// Pure design operations. Every editor action is a function Design -> Design here, so the
// store, the demonstration presets and the unit tests all exercise exactly the same logic.

import { Matrix4, Vector3 } from 'three';
import { REGION_BY_ID, mirrorRegionId } from '../body/body';
import { materialFromPreset } from '../catalog/materials';
import { TEMPLATE_BY_ID, type MountSpec, type TemplateDef } from '../catalog/templates';
import { newId } from '../core/math';
import {
  SCHEMA_VERSION,
  type Attachment,
  type ComponentInstance,
  type CustomPart,
  type Design,
  type MaterialSpec,
  type Side,
  type Transform,
  type Vec3,
} from '../core/types';
import { buildComponent, clampParams, defaultParams, mirrorSurfaceCoords } from '../geometry/build';
import type { BuildResult } from '../geometry/types';
import { computeFit, stackOf, type FitResult } from './layering';

export const IDENTITY: Transform = { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };

export function emptyDesign(name = 'Untitled design'): Design {
  const now = Date.now();
  return {
    schema: SCHEMA_VERSION,
    app: 'armor-atelier',
    id: newId('d'),
    name,
    createdAt: now,
    updatedAt: now,
    symmetry: true,
    mannequin: { color: '#7b7b80', showGrid: true },
    instances: {},
    roots: [],
    orderCounter: 1,
  };
}

// ---------------------------------------------------------------- helpers

function cloneInstance(i: ComponentInstance): ComponentInstance {
  return {
    ...i,
    children: [...i.children],
    transform: { position: [...i.transform.position], rotation: [...i.transform.rotation], scale: [...i.transform.scale] },
    params: { ...i.params },
    materials: Object.fromEntries(Object.entries(i.materials).map(([k, v]) => [k, { ...v }])),
    symmetry: { ...i.symmetry },
    attachment: i.attachment ? { ...i.attachment, position: [...i.attachment.position], normal: [...i.attachment.normal] } : null,
  };
}

/** Shallow-copy the design so instances can be replaced without mutating the previous state. */
function draft(d: Design): Design {
  return { ...d, instances: { ...d.instances }, roots: [...d.roots], mannequin: { ...d.mannequin }, updatedAt: Date.now() };
}

/** Get a writable copy of an instance inside a draft. */
function edit(d: Design, id: string): ComponentInstance {
  const c = cloneInstance(d.instances[id]);
  d.instances[id] = c;
  return c;
}

export function mirrorTransform(t: Transform): Transform {
  return {
    position: [-t.position[0], t.position[1], t.position[2]],
    rotation: [t.rotation[0], -t.rotation[1], -t.rotation[2]],
    scale: [...t.scale],
  };
}

export function descendants(d: Design, id: string, out: string[] = []): string[] {
  const i = d.instances[id];
  if (!i) return out;
  out.push(id);
  for (const c of i.children) descendants(d, c, out);
  return out;
}

export function rootOf(d: Design, id: string): ComponentInstance | null {
  let i = d.instances[id];
  while (i && i.parentId) i = d.instances[i.parentId];
  return i ?? null;
}

function partnerOf(d: Design, i: ComponentInstance): ComponentInstance | null {
  const p = i.symmetry.partnerId ? d.instances[i.symmetry.partnerId] : null;
  return p ?? null;
}

function makeInstance(t: TemplateDef, region: string, order: number, mirrored: boolean, name?: string): ComponentInstance {
  const materials: Record<string, MaterialSpec> = {};
  for (const [slot, preset] of Object.entries(t.materials)) materials[slot] = materialFromPreset(preset);
  return {
    id: newId('c'),
    templateId: t.id,
    name: name ?? t.name,
    region,
    parentId: null,
    children: [],
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    params: defaultParams(t),
    materials,
    layer: t.layer,
    order,
    visible: true,
    locked: false,
    symmetry: { partnerId: null, mirrored },
    attachment: null,
  };
}

// ---------------------------------------------------------------- attachments

export interface ResolvedAttachment {
  position: Vector3;
  normal: Vector3;
}

/** Resolve an attachment to a parent-local point + normal against the parent's CURRENT geometry. */
export function resolveAttachment(att: Attachment, parentBuild: BuildResult | null): ResolvedAttachment {
  if (att.kind === 'param' && parentBuild) {
    const sp = parentBuild.builder.evalSurface(att.surface, att.u, att.v);
    if (sp) return sp;
  }
  return { position: new Vector3(...att.position), normal: new Vector3(...att.normal).normalize() };
}

const UP = new Vector3(0, 1, 0);

/** Parent-local frame for an accessory sitting at `r`. */
export function attachMatrix(r: ResolvedAttachment, mode: 'normalY' | 'normalZ'): Matrix4 {
  const n = r.normal.clone().normalize();
  const ref = Math.abs(n.dot(UP)) > 0.94 ? new Vector3(0, 0, mode === 'normalY' ? 1 : -1) : UP.clone();
  const t = ref.addScaledVector(n, -ref.dot(n)).normalize();
  const m = new Matrix4();
  if (mode === 'normalY') {
    const x = new Vector3().crossVectors(n, t);
    m.makeBasis(x, n, t);
  } else {
    const x = new Vector3().crossVectors(t, n);
    m.makeBasis(x, t, n);
  }
  m.setPosition(r.position);
  return m;
}

/** Build an instance exactly as the scene renders it (layer offset and squeeze included). */
export function buildOf(d: Design, inst: ComponentInstance, fit?: FitResult): BuildResult {
  if (inst.parentId) return buildComponent(inst.templateId, inst.params, 0, inst.symmetry.mirrored);
  const f = fit ?? computeFit(d);
  return buildComponent(inst.templateId, inst.params, f.offsets[inst.id] ?? 0, inst.symmetry.mirrored, f.squeeze[inst.id]);
}

function mirroredAttachment(parentT: TemplateDef, att: Attachment, sameParent: boolean): Attachment {
  const out: Attachment = { ...att, position: [-att.position[0], att.position[1], att.position[2]], normal: [-att.normal[0], att.normal[1], att.normal[2]] };
  if (att.kind === 'param' && sameParent) {
    const m = mirrorSurfaceCoords(parentT, att.surface, att.u, att.v);
    out.surface = m.surface;
    out.u = m.u;
    out.v = m.v;
  }
  return out;
}

/** Default mount for an accessory template on a given parent. */
export function defaultAttachment(d: Design, t: TemplateDef, parent: ComponentInstance, fit?: FitResult): Attachment {
  const pt = TEMPLATE_BY_ID[parent.templateId];
  const spec: MountSpec = t.mounts?.[pt.family] ?? { surface: 0, u: 0, v: 0.6 };
  const build = buildOf(d, parent, fit);
  if (spec.position) {
    const mx = parent.symmetry.mirrored ? -1 : 1;
    return { kind: 'static', surface: -1, u: 0, v: 0, position: [spec.position[0] * mx, spec.position[1], spec.position[2]], normal: [(spec.normal?.[0] ?? 0) * mx, spec.normal?.[1] ?? 0, spec.normal?.[2] ?? 1] };
  }
  const sp = build.builder.evalSurface(spec.surface ?? 0, spec.u ?? 0, spec.v ?? 0.6);
  if (sp) return { kind: 'param', surface: spec.surface ?? 0, u: spec.u ?? 0, v: spec.v ?? 0.6, position: sp.position.toArray() as Vec3, normal: sp.normal.toArray() as Vec3 };
  const bb = build.geometry.boundingBox!;
  return { kind: 'static', surface: -1, u: 0, v: 0, position: [(bb.min.x + bb.max.x) / 2, (bb.min.y + bb.max.y) / 2, bb.max.z], normal: [0, 0, 1] };
}

// ---------------------------------------------------------------- adding

export interface AddResult {
  design: Design;
  ids: string[];
}

export function addFitted(d0: Design, templateId: string, opts: { side?: Side; symmetric?: boolean } = {}): AddResult {
  const t = TEMPLATE_BY_ID[templateId];
  if (!t || t.kind !== 'fitted') throw new Error(`"${templateId}" is not a fitted component`);
  const d = draft(d0);
  const ids: string[] = [];
  const centre = !!REGION_BY_ID[t.regionType];
  if (centre) {
    const inst = makeInstance(t, t.regionType, d.orderCounter++, false);
    d.instances[inst.id] = inst;
    d.roots.push(inst.id);
    ids.push(inst.id);
    return { design: d, ids };
  }
  const side: Side = opts.side && opts.side !== 'C' ? opts.side : 'L';
  const symmetric = opts.symmetric ?? d.symmetry;
  const order = d.orderCounter++;
  const first = makeInstance(t, `${t.regionType}${side}`, order, side === 'R', `${t.name} (${side})`);
  d.instances[first.id] = first;
  d.roots.push(first.id);
  ids.push(first.id);
  if (symmetric) {
    const other: Side = side === 'L' ? 'R' : 'L';
    const second = makeInstance(t, `${t.regionType}${other}`, order, other === 'R', `${t.name} (${other})`);
    first.symmetry.partnerId = second.id;
    second.symmetry.partnerId = first.id;
    d.instances[second.id] = second;
    d.roots.push(second.id);
    ids.push(second.id);
  }
  return { design: d, ids };
}

export function addAccessory(d0: Design, templateId: string, parentId: string, attachment: Attachment, opts: { symmetric?: boolean; mirrored?: boolean } = {}): AddResult {
  const t = TEMPLATE_BY_ID[templateId];
  const parent0 = d0.instances[parentId];
  if (!t || t.kind !== 'accessory') throw new Error(`"${templateId}" is not an accessory`);
  if (!parent0) throw new Error('Attachment target no longer exists');
  const d = draft(d0);
  const parent = edit(d, parentId);
  const inst = makeInstance(t, parent.region, d.orderCounter++, opts.mirrored ?? parent.symmetry.mirrored);
  inst.parentId = parentId;
  inst.attachment = { ...attachment };
  d.instances[inst.id] = inst;
  parent.children.push(inst.id);
  const ids = [inst.id];
  const symmetric = opts.symmetric ?? d.symmetry;
  if (symmetric) {
    const pt = TEMPLATE_BY_ID[parent.templateId];
    const pPartner = partnerOf(d, parent);
    let twinParent: ComponentInstance | null = null;
    let same = false;
    if (pPartner) twinParent = edit(d, pPartner.id);
    else if (Math.abs(attachment.position[0]) > 0.012 && REGION_BY_ID[rootOf(d, parentId)?.region ?? '']?.side === 'C') {
      twinParent = parent;
      same = true;
    }
    if (twinParent) {
      const twin = makeInstance(t, twinParent.region, d.orderCounter++, !inst.symmetry.mirrored);
      twin.parentId = twinParent.id;
      twin.attachment = mirroredAttachment(pt, attachment, same);
      twin.symmetry.partnerId = inst.id;
      inst.symmetry.partnerId = twin.id;
      d.instances[twin.id] = twin;
      twinParent.children.push(twin.id);
      ids.push(twin.id);
    }
  }
  return { design: d, ids };
}

/** Attach an accessory at its template's default mount on the parent. */
export function autoAttach(d: Design, templateId: string, parentId: string, opts: { symmetric?: boolean } = {}): AddResult {
  const t = TEMPLATE_BY_ID[templateId];
  const parent = d.instances[parentId];
  if (!t || !parent) throw new Error('Cannot attach: missing template or parent');
  return addAccessory(d, templateId, parentId, defaultAttachment(d, t, parent), opts);
}

// ---------------------------------------------------------------- editing

function linked(d: Design, i: ComponentInstance, propagate: boolean): ComponentInstance | null {
  if (!propagate || !d.symmetry) return null;
  const p = partnerOf(d, i);
  return p && !p.locked ? p : null;
}

export function updateParams(d0: Design, id: string, patch: Record<string, number>, propagate = true): Design {
  const i0 = d0.instances[id];
  if (!i0 || i0.locked) return d0;
  const t = TEMPLATE_BY_ID[i0.templateId];
  const clean = clampParams(t, patch);
  if (!Object.keys(clean).some((k) => i0.params[k] !== clean[k])) return d0;
  const d = draft(d0);
  Object.assign(edit(d, id).params, clean);
  const p = linked(d, i0, propagate);
  if (p && p.templateId === i0.templateId) Object.assign(edit(d, p.id).params, clean);
  return d;
}

export function updateTransform(d0: Design, id: string, patch: Partial<Transform>, propagate = true): Design {
  const i0 = d0.instances[id];
  if (!i0 || i0.locked) return d0;
  const d = draft(d0);
  const i = edit(d, id);
  i.transform = { ...i.transform, ...patch } as Transform;
  const p = linked(d, i0, propagate);
  if (p) edit(d, p.id).transform = mirrorTransform(i.transform);
  return d;
}

export function setMaterial(d0: Design, id: string, slot: string, patch: Partial<MaterialSpec>, propagate = true): Design {
  const i0 = d0.instances[id];
  if (!i0 || i0.locked) return d0;
  const d = draft(d0);
  const apply = (iid: string) => {
    const i = edit(d, iid);
    const cur = i.materials[slot] ?? materialFromPreset('steel');
    i.materials[slot] = { ...cur, ...patch };
  };
  apply(id);
  const p = linked(d, i0, propagate);
  if (p) apply(p.id);
  return d;
}

export function setAttachment(d0: Design, id: string, att: Attachment, propagate = true): Design {
  const i0 = d0.instances[id];
  if (!i0 || i0.locked || !i0.parentId) return d0;
  const d = draft(d0);
  edit(d, id).attachment = { ...att };
  const p = linked(d, i0, propagate);
  if (p && p.parentId) {
    const pt = TEMPLATE_BY_ID[d.instances[i0.parentId].templateId];
    edit(d, p.id).attachment = mirroredAttachment(pt, att, p.parentId === i0.parentId);
  }
  return d;
}

/** Move an accessory to a different parent (or the same one) at a new attachment. */
export function reattach(d0: Design, id: string, parentId: string, att: Attachment): Design {
  const i0 = d0.instances[id];
  if (!i0 || !i0.parentId || i0.locked || !d0.instances[parentId]) return d0;
  if (descendants(d0, id).includes(parentId)) return d0;
  if (i0.parentId === parentId) return setAttachment(d0, id, att);
  const d = draft(d0);
  const oldP = edit(d, i0.parentId);
  oldP.children = oldP.children.filter((c) => c !== id);
  const newP = edit(d, parentId);
  newP.children.push(id);
  const i = edit(d, id);
  i.parentId = parentId;
  i.attachment = { ...att };
  // a re-parented accessory no longer mirrors its old twin
  if (i.symmetry.partnerId && d.instances[i.symmetry.partnerId]) edit(d, i.symmetry.partnerId).symmetry.partnerId = null;
  i.symmetry.partnerId = null;
  i.symmetry.mirrored = newP.symmetry.mirrored;
  for (const c of descendants(d, id)) edit(d, c).region = newP.region;
  return d;
}

export function patchInstance(d0: Design, id: string, patch: Partial<Pick<ComponentInstance, 'name' | 'visible' | 'locked'>>): Design {
  if (!d0.instances[id]) return d0;
  const d = draft(d0);
  Object.assign(edit(d, id), patch);
  return d;
}

export function resetShape(d0: Design, id: string): Design {
  const i0 = d0.instances[id];
  if (!i0 || i0.locked) return d0;
  const t = TEMPLATE_BY_ID[i0.templateId];
  const d = draft(d0);
  edit(d, id).params = defaultParams(t);
  const p = linked(d, i0, true);
  if (p && p.templateId === i0.templateId) edit(d, p.id).params = defaultParams(t);
  return d;
}

export function resetTransform(d0: Design, id: string): Design {
  return updateTransform(d0, id, { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });
}

export function removeInstance(d0: Design, id: string): Design {
  const i0 = d0.instances[id];
  if (!i0) return d0;
  const d = draft(d0);
  const gone = new Set(descendants(d, id));
  if (i0.parentId && d.instances[i0.parentId]) {
    const p = edit(d, i0.parentId);
    p.children = p.children.filter((c) => c !== id);
  }
  d.roots = d.roots.filter((r) => r !== id);
  for (const g of gone) {
    const partner = d.instances[g]?.symmetry.partnerId;
    if (partner && !gone.has(partner) && d.instances[partner]) edit(d, partner).symmetry.partnerId = null;
    delete d.instances[g];
  }
  return d;
}

/** Deep-copy a sub-tree with fresh ids. Returns the new root id. */
function copySubtree(d: Design, src: Record<string, ComponentInstance>, rootId: string, map: Record<string, string> = {}): string {
  const ids: string[] = [];
  const walk = (id: string) => {
    if (!src[id]) return;
    ids.push(id);
    src[id].children.forEach(walk);
  };
  walk(rootId);
  for (const id of ids) map[id] = newId('c');
  for (const id of ids) {
    const c = cloneInstance(src[id]);
    c.id = map[id];
    c.children = c.children.filter((x) => map[x]).map((x) => map[x]);
    c.parentId = c.parentId && map[c.parentId] ? map[c.parentId] : c.parentId;
    c.symmetry.partnerId = c.symmetry.partnerId && map[c.symmetry.partnerId] ? map[c.symmetry.partnerId] : null;
    c.order = d.orderCounter++;
    d.instances[c.id] = c;
  }
  return map[rootId];
}

export function duplicate(d0: Design, id: string): AddResult {
  const i0 = d0.instances[id];
  if (!i0) return { design: d0, ids: [] };
  const d = draft(d0);
  const nid = copySubtree(d, d0.instances, id);
  const n = d.instances[nid];
  n.name = `${i0.name} copy`;
  n.symmetry.partnerId = null;
  if (i0.parentId) {
    edit(d, i0.parentId).children.push(nid);
    n.transform.position = [n.transform.position[0] + 0.03, n.transform.position[1], n.transform.position[2]];
  } else d.roots.push(nid);
  return { design: d, ids: [nid] };
}

function flipSubtree(d: Design, rootId: string, region: string | null) {
  for (const id of descendants(d, rootId)) {
    const c = d.instances[id];
    c.symmetry.mirrored = !c.symmetry.mirrored;
    c.transform = mirrorTransform(c.transform);
    if (region) c.region = region;
    if (id !== rootId && c.attachment) {
      c.attachment = { ...c.attachment, position: [-c.attachment.position[0], c.attachment.position[1], c.attachment.position[2]], normal: [-c.attachment.normal[0], c.attachment.normal[1], c.attachment.normal[2]] };
    }
  }
}

/** Create (or update) the mirror-image twin of a component on the opposite side. */
export function mirrorInstance(d0: Design, id: string): AddResult & { message?: string } {
  const i0 = d0.instances[id];
  if (!i0) return { design: d0, ids: [] };
  const d = draft(d0);
  const existing = partnerOf(d, i0);
  if (!i0.parentId) {
    const other = mirrorRegionId(i0.region);
    if (!other) return { design: d0, ids: [], message: 'Centre pieces have no opposite side - mirror their accessories instead.' };
    if (existing) {
      const p = edit(d, existing.id);
      p.params = { ...i0.params };
      p.materials = cloneInstance(i0).materials;
      p.transform = mirrorTransform(i0.transform);
      p.layer = i0.layer;
      return { design: d, ids: [p.id], message: 'Updated the linked opposite-side component.' };
    }
    const map: Record<string, string> = {};
    const nid = copySubtree(d, d0.instances, id, map);
    flipSubtree(d, nid, other);
    const n = d.instances[nid];
    n.name = i0.name.replace(/\((L|R)\)$/, (_m, s) => `(${s === 'L' ? 'R' : 'L'})`);
    if (n.name === i0.name) n.name = `${i0.name} (mirror)`;
    n.order = i0.order;
    d.roots.push(nid);
    for (const [a, b] of Object.entries(map)) {
      edit(d, a).symmetry.partnerId = b;
      d.instances[b].symmetry.partnerId = a;
    }
    return { design: d, ids: [nid] };
  }
  // accessory
  const parent = d.instances[i0.parentId];
  const pt = TEMPLATE_BY_ID[parent.templateId];
  const pPartner = partnerOf(d, parent);
  const same = !pPartner;
  const target = pPartner ?? parent;
  if (existing) {
    const p = edit(d, existing.id);
    p.params = { ...i0.params };
    p.materials = cloneInstance(i0).materials;
    p.transform = mirrorTransform(i0.transform);
    if (i0.attachment) p.attachment = mirroredAttachment(pt, i0.attachment, existing.parentId === i0.parentId);
    return { design: d, ids: [p.id], message: 'Updated the linked mirrored accessory.' };
  }
  const map: Record<string, string> = {};
  const nid = copySubtree(d, d0.instances, id, map);
  flipSubtree(d, nid, target.region);
  const n = d.instances[nid];
  n.parentId = target.id;
  if (i0.attachment) n.attachment = mirroredAttachment(pt, i0.attachment, same);
  n.name = `${i0.name} (mirror)`;
  edit(d, target.id).children.push(nid);
  for (const [a, b] of Object.entries(map)) {
    edit(d, a).symmetry.partnerId = b;
    d.instances[b].symmetry.partnerId = a;
  }
  return { design: d, ids: [nid] };
}

export function breakLink(d0: Design, id: string): Design {
  const i0 = d0.instances[id];
  if (!i0 || !i0.symmetry.partnerId) return d0;
  const d = draft(d0);
  const partner = i0.symmetry.partnerId;
  edit(d, id).symmetry.partnerId = null;
  if (d.instances[partner]) edit(d, partner).symmetry.partnerId = null;
  return d;
}

/** Move a fitted component one step up (+1) or down (-1) in its layer stack. */
export function moveLayer(d0: Design, id: string, dir: 1 | -1): Design {
  const i0 = d0.instances[id];
  if (!i0) return d0;
  if (i0.parentId) {
    const d = draft(d0);
    const p = edit(d, i0.parentId);
    const k = p.children.indexOf(id);
    const j = k + dir;
    if (j < 0 || j >= p.children.length) return d0;
    [p.children[k], p.children[j]] = [p.children[j], p.children[k]];
    return d;
  }
  const partnerId = i0.symmetry.partnerId;
  const stack = stackOf(d0, id).filter((x) => x.id !== partnerId);
  const k = stack.findIndex((x) => x.id === id);
  const j = k + dir;
  if (j < 0 || j >= stack.length) return d0;
  const other = stack[j];
  const d = draft(d0);
  const a = edit(d, id);
  const b = edit(d, other.id);
  const al = a.layer;
  const ao = a.order;
  a.layer = b.layer;
  a.order = b.order;
  b.layer = al;
  b.order = ao;
  if (a.layer === b.layer && a.order === b.order) a.order += dir * 0.5;
  // keep linked twins on the same layer
  for (const [x, src] of [
    [a, a],
    [b, b],
  ] as const) {
    const p = x.symmetry.partnerId && d.instances[x.symmetry.partnerId];
    if (p && p.id !== a.id && p.id !== b.id) {
      const pe = edit(d, p.id);
      pe.layer = src.layer;
      pe.order = src.order;
    }
  }
  return d;
}

export function setLayer(d0: Design, id: string, layer: number): Design {
  const i0 = d0.instances[id];
  if (!i0) return d0;
  const d = draft(d0);
  const i = edit(d, id);
  i.layer = layer;
  i.order = d.orderCounter++;
  const p = partnerOf(d, i0);
  if (p) {
    const pe = edit(d, p.id);
    pe.layer = layer;
    pe.order = i.order;
  }
  return d;
}

export function setSymmetry(d0: Design, on: boolean): Design {
  return { ...d0, symmetry: on, updatedAt: Date.now() };
}

// ---------------------------------------------------------------- custom parts

export function extractCustomPart(d: Design, id: string, name: string): CustomPart {
  const inst = d.instances[id];
  if (!inst) throw new Error('Nothing selected to save');
  const instances: Record<string, ComponentInstance> = {};
  for (const c of descendants(d, id)) {
    const copy = cloneInstance(d.instances[c]);
    copy.symmetry.partnerId = null;
    instances[c] = copy;
  }
  return { id: newId('p'), name, createdAt: Date.now(), rootTemplateId: inst.templateId, rootId: id, instances };
}

/** Place a saved assembly. Fitted roots go back onto their body region; accessory roots need a parent. */
export function insertCustomPart(d0: Design, part: CustomPart, opts: { parentId?: string; attachment?: Attachment; side?: Side } = {}): AddResult {
  const root = part.instances[part.rootId];
  const t = root && TEMPLATE_BY_ID[root.templateId];
  if (!root || !t) throw new Error('This custom part uses a component that is no longer available');
  const d = draft(d0);
  const nid = copySubtree(d, part.instances, part.rootId);
  const n = d.instances[nid];
  n.name = part.name;
  n.symmetry.partnerId = null;
  const ids = [nid];
  if (t.kind === 'fitted') {
    n.parentId = null;
    n.attachment = null;
    const region = REGION_BY_ID[root.region];
    if (opts.side && region && region.side !== 'C' && opts.side !== region.side) {
      const other = mirrorRegionId(root.region)!;
      flipSubtree(d, nid, other);
    }
    d.roots.push(nid);
    return { design: d, ids };
  }
  const parentId = opts.parentId;
  if (!parentId || !d.instances[parentId]) throw new Error('Select a component to attach this custom part to');
  const parent = edit(d, parentId);
  n.parentId = parentId;
  n.attachment = opts.attachment ?? defaultAttachment(d, t, parent);
  if (parent.symmetry.mirrored !== root.symmetry.mirrored) {
    const att = n.attachment;
    flipSubtree(d, nid, parent.region);
    n.attachment = att;
  } else for (const c of descendants(d, nid)) d.instances[c].region = parent.region;
  parent.children.push(nid);
  return { design: d, ids };
}

// ---------------------------------------------------------------- attachment health

function nearestVertex(build: BuildResult, p: Vector3): { index: number; dist: number } {
  const pos = build.geometry.getAttribute('position');
  let best = -1;
  let bd = Infinity;
  for (let i = 0; i < pos.count; i++) {
    const dx = pos.getX(i) - p.x;
    const dy = pos.getY(i) - p.y;
    const dz = pos.getZ(i) - p.z;
    const d = dx * dx + dy * dy + dz * dz;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return { index: best, dist: Math.sqrt(bd) };
}

/** Distance (metres) between an accessory's mount point and its parent's surface. Large values mean it floats. */
export function attachmentGap(d: Design, id: string, fit?: FitResult): number {
  const inst = d.instances[id];
  const parent = inst?.parentId ? d.instances[inst.parentId] : null;
  if (!inst || !parent || !inst.attachment) return 0;
  const build = buildOf(d, parent, fit);
  return nearestVertex(build, resolveAttachment(inst.attachment, build).position).dist;
}

/** Re-seat an accessory on the closest point of its parent's current surface. */
export function snapToSurface(d0: Design, id: string): Design {
  const inst = d0.instances[id];
  const parent = inst?.parentId ? d0.instances[inst.parentId] : null;
  if (!inst || !parent || !inst.attachment || inst.locked) return d0;
  const build = buildOf(d0, parent);
  const { index } = nearestVertex(build, resolveAttachment(inst.attachment, build).position);
  if (index < 0) return d0;
  const g = build.geometry;
  const pos = g.getAttribute('position');
  const nrm = g.getAttribute('normal');
  const surf = g.getAttribute('surf').getX(index);
  const puv = g.getAttribute('puv');
  const att: Attachment = {
    kind: surf >= 0 ? 'param' : 'static',
    surface: surf,
    u: puv.getX(index),
    v: puv.getY(index),
    position: [pos.getX(index), pos.getY(index), pos.getZ(index)],
    normal: [nrm.getX(index), nrm.getY(index), nrm.getZ(index)],
  };
  return setAttachment(updateTransform(d0, id, { position: [0, 0, 0] }), id, att);
}

// ---------------------------------------------------------------- repeated ornaments

const ANGULAR_FAMILIES = new Set(['shell', 'dome', 'cap', 'horn', 'gauntlet', 'footwear', 'medallion']);

/** Copy an accessory `count - 1` times, evenly spaced around its parent's surface (rivet rows, spike crowns...). */
export function repeatAround(d0: Design, id: string, count: number): AddResult {
  const inst = d0.instances[id];
  const parent = inst?.parentId ? d0.instances[inst.parentId] : null;
  const n = Math.round(count);
  if (!inst || !parent || !inst.attachment || n < 2 || n > 48) return { design: d0, ids: [] };
  const pt = TEMPLATE_BY_ID[parent.templateId];
  if (inst.attachment.kind !== 'param' || !ANGULAR_FAMILIES.has(pt.family)) throw new Error('Repeat needs an accessory seated on a curved surface. Use "Snap to surface" first.');
  const d = draft(d0);
  const build = buildOf(d0, parent);
  const ids: string[] = [];
  const p = edit(d, parent.id);
  for (let k = 1; k < n; k++) {
    let u = inst.attachment.u + (k * Math.PI * 2) / n;
    while (u > Math.PI) u -= Math.PI * 2;
    const att: Attachment = { ...inst.attachment, u };
    const r = resolveAttachment(att, build);
    if (nearestVertex(build, r.position).dist > 0.03) continue; // fell off an open edge
    att.position = r.position.toArray() as Vec3;
    att.normal = r.normal.toArray() as Vec3;
    const nid = copySubtree(d, d0.instances, id);
    const c = d.instances[nid];
    c.attachment = att;
    c.symmetry.partnerId = null;
    p.children.push(nid);
    ids.push(nid);
  }
  return { design: d, ids };
}
