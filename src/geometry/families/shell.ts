// "Shell" family: body-conforming lofted shells for torsos and limbs.
// Cuirasses, breastplates, mail shirts, tunics, tabards, skirts, vambraces, greaves, faulds, tassets...
// are all parameter presets of this one generator.

import { Matrix4, SphereGeometry, Vector3 } from 'three';
import { PROFILES, leftPartToPart, ringXZ, sampleProfile, sampleTorsoHang } from '../../body/body';
import { clamp, lerp, linspace, wrapAngle } from '../../core/math';
import type { PartType } from '../../core/types';
import { GROUP_BASE, GROUP_DETAIL, GROUP_TRIM, MeshBuilder, uniqueSorted, type SurfFn } from '../MeshBuilder';
import type { CoverRange, Family, HandleSpec } from '../types';
import { DEFORM_PARAMS, FIT_PARAMS, applyDeformers, finishHandles, frac, lameSaw, looseness, surfHandle } from './common';

const EPS = 2e-4;
const rivetGeo = new SphereGeometry(1, 7, 5);

export interface ShellCfg {
  part: PartType;
  y0: number;
  y1: number;
  arcCenter?: number;
  panels?: 'single' | 'pair' | 'frontback';
  style?: 'plain' | 'muscle' | 'gothic' | 'quilt' | 'lamellar' | 'brigandine' | 'strips' | 'scales';
  cloth?: boolean;
  sleeves?: boolean;
  bulgeFront?: boolean;
  rivets?: boolean;
}

function spanOf(p: Record<string, number>, cfg: ShellCfg) {
  let yb = cfg.y0 + (p.trimBottom ?? 0);
  let yt = cfg.y1 - (p.trimTop ?? 0);
  if (yt - yb < 0.02) {
    const mid = clamp((yb + yt) / 2, cfg.y0 + 0.01, cfg.y1 - 0.01);
    yb = Math.min(yb, mid - 0.01);
    yt = Math.max(yt, yb + 0.02);
  }
  return { yb, yt };
}

function sleeveEnd(p: Record<string, number>) {
  return lerp(-0.07, -0.555, clamp(p.sleeve ?? 0, 0, 1));
}

export const shell: Family = {
  id: 'shell',
  slots: ['base', 'trim', 'detail'],
  params: [
    { key: 'width', label: 'Width', min: 0.7, max: 1.8, step: 0.01, def: 1, unit: 'x', group: 'Size' },
    { key: 'depth', label: 'Depth', min: 0.7, max: 1.8, step: 0.01, def: 1, unit: 'x', group: 'Size' },
    { key: 'trimBottom', label: 'Lower edge', min: -0.5, max: 0.6, step: 0.002, def: 0, unit: 'cm', group: 'Trim', hint: 'Raise or lower the bottom edge' },
    { key: 'trimTop', label: 'Upper edge', min: -0.1, max: 0.6, step: 0.002, def: 0, unit: 'cm', group: 'Trim' },
    { key: 'frontDip', label: 'Front hem', min: -0.25, max: 0.3, step: 0.002, def: 0, unit: 'cm', group: 'Trim', hint: 'Raise (+) or drop (-) the lower edge at the front only' },
    { key: 'sideDip', label: 'Side hem', min: -0.25, max: 0.3, step: 0.002, def: 0, unit: 'cm', group: 'Trim' },
    { key: 'backDip', label: 'Back hem', min: -0.25, max: 0.3, step: 0.002, def: 0, unit: 'cm', group: 'Trim' },
    { key: 'point', label: 'Lower point', min: 0, max: 1, step: 0.01, def: 0, group: 'Trim' },
    { key: 'round', label: 'Corner rounding', min: 0, max: 1, step: 0.01, def: 0, group: 'Trim' },
    { key: 'armhole', label: 'Armhole depth', min: 0, max: 0.2, step: 0.002, def: 0, unit: 'cm', group: 'Trim' },
    { key: 'neckline', label: 'Neckline', min: 0, max: 0.2, step: 0.002, def: 0, unit: 'cm', group: 'Trim' },
    { key: 'arc', label: 'Wrap coverage', min: 0.08, max: 1, step: 0.01, def: 1, unit: '%', group: 'Trim', hint: 'How far the piece wraps around the body' },
    { key: 'flare', label: 'Lower flare', min: -0.3, max: 1.5, step: 0.01, def: 0, group: 'Shape' },
    { key: 'flareTop', label: 'Upper flare', min: -0.3, max: 1.2, step: 0.01, def: 0, group: 'Shape' },
    { key: 'taper', label: 'Taper', min: -0.6, max: 0.6, step: 0.01, def: 0, group: 'Shape' },
    { key: 'bulge', label: 'Curvature', min: -0.5, max: 1.5, step: 0.01, def: 0, group: 'Shape' },
    { key: 'ridge', label: 'Centre ridge', min: 0, max: 1.5, step: 0.01, def: 0, group: 'Shape' },
    { key: 'sleeve', label: 'Sleeve length', min: 0, max: 1, step: 0.01, def: 0, unit: '%', group: 'Shape' },
    { key: 'lames', label: 'Segments', min: 0, max: 12, step: 1, def: 0, unit: 'n', group: 'Detail' },
    { key: 'lameDepth', label: 'Segment overlap', min: 0, max: 0.012, step: 0.0005, def: 0.004, unit: 'cm', group: 'Detail' },
    { key: 'folds', label: 'Fold intensity', min: 0, max: 1.5, step: 0.01, def: 0, group: 'Detail' },
    { key: 'foldCount', label: 'Fold count', min: 4, max: 28, step: 1, def: 12, unit: 'n', group: 'Detail' },
    { key: 'relief', label: 'Surface relief', min: 0, max: 2, step: 0.01, def: 1, group: 'Detail' },
    { key: 'trim', label: 'Trim width', min: 0, max: 0.05, step: 0.001, def: 0.012, unit: 'cm', group: 'Detail' },
    ...FIT_PARAMS,
    ...DEFORM_PARAMS,
  ],

  coverage(p, cfgAny) {
    const cfg = cfgAny as ShellCfg;
    const { yb, yt } = spanOf(p, cfg);
    const out: CoverRange[] = [{ part: cfg.part, y0: yb, y1: yt }];
    if (cfg.sleeves && (p.sleeve ?? 0) > 0.02) out.push({ part: 'arm', y0: sleeveEnd(p), y1: 0.07 });
    return out;
  },

  bulk(p, cfgAny) {
    const cfg = cfgAny as ShellCfg;
    if (cfg.cloth) return 0;
    return Math.max(0, p.bulge ?? 0) * 0.03 + ((p.lames ?? 0) >= 1 ? (p.lameDepth ?? 0) : 0) + Math.max(0, p.ridge ?? 0) * 0.004;
  },

  build(p, ctx, cfgAny) {
    const cfg = cfgAny as ShellCfg;
    const prof = PROFILES[cfg.part as 'torso' | 'arm' | 'leg' | 'head'];
    const b = new MeshBuilder();
    const { yb, yt } = spanOf(p, cfg);
    const H = yt - yb;
    const baseOff = ctx.fitOffset + (p.offset ?? 0);
    const arcFrac = clamp(p.arc ?? 1, 0.05, 1);
    const closed = arcFrac >= 0.995 && (cfg.panels ?? 'single') === 'single';
    const A = closed ? Math.PI * 2 : arcFrac * Math.PI * 2 * ((cfg.panels ?? 'single') === 'single' ? 1 : 0.5);
    const center0 = cfg.arcCenter ?? 0;
    const style = cfg.style ?? 'plain';
    const relief = p.relief ?? 1;
    const nLames = Math.round(p.lames ?? 0);
    const lameDepth = p.lameDepth ?? 0.004;
    const folds = p.folds ?? 0;
    const foldCount = Math.round(p.foldCount ?? 12);
    const trimW = cfg.cloth ? Math.min(p.trim ?? 0, 0.03) : (p.trim ?? 0);
    const vTrim = trimW > 0.0005 ? clamp(trimW / H, 0, 0.3) : 0;
    const torso = cfg.part === 'torso';
    const soft = !!cfg.cloth;
    const midSec = sampleProfile(prof, clamp((yb + yt) / 2, prof.ys[0], prof.ys[prof.ys.length - 1]));
    const uvR = (midSec.rx + midSec.rz) / 2 + baseOff;
    const lamRows = style === 'lamellar' ? Math.max(2, Math.round(H / 0.042)) : 0;

    const makeFn = (center: number, halfArc: number): SurfFn => {
      const edge = (u: number) => {
        const du = wrapAngle(u - center);
        const c = Math.cos(du);
        const f = c > 0 ? c * c : 0;
        const bk = c < 0 ? c * c : 0;
        const sd = 1 - c * c;
        let yB = yb + (p.frontDip ?? 0) * f + (p.sideDip ?? 0) * sd + (p.backDip ?? 0) * bk;
        const rel = closed ? Math.abs(du) / Math.PI : Math.abs(du) / halfArc;
        if (p.point) yB -= p.point * 0.45 * H * Math.pow(Math.max(0, 1 - rel * (closed ? 3 : 1)), 1.4);
        if (p.round && !closed) yB += p.round * 0.5 * H * Math.pow(clamp(rel, 0, 1), 5);
        let yT = yt;
        if (p.armhole) {
          const a = (Math.abs(wrapAngle(u)) - Math.PI / 2) / 0.62;
          yT -= p.armhole * Math.exp(-a * a * a * a);
        }
        if (p.neckline) {
          const cu = Math.cos(wrapAngle(u));
          if (cu > 0) yT -= p.neckline * Math.pow(cu, 5);
        }
        if (yT - yB < 0.012) yB = yT - 0.012;
        return [yB, yT];
      };
      return (u, v, off, out) => {
        const [yB, yT] = edge(u);
        const y = yB + (yT - yB) * v;
        const sec = torso ? sampleTorsoHang(y) : sampleProfile(prof, y);
        const du = wrapAngle(u - center);
        const cu = Math.cos(du);
        let o = baseOff + off;
        if (vTrim > 0 && (v < vTrim || v > 1 - vTrim)) o += cfg.cloth ? 0.0012 : 0.0028;
        const iv = 1 - v;
        const loose = soft ? looseness(ctx.squeeze, cfg.part, y) : 1;
        o += ((p.flare ?? 0) * 0.25 * H * iv * iv + (p.flareTop ?? 0) * 0.2 * H * v * v) * loose;
        if (p.bulge) o += p.bulge * 0.04 * Math.sin(Math.PI * v) * (cfg.bulgeFront ? 0.5 + 0.5 * cu : 1) * loose;
        if (p.ridge && cu > 0) o += p.ridge * 0.02 * Math.pow(cu, 14) * Math.pow(Math.sin(Math.PI * clamp(v, 0, 1)), 0.5);
        if (nLames >= 1) o += lameDepth * lameSaw(v, nLames);
        if (folds > 0) {
          const hang = cfg.part === 'torso' ? 0.25 + 0.75 * iv : 0.6;
          o += loose * folds * 0.011 * hang * (Math.sin(foldCount * u + 1.3 * Math.sin(3 * v + u)) * 0.75 + 0.25 * Math.sin(foldCount * 2.3 * u + 2));
        }
        if (relief > 0) {
          switch (style) {
            case 'muscle': {
              const au = Math.abs(wrapAngle(u));
              const pu = (au - 0.5) / 0.36;
              const py = (y - 1.345) / 0.058;
              o += relief * 0.012 * Math.exp(-pu * pu - py * py);
              if (au < 1.0) o -= relief * 0.004 * Math.exp(-Math.pow((y - 1.277) / 0.013, 2));
              if (y > 1.09 && y < 1.27 && au < 0.36) {
                const a = Math.pow(Math.max(0, Math.sin((Math.PI * 3 * (y - 1.09)) / 0.18)), 0.6);
                const c = Math.pow(Math.max(0, Math.cos((Math.PI * (au - 0.18)) / 0.36)), 0.6);
                o += relief * 0.0065 * a * c;
              }
              if (y > 1.09 && y < 1.31) o -= relief * 0.003 * Math.exp(-Math.pow(au / 0.04, 2));
              break;
            }
            case 'gothic': {
              const au = Math.abs(du);
              o += relief * 0.003 * (0.5 + 0.5 * Math.cos(24 * au - 9 * v)) * Math.max(0, Math.cos(au * 0.62));
              break;
            }
            case 'quilt':
              o += relief * 0.0055 * Math.pow(Math.abs(Math.sin(u * 15)), 0.7);
              break;
            case 'lamellar': {
              o += relief * 0.0035 * lameSaw(v, lamRows);
              const row = Math.floor(v * lamRows);
              const col = frac((u * uvR) / 0.024 + (row % 2 ? 0.5 : 0));
              if (col < 0.14) o -= relief * 0.0022;
              break;
            }
            case 'brigandine':
              o += relief * 0.0016 * Math.abs(Math.sin(u * 11));
              break;
            case 'scales':
              o += relief * 0.002 * lameSaw(v, Math.max(2, Math.round(H / 0.03)));
              break;
          }
        }
        const sc = 1 + (p.taper ?? 0) * (v - 0.5);
        const [x, z] = ringXZ(sec, u, o, (p.width ?? 1) * sc, (p.depth ?? 1) * sc);
        out.set(x, y, z);
      };
    };

    // v rows (with duplicated rows at creases)
    const baseRows = clamp(Math.round(H / 0.013), 8, 44);
    let vs = linspace(0, 1, baseRows);
    if (vTrim > 0) vs.push(vTrim - EPS, vTrim + EPS, 1 - vTrim - EPS, 1 - vTrim + EPS);
    const creaseN = nLames >= 1 ? nLames : style === 'lamellar' ? lamRows : style === 'scales' ? Math.max(2, Math.round(H / 0.03)) : 0;
    for (let k = 1; k < creaseN; k++) vs.push(k / creaseN - EPS, k / creaseN + EPS);
    vs = uniqueSorted(vs.filter((v) => v >= 0 && v <= 1), 5e-5);

    const panels: { center: number; fn: SurfFn; us: number[] }[] = [];
    const mode = cfg.panels ?? 'single';
    const centers = mode === 'single' ? [center0] : mode === 'pair' ? [center0, -center0] : [0, Math.PI];
    for (const c of centers) {
      const half = A / 2;
      const nu = closed ? 72 : Math.max(6, Math.ceil((A / (Math.PI * 2)) * 72));
      const us = closed ? linspace(-Math.PI, Math.PI, nu) : linspace(c - half, c + half, nu);
      panels.push({ center: c, fn: makeFn(c, half), us });
    }

    const stripW = 0.34;
    panels.forEach((pn, pi) => {
      const nu = pn.us.length;
      const edgeCols = closed || vTrim <= 0 ? 0 : Math.max(1, Math.round(trimW / (uvR * (pn.us[1] - pn.us[0]) || 1)));
      b.addSurface({
        us: pn.us,
        vs,
        fn: pn.fn,
        closedU: closed,
        thickness: cfg.cloth ? 0 : (p.thickness ?? 0.004),
        id: pi,
        uvScale: [uvR, H],
        group: (i, _j, uc, vc) => {
          if (style === 'strips' && vc < 0.86 && frac((uc - pn.center) / stripW + 0.5) > 0.86) return -1;
          if (vTrim > 0 && (vc < vTrim || vc > 1 - vTrim)) return GROUP_TRIM;
          if (edgeCols && (i < edgeCols || i >= nu - 1 - edgeCols)) return GROUP_TRIM;
          return GROUP_BASE;
        },
      });
    });

    // rivets (brigandine studs, segmented plate rivets)
    if (cfg.rivets || style === 'brigandine') {
      const tmp = new Vector3();
      const m = new Matrix4();
      const r = 0.0034;
      for (const pn of panels) {
        const u0 = pn.us[0];
        const u1 = pn.us[pn.us.length - 1];
        const cols = Math.max(2, Math.round(((u1 - u0) * uvR) / 0.045));
        const rows = style === 'brigandine' ? Math.max(2, Math.round(H / 0.055)) : Math.max(1, nLames);
        for (let j = 0; j < rows; j++) {
          for (let i = 0; i <= cols; i++) {
            if (closed && i === cols) continue;
            const u = lerp(u0, u1, i / cols) + (style === 'brigandine' && j % 2 ? ((u1 - u0) / cols) * 0.5 : 0);
            if (u > u1 + 1e-6) continue;
            const v = style === 'brigandine' ? (j + 0.5) / rows : (j + 0.82) / rows;
            pn.fn(u, v, 0.0005, tmp);
            m.makeScale(r, r, r).setPosition(tmp);
            b.addGeometry(rivetGeo, m, GROUP_TRIM);
          }
        }
      }
    }

    // sleeves (torso garments)
    let sleeveFn: SurfFn | null = null;
    if (cfg.sleeves && (p.sleeve ?? 0) > 0.02) {
      const M = leftPartToPart('arm', 'torso');
      const arm = PROFILES.arm;
      const yEnd = sleeveEnd(p);
      const R = 0.061 + baseOff;
      const yTopS = R - 0.0015;
      const Ls = yTopS - yEnd;
      const vt = trimW > 0.0005 ? clamp(trimW / Ls, 0, 0.3) : 0;
      const mk =
        (mirror: boolean): SurfFn =>
        (u, v, off, out) => {
          const y = lerp(yEnd, yTopS, v);
          const sec = sampleProfile(arm, y);
          let o = baseOff + off + 0.002;
          const loose = looseness(ctx.squeeze, 'arm', y);
          if (vt > 0 && v < vt) o += 0.0012;
          if (folds > 0) o += loose * folds * 0.006 * (1 - v) * Math.sin(8 * u + 5 * v);
          if (style === 'quilt') o += relief * 0.004 * Math.pow(Math.abs(Math.sin(v * Ls * 60)), 0.7);
          o += loose * (p.flare ?? 0) * 0.05 * (1 - v) * (1 - v);
          let rx = y <= 0.056 ? sec.rx + o : 0;
          let rz = y <= 0.056 ? sec.rz + o : 0;
          if (y > -0.075) {
            const rb = R + off;
            const ball = Math.sqrt(Math.max(0, rb * rb - y * y));
            rx = Math.max(rx, ball);
            rz = Math.max(rz, ball);
          }
          out.set(rx * Math.sin(u), y, rz * Math.cos(u)).applyMatrix4(M);
          if (mirror) out.x = -out.x;
        };
      const usS = linspace(-Math.PI, Math.PI, 28);
      let vsS = linspace(0, 1, clamp(Math.round(Ls / 0.016), 8, 34));
      if (vt > 0) vsS = uniqueSorted([...vsS, vt - EPS, vt + EPS], 5e-5);
      for (const mirror of [false, true]) {
        const f = mk(mirror);
        if (!mirror) sleeveFn = f;
        b.addSurface({
          us: usS,
          vs: vsS,
          fn: f,
          closedU: true,
          flip: mirror,
          thickness: 0,
          id: panels.length + (mirror ? 1 : 0),
          uvScale: [0.05, Ls],
          group: (_i, _j, _uc, vc) => (vt > 0 && vc < vt ? GROUP_TRIM : GROUP_BASE),
        });
      }
    }

    const pivot: [number, number, number] = [0, (yb + yt) / 2, midSec.cz];
    applyDeformers(b, p, pivot, H);
    if (ctx.mirror) b.mirrorX();

    // handles
    const f0 = panels[0].fn;
    const c0 = panels[0].center;
    const half = A / 2;
    const sideU = closed ? Math.PI / 2 : c0 + half * 0.85;
    const zs = Math.cos(c0) >= 0 ? 1 : -1;
    const handles: HandleSpec[] = [
      surfHandle('trimBottom', 'trimBottom', 'Lower edge', 'trim', f0, closed ? c0 + 0.75 : c0 + half * 0.45, 0, [0, 1, 0], 1, 0.022),
      surfHandle('trimTop', 'trimTop', 'Upper edge', 'trim', f0, closed ? c0 + 0.5 : c0 + half * 0.45, 1, [0, 1, 0], -1, 0.022),
      surfHandle('frontDip', 'frontDip', 'Front hem', 'trim', f0, c0, 0, [0, 1, 0], 1, 0.03),
      surfHandle('width', 'width', 'Width', 'size', f0, sideU, 0.5, [Math.sin(sideU) >= 0 ? 1 : -1, 0, 0], 1 / Math.max(0.02, midSec.rx + baseOff), 0.03),
      surfHandle('depth', 'depth', 'Depth', 'size', f0, c0, 0.56, [0, 0, zs], 1 / Math.max(0.02, midSec.rz + baseOff), 0.04),
      surfHandle('flare', 'flare', 'Lower flare', 'shape', f0, closed ? c0 - 0.9 : c0 - half * 0.6, 0.04, Math.abs(Math.sin(c0 - 0.9)) > 0.3 ? [-1, 0, 0] : [0, 0, zs], 1 / (0.25 * H), 0.03),
      surfHandle('bulge', 'bulge', 'Curvature', 'shape', f0, closed ? c0 - 0.35 : c0 - half * 0.3, 0.5, [0, 0, zs], 1 / 0.04, 0.03),
    ];
    if (sleeveFn) {
      const axis = new Vector3(0, -1, 0).transformDirection(leftPartToPart('arm', 'torso'));
      handles.push(surfHandle('sleeve', 'sleeve', 'Sleeve length', 'trim', sleeveFn, Math.PI / 2, 0, [axis.x, axis.y, axis.z], 1 / 0.485, 0.03));
    }

    return { geometry: b.finish(), builder: b, handles: finishHandles(b, handles, ctx.mirror), pivot: ctx.mirror ? [-pivot[0], pivot[1], pivot[2]] : pivot };
  },
};

export const _GROUP_DETAIL_UNUSED = GROUP_DETAIL;
