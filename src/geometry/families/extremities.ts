// Hands and feet: shared shape functions for the mannequin and for gauntlets / footwear,
// plus the "gauntlet" and "footwear" families.

import { Matrix4, SphereGeometry, Vector3 } from 'three';
import { FOOT, HAND, PROFILES, leftPartToPart, sampleProfile } from '../../body/body';
import { clamp, hermite, lerp, linspace } from '../../core/math';
import type { Vec3 } from '../../core/types';
import { GROUP_BASE, GROUP_DETAIL, GROUP_TRIM, MeshBuilder, uniqueSorted, type SurfFn } from '../MeshBuilder';
import type { Family, HandleSpec } from '../types';
import { FIT_PARAMS, finishHandles, lameSaw, surfHandle } from './common';

const EPS = 2e-4;
const ARM_LEN = 0.57;
const knuckleGeo = new SphereGeometry(1, 8, 6);

const palmYs = HAND.palm.map((r) => r[0]).reverse();
const palmRx = HAND.palm.map((r) => r[1]).reverse();
const palmRz = HAND.palm.map((r) => r[2]).reverse();
const palmCz = HAND.palm.map((r) => r[3]).reverse();

/** Curl applied to everything below the knuckles so fingers bend gently toward the palm (-X). */
function curl(out: Vector3, amount = 1) {
  const d = HAND.fingerBaseY - out.y;
  if (d > 0) out.x -= amount * 1.6 * d * d + 0.04 * d;
}

export interface HandOpts {
  gap: number;
  width: number;
  /** 0..1 fraction of the circumference covered, centred on the back of the hand (+X). */
  wrap: number;
  mitten: boolean;
  lames: number;
  fingerLames: number;
  thickness: number;
  fingerLen: number;
  idBase: number;
}

export function addHand(b: MeshBuilder, o: HandOpts): { palm: SurfFn } {
  const closed = o.wrap >= 0.995;
  const half = closed ? Math.PI : o.wrap * Math.PI;
  const us = closed ? linspace(-Math.PI, Math.PI, 28) : linspace(Math.PI / 2 - half, Math.PI / 2 + half, Math.max(6, Math.round(28 * o.wrap)));
  const y0 = HAND.fingerBaseY - 0.006;
  const palm: SurfFn = (u, v, off, out) => {
    const y = lerp(y0, 0.004, v);
    const rx = hermite(palmYs, palmRx, y) + o.gap + off;
    const rz = (hermite(palmYs, palmRz, y) + o.gap + off) * o.width;
    let k = 0;
    if (o.lames >= 1) k = 0.0026 * lameSaw(v, o.lames);
    out.set((rx + k) * Math.sin(u), y, hermite(palmYs, palmCz, y) + (rz + k) * Math.cos(u));
  };
  let vs = linspace(0, 1, 9);
  for (let k = 1; k < o.lames; k++) vs.push(k / o.lames - EPS, k / o.lames + EPS);
  vs = uniqueSorted(vs, 5e-5);
  b.addSurface({ us, vs, fn: palm, closedU: closed, thickness: o.thickness, id: o.idBase, uvScale: [0.03, 0.1] });

  const tipRound = (t: number) => (t > 0.86 ? Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.86) / 0.14, 2))) : 1);
  if (o.mitten) {
    const len = 0.088 * o.fingerLen;
    const fn: SurfFn = (u, v, off, out) => {
      const t = 1 - v; // 0 at knuckles, 1 at tip
      const y = HAND.fingerBaseY - t * len;
      const rr = tipRound(t);
      let k = o.gap + off + 0.001;
      if (o.fingerLames >= 1) k += 0.0024 * lameSaw(v, o.fingerLames);
      const rx = (0.0125 + k) * (0.35 + 0.65 * rr);
      const rz = (0.043 * (1 - 0.14 * t) + k) * o.width * (0.5 + 0.5 * rr);
      out.set(rx * Math.sin(u), y, 0.0005 + rz * Math.cos(u));
      curl(out);
    };
    let fv = linspace(0, 1, 12);
    for (let k = 1; k < o.fingerLames; k++) fv.push(k / o.fingerLames - EPS, k / o.fingerLames + EPS);
    fv = uniqueSorted(fv, 5e-5);
    b.addSurface({ us: linspace(-Math.PI, Math.PI, 28), vs: fv, fn, closedU: true, id: o.idBase + 1, uvScale: [0.03, len] });
  } else {
    HAND.fingers.forEach((f) => {
      const len = f.len * o.fingerLen;
      const fn: SurfFn = (u, v, off, out) => {
        const t = 1 - v;
        const y = HAND.fingerBaseY + 0.006 - t * (len + 0.006);
        const rr = tipRound(t);
        let k = o.gap + off;
        if (o.fingerLames >= 1) k += 0.0016 * lameSaw(v, o.fingerLames);
        const r = (f.r * (1 - 0.18 * t) + k) * (0.25 + 0.75 * rr);
        out.set(r * Math.sin(u), y, f.z * o.width + r * Math.cos(u));
        curl(out);
      };
      let fv = linspace(0, 1, 10);
      for (let k = 1; k < o.fingerLames; k++) fv.push(k / o.fingerLames - EPS, k / o.fingerLames + EPS);
      fv = uniqueSorted(fv, 5e-5);
      b.addSurface({ us: linspace(-Math.PI, Math.PI, 10), vs: fv, fn, closedU: true, uvScale: [0.01, len] });
    });
  }
  // thumb
  const th = HAND.thumb;
  const d = new Vector3(...th.dir).normalize();
  const n1 = new Vector3().crossVectors(d, new Vector3(1, 0, 0)).normalize();
  const n2 = new Vector3().crossVectors(d, n1).normalize();
  const tfn: SurfFn = (u, v, off, out) => {
    const t = 1 - v;
    const s = -0.012 + t * (th.len * o.fingerLen + 0.012);
    const r = (th.r * (1 - 0.15 * t) + o.gap + off) * (0.25 + 0.75 * tipRound(t));
    out.set(th.base[0] + d.x * s, th.base[1] + d.y * s, th.base[2] * o.width + d.z * s);
    out.addScaledVector(n1, r * Math.cos(u)).addScaledVector(n2, r * Math.sin(u));
  };
  b.addSurface({ us: linspace(-Math.PI, Math.PI, 10), vs: linspace(0, 1, 8), fn: tfn, closedU: true, flip: true, uvScale: [0.01, th.len] });
  return { palm };
}

// ---------------------------------------------------------------- gauntlet family

export const gauntlet: Family = {
  id: 'gauntlet',
  slots: ['base', 'trim', 'detail'],
  params: [
    { key: 'cuff', label: 'Cuff length', min: 0, max: 0.26, step: 0.002, def: 0.09, unit: 'cm', group: 'Size' },
    { key: 'cuffFlare', label: 'Cuff flare', min: 0, max: 2.5, step: 0.01, def: 0.7, group: 'Shape' },
    { key: 'taper', label: 'Cuff taper', min: -0.5, max: 0.5, step: 0.01, def: 0, group: 'Shape' },
    { key: 'width', label: 'Hand width', min: 0.85, max: 1.6, step: 0.01, def: 1, unit: 'x', group: 'Size' },
    { key: 'fingerLen', label: 'Finger length', min: 0.7, max: 1.6, step: 0.01, def: 1, unit: 'x', group: 'Size' },
    { key: 'wrap', label: 'Hand coverage', min: 0.3, max: 1, step: 0.01, def: 1, unit: '%', group: 'Trim' },
    { key: 'mitten', label: 'Mitten fingers', min: 0, max: 1, step: 1, def: 0, unit: 'n', group: 'Shape' },
    { key: 'lames', label: 'Hand segments', min: 0, max: 6, step: 1, def: 0, unit: 'n', group: 'Detail' },
    { key: 'fingerLames', label: 'Finger segments', min: 0, max: 6, step: 1, def: 3, unit: 'n', group: 'Detail' },
    { key: 'cuffLames', label: 'Cuff segments', min: 0, max: 6, step: 1, def: 0, unit: 'n', group: 'Detail' },
    { key: 'knuckles', label: 'Knuckle guards', min: 0, max: 2, step: 0.05, def: 0, group: 'Detail' },
    { key: 'trim', label: 'Cuff trim', min: 0, max: 0.03, step: 0.001, def: 0.008, unit: 'cm', group: 'Detail' },
    ...FIT_PARAMS,
  ],
  coverage(p) {
    const out = [{ part: 'hand' as const, y0: -0.19, y1: 0.01 }];
    if ((p.cuff ?? 0) > 0.01) out.push({ part: 'arm' as any, y0: -ARM_LEN - 0.01, y1: -ARM_LEN + p.cuff });
    return out;
  },
  build(p, ctx, cfg) {
    const b = new MeshBuilder();
    const gap = 0.003 + ctx.fitOffset + (p.offset ?? 0);
    const soft = !!cfg.soft;
    const thickness = soft ? 0 : (p.thickness ?? 0.003);
    const cuff = p.cuff ?? 0.09;
    const arm = PROFILES.arm;
    const trimW = p.trim ?? 0;
    const nC = Math.round(p.cuffLames ?? 0);
    let cfn: SurfFn | null = null;
    if (cuff > 0.01) {
      const vt = trimW > 0 ? clamp(trimW / cuff, 0, 0.4) : 0;
      cfn = (u, v, off, out) => {
        const y = lerp(-0.006, cuff, v);
        const sec = sampleProfile(arm, -ARM_LEN + y);
        let o = gap + off + 0.002 + (p.cuffFlare ?? 0) * 0.022 * v * v + (p.taper ?? 0) * 0.02 * (v - 0.5);
        if (nC >= 1) o += 0.003 * lameSaw(v, nC);
        if (vt > 0 && v > 1 - vt) o += 0.0022;
        out.set((sec.rx + o) * Math.sin(u), y, (sec.rz + o) * Math.cos(u));
      };
      let vs = linspace(0, 1, clamp(Math.round(cuff / 0.012), 5, 18));
      if (vt > 0) vs.push(1 - vt - EPS, 1 - vt + EPS);
      for (let k = 1; k < nC; k++) vs.push(k / nC - EPS, k / nC + EPS);
      vs = uniqueSorted(vs, 5e-5);
      b.addSurface({
        us: linspace(-Math.PI, Math.PI, 28),
        vs,
        fn: cfn,
        closedU: true,
        thickness,
        id: 0,
        uvScale: [0.035, cuff],
        group: (_i, _j, _uc, vc) => (vt > 0 && vc > 1 - vt ? GROUP_TRIM : GROUP_BASE),
      });
    }
    const { palm } = addHand(b, {
      gap,
      width: p.width ?? 1,
      wrap: p.wrap ?? 1,
      mitten: (p.mitten ?? 0) >= 0.5,
      lames: Math.round(p.lames ?? 0),
      fingerLames: Math.round(p.fingerLames ?? 0),
      thickness,
      fingerLen: p.fingerLen ?? 1,
      idBase: 1,
    });
    const kn = p.knuckles ?? 0;
    if (kn > 0.05) {
      const m = new Matrix4();
      for (const f of HAND.fingers) {
        const r = 0.0085 * kn;
        m.makeScale(r * 0.8, r * 1.1, r).setPosition(0.014 + gap + 0.002, HAND.fingerBaseY + 0.004, f.z * (p.width ?? 1));
        b.addGeometry(knuckleGeo, m, GROUP_TRIM);
      }
    }
    if (ctx.mirror) b.mirrorX();
    const handles: HandleSpec[] = [];
    if (cfn) {
      handles.push(surfHandle('cuff', 'cuff', 'Cuff length', 'trim', cfn, Math.PI / 2, 1, [0, 1, 0], 1, 0.022));
      handles.push(surfHandle('cuffFlare', 'cuffFlare', 'Cuff flare', 'shape', cfn, 0, 0.95, [0, 0, 1], 1 / 0.022, 0.022));
    }
    handles.push(surfHandle('width', 'width', 'Hand width', 'size', palm, Math.PI, 0.4, [0, 0, -1], 1 / 0.04, 0.02));
    const pivot: Vec3 = [0, -0.05, 0];
    return { geometry: b.finish(), builder: b, handles: finishHandles(b, handles, ctx.mirror), pivot: pivot };
  },
};

// ---------------------------------------------------------------- feet

const footZs = FOOT.sections.map((r) => r[0]);
const footRx = FOOT.sections.map((r) => r[1]);
const footRy = FOOT.sections.map((r) => r[2]);
const footCy = FOOT.sections.map((r) => r[3]);
const BALL_Z = 0.11;

export interface FootOpts {
  gap: number;
  toe: number;
  pointy: number;
  width: number;
  lames: number;
  hole: boolean;
  sole: boolean;
  id: number;
  thickness?: number;
}

export function addFoot(b: MeshBuilder, o: FootOpts): SurfFn {
  const z0 = FOOT.heelZ - o.gap;
  const z1 = FOOT.toeZ + o.gap + o.toe;
  const toeLen0 = FOOT.toeZ - BALL_Z;
  const L = z1 - z0;
  const fn: SurfFn = (u, v, off, out) => {
    const z = lerp(z0, z1, v);
    let zs = z;
    let pt = 1;
    if (z > BALL_Z) {
      const t = (z - BALL_Z) / (z1 - BALL_Z);
      zs = BALL_Z + t * toeLen0;
      pt = 1 - o.pointy * t * t * 0.85;
    }
    zs = clamp(zs, FOOT.heelZ, FOOT.toeZ);
    let k = o.gap + off;
    if (o.lames >= 1 && v > 0.42) k += 0.003 * lameSaw((1 - v) / 0.58, o.lames);
    const endTaper = v < 0.04 ? Math.sqrt(v / 0.04) : v > 0.97 ? Math.sqrt(Math.max(0, (1 - v) / 0.03)) : 1;
    const rx = (hermite(footZs, footRx, zs) + k) * o.width * pt * (0.02 + 0.98 * endTaper);
    const ry = (hermite(footZs, footRy, zs) + k) * (0.02 + 0.98 * endTaper);
    const cy = hermite(footZs, footCy, zs);
    const s = Math.sin(u);
    const c = Math.cos(u);
    const e = 2 / 2.6;
    const x = rx * Math.sign(s) * Math.pow(Math.abs(s), e);
    const y = Math.max(-0.0005, cy + ry * Math.sign(c) * Math.pow(Math.abs(c), e));
    out.set(x, y, z);
  };
  let vs = linspace(0, 1, 26);
  vs.push(0.01, 0.02, 0.985, 0.995);
  for (let k = 1; k < o.lames; k++) {
    const v = 1 - (k / o.lames) * 0.58;
    vs.push(v - EPS, v + EPS);
  }
  vs = uniqueSorted(vs, 5e-5);
  b.addSurface({
    us: linspace(-Math.PI, Math.PI, 32),
    vs,
    fn,
    closedU: true,
    flip: true,
    id: o.id,
    uvScale: [0.04, L],
    group: (_i, _j, uc, vc) => {
      const z = lerp(z0, z1, vc);
      if (o.hole && Math.abs(uc) < 0.85 && z > -0.05 && z < 0.036) return -1;
      if (o.sole && Math.abs(uc) > 2.3) return GROUP_DETAIL;
      return GROUP_BASE;
    },
  });
  return fn;
}

export const footwear: Family = {
  id: 'footwear',
  slots: ['base', 'trim', 'detail'],
  params: [
    { key: 'toe', label: 'Toe length', min: 0, max: 0.2, step: 0.002, def: 0.01, unit: 'cm', group: 'Size' },
    { key: 'pointy', label: 'Toe point', min: 0, max: 1.1, step: 0.01, def: 0.2, group: 'Shape' },
    { key: 'width', label: 'Width', min: 0.85, max: 1.5, step: 0.01, def: 1, unit: 'x', group: 'Size' },
    { key: 'shaft', label: 'Shaft height', min: 0, max: 0.46, step: 0.002, def: 0.04, unit: 'cm', group: 'Size' },
    { key: 'cuff', label: 'Top flare', min: 0, max: 2, step: 0.01, def: 0.2, group: 'Shape' },
    { key: 'lames', label: 'Toe segments', min: 0, max: 8, step: 1, def: 0, unit: 'n', group: 'Detail' },
    { key: 'shaftLames', label: 'Shaft segments', min: 0, max: 8, step: 1, def: 0, unit: 'n', group: 'Detail' },
    { key: 'trim', label: 'Top trim', min: 0, max: 0.04, step: 0.001, def: 0.01, unit: 'cm', group: 'Detail' },
    { key: 'offset', label: 'Fit offset', min: -0.005, max: 0.04, step: 0.001, def: 0, unit: 'cm', group: 'Fit' },
  ],
  coverage(p) {
    return [
      { part: 'foot', y0: 0, y1: 0.1 },
      { part: 'leg', y0: -0.86, y1: -0.84 + (p.shaft ?? 0) },
    ];
  },
  build(p, ctx) {
    const b = new MeshBuilder();
    const gap = 0.004 + ctx.fitOffset + (p.offset ?? 0);
    const shoe = addFoot(b, {
      gap,
      toe: p.toe ?? 0,
      pointy: p.pointy ?? 0,
      width: p.width ?? 1,
      lames: Math.round(p.lames ?? 0),
      hole: true,
      sole: true,
      id: 0,
    });
    const shaft = Math.max(0.02, p.shaft ?? 0.04);
    const M = leftPartToPart('leg', 'foot');
    const leg = PROFILES.leg;
    const yA = -0.865;
    const yB = -0.84 + shaft;
    const Ls = yB - yA;
    const trimW = p.trim ?? 0;
    const vt = trimW > 0 ? clamp(trimW / Ls, 0, 0.4) : 0;
    const nS = Math.round(p.shaftLames ?? 0);
    const sfn: SurfFn = (u, v, off, out) => {
      const y = lerp(yA, yB, v);
      const sec = sampleProfile(leg, y);
      let o = gap + off + 0.003 + (p.cuff ?? 0) * 0.02 * v * v * v;
      if (nS >= 1) o += 0.003 * lameSaw(v, nS);
      if (vt > 0 && v > 1 - vt) o += 0.002;
      // widen toward the shoe so the shaft blends into the ankle opening
      const blend = Math.pow(1 - clamp(v * Ls / 0.05, 0, 1), 2) * 0.008;
      out.set((sec.rx + o + blend) * Math.sin(u), y, sec.cz + (sec.rz + o + blend) * Math.cos(u)).applyMatrix4(M);
    };
    let vs = linspace(0, 1, clamp(Math.round(Ls / 0.014), 4, 30));
    if (vt > 0) vs.push(1 - vt - EPS, 1 - vt + EPS);
    for (let k = 1; k < nS; k++) vs.push(k / nS - EPS, k / nS + EPS);
    vs = uniqueSorted(vs, 5e-5);
    b.addSurface({
      us: linspace(-Math.PI, Math.PI, 28),
      vs,
      fn: sfn,
      closedU: true,
      thickness: 0.003,
      id: 1,
      uvScale: [0.04, Ls],
      group: (_i, _j, _uc, vc) => (vt > 0 && vc > 1 - vt ? GROUP_TRIM : GROUP_BASE),
    });
    if (ctx.mirror) b.mirrorX();
    const handles: HandleSpec[] = [
      surfHandle('toe', 'toe', 'Toe length', 'size', shoe, 0, 1, [0, 0, 1], 1, 0.02),
      surfHandle('shaft', 'shaft', 'Shaft height', 'trim', sfn, 0, 1, [0, 1, 0], 1, 0.022),
      surfHandle('width', 'width', 'Width', 'size', shoe, Math.PI / 2, 0.62, [1, 0, 0], 1 / 0.045, 0.02),
    ];
    handles[0].position[2] += 0.02;
    return { geometry: b.finish(), builder: b, handles: finishHandles(b, handles, ctx.mirror), pivot: [0, 0.05, 0.04] };
  },
};
