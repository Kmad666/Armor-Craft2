// Geometry entry point: template + parameters -> cached BuildResult.

import { TEMPLATE_BY_ID, type TemplateDef } from '../catalog/templates';
import { clamp } from '../core/math';
import { cap } from './families/cap';
import { dome } from './families/dome';
import { footwear, gauntlet } from './families/extremities';
import { chain, crest, horn, medallion, plate } from './families/ornaments';
import { shell, type ShellCfg } from './families/shell';
import type { BuildResult, CoverRange, Family, ParamDef, SqueezeRange } from './types';

export const FAMILIES: Record<string, Family> = { shell, dome, cap, horn, crest, plate, medallion, chain, gauntlet, footwear };

export function familyOf(t: TemplateDef): Family {
  return FAMILIES[t.family];
}

const paramDefCache = new Map<string, ParamDef[]>();

/** Parameter definitions for a template: family params with the template's preset as defaults. */
export function paramDefs(t: TemplateDef): ParamDef[] {
  let d = paramDefCache.get(t.id);
  if (!d) {
    d = familyOf(t).params
      .filter((p) => !(t.family === 'shell' && p.key === 'sleeve' && !(t.cfg as ShellCfg).sleeves))
      .filter((p) => !(t.family === 'shell' && (p.key === 'thickness') && (t.cfg as ShellCfg).cloth))
      .map((p) => {
        const def = t.preset[p.key] ?? p.def;
        return { ...p, def, min: Math.min(p.min, def), max: Math.max(p.max, def) };
      });
    paramDefCache.set(t.id, d);
  }
  return d;
}

export function defaultParams(t: TemplateDef): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of familyOf(t).params) out[p.key] = t.preset[p.key] ?? p.def;
  return out;
}

/** Clamp a parameter patch to the template's allowed ranges. */
export function clampParams(t: TemplateDef, patch: Record<string, number>): Record<string, number> {
  const defs = familyOf(t).params;
  const out: Record<string, number> = {};
  for (const k of Object.keys(patch)) {
    const d = defs.find((x) => x.key === k);
    const v = patch[k];
    if (!d || typeof v !== 'number' || !isFinite(v)) continue;
    const def = t.preset[k] ?? d.def;
    let x = clamp(v, Math.min(d.min, def), Math.max(d.max, def));
    if (d.unit === 'n') x = Math.round(x);
    out[k] = x;
  }
  return out;
}

export function coverageOf(t: TemplateDef, params: Record<string, number>): CoverRange[] {
  const f = familyOf(t);
  return f.coverage ? f.coverage(params, t.cfg) : [];
}

const cache = new Map<string, BuildResult>();
const MAX_CACHE = 260;
let builds = 0;

export function buildStats() {
  return { builds, cached: cache.size };
}

export function bulkOf(t: TemplateDef, params: Record<string, number>): number {
  const f = familyOf(t);
  return f.bulk ? f.bulk(params, t.cfg) : 0;
}

export function buildKey(templateId: string, params: Record<string, number>, fitOffset: number, mirror: boolean, squeeze?: SqueezeRange[]): string {
  let s = `${templateId}|${mirror ? 1 : 0}|${fitOffset.toFixed(4)}`;
  if (squeeze) for (const q of squeeze) s += `|q${q.part}:${q.y0.toFixed(3)}:${q.y1.toFixed(3)}`;
  for (const k of Object.keys(params).sort()) s += `|${k}:${+params[k].toFixed(5)}`;
  return s;
}

export function buildComponent(templateId: string, params: Record<string, number>, fitOffset = 0, mirror = false, squeeze?: SqueezeRange[]): BuildResult {
  const t = TEMPLATE_BY_ID[templateId];
  if (!t) throw new Error(`Unknown template "${templateId}"`);
  const key = buildKey(templateId, params, fitOffset, mirror, squeeze);
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const full = { ...defaultParams(t), ...params };
  const res = familyOf(t).build(full, { fitOffset, mirror, squeeze }, t.cfg);
  builds++;
  cache.set(key, res);
  if (cache.size > MAX_CACHE) {
    const first = cache.keys().next().value as string;
    const old = cache.get(first);
    cache.delete(first);
    old?.geometry.dispose();
  }
  return res;
}

/**
 * Map an attachment's parametric coordinates to the mirror-image location on the same parent
 * (used when mirroring an accessory across a centre piece such as a helmet).
 */
export function mirrorSurfaceCoords(t: TemplateDef, surface: number, u: number, v: number): { surface: number; u: number; v: number } {
  if (t.family === 'shell') {
    const cfg = t.cfg as ShellCfg;
    const n = (cfg.panels ?? 'single') === 'single' ? 1 : 2;
    if (surface >= n) return { surface: n + (1 - (surface - n)), u, v };
    if (cfg.panels === 'pair') return { surface: 1 - surface, u: -u, v };
    return { surface, u: -u, v };
  }
  if (t.family === 'cap') return { surface, u: -u, v };
  return { surface, u: -u, v };
}
