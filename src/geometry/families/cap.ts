// "Cap" family: domed plates that sit over a joint - pauldrons, spaulders, knee and elbow cops.

import { Vector3 } from 'three';
import { clamp, linspace } from '../../core/math';
import type { PartType, Vec3 } from '../../core/types';
import { GROUP_BASE, GROUP_TRIM, MeshBuilder, uniqueSorted, type SurfFn } from '../MeshBuilder';
import type { CoverRange, Family, HandleSpec } from '../types';
import { DEFORM_PARAMS, FIT_PARAMS, applyDeformers, finishHandles, lameSaw, surfHandle } from './common';

export interface CapCfg {
  part: PartType;
  center: Vec3;
  /** Direction the dome points. */
  apex: Vec3;
  /** Direction of maximum coverage (e.g. down the arm). */
  e1: Vec3;
  R: number;
  phiIn: number;
  phiOut: number;
  cover: CoverRange[];
}

const EPS = 2e-4;

export const cap: Family = {
  id: 'cap',
  slots: ['base', 'trim', 'detail'],
  params: [
    { key: 'size', label: 'Size', min: 0.6, max: 2.2, step: 0.01, def: 1, unit: 'x', group: 'Size' },
    { key: 'length', label: 'Length', min: 0.6, max: 2.4, step: 0.01, def: 1, unit: 'x', group: 'Size' },
    { key: 'width', label: 'Width', min: 0.6, max: 2, step: 0.01, def: 1, unit: 'x', group: 'Size' },
    { key: 'height', label: 'Dome height', min: 0.4, max: 2.2, step: 0.01, def: 1, unit: 'x', group: 'Size' },
    { key: 'cover', label: 'Coverage', min: 0.5, max: 1.4, step: 0.01, def: 1, unit: 'x', group: 'Trim' },
    { key: 'flare', label: 'Rim flare', min: -0.5, max: 2, step: 0.01, def: 0, group: 'Shape' },
    { key: 'ridge', label: 'Centre ridge', min: 0, max: 2, step: 0.01, def: 0, group: 'Shape' },
    { key: 'pointed', label: 'Pointed apex', min: 0, max: 1.5, step: 0.01, def: 0, group: 'Shape' },
    { key: 'wing', label: 'Side wing', min: 0, max: 2, step: 0.01, def: 0, group: 'Shape' },
    { key: 'lames', label: 'Segments', min: 0, max: 8, step: 1, def: 0, unit: 'n', group: 'Detail' },
    { key: 'lameDepth', label: 'Segment overlap', min: 0, max: 0.012, step: 0.0005, def: 0.004, unit: 'cm', group: 'Detail' },
    { key: 'flute', label: 'Fluting', min: 0, max: 2, step: 0.01, def: 0, group: 'Detail' },
    { key: 'facets', label: 'Facets', min: 0, max: 12, step: 1, def: 0, unit: 'n', group: 'Detail', hint: '0 = smooth dome; 4+ = angular faceted plate' },
    { key: 'trim', label: 'Rim trim', min: 0, max: 0.03, step: 0.001, def: 0.008, unit: 'cm', group: 'Detail' },
    ...FIT_PARAMS,
    ...DEFORM_PARAMS,
  ],

  coverage(_p, cfg) {
    return (cfg as CapCfg).cover;
  },

  build(p, ctx, cfgAny) {
    const cfg = cfgAny as CapCfg;
    const b = new MeshBuilder();
    const c = new Vector3(...cfg.center);
    const A = new Vector3(...cfg.apex).normalize();
    const e1 = new Vector3(...cfg.e1).normalize();
    const e2 = new Vector3().crossVectors(A, e1).normalize();
    const gap = ctx.fitOffset + (p.offset ?? 0);
    const R = (cfg.R + gap) * (p.size ?? 1);
    const kL = p.length ?? 1;
    const kW = p.width ?? 1;
    const kH = p.height ?? 1;
    const nL = Math.round(p.lames ?? 0);
    const trimW = p.trim ?? 0;
    const phiMax = (u: number) => {
      const w = Math.pow(0.5 + 0.5 * Math.cos(u), 1.3);
      return clamp((cfg.phiIn + (cfg.phiOut - cfg.phiIn) * w) * (p.cover ?? 1), 0.3, 2.6);
    };
    const vTrim = trimW > 0 ? clamp(trimW / (R * 1.5), 0, 0.3) : 0;

    const fn: SurfFn = (u, v, off, out) => {
      const phi = phiMax(u) * (1 - v);
      const s = Math.sin(phi);
      const co = Math.cos(phi);
      let o = off;
      const iv = 1 - v;
      o += (p.flare ?? 0) * 0.03 * iv * iv * iv;
      if (nL >= 1) o += (p.lameDepth ?? 0.004) * lameSaw(v * 0.999, nL) * (v < 0.98 ? 1 : 0);
      if (p.ridge) o += p.ridge * 0.011 * Math.exp(-Math.pow(Math.sin(u) / 0.16, 2)) * (0.4 + 0.6 * iv);
      if (p.flute) o += p.flute * 0.003 * (0.5 + 0.5 * Math.cos(u * 12)) * Math.sin(Math.PI * clamp(iv * 1.1, 0, 1));
      if (vTrim > 0 && v < vTrim) o += 0.0024;
      const hp = 1 + (p.pointed ?? 0) * 0.6 * Math.pow(v, 6);
      const a = (R * kL + o) * s * Math.cos(u);
      const bb = (R * kW + o) * s * Math.sin(u);
      const h = (R * kH * hp + o) * co;
      out.set(c.x + e1.x * a + e2.x * bb + A.x * h, c.y + e1.y * a + e2.y * bb + A.y * h, c.z + e1.z * a + e2.z * bb + A.z * h);
    };

    const facets = Math.round(p.facets ?? 0);
    const flat = facets >= 3;
    const us = flat ? linspace(-Math.PI, Math.PI, facets) : linspace(-Math.PI, Math.PI, 40);
    let vs = flat ? linspace(0, 1, 3) : linspace(0, 1, 16);
    if (!flat) {
      if (vTrim > 0) vs.push(vTrim - EPS, vTrim + EPS);
      for (let k = 1; k < nL; k++) vs.push(k / nL - EPS, k / nL + EPS);
      vs = uniqueSorted(vs, 5e-5);
    }
    b.addSurface({
      us,
      vs,
      fn,
      closedU: true,
      flat,
      thickness: flat ? 0 : (p.thickness ?? 0.004),
      id: 0,
      uvScale: [R, R * 1.5],
      group: (_i, _j, _uc, vc) => (vTrim > 0 && vc < vTrim && !flat ? GROUP_TRIM : GROUP_BASE),
    });

    // side wing (fan plate) on the +e2 side
    const wing = p.wing ?? 0;
    let wfn: SurfFn | null = null;
    if (wing > 0.03) {
      const wr = 0.046 * wing * (p.size ?? 1);
      const base = c.clone().addScaledVector(e2, R * kW * 0.93);
      wfn = (u, v, off, out) => {
        const rr = wr * v * (1 + 0.16 * Math.cos(2 * u));
        const a = Math.cos(u) * rr * 1.15;
        const h = Math.sin(u) * rr;
        const k = off + 0.012 * (1 - v * v) + 0.004 * v * Math.abs(Math.sin(u * 3));
        out.set(base.x + e1.x * a + A.x * h + e2.x * k, base.y + e1.y * a + A.y * h + e2.y * k, base.z + e1.z * a + A.z * h + e2.z * k);
      };
      b.addSurface({
        us: linspace(-Math.PI, Math.PI, 28),
        vs: linspace(0.02, 1, 5),
        fn: wfn,
        closedU: true,
        thickness: p.thickness ?? 0.004,
        id: 1,
        uvScale: [wr, wr],
        group: (_i, _j, _uc, vc) => (vc > 0.8 && trimW > 0 ? GROUP_TRIM : GROUP_BASE),
      });
    }

    const pivot: Vec3 = [c.x, c.y, c.z];
    applyDeformers(b, p, pivot, R * 2);
    if (ctx.mirror) b.mirrorX();

    const ax = (v: Vector3): Vec3 => [v.x, v.y, v.z];
    const handles: HandleSpec[] = [
      surfHandle('size', 'size', 'Size', 'size', fn, 0, 1, ax(A), 1 / Math.max(0.02, cfg.R + gap), 0.025),
      surfHandle('length', 'length', 'Length', 'size', fn, 0, 0.25, ax(e1), 1 / R, 0.025),
      surfHandle('width', 'width', 'Width', 'size', fn, Math.PI / 2, 0.3, ax(e2), 1 / R, 0.025),
      surfHandle('flare', 'flare', 'Rim flare', 'shape', fn, -Math.PI / 2, 0.02, ax(e2.clone().negate()), 1 / 0.03, 0.025),
    ];
    if (wfn) handles.push(surfHandle('wing', 'wing', 'Side wing', 'shape', wfn, Math.PI / 2, 1, ax(A), 1 / 0.046, 0.012));

    return { geometry: b.finish(), builder: b, handles: finishHandles(b, handles, ctx.mirror), pivot: ctx.mirror ? [-pivot[0], pivot[1], pivot[2]] : pivot };
  },
};
