import { Vector3 } from 'three';
import type { Vec3 } from '../../core/types';
import type { MeshBuilder, SurfFn } from '../MeshBuilder';
import type { HandleKind, HandleSpec, ParamDef } from '../types';

export const DEFORM_PARAMS: ParamDef[] = [
  { key: 'bend', label: 'Bend sideways', min: -1, max: 1, step: 0.01, def: 0, group: 'Deform' },
  { key: 'lean', label: 'Bend forward', min: -1, max: 1, step: 0.01, def: 0, group: 'Deform' },
  { key: 'twist', label: 'Twist', min: -1.6, max: 1.6, step: 0.01, def: 0, unit: 'deg', group: 'Deform' },
  { key: 'skew', label: 'Skew', min: -0.8, max: 0.8, step: 0.01, def: 0, group: 'Deform' },
];

export const FIT_PARAMS: ParamDef[] = [
  { key: 'offset', label: 'Fit offset', min: -0.01, max: 0.06, step: 0.001, def: 0, unit: 'cm', group: 'Fit' },
  { key: 'thickness', label: 'Plate thickness', min: 0.001, max: 0.014, step: 0.0005, def: 0.004, unit: 'cm', group: 'Fit' },
];

/** Register bend / lean / twist / skew deformers around a pivot. `height` normalises the effect. */
export function applyDeformers(b: MeshBuilder, p: Record<string, number>, pivot: Vec3, height: number) {
  const bend = p.bend ?? 0;
  const lean = p.lean ?? 0;
  const twist = p.twist ?? 0;
  const skew = p.skew ?? 0;
  if (!bend && !lean && !twist && !skew) return;
  const h = Math.max(height, 0.02);
  const [px, py, pz] = pivot;
  b.deform((q: Vector3) => {
    const t = (q.y - py) / h;
    if (twist) {
      const a = twist * t;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const x = q.x - px;
      const z = q.z - pz;
      q.x = px + x * c + z * s;
      q.z = pz - x * s + z * c;
    }
    if (bend) q.x += bend * h * t * t * 1.2;
    if (lean) q.z += lean * h * t * t * 1.2;
    if (skew) q.x += skew * (q.y - py);
  });
}

const tmpA = new Vector3();

/** Build a handle from a surface function evaluated at (u, v) pushed `lift` metres outward. */
export function surfHandle(
  id: string,
  param: string,
  label: string,
  kind: HandleKind,
  fn: SurfFn,
  u: number,
  v: number,
  axis: Vec3,
  gain: number,
  lift = 0.018,
): HandleSpec {
  fn(u, v, lift, tmpA);
  return { id, param, label, kind, position: [tmpA.x, tmpA.y, tmpA.z], axis, gain };
}

/** Apply the builder's deformers + mirroring to handle positions and axes. */
export function finishHandles(b: MeshBuilder, handles: HandleSpec[], mirror: boolean): HandleSpec[] {
  return handles.map((h) => {
    const p = new Vector3(...h.position);
    for (const d of b.deformers) d(p);
    let ax = h.axis;
    if (mirror) {
      p.x = -p.x;
      ax = [-ax[0], ax[1], ax[2]];
    }
    return { ...h, position: [p.x, p.y, p.z], axis: ax };
  });
}

export const frac = (x: number) => x - Math.floor(x);

/** Sawtooth used for overlapping lames: 1 at the lower edge of each lame, 0 at its top. */
export const lameSaw = (v: number, n: number) => (n >= 1 ? 1 - frac(v * n * 0.99999) : 0);
