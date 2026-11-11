// Save-file validation and migration.
// A design file is versioned JSON holding template references + parameters (never baked meshes),
// so everything stays editable after loading and new templates can be added without breaking saves.

import { REGION_BY_ID } from '../body/body';
import { materialFromPreset } from '../catalog/materials';
import { TEMPLATE_BY_ID } from '../catalog/templates';
import { SCHEMA_VERSION, type ComponentInstance, type CustomPart, type Design, type MaterialSpec, type Vec3 } from '../core/types';
import { clampParams, defaultParams } from '../geometry/build';

export class DesignFormatError extends Error {}

const TEXTURES = ['none', 'brushed', 'hammered', 'mail', 'weave', 'wool', 'velvet', 'leather', 'quilt', 'scales'];

export interface LoadResult {
  design: Design;
  warnings: string[];
}

/** Migrations keyed by the version they upgrade FROM. Add an entry whenever SCHEMA_VERSION is bumped. */
export const MIGRATIONS: Record<number, (raw: any) => any> = {};

const isObj = (x: unknown): x is Record<string, any> => typeof x === 'object' && x !== null && !Array.isArray(x);
const num = (x: unknown, d: number) => (typeof x === 'number' && isFinite(x) ? x : d);
const vec3 = (x: unknown, d: Vec3): Vec3 => (Array.isArray(x) && x.length === 3 && x.every((n) => typeof n === 'number' && isFinite(n)) ? [x[0], x[1], x[2]] : [...d]);

function cleanMaterial(raw: any, fallbackPreset: string): MaterialSpec {
  const base = materialFromPreset(isObj(raw) && typeof raw.preset === 'string' ? raw.preset : fallbackPreset);
  if (!isObj(raw)) return base;
  return {
    preset: typeof raw.preset === 'string' ? raw.preset : base.preset,
    kind: ['metal', 'fabric', 'leather', 'mail'].includes(raw.kind) ? raw.kind : base.kind,
    color: typeof raw.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.color) ? raw.color : base.color,
    metalness: Math.min(1, Math.max(0, num(raw.metalness, base.metalness))),
    roughness: Math.min(1, Math.max(0, num(raw.roughness, base.roughness))),
    texture: TEXTURES.includes(raw.texture) ? raw.texture : base.texture,
    textureIntensity: Math.min(1, Math.max(0, num(raw.textureIntensity, base.textureIntensity))),
    wear: Math.min(1, Math.max(0, num(raw.wear, base.wear))),
  };
}

function cleanInstance(raw: any, warnings: string[]): ComponentInstance | null {
  if (!isObj(raw) || typeof raw.id !== 'string' || typeof raw.templateId !== 'string') return null;
  const t = TEMPLATE_BY_ID[raw.templateId];
  if (!t) {
    warnings.push(`Skipped "${raw.name ?? raw.id}": unknown component "${raw.templateId}".`);
    return null;
  }
  const params = { ...defaultParams(t), ...clampParams(t, isObj(raw.params) ? raw.params : {}) };
  const materials: Record<string, MaterialSpec> = {};
  for (const [slot, preset] of Object.entries(t.materials)) materials[slot] = cleanMaterial(isObj(raw.materials) ? raw.materials[slot] : null, preset);
  const tr = isObj(raw.transform) ? raw.transform : {};
  const att = isObj(raw.attachment)
    ? {
        kind: raw.attachment.kind === 'param' ? ('param' as const) : ('static' as const),
        surface: num(raw.attachment.surface, -1),
        u: num(raw.attachment.u, 0),
        v: num(raw.attachment.v, 0),
        position: vec3(raw.attachment.position, [0, 0, 0]),
        normal: vec3(raw.attachment.normal, [0, 0, 1]),
      }
    : null;
  return {
    id: raw.id,
    templateId: raw.templateId,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.slice(0, 80) : t.name,
    region: typeof raw.region === 'string' ? raw.region : t.regionType,
    parentId: typeof raw.parentId === 'string' ? raw.parentId : null,
    children: Array.isArray(raw.children) ? raw.children.filter((c: unknown) => typeof c === 'string') : [],
    transform: { position: vec3(tr.position, [0, 0, 0]), rotation: vec3(tr.rotation, [0, 0, 0]), scale: vec3(tr.scale, [1, 1, 1]) },
    params,
    materials,
    layer: Math.min(5, Math.max(1, Math.round(num(raw.layer, t.layer)))),
    order: num(raw.order, 0),
    visible: raw.visible !== false,
    locked: raw.locked === true,
    symmetry: {
      partnerId: isObj(raw.symmetry) && typeof raw.symmetry.partnerId === 'string' ? raw.symmetry.partnerId : null,
      mirrored: isObj(raw.symmetry) && raw.symmetry.mirrored === true,
    },
    attachment: att,
  };
}

/** Repair parent/child/partner references after individual instances were validated (or dropped). */
function repairGraph(instances: Record<string, ComponentInstance>, warnings: string[], rootOrder?: unknown): string[] {
  // drop accessories whose parent is gone, and fitted pieces on unknown regions
  let changed = true;
  while (changed) {
    changed = false;
    for (const i of Object.values(instances)) {
      const t = TEMPLATE_BY_ID[i.templateId];
      const orphan = t.kind === 'accessory' && (!i.parentId || !instances[i.parentId]);
      const badRegion = !REGION_BY_ID[i.region];
      if (orphan || badRegion) {
        warnings.push(`Skipped "${i.name}": ${orphan ? 'its parent component is missing' : `unknown body region "${i.region}"`}.`);
        delete instances[i.id];
        changed = true;
      }
    }
  }
  const roots: string[] = [];
  const orig = new Map<string, string[]>();
  for (const i of Object.values(instances)) {
    orig.set(i.id, i.children);
    const t = TEMPLATE_BY_ID[i.templateId];
    if (t.kind === 'fitted') {
      i.parentId = null;
      i.attachment = null;
    } else if (!i.attachment) i.attachment = { kind: 'static', surface: -1, u: 0, v: 0, position: [0, 0, 0], normal: [0, 0, 1] };
    i.children = [];
    if (i.symmetry.partnerId && (!instances[i.symmetry.partnerId] || instances[i.symmetry.partnerId].symmetry.partnerId !== i.id)) i.symmetry.partnerId = null;
  }
  const sorted = Object.values(instances).sort((a, b) => a.order - b.order);
  for (const i of sorted) {
    if (i.parentId) instances[i.parentId].children.push(i.id);
    else roots.push(i.id);
  }
  for (const i of Object.values(instances)) {
    const o = orig.get(i.id) ?? [];
    const rank = (id: string) => (o.indexOf(id) < 0 ? 1e9 : o.indexOf(id));
    i.children.sort((a, b) => rank(a) - rank(b));
  }
  if (Array.isArray(rootOrder)) {
    const rank = (id: string) => (rootOrder.indexOf(id) < 0 ? 1e9 : rootOrder.indexOf(id));
    roots.sort((a, b) => rank(a) - rank(b));
  }
  // guard against cycles: anything unreachable from a root is dropped
  const seen = new Set<string>();
  const walk = (id: string) => {
    if (seen.has(id)) return;
    seen.add(id);
    instances[id].children.forEach(walk);
  };
  roots.forEach(walk);
  for (const id of Object.keys(instances)) {
    if (!seen.has(id)) {
      warnings.push(`Skipped "${instances[id].name}": broken hierarchy.`);
      delete instances[id];
    }
  }
  return roots;
}

/** Parse + validate + migrate anything that claims to be a design. Throws DesignFormatError with a readable message. */
export function parseDesign(input: unknown): LoadResult {
  let raw: any = input;
  if (typeof input === 'string') {
    try {
      raw = JSON.parse(input);
    } catch {
      throw new DesignFormatError('This file is not valid JSON.');
    }
  }
  if (!isObj(raw)) throw new DesignFormatError('This file does not contain an Armor Atelier design.');
  if (raw.app !== 'armor-atelier') throw new DesignFormatError('This file was not made by Armor Atelier.');
  let version = num(raw.schema, NaN);
  if (!isFinite(version)) throw new DesignFormatError('The design has no schema version.');
  if (version > SCHEMA_VERSION) throw new DesignFormatError(`This design was saved by a newer version of Armor Atelier (format ${version}; this build reads up to ${SCHEMA_VERSION}).`);
  while (version < SCHEMA_VERSION) {
    const m = MIGRATIONS[version];
    if (!m) throw new DesignFormatError(`No migration is available from design format ${version}.`);
    raw = m(raw);
    version++;
  }
  if (!isObj(raw.instances)) throw new DesignFormatError('The design has no component list.');
  const warnings: string[] = [];
  const instances: Record<string, ComponentInstance> = {};
  for (const [id, v] of Object.entries(raw.instances)) {
    const c = cleanInstance(v, warnings);
    if (c && c.id === id) instances[id] = c;
    else if (!c && isObj(v) && !TEMPLATE_BY_ID[(v as any).templateId]) continue;
    else if (!c) warnings.push(`Skipped a malformed component entry (${id}).`);
  }
  const roots = repairGraph(instances, warnings, raw.roots);
  let maxOrder = 0;
  for (const i of Object.values(instances)) maxOrder = Math.max(maxOrder, i.order);
  const now = Date.now();
  const design: Design = {
    schema: SCHEMA_VERSION,
    app: 'armor-atelier',
    id: typeof raw.id === 'string' ? raw.id : `d_${now.toString(36)}`,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.slice(0, 80) : 'Imported design',
    createdAt: num(raw.createdAt, now),
    updatedAt: num(raw.updatedAt, now),
    symmetry: raw.symmetry !== false,
    mannequin: {
      color: isObj(raw.mannequin) && typeof raw.mannequin.color === 'string' ? raw.mannequin.color : '#7b7b80',
      showGrid: !isObj(raw.mannequin) || raw.mannequin.showGrid !== false,
    },
    instances,
    roots,
    orderCounter: Math.max(num(raw.orderCounter, 1), Math.floor(maxOrder) + 1),
  };
  return { design, warnings };
}

export function serializeDesign(d: Design): string {
  return JSON.stringify(d, null, 2);
}

export function parseCustomPart(raw: any): CustomPart | null {
  if (!isObj(raw) || typeof raw.id !== 'string' || typeof raw.rootId !== 'string' || !isObj(raw.instances)) return null;
  const warnings: string[] = [];
  const instances: Record<string, ComponentInstance> = {};
  for (const [id, v] of Object.entries(raw.instances)) {
    const c = cleanInstance(v, warnings);
    if (c) instances[id] = c;
  }
  if (!instances[raw.rootId]) return null;
  for (const i of Object.values(instances)) i.children = i.children.filter((c) => instances[c]);
  return { id: raw.id, name: typeof raw.name === 'string' ? raw.name : 'Custom part', createdAt: num(raw.createdAt, Date.now()), rootTemplateId: instances[raw.rootId].templateId, rootId: raw.rootId, instances };
}
