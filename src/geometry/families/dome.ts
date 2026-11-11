// "Dome" family: helmets and coifs.
// A helmet is a crown (superellipse profile above the brow line) plus a lower wall whose
// bottom edge varies around the head (face opening, cheek guards, neck guard), with optional
// brim, peak, nasal bar, reinforcing bands, eye slit and face hole.

import { ConeGeometry, Matrix4, SphereGeometry, Vector3 } from 'three';
import { PROFILES, sampleProfile } from '../../body/body';
import { clamp, linspace, smoothstep, wrapAngle } from '../../core/math';
import { GROUP_BASE, GROUP_TRIM, MeshBuilder, uniqueSorted, type SurfFn } from '../MeshBuilder';
import type { Family, HandleSpec } from '../types';
import { DEFORM_PARAMS, FIT_PARAMS, applyDeformers, finishHandles, lameSaw, surfHandle } from './common';

const Y_E = 1.712; // brow line: widest part of the head
const RX = 0.077;
const RZ = 0.097;
const V_E = 0.44;
const EPS = 2e-4;
const rivetGeo = new SphereGeometry(1, 7, 5);
const coneGeo = new ConeGeometry(1, 1, 10, 1);

export interface DomeCfg {
  soft?: boolean;
}

export const dome: Family = {
  id: 'dome',
  slots: ['base', 'trim', 'detail'],
  params: [
    { key: 'height', label: 'Crown height', min: 0.05, max: 0.34, step: 0.002, def: 0.1, unit: 'cm', group: 'Size' },
    { key: 'width', label: 'Width', min: 0.85, max: 1.7, step: 0.01, def: 1, unit: 'x', group: 'Size' },
    { key: 'depth', label: 'Depth', min: 0.85, max: 1.7, step: 0.01, def: 1, unit: 'x', group: 'Size' },
    { key: 'crown', label: 'Crown shape', min: 1.05, max: 6, step: 0.05, def: 2, group: 'Shape', hint: 'Low = pointed, high = flat-topped' },
    { key: 'apexShift', label: 'Apex shift', min: -0.08, max: 0.08, step: 0.002, def: 0, unit: 'cm', group: 'Shape' },
    { key: 'front', label: 'Front edge', min: 0.004, max: 0.3, step: 0.002, def: 0.02, unit: 'cm', group: 'Trim', hint: 'How far the helmet comes down over the face' },
    { key: 'side', label: 'Side edge', min: 0.004, max: 0.34, step: 0.002, def: 0.04, unit: 'cm', group: 'Trim' },
    { key: 'back', label: 'Back edge', min: 0.004, max: 0.34, step: 0.002, def: 0.06, unit: 'cm', group: 'Trim' },
    { key: 'faceWidth', label: 'Face opening width', min: 0.12, max: 1.5, step: 0.01, def: 0.9, group: 'Trim' },
    { key: 'cheek', label: 'Cheek guards', min: 0, max: 0.18, step: 0.002, def: 0, unit: 'cm', group: 'Trim' },
    { key: 'faceHole', label: 'Face hole', min: 0, max: 1.6, step: 0.01, def: 0, group: 'Trim' },
    { key: 'slit', label: 'Eye slit', min: 0, max: 2.5, step: 0.05, def: 0, group: 'Trim' },
    { key: 'flare', label: 'Lower flare', min: -0.4, max: 2, step: 0.01, def: 0, group: 'Shape' },
    { key: 'tail', label: 'Neck guard flare', min: 0, max: 2.5, step: 0.01, def: 0, group: 'Shape' },
    { key: 'hug', label: 'Jaw taper', min: 0, max: 1.2, step: 0.01, def: 0.2, group: 'Shape' },
    { key: 'snout', label: 'Visor snout', min: 0, max: 0.09, step: 0.002, def: 0, unit: 'cm', group: 'Shape' },
    { key: 'drape', label: 'Shoulder drape', min: 0, max: 1.6, step: 0.01, def: 0, group: 'Shape' },
    { key: 'brim', label: 'Brim width', min: 0, max: 0.16, step: 0.002, def: 0, unit: 'cm', group: 'Shape' },
    { key: 'brimDrop', label: 'Brim slope', min: -0.03, max: 0.09, step: 0.002, def: 0.02, unit: 'cm', group: 'Shape' },
    { key: 'peak', label: 'Front peak', min: 0, max: 0.1, step: 0.002, def: 0, unit: 'cm', group: 'Shape' },
    { key: 'ridge', label: 'Crown ridge', min: 0, max: 0.06, step: 0.001, def: 0, unit: 'cm', group: 'Detail' },
    { key: 'bands', label: 'Crown bands', min: 0, max: 16, step: 1, def: 0, unit: 'n', group: 'Detail' },
    { key: 'browBand', label: 'Brow band', min: 0, max: 1, step: 1, def: 0, unit: 'n', group: 'Detail' },
    { key: 'nasal', label: 'Nasal bar', min: 0, max: 0.11, step: 0.002, def: 0, unit: 'cm', group: 'Detail' },
    { key: 'lames', label: 'Neck lames', min: 0, max: 8, step: 1, def: 0, unit: 'n', group: 'Detail' },
    { key: 'rivets', label: 'Rivets', min: 0, max: 1, step: 1, def: 0, unit: 'n', group: 'Detail' },
    { key: 'spike', label: 'Top spike', min: 0, max: 0.12, step: 0.002, def: 0, unit: 'cm', group: 'Detail' },
    { key: 'trim', label: 'Rim trim', min: 0, max: 0.03, step: 0.001, def: 0.008, unit: 'cm', group: 'Detail' },
    ...FIT_PARAMS,
    ...DEFORM_PARAMS,
  ],

  coverage(p) {
    const d = Math.max(p.front ?? 0, p.side ?? 0, p.back ?? 0);
    return [{ part: 'head', y0: Y_E - d, y1: Y_E + (p.height ?? 0.1) }];
  },

  build(p, ctx, cfgAny) {
    const cfg = cfgAny as DomeCfg;
    const b = new MeshBuilder();
    const gap = (cfg.soft ? 0.003 : 0.009) + ctx.fitOffset + (p.offset ?? 0);
    const H = p.height ?? 0.1;
    const e = 2 / (p.crown ?? 2);
    const faceHalf = p.faceWidth ?? 0.9;
    const front = p.front ?? 0.02;
    const side = p.side ?? 0.04;
    const back = p.back ?? 0.06;
    const cheek = p.cheek ?? 0;
    const trimW = p.trim ?? 0;
    const nb = Math.round(p.bands ?? 0);
    const bandW = nb > 8 ? 0.045 : 0.075;
    const nLames = Math.round(p.lames ?? 0);
    const head = PROFILES.head;

    const depthAt = (u: number) => {
      const a = Math.abs(wrapAngle(u));
      const wF = 1 - smoothstep(faceHalf - 0.14, faceHalf + 0.14, a);
      const wB = smoothstep(Math.PI - 1.35, Math.PI - 0.85, a);
      let d = side + (front - side) * wF + (back - side) * wB;
      if (cheek) d += cheek * Math.exp(-Math.pow((a - Math.max(0.95, faceHalf + 0.12)) / 0.3, 2)) * (1 - wB);
      return Math.max(0.004, d);
    };
    let Dmax = 0.004;
    for (let i = 0; i < 72; i++) Dmax = Math.max(Dmax, depthAt((i / 72) * Math.PI * 2));

    const dOfV = (v: number) => Dmax * (1 - v / V_E);
    const vOfD = (d: number) => V_E * (1 - d / Dmax);
    const phiOfV = (v: number) => ((v - V_E) / (1 - V_E)) * (Math.PI / 2);
    const vOfUp = (h: number) => V_E + (1 - V_E) * (Math.asin(Math.pow(clamp(h / H, 0, 1), 1 / e)) / (Math.PI / 2));

    const browLo = 0.01;
    const browHi = 0.014;
    const slitH = (p.slit ?? 0) * 0.011;
    const slitD = 0.02;
    const hole = p.faceHole ?? 0;

    /** Lower wall at absolute depth `d` below the brow line. */
    const wall = (u: number, d: number, off: number, out: Vector3, raise = 0) => {
      const du = wrapAngle(u);
      const a = Math.abs(du);
      const cu = Math.cos(du);
      let o = gap + off + raise;
      let rs = 1;
      const dn = d / 0.15;
      const wB = smoothstep(Math.PI - 1.5, Math.PI - 0.7, a);
      rs += (p.flare ?? 0) * 0.22 * dn * dn + (p.tail ?? 0) * 0.42 * wB * Math.pow(dn, 1.6);
      rs -= (p.hug ?? 0) * 0.13 * smoothstep(0.03, 0.2, d) * (0.45 + 0.55 * Math.abs(Math.sin(du)));
      const cz = 0.012 * Math.min(1.4, dn) * (cu > 0 ? cu : 0);
      if (p.snout && cu > 0) o += p.snout * Math.exp(-Math.pow(a / 0.55, 2)) * Math.exp(-Math.pow((d - 0.075) / 0.05, 2));
      if (p.drape && d > 0.15) o += p.drape * (d - 0.15) * 1.25;
      if (nLames >= 1 && d > 0.03) o += 0.0032 * lameSaw((d - 0.03) / Math.max(0.01, Dmax - 0.03), nLames) * (1 - (cu > 0.3 && front < 0.05 ? 1 : 0));
      if ((p.browBand ?? 0) > 0 && d < browLo) o += 0.0024;
      out.set((RX * (p.width ?? 1) * rs + o) * Math.sin(du), Y_E - d, cz + (RZ * (p.depth ?? 1) * rs + o) * Math.cos(du));
    };

    const fn: SurfFn = (u, v, off, out) => {
      if (v <= V_E) {
        wall(u, Math.min(dOfV(v), depthAt(u)), off, out);
        return;
      }
      const du = wrapAngle(u);
      let o = gap + off;
      const phi = phiOfV(v);
      const s = Math.sin(phi);
      const c = Math.cos(phi);
      const up = H * Math.pow(s, e);
      const y = Y_E + up;
      const rs = Math.pow(Math.max(c, 0), e);
      const cz = (p.apexShift ?? 0) * s * s * s * s;
      if ((p.browBand ?? 0) > 0 && up < browHi) o += 0.0024;
      if (nb > 0 && up >= browHi * 0.5) {
        for (let k = 0; k < nb; k++) {
          if (Math.abs(wrapAngle(du - (k * Math.PI * 2) / nb)) < bandW) {
            o += nb > 8 ? 0.0028 : 0.0024;
            break;
          }
        }
      }
      if (p.ridge) o += p.ridge * Math.exp(-Math.pow(Math.sin(du) / 0.085, 2)) * Math.pow(s, 0.45) * (1 - 0.15 * c);
      const rr = Math.max(rs, 0);
      const ox = rr < 0.02 ? o * (rr / 0.02) : o;
      out.set((RX * (p.width ?? 1) * rr + ox) * Math.sin(du), y + (rr < 0.02 ? o - ox : 0), cz + (RZ * (p.depth ?? 1) * rr + ox) * Math.cos(du));
    };

    // rows
    let vs = [...linspace(0, V_E, clamp(Math.round(Dmax / 0.011), 3, 26)), ...linspace(V_E, 1, 16)];
    if ((p.browBand ?? 0) > 0) {
      const a = vOfD(Math.min(browLo, Dmax));
      const c = vOfUp(browHi);
      vs.push(a - EPS, a + EPS, c - EPS, c + EPS);
    }
    if (nb > 0) {
      const c = vOfUp(browHi * 0.5);
      vs.push(c);
    }
    if (slitH > 0) {
      const a = vOfD(Math.min(Dmax, slitD + slitH));
      const c = vOfD(Math.min(Dmax, slitD));
      vs.push(a, c);
    }
    if (hole > 0) {
      const d0 = Math.max(0, 0.062 - 0.082 * hole - 0.006);
      const d1 = Math.min(Dmax, 0.062 + 0.082 * hole + 0.006);
      for (const d of linspace(d0, d1, Math.ceil((d1 - d0) / 0.005))) vs.push(vOfD(d));
    }
    for (let k = 1; k < nLames; k++) {
      const d = 0.03 + ((Dmax - 0.03) * k) / nLames;
      const v = vOfD(d);
      vs.push(v - EPS, v + EPS);
    }
    vs = uniqueSorted(vs.filter((v) => v >= 0 && v <= 1), 5e-5);

    let us = linspace(-Math.PI, Math.PI, 72);
    if (nb > 0) {
      for (let k = 0; k < nb; k++) {
        const c = wrapAngle((k * Math.PI * 2) / nb);
        for (const s of [-1, 1]) {
          const x = c + s * bandW;
          if (x > -Math.PI && x < Math.PI) us.push(x - EPS, x + EPS);
        }
      }
    }
    if (slitH > 0) us.push(-0.62, 0.62, -0.045, 0.045);
    if (hole > 0) {
      const w = 0.7 * hole + 0.08;
      us.push(...linspace(-w, w, Math.ceil((w * 2) / 0.03)));
    }
    us = uniqueSorted(us, 5e-5);

    const thickness = cfg.soft ? 0 : (p.thickness ?? 0.004);
    b.addSurface({
      us,
      vs,
      fn,
      closedU: true,
      thickness,
      id: 0,
      uvScale: [0.09, 0.3],
      group: (_i, _j, uc, vc) => {
        const a = Math.abs(wrapAngle(uc));
        const depth = depthAt(uc);
        if (vc <= V_E) {
          const d = dOfV(vc);
          if (slitH > 0 && d > slitD && d < slitD + slitH && a < 0.62 && a > 0.045 && depth > slitD + slitH + 0.006) return -1;
          if (hole > 0) {
            const hx = a / (0.7 * hole);
            const hy = (d - 0.062) / (0.082 * hole);
            if (hx * hx + hy * hy < 1 && depth > 0.062 + 0.082 * hole) return -1;
          }
          if ((p.browBand ?? 0) > 0 && d < browLo) return GROUP_TRIM;
          return GROUP_BASE;
        }
        const up = H * Math.pow(Math.sin(phiOfV(vc)), e);
        if ((p.browBand ?? 0) > 0 && up < browHi) return GROUP_TRIM;
        if (nb > 0 && up >= browHi * 0.5) {
          for (let k = 0; k < nb; k++) if (Math.abs(wrapAngle(uc - (k * Math.PI * 2) / nb)) < bandW) return GROUP_TRIM;
        }
        return GROUP_BASE;
      },
    });

    // rim trim: a band that follows the lower edge exactly, however it curves
    if (trimW > 0.0005) {
      const rfn: SurfFn = (u, v, off, out) => {
        const depth = depthAt(u);
        wall(u, Math.max(0, depth - trimW * (1 - v) * Math.min(1, depth / (trimW * 1.5))), off, out, 0.0024);
      };
      b.addSurface({ us: linspace(-Math.PI, Math.PI, 144), vs: [0, 0.5, 1], fn: rfn, closedU: true, thickness: 0.0024 + (thickness || 0.002), uvScale: [0.09, trimW], group: GROUP_TRIM });
    }

    // brim / peak
    const brim = p.brim ?? 0;
    const peak = p.peak ?? 0;
    if (brim > 0.002 || peak > 0.002) {
      const edge = new Vector3();
      const ext = (u: number) => brim + peak * Math.pow(Math.max(0, Math.cos(u)), 1.5);
      const bfn: SurfFn = (u, v, off, out) => {
        fn(u, 0, 0, edge);
        const x = ext(u) * v;
        const r = Math.hypot(edge.x, edge.z) || 1;
        out.set(edge.x + (edge.x / r) * x, edge.y - (p.brimDrop ?? 0.02) * v * v * (ext(u) / Math.max(brim + peak, 1e-4)) + off, edge.z + (edge.z / r) * x);
      };
      b.addSurface({
        us: linspace(-Math.PI, Math.PI, 72),
        vs: linspace(0, 1, 4),
        fn: bfn,
        closedU: true,
        flip: true,
        thickness: thickness || 0.003,
        id: 1,
        uvScale: [0.09, 0.08],
        group: (_i, _j, uc, vc) => (ext(uc) < 0.003 ? -1 : vc > 0.7 && trimW > 0 ? GROUP_TRIM : GROUP_BASE),
      });
    }

    // nasal bar
    const nasal = p.nasal ?? 0;
    if (nasal > 0.004) {
      const nfn: SurfFn = (u, v, off, out) => {
        const y = Y_E - 0.002 - v * nasal;
        const sec = sampleProfile(head, y);
        const bulge = 0.014 * Math.pow(Math.sin(Math.PI * clamp((Y_E - y) / 0.085, 0, 1)), 1.5);
        const R = sec.cz + sec.rz + gap + 0.0035 + bulge + off;
        const uu = u * (1 - 0.3 * v);
        out.set(R * Math.sin(uu) * 0.9, y, R * Math.cos(uu) + (p.width ? 0 : 0));
      };
      b.addSurface({ us: linspace(-0.12, 0.12, 4), vs: linspace(0, 1, 7), fn: nfn, thickness: 0.004, id: 2, uvScale: [0.09, nasal], group: GROUP_TRIM });
    }

    // rivets + spike
    const tmp = new Vector3();
    const m = new Matrix4();
    if ((p.rivets ?? 0) > 0) {
      const r = 0.0036;
      const add = (u: number, v: number) => {
        fn(u, v, 0.001, tmp);
        m.makeScale(r, r, r).setPosition(tmp);
        b.addGeometry(rivetGeo, m, GROUP_TRIM);
      };
      const vb = vOfUp(0.004);
      for (let i = 0; i < 18; i++) add(-Math.PI + ((i + 0.5) / 18) * Math.PI * 2, vb);
      if (nb > 0 && nb <= 8) {
        for (let k = 0; k < nb; k++) for (const h of [0.35, 0.6, 0.82]) add(wrapAngle((k * Math.PI * 2) / nb), vOfUp(H * h));
      }
    }
    if ((p.spike ?? 0) > 0.003) {
      fn(0, 1, 0, tmp);
      const sp = p.spike;
      m.makeScale(0.011, sp, 0.011).setPosition(tmp.x, tmp.y + sp / 2 - 0.004, tmp.z);
      b.addGeometry(coneGeo, m, GROUP_TRIM);
      m.makeScale(0.014, 0.008, 0.014).setPosition(tmp.x, tmp.y, tmp.z);
      b.addGeometry(rivetGeo, m, GROUP_TRIM);
    }

    const pivot: [number, number, number] = [0, Y_E, 0];
    applyDeformers(b, p, pivot, H + Dmax);
    if (ctx.mirror) b.mirrorX();

    const handles: HandleSpec[] = [
      surfHandle('height', 'height', 'Crown height', 'size', fn, 0, 1, [0, 1, 0], 1, 0.03),
      surfHandle('width', 'width', 'Width', 'size', fn, Math.PI / 2, V_E + 0.08, [1, 0, 0], 1 / RX, 0.03),
      surfHandle('depth', 'depth', 'Depth', 'size', fn, Math.PI, V_E + 0.12, [0, 0, -1], 1 / RZ, 0.03),
      surfHandle('front', 'front', 'Front edge', 'trim', fn, 0, 0, [0, 1, 0], -1, 0.028),
      surfHandle('side', 'side', 'Side edge', 'trim', fn, Math.PI / 2 + 0.25, 0, [0, 1, 0], -1, 0.028),
      surfHandle('back', 'back', 'Back edge', 'trim', fn, Math.PI, 0, [0, 1, 0], -1, 0.028),
      surfHandle('tail', 'tail', 'Neck guard flare', 'shape', fn, Math.PI - 0.55, 0.03, [-0.5, 0, -0.87], 1 / 0.05, 0.03),
    ];
    if (brim > 0.002) handles.push(surfHandle('brim', 'brim', 'Brim width', 'shape', fn, -Math.PI / 2, 0, [-1, 0, 0], 1, brim + 0.02));

    return { geometry: b.finish(), builder: b, handles: finishHandles(b, handles, ctx.mirror), pivot };
  },
};
