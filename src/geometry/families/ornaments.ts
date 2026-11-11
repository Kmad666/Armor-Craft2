// Accessory families. Accessories are built in their own local frame:
//  - "normalY" accessories (horns, spikes, plumes, crests) grow along +Y from the origin, bending toward +Z.
//  - "normalZ" accessories (plates, emblems, bands, chains, strips) lie on the surface facing +Z with +Y up.

import { Matrix4, Quaternion, TorusGeometry, Vector3 } from 'three';
import { clamp, lerp, linspace } from '../../core/math';
import type { Vec3 } from '../../core/types';
import { GROUP_BASE, GROUP_TRIM, MeshBuilder, uniqueSorted, type SurfFn } from '../MeshBuilder';
import type { Family, HandleSpec } from '../types';
import { DEFORM_PARAMS, applyDeformers, finishHandles, lameSaw, surfHandle } from './common';

const EPS = 2e-4;

// ---------------------------------------------------------------- horn

export interface HornCfg {
  profile?: 'horn' | 'feather' | 'blade';
}

export const horn: Family = {
  id: 'horn',
  slots: ['base', 'trim'],
  params: [
    { key: 'length', label: 'Length', min: 0.02, max: 0.7, step: 0.002, def: 0.16, unit: 'cm', group: 'Size' },
    { key: 'radius', label: 'Base radius', min: 0.004, max: 0.09, step: 0.001, def: 0.022, unit: 'cm', group: 'Size' },
    { key: 'curvature', label: 'Curvature', min: -4, max: 5, step: 0.02, def: 1.2, group: 'Shape' },
    { key: 'spiral', label: 'Spiral', min: -6, max: 6, step: 0.02, def: 0, group: 'Shape' },
    { key: 'taper', label: 'Taper', min: 0.3, max: 3, step: 0.01, def: 1, group: 'Shape' },
    { key: 'tip', label: 'Tip size', min: 0.01, max: 1, step: 0.01, def: 0.05, group: 'Shape' },
    { key: 'flatten', label: 'Flatten', min: 0.15, max: 2, step: 0.01, def: 1, group: 'Shape' },
    { key: 'rings', label: 'Growth rings', min: 0, max: 2, step: 0.01, def: 0, group: 'Detail' },
    { key: 'ferrule', label: 'Base collar', min: 0, max: 0.4, step: 0.01, def: 0.12, group: 'Detail' },
    ...DEFORM_PARAMS,
  ],

  build(p, ctx, cfgAny) {
    const cfg = cfgAny as HornCfg;
    const b = new MeshBuilder();
    const L = p.length ?? 0.16;
    const R = p.radius ?? 0.022;
    const N = 36;
    const P: Vector3[] = [];
    const T: Vector3[] = [];
    const Nn: Vector3[] = [];
    const Bn: Vector3[] = [];
    const pos = new Vector3(0, -Math.min(0.012, L * 0.1), 0);
    const t = new Vector3(0, 1, 0);
    const n = new Vector3(0, 0, 1);
    const q = new Quaternion();
    const bi = new Vector3();
    const total = L + Math.min(0.012, L * 0.1);
    for (let k = 0; k <= N; k++) {
      bi.crossVectors(t, n).normalize();
      P.push(pos.clone());
      T.push(t.clone());
      Nn.push(n.clone());
      Bn.push(bi.clone());
      const ds = 1 / N;
      pos.addScaledVector(t, total * ds);
      // curve toward the normal, then spin the bend plane (spiral)
      q.setFromAxisAngle(bi, (p.curvature ?? 0) * ds);
      t.applyQuaternion(q).normalize();
      n.applyQuaternion(q);
      q.setFromAxisAngle(t, (p.spiral ?? 0) * ds);
      n.applyQuaternion(q).normalize();
    }
    const profile = cfg.profile ?? 'horn';
    const radiusAt = (s: number) => {
      const tip = p.tip ?? 0.05;
      if (profile === 'feather') return R * (0.22 + 0.95 * Math.pow(Math.sin(Math.PI * Math.pow(s, 0.75)), 0.8)) * (s > 0.97 ? (1 - s) / 0.03 + 0.05 : 1);
      if (profile === 'blade') return R * (s < 0.75 ? 1 : Math.max(tip, 1 - Math.pow((s - 0.75) / 0.25, 1.5)));
      return R * Math.max(tip * 0.4, Math.pow(1 - s, p.taper ?? 1) * (1 - tip) + tip * (1 - s * s * 0.6));
    };
    const tmp = new Vector3();
    const fn: SurfFn = (u, v, off, out) => {
      const f = clamp(v, 0, 1) * N;
      const i = Math.min(N - 1, Math.floor(f));
      const w = f - i;
      out.copy(P[i]).lerp(P[i + 1], w);
      let r = radiusAt(v);
      if (p.rings) r *= 1 + p.rings * 0.07 * Math.sin(v * 46) * (1 - v);
      if (profile === 'feather') r *= 1 + 0.16 * Math.sin(u * 9 + v * 15);
      if (v < (p.ferrule ?? 0) && profile === 'horn') r += 0.0022;
      r += off;
      const nn = tmp.copy(Nn[i]).lerp(Nn[i + 1], w).normalize();
      out.addScaledVector(nn, r * Math.cos(u) * (p.flatten ?? 1));
      const bb = tmp.copy(Bn[i]).lerp(Bn[i + 1], w).normalize();
      out.addScaledVector(bb, r * Math.sin(u));
    };
    let vs = linspace(0, 1, N);
    const fer = profile === 'horn' ? (p.ferrule ?? 0) : 0;
    if (fer > 0.01) vs = uniqueSorted([...vs, fer - EPS, fer + EPS], 5e-5);
    b.addSurface({
      us: linspace(-Math.PI, Math.PI, 18),
      vs,
      fn,
      closedU: true,
      id: 0,
      uvScale: [R, L],
      group: (_i, _j, _uc, vc) => (vc < fer ? GROUP_TRIM : GROUP_BASE),
    });
    const pivot: Vec3 = [0, 0, 0];
    applyDeformers(b, p, pivot, L);
    if (ctx.mirror) b.mirrorX();
    const tipP = P[N];
    const tipT = T[N];
    const mid = Math.round(N * 0.55);
    const handles: HandleSpec[] = [
      { id: 'length', param: 'length', label: 'Length', kind: 'size', position: [tipP.x + tipT.x * 0.015, tipP.y + tipT.y * 0.015, tipP.z + tipT.z * 0.015], axis: [tipT.x, tipT.y, tipT.z], gain: 1 },
      {
        id: 'curvature',
        param: 'curvature',
        label: 'Curvature',
        kind: 'shape',
        position: [P[mid].x + Nn[mid].x * (radiusAt(0.55) + 0.02), P[mid].y + Nn[mid].y * (radiusAt(0.55) + 0.02), P[mid].z + Nn[mid].z * (radiusAt(0.55) + 0.02)],
        axis: [0, 0, 1],
        gain: 1 / Math.max(0.02, L * 0.22),
      },
      { id: 'radius', param: 'radius', label: 'Base radius', kind: 'size', position: [R + 0.015, 0.012, 0], axis: [1, 0, 0], gain: 1 },
    ];
    return { geometry: b.finish(), builder: b, handles: finishHandles(b, handles, ctx.mirror), pivot };
  },
};

// ---------------------------------------------------------------- crest (brush / comb)

export const crest: Family = {
  id: 'crest',
  slots: ['base', 'trim'],
  params: [
    { key: 'length', label: 'Length', min: 0.04, max: 0.6, step: 0.002, def: 0.24, unit: 'cm', group: 'Size' },
    { key: 'height', label: 'Height', min: 0.01, max: 0.4, step: 0.002, def: 0.09, unit: 'cm', group: 'Size' },
    { key: 'thick', label: 'Thickness', min: 0.004, max: 0.08, step: 0.001, def: 0.022, unit: 'cm', group: 'Size' },
    { key: 'arch', label: 'Arch', min: 0, max: 3.6, step: 0.02, def: 1.9, group: 'Shape', hint: 'How strongly the crest follows a curved surface' },
    { key: 'fan', label: 'Fan spread', min: 0, max: 1.6, step: 0.01, def: 1, group: 'Shape' },
    { key: 'sweep', label: 'Sweep back', min: -1, max: 1, step: 0.01, def: 0, group: 'Shape' },
    { key: 'wave', label: 'Bristle wave', min: 0, max: 2, step: 0.01, def: 1, group: 'Detail' },
    { key: 'holder', label: 'Holder height', min: 0, max: 0.6, step: 0.01, def: 0.16, group: 'Detail' },
    { key: 'turn', label: 'Turn', min: -3.15, max: 3.15, step: 0.01, def: 0, unit: 'deg', group: 'Shape' },
    ...DEFORM_PARAMS,
  ],
  build(p, ctx) {
    const b = new MeshBuilder();
    const L = p.length ?? 0.24;
    const Hh = p.height ?? 0.09;
    const span = Math.max(0.02, p.arch ?? 1.9);
    const Ra = L / span;
    const holder = p.holder ?? 0.16;
    const turn = p.turn ?? 0;
    const ct = Math.cos(turn);
    const st = Math.sin(turn);
    const fn: SurfFn = (u, v, off, out) => {
      const beta = (u * span) / 2;
      const by = Ra * (Math.cos(beta) - 1);
      const bz = Ra * Math.sin(beta);
      const fb = beta * (p.fan ?? 1) + (p.sweep ?? 0) * 0.9 * v;
      const h = Hh * (1 - 0.22 * u * u) * (v <= holder ? 1 : 1 + (p.wave ?? 0) * 0.035 * Math.sin(u * 48 + 1.7) * (v - holder));
      const d = v * h - 0.008;
      const w = ((p.thick ?? 0.022) / 2) * (v < holder ? 1 : 1 - 0.55 * ((v - holder) / (1 - holder))) * (1 - 0.5 * Math.pow(Math.abs(u), 6));
      const x = off < 0 ? -w : w + off;
      const y = by + Math.cos(fb) * d;
      const z = bz + Math.sin(fb) * d;
      out.set(x * ct + z * st, y, -x * st + z * ct);
    };
    let vs = linspace(0, 1, 10);
    if (holder > 0.01) vs = uniqueSorted([...vs, holder - EPS, holder + EPS], 5e-5);
    b.addSurface({
      us: linspace(-1, 1, 40),
      vs,
      fn,
      flip: true,
      thickness: 0.001,
      id: 0,
      uvScale: [L / 2, Hh],
      group: (_i, _j, _uc, vc) => (vc < holder ? GROUP_TRIM : GROUP_BASE),
    });
    const pivot: Vec3 = [0, 0, 0];
    applyDeformers(b, p, pivot, Hh);
    if (ctx.mirror) b.mirrorX();
    const handles: HandleSpec[] = [
      surfHandle('height', 'height', 'Height', 'size', fn, 0, 1, [0, 1, 0], 1, 0),
      surfHandle('length', 'length', 'Length', 'size', fn, 1, 0.5, [st, 0, ct], 2, 0),
    ];
    handles[0].position[1] += 0.02;
    return { geometry: b.finish(), builder: b, handles: finishHandles(b, handles, ctx.mirror), pivot };
  },
};

// ---------------------------------------------------------------- curved plate

export interface PlateCfg {
  cloth?: boolean;
  anchorTop?: boolean;
  flat?: boolean;
}

export const plate: Family = {
  id: 'plate',
  slots: ['base', 'trim'],
  params: [
    { key: 'width', label: 'Width', min: 0.01, max: 0.6, step: 0.002, def: 0.12, unit: 'cm', group: 'Size' },
    { key: 'height', label: 'Height', min: 0.006, max: 0.9, step: 0.002, def: 0.08, unit: 'cm', group: 'Size' },
    { key: 'wrap', label: 'Wrap', min: 0, max: 3.4, step: 0.02, def: 1.2, group: 'Shape', hint: 'Curves the plate around the surface underneath' },
    { key: 'bow', label: 'Vertical bow', min: -0.06, max: 0.1, step: 0.001, def: 0, unit: 'cm', group: 'Shape' },
    { key: 'taper', label: 'Taper', min: -1, max: 1, step: 0.01, def: 0, group: 'Shape' },
    { key: 'point', label: 'Lower point', min: 0, max: 1.5, step: 0.01, def: 0, group: 'Shape' },
    { key: 'arch', label: 'Upper arch', min: -1, max: 1.5, step: 0.01, def: 0, group: 'Shape' },
    { key: 'crescent', label: 'Crescent', min: 0, max: 1.5, step: 0.01, def: 0, group: 'Shape' },
    { key: 'snout', label: 'Snout', min: 0, max: 0.12, step: 0.002, def: 0, unit: 'cm', group: 'Shape' },
    { key: 'ridge', label: 'Centre ridge', min: 0, max: 2, step: 0.01, def: 0, group: 'Shape' },
    { key: 'slit', label: 'Eye slit', min: 0, max: 2, step: 0.05, def: 0, group: 'Detail' },
    { key: 'breaths', label: 'Breath slots', min: 0, max: 8, step: 1, def: 0, unit: 'n', group: 'Detail' },
    { key: 'lames', label: 'Segments', min: 0, max: 10, step: 1, def: 0, unit: 'n', group: 'Detail' },
    { key: 'wave', label: 'Cloth wave', min: 0, max: 2, step: 0.01, def: 0, group: 'Detail' },
    { key: 'trim', label: 'Trim width', min: 0, max: 0.03, step: 0.001, def: 0.006, unit: 'cm', group: 'Detail' },
    { key: 'thickness', label: 'Thickness', min: 0.001, max: 0.014, step: 0.0005, def: 0.004, unit: 'cm', group: 'Fit' },
    ...DEFORM_PARAMS,
  ],
  build(p, ctx, cfgAny) {
    const cfg = cfgAny as PlateCfg;
    const b = new MeshBuilder();
    const W = p.width ?? 0.12;
    const Hh = p.height ?? 0.08;
    const wrap = p.wrap ?? 0;
    const nL = Math.round(p.lames ?? 0);
    const cres = p.crescent ?? 0;
    const trimW = p.trim ?? 0;
    const tu = trimW > 0 ? clamp(trimW / (W / 2), 0, 0.5) : 0;
    const tv = trimW > 0 ? clamp(trimW / Hh, 0, 0.4) : 0;
    const fn: SurfFn = (u, v, off, out) => {
      const sc = 1 - (p.taper ?? 0) * (p.taper! >= 0 ? 1 - v : -v) * 0.75;
      const ang = (u * wrap) / 2;
      let x: number;
      let z: number;
      let nx = 0;
      let nz = 1;
      if (wrap < 0.02) {
        x = (u * W * sc) / 2;
        z = 0;
      } else {
        const Rw = W / wrap;
        x = Rw * Math.sin(ang) * sc;
        z = Rw * (Math.cos(ang) - 1);
        nx = Math.sin(ang);
        nz = Math.cos(ang);
      }
      const au = Math.abs(u);
      let hh = Hh * (1 - 0.88 * cres * u * u);
      let y = (v - (cfg.anchorTop ? 1 : 0.5)) * hh + cres * Hh * 1.3 * u * u;
      if (p.point) y -= p.point * Hh * 0.5 * Math.pow(1 - au, 1.3) * (1 - v);
      if (p.arch) y += p.arch * Hh * 0.35 * (1 - u * u) * v;
      let o = off;
      const c2 = 2 * v - 1;
      o += (p.bow ?? 0) * (1 - c2 * c2);
      if (p.snout) o += p.snout * Math.exp(-Math.pow(u / 0.5, 2)) * Math.exp(-Math.pow((v - 0.42) / 0.26, 2));
      if (p.ridge) o += p.ridge * 0.012 * Math.pow(1 - au, 5);
      if (nL >= 1) o += 0.0035 * lameSaw(v, nL);
      if (p.wave) o += p.wave * 0.012 * Math.sin((cfg.anchorTop ? 1 - v : v) * 11 + u * 1.5) * (cfg.anchorTop ? 1 - v : 1);
      if ((tu > 0 && au > 1 - tu) || (tv > 0 && (v < tv || v > 1 - tv))) o += cfg.cloth ? 0.001 : 0.002;
      out.set(x + nx * o, y, z + nz * o);
    };
    const flat = !!cfg.flat;
    let us = flat ? linspace(-1, 1, 4) : linspace(-1, 1, clamp(Math.round(10 + wrap * 8), 10, 34));
    let vs = flat ? linspace(0, 1, 3) : linspace(0, 1, clamp(Math.round(Hh / 0.012), 6, 30));
    const slit = (p.slit ?? 0) * 0.06;
    const nb = Math.round(p.breaths ?? 0);
    if (!flat) {
      if (tu > 0) us.push(-1 + tu - EPS, -1 + tu + EPS, 1 - tu - EPS, 1 - tu + EPS);
      if (tv > 0) vs.push(tv - EPS, tv + EPS, 1 - tv - EPS, 1 - tv + EPS);
      for (let k = 1; k < nL; k++) vs.push(k / nL - EPS, k / nL + EPS);
      if (slit > 0) {
        vs.push(0.74 - slit / 2, 0.74 + slit / 2);
        us.push(-0.8, -0.14, 0.14, 0.8);
      }
      for (let k = 0; k < nb; k++) {
        const c = nb === 1 ? 0 : lerp(-0.5, 0.5, k / (nb - 1));
        us.push(c - 0.035, c + 0.035);
      }
      if (nb > 0) vs.push(0.2, 0.46);
      us = uniqueSorted(us, 5e-5);
      vs = uniqueSorted(vs, 5e-5);
    }
    b.addSurface({
      us,
      vs,
      fn,
      flat,
      thickness: cfg.cloth || flat ? 0 : (p.thickness ?? 0.004),
      id: 0,
      uvScale: [W / 2, Hh],
      group: (_i, _j, uc, vc) => {
        const au = Math.abs(uc);
        if (slit > 0 && vc > 0.74 - slit / 2 && vc < 0.74 + slit / 2 && au > 0.14 && au < 0.8) return -1;
        if (nb > 0 && vc > 0.2 && vc < 0.46) {
          for (let k = 0; k < nb; k++) {
            const c = nb === 1 ? 0 : lerp(-0.5, 0.5, k / (nb - 1));
            if (Math.abs(uc - c) < 0.035) return -1;
          }
        }
        if ((tu > 0 && au > 1 - tu) || (tv > 0 && (vc < tv || vc > 1 - tv))) return GROUP_TRIM;
        return GROUP_BASE;
      },
    });
    const pivot: Vec3 = [0, cfg.anchorTop ? -Hh / 2 : 0, 0];
    applyDeformers(b, p, [0, cfg.anchorTop ? 0 : -Hh / 2, 0], Hh);
    if (ctx.mirror) b.mirrorX();
    const handles: HandleSpec[] = [
      surfHandle('width', 'width', 'Width', 'size', fn, 1, 0.5, [1, 0, 0], 2, 0.012),
      cfg.anchorTop
        ? surfHandle('height', 'height', 'Length', 'size', fn, 0, 0, [0, -1, 0], 1, 0.012)
        : surfHandle('height', 'height', 'Height', 'size', fn, 0, 1, [0, 1, 0], 2, 0.012),
      surfHandle('wrap', 'wrap', 'Wrap', 'shape', fn, -1, 0.5, [0, 0, -1], 14, 0.012),
    ];
    if (!cfg.anchorTop) handles.push(surfHandle('point', 'point', 'Lower point', 'shape', fn, 0, 0, [0, -1, 0], 1 / Math.max(0.01, Hh * 0.5), 0.012));
    handles[0].position[0] += 0.012;
    return { geometry: b.finish(), builder: b, handles: finishHandles(b, handles, ctx.mirror), pivot };
  },
};

// ---------------------------------------------------------------- medallion (rivets, bosses, emblems, buckles)

export interface MedallionCfg {
  ring?: boolean;
}

export const medallion: Family = {
  id: 'medallion',
  slots: ['base', 'trim'],
  params: [
    { key: 'radius', label: 'Radius', min: 0.003, max: 0.2, step: 0.001, def: 0.03, unit: 'cm', group: 'Size' },
    { key: 'dome', label: 'Dome height', min: 0, max: 0.12, step: 0.001, def: 0.008, unit: 'cm', group: 'Size' },
    { key: 'aspect', label: 'Aspect', min: 0.3, max: 3, step: 0.01, def: 1, group: 'Shape' },
    { key: 'star', label: 'Star points depth', min: 0, max: 1.5, step: 0.01, def: 0, group: 'Shape' },
    { key: 'points', label: 'Star points', min: 3, max: 16, step: 1, def: 8, unit: 'n', group: 'Shape' },
    { key: 'boss', label: 'Centre boss', min: 0, max: 0.08, step: 0.001, def: 0, unit: 'cm', group: 'Detail' },
    { key: 'spike', label: 'Centre spike', min: 0, max: 0.2, step: 0.002, def: 0, unit: 'cm', group: 'Detail' },
    { key: 'rim', label: 'Rim width', min: 0, max: 0.5, step: 0.01, def: 0.18, group: 'Detail' },
    ...DEFORM_PARAMS,
  ],
  build(p, ctx, cfgAny) {
    const cfg = cfgAny as MedallionCfg;
    const b = new MeshBuilder();
    const R = p.radius ?? 0.03;
    const n = Math.round(p.points ?? 8);
    const rim = p.rim ?? 0;
    const fn: SurfFn = (u, v, off, out) => {
      const st = (p.star ?? 0) > 0 ? 1 - (p.star ?? 0) * 0.42 * (0.5 - 0.5 * Math.cos(n * u)) * v : 1;
      const r = R * v * st;
      let z = (p.dome ?? 0) * (1 - v * v) + off;
      if (p.boss) z += p.boss * Math.exp(-Math.pow(v / 0.32, 2));
      if (p.spike) z += p.spike * Math.pow(Math.max(0, 1 - v / 0.3), 1.6);
      if (rim > 0 && v > 1 - rim) z += 0.0016 + (p.dome ?? 0) * 0.25;
      if (v > 0.985) z -= 0.004;
      out.set(r * Math.cos(u) * (p.aspect ?? 1), r * Math.sin(u), z);
    };
    let vs = linspace(cfg.ring ? 0.56 : 0, 1, cfg.ring ? 4 : 9);
    vs.push(0.99);
    if (rim > 0) vs.push(1 - rim - EPS, 1 - rim + EPS);
    vs = uniqueSorted(vs, 5e-5);
    b.addSurface({
      us: linspace(-Math.PI, Math.PI, (p.star ?? 0) > 0 ? Math.max(32, n * 8) : R < 0.012 ? 12 : 32),
      vs,
      fn,
      closedU: true,
      flip: true,
      thickness: cfg.ring ? 0.004 : 0,
      id: 0,
      uvScale: [R, R],
      group: (_i, _j, _uc, vc) => (rim > 0 && vc > 1 - rim ? GROUP_TRIM : GROUP_BASE),
    });
    if (cfg.ring) {
      // buckle tongue
      const bar: SurfFn = (u, v, off, out) => out.set((v - 0.5) * 2 * R * (p.aspect ?? 1) * 0.95, Math.sin(u) * R * 0.09, (p.dome ?? 0) * 0.5 + 0.003 + Math.cos(u) * R * 0.09 + off * 0);
      b.addSurface({ us: linspace(-Math.PI, Math.PI, 8), vs: linspace(0, 1, 2), fn: bar, closedU: true, flip: true, group: GROUP_TRIM });
    }
    const pivot: Vec3 = [0, 0, 0];
    applyDeformers(b, p, pivot, R * 2);
    if (ctx.mirror) b.mirrorX();
    const handles: HandleSpec[] = [
      { id: 'radius', param: 'radius', label: 'Radius', kind: 'size', position: [R * (p.aspect ?? 1) + 0.012, 0, 0.005], axis: [1, 0, 0], gain: 1 },
      { id: 'dome', param: 'dome', label: 'Dome height', kind: 'shape', position: [0, 0, (p.dome ?? 0) + (p.boss ?? 0) + (p.spike ?? 0) + 0.014], axis: [0, 0, 1], gain: 1 },
    ];
    return { geometry: b.finish(), builder: b, handles: finishHandles(b, handles, ctx.mirror), pivot };
  },
};

// ---------------------------------------------------------------- chain

const linkGeo = new TorusGeometry(1, 0.26, 5, 10);

export const chain: Family = {
  id: 'chain',
  slots: ['base'],
  params: [
    { key: 'span', label: 'Span', min: 0.02, max: 0.8, step: 0.002, def: 0.16, unit: 'cm', group: 'Size' },
    { key: 'sag', label: 'Sag', min: 0, max: 0.5, step: 0.002, def: 0.05, unit: 'cm', group: 'Size' },
    { key: 'link', label: 'Link size', min: 0.005, max: 0.04, step: 0.0005, def: 0.011, unit: 'cm', group: 'Detail' },
    { key: 'wrap', label: 'Wrap', min: 0, max: 3, step: 0.02, def: 0, group: 'Shape' },
  ],
  build(p, ctx) {
    const b = new MeshBuilder();
    const span = p.span ?? 0.16;
    const sag = p.sag ?? 0.05;
    const link = p.link ?? 0.011;
    const wrap = p.wrap ?? 0;
    const at = (t: number, out: Vector3) => {
      const u = 2 * t - 1;
      const y = -sag * (1 - u * u);
      if (wrap < 0.02) return out.set((u * span) / 2, y, link * 0.35);
      const Rw = span / wrap;
      const a = (u * wrap) / 2;
      return out.set(Rw * Math.sin(a), y, Rw * (Math.cos(a) - 1) + link * 0.35);
    };
    // approximate arc length
    let len = 0;
    const a = new Vector3();
    const c = new Vector3();
    at(0, a);
    for (let i = 1; i <= 40; i++) {
      at(i / 40, c);
      len += a.distanceTo(c);
      a.copy(c);
    }
    const count = clamp(Math.round(len / (link * 1.25)), 3, 90);
    const m = new Matrix4();
    const q = new Quaternion();
    const q2 = new Quaternion();
    const dir = new Vector3();
    const s = new Vector3(link * 0.5, link * 0.72, link * 0.5);
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      at(t, a);
      at(Math.min(1, t + 0.01), c);
      dir.subVectors(c, a).normalize();
      // torus ring lies in XY with its long axis (Y) along the chain direction
      q.setFromUnitVectors(new Vector3(0, 1, 0), dir);
      if (i % 2) {
        q2.setFromAxisAngle(dir, Math.PI / 2);
        q.premultiply(q2);
      }
      m.compose(a, q, s);
      b.addGeometry(linkGeo, m, GROUP_BASE);
    }
    if (ctx.mirror) b.mirrorX();
    const end = at(1, new Vector3());
    const midP = at(0.5, new Vector3());
    const handles: HandleSpec[] = [
      { id: 'span', param: 'span', label: 'Span', kind: 'size', position: [end.x + 0.015, end.y, end.z], axis: [1, 0, 0], gain: 2 },
      { id: 'sag', param: 'sag', label: 'Sag', kind: 'shape', position: [midP.x, midP.y - 0.015, midP.z], axis: [0, -1, 0], gain: 1 },
    ];
    return { geometry: b.finish(), builder: b, handles: finishHandles(b, handles, ctx.mirror), pivot: [0, 0, 0] };
  },
};
