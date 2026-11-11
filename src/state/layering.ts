// Layer manager: turns layer categories + ordering into real geometric shell offsets.
//
// Every fitted component declares which stretches of the body it covers. A component is pushed
// outward by the summed thickness of everything beneath it that overlaps those stretches, so
// layers are separated by actual geometry rather than depth-buffer tricks. Soft layers (cloth,
// mail) are additionally "squeezed" flat wherever something sits on top of them, which is what
// stops a flared tunic from poking through the cuirass worn over it.

import { REGION_BY_ID } from '../body/body';
import { TEMPLATE_BY_ID } from '../catalog/templates';
import type { ComponentInstance, Design, PartId, PartType } from '../core/types';
import { bulkOf, coverageOf } from '../geometry/build';
import type { SqueezeRange } from '../geometry/types';

export const LAYER_NAMES: Record<number, string> = {
  1: 'Inner garment',
  2: 'Flexible armor',
  3: 'Primary armor',
  4: 'Secondary armor',
  5: 'Accessory',
};

const BASE_GAP = 0.0015;
const LAYER_GAP = 0.0015;

interface ResolvedRange {
  part: PartId;
  type: PartType;
  y0: number;
  y1: number;
  passive: boolean;
}

interface Item {
  inst: ComponentInstance;
  thickness: number;
  ranges: ResolvedRange[];
}

function resolveRanges(inst: ComponentInstance): ResolvedRange[] {
  const t = TEMPLATE_BY_ID[inst.templateId];
  const region = REGION_BY_ID[inst.region];
  if (!t || !region) return [];
  const out: ResolvedRange[] = [];
  for (const r of coverageOf(t, inst.params)) {
    const passive = !!r.passive;
    const base = { type: r.part, y0: r.y0, y1: r.y1, passive };
    if (r.part === 'head' || r.part === 'torso') out.push({ part: r.part, ...base });
    else if (region.side === 'C') {
      out.push({ part: `${r.part}L` as PartId, ...base });
      out.push({ part: `${r.part}R` as PartId, ...base });
    } else out.push({ part: `${r.part}${region.side}` as PartId, ...base });
  }
  return out;
}

export function isBelow(a: ComponentInstance, b: ComponentInstance): boolean {
  return a.layer < b.layer || (a.layer === b.layer && a.order < b.order);
}

const overlap = (a: ResolvedRange, b: ResolvedRange) => a.part === b.part && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 0.005;

export interface FitResult {
  /** Shell offset (metres from the body surface) per fitted root component. */
  offsets: Record<string, number>;
  /** Where each component is pressed flat by the layers above it. */
  squeeze: Record<string, SqueezeRange[]>;
}

export function computeFit(design: Design): FitResult {
  const items: Item[] = [];
  for (const id of design.roots) {
    const inst = design.instances[id];
    const t = inst && TEMPLATE_BY_ID[inst.templateId];
    if (!inst || !t || t.kind !== 'fitted') continue;
    items.push({ inst, thickness: t.stack + Math.max(0, inst.params.offset ?? 0) + bulkOf(t, inst.params), ranges: resolveRanges(inst) });
  }
  const offsets: Record<string, number> = {};
  const squeeze: Record<string, SqueezeRange[]> = {};
  for (const x of items) {
    let best = 0;
    for (const r of x.ranges) {
      let sum = 0;
      for (const y of items) {
        if (y === x || !isBelow(y.inst, x.inst)) continue;
        if (y.ranges.some((q) => !q.passive && overlap(q, r))) sum += y.thickness + LAYER_GAP;
      }
      if (sum > best) best = sum;
    }
    offsets[x.inst.id] = +(BASE_GAP + best).toFixed(4);
    const sq: SqueezeRange[] = [];
    for (const y of items) {
      if (y === x || !y.inst.visible || !isBelow(x.inst, y.inst)) continue;
      for (const q of y.ranges) {
        if (q.passive || !x.ranges.some((r) => r.part === q.part)) continue;
        if (!sq.some((s) => s.part === q.type && s.y0 === q.y0 && s.y1 === q.y1)) sq.push({ part: q.type, y0: +q.y0.toFixed(3), y1: +q.y1.toFixed(3) });
      }
    }
    if (sq.length) squeeze[x.inst.id] = sq.sort((a, b) => a.part.localeCompare(b.part) || a.y0 - b.y0 || a.y1 - b.y1);
  }
  return { offsets, squeeze };
}

export function computeFitOffsets(design: Design): Record<string, number> {
  return computeFit(design).offsets;
}

/** Fitted roots that share body coverage with `id`, sorted bottom-to-top. */
export function stackOf(design: Design, id: string): ComponentInstance[] {
  const me = design.instances[id];
  if (!me) return [];
  const mine = resolveRanges(me);
  const out: ComponentInstance[] = [];
  for (const rid of design.roots) {
    const inst = design.instances[rid];
    if (!inst) continue;
    if (rid === id) {
      out.push(inst);
      continue;
    }
    const theirs = resolveRanges(inst);
    if (theirs.some((q) => mine.some((r) => overlap(q, r)))) out.push(inst);
  }
  return out.sort((a, b) => a.layer - b.layer || a.order - b.order);
}

/** Simple clipping heuristics: warn when a lower layer has been made bulkier than the layer above it. */
export function clipWarnings(design: Design, id: string): string[] {
  const me = design.instances[id];
  const t = me && TEMPLATE_BY_ID[me.templateId];
  if (!me || !t || t.kind !== 'fitted') return [];
  const stack = stackOf(design, id);
  const warn: string[] = [];
  const bulk = (i: ComponentInstance) => Math.max(i.params.width ?? 1, i.params.depth ?? 1);
  for (const other of stack) {
    if (other.id === id) continue;
    const ot = TEMPLATE_BY_ID[other.templateId];
    if (!ot || ot.family !== t.family) continue;
    if (isBelow(other, me) && bulk(other) > bulk(me) + 0.04) warn.push(`"${other.name}" underneath is wider and may poke through. Widen this piece or raise its fit offset.`);
    if (isBelow(me, other) && bulk(me) > bulk(other) + 0.04) warn.push(`This piece is wider than "${other.name}" above it and may poke through.`);
  }
  return warn;
}
