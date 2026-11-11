// Procedural tiling textures drawn on canvases (no image assets are shipped).
// UVs on armour geometry are in metres, so `tilesPerMetre` gives physically sized patterns.

import { CanvasTexture, NoColorSpace, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';
import type { TextureKind } from '../core/types';

interface TexDef {
  size: number;
  tilesPerMetre: number;
  /** Paints a grayscale height/shade pattern (white = raised / bright). */
  draw(ctx: CanvasRenderingContext2D, s: number, rnd: () => number): void;
  /** How strongly the pattern tints the base colour (0 = bump only). */
  shade: number;
  bump: number;
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function speckle(ctx: CanvasRenderingContext2D, s: number, rnd: () => number, n: number, r0: number, r1: number, a: number) {
  for (let i = 0; i < n; i++) {
    const x = rnd() * s;
    const y = rnd() * s;
    const r = r0 + rnd() * (r1 - r0);
    const g = Math.floor(rnd() * 255);
    ctx.fillStyle = `rgba(${g},${g},${g},${a})`;
    for (const dx of [-s, 0, s]) for (const dy of [-s, 0, s]) {
      ctx.beginPath();
      ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

const DEFS: Record<Exclude<TextureKind, 'none'>, TexDef> = {
  mail: {
    size: 128,
    tilesPerMetre: 52,
    shade: 1,
    bump: 2.2,
    draw(ctx, s) {
      ctx.fillStyle = '#2b2b2b';
      ctx.fillRect(0, 0, s, s);
      const px = s / 2;
      const py = s / 4;
      for (let row = -1; row <= 4; row++) {
        for (let col = -1; col <= 2; col++) {
          const cx = col * px + (row % 2 ? px / 2 : 0) + px / 2;
          const cy = row * py + py / 2;
          ctx.lineWidth = s * 0.058;
          ctx.strokeStyle = '#5a5a5a';
          ctx.beginPath();
          ctx.ellipse(cx, cy + s * 0.012, px * 0.43, py * 0.62, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.lineWidth = s * 0.04;
          ctx.strokeStyle = '#f2f2f2';
          ctx.beginPath();
          ctx.ellipse(cx, cy, px * 0.43, py * 0.62, 0, Math.PI * 1.05, Math.PI * 1.95);
          ctx.stroke();
          ctx.strokeStyle = '#b9b9b9';
          ctx.beginPath();
          ctx.ellipse(cx, cy, px * 0.43, py * 0.62, 0, Math.PI * 0.05, Math.PI * 0.95);
          ctx.stroke();
        }
      }
    },
  },
  scales: {
    size: 128,
    tilesPerMetre: 22,
    shade: 0.8,
    bump: 2.4,
    draw(ctx, s) {
      ctx.fillStyle = '#8a8a8a';
      ctx.fillRect(0, 0, s, s);
      const w = s / 2;
      const h = s / 2;
      for (let row = 3; row >= -1; row--) {
        for (let col = -1; col <= 2; col++) {
          const x = col * w + (row % 2 ? w / 2 : 0);
          const y = row * h;
          const g = ctx.createLinearGradient(0, y, 0, y + h * 1.3);
          g.addColorStop(0, '#9c9c9c');
          g.addColorStop(0.75, '#f4f4f4');
          g.addColorStop(1, '#d8d8d8');
          ctx.fillStyle = g;
          ctx.strokeStyle = '#3c3c3c';
          ctx.lineWidth = s * 0.02;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + w, y);
          ctx.lineTo(x + w, y + h * 0.75);
          ctx.quadraticCurveTo(x + w / 2, y + h * 1.55, x, y + h * 0.75);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      }
    },
  },
  weave: {
    size: 64,
    tilesPerMetre: 110,
    shade: 0.45,
    bump: 1.2,
    draw(ctx, s) {
      ctx.fillStyle = '#7d7d7d';
      ctx.fillRect(0, 0, s, s);
      const c = s / 4;
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
          const over = (i + j) % 2 === 0;
          const g = over ? ctx.createLinearGradient(i * c, 0, (i + 1) * c, 0) : ctx.createLinearGradient(0, j * c, 0, (j + 1) * c);
          g.addColorStop(0, '#8e8e8e');
          g.addColorStop(0.5, over ? '#f6f6f6' : '#d9d9d9');
          g.addColorStop(1, '#8e8e8e');
          ctx.fillStyle = g;
          ctx.fillRect(i * c + 0.5, j * c + 0.5, c - 1, c - 1);
        }
      }
    },
  },
  wool: {
    size: 128,
    tilesPerMetre: 30,
    shade: 0.4,
    bump: 1.1,
    draw(ctx, s, rnd) {
      ctx.fillStyle = '#bdbdbd';
      ctx.fillRect(0, 0, s, s);
      speckle(ctx, s, rnd, 1400, 0.6, 1.8, 0.35);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      for (let i = 0; i < 260; i++) {
        const x = rnd() * s;
        const y = rnd() * s;
        ctx.lineWidth = 0.6 + rnd();
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (rnd() - 0.5) * 9, y + 4 + rnd() * 8);
        ctx.stroke();
      }
    },
  },
  velvet: {
    size: 128,
    tilesPerMetre: 40,
    shade: 0.3,
    bump: 0.5,
    draw(ctx, s, rnd) {
      ctx.fillStyle = '#c9c9c9';
      ctx.fillRect(0, 0, s, s);
      speckle(ctx, s, rnd, 2600, 0.4, 1.1, 0.3);
    },
  },
  leather: {
    size: 128,
    tilesPerMetre: 14,
    shade: 0.45,
    bump: 1.3,
    draw(ctx, s, rnd) {
      ctx.fillStyle = '#b5b5b5';
      ctx.fillRect(0, 0, s, s);
      speckle(ctx, s, rnd, 500, 2, 7, 0.16);
      speckle(ctx, s, rnd, 1500, 0.5, 1.6, 0.3);
      ctx.strokeStyle = 'rgba(40,40,40,0.35)';
      ctx.lineWidth = 0.8;
      for (let i = 0; i < 60; i++) {
        const x = rnd() * s;
        const y = rnd() * s;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + (rnd() - 0.5) * 20, y + (rnd() - 0.5) * 20, x + (rnd() - 0.5) * 30, y + (rnd() - 0.5) * 30);
        ctx.stroke();
      }
    },
  },
  quilt: {
    size: 128,
    tilesPerMetre: 18,
    shade: 0.4,
    bump: 2,
    draw(ctx, s, rnd) {
      ctx.fillStyle = '#d2d2d2';
      ctx.fillRect(0, 0, s, s);
      speckle(ctx, s, rnd, 900, 0.5, 1.4, 0.18);
      ctx.strokeStyle = '#5e5e5e';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([5, 3]);
      for (const sign of [1, -1]) {
        for (let k = -2; k <= 2; k++) {
          ctx.beginPath();
          ctx.moveTo(k * s, sign > 0 ? 0 : s);
          ctx.lineTo((k + 1) * s, sign > 0 ? s : 0);
          ctx.stroke();
        }
      }
      ctx.setLineDash([]);
    },
  },
  brushed: {
    size: 128,
    tilesPerMetre: 9,
    shade: 0.12,
    bump: 0.35,
    draw(ctx, s, rnd) {
      ctx.fillStyle = '#c8c8c8';
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 500; i++) {
        const y = rnd() * s;
        const x = rnd() * s;
        const len = 20 + rnd() * 70;
        const g = 120 + Math.floor(rnd() * 135);
        ctx.strokeStyle = `rgba(${g},${g},${g},0.3)`;
        ctx.lineWidth = 0.5 + rnd() * 0.8;
        for (const dx of [-s, 0, s]) {
          ctx.beginPath();
          ctx.moveTo(x + dx, y);
          ctx.lineTo(x + dx + len, y + (rnd() - 0.5) * 1.5);
          ctx.stroke();
        }
      }
    },
  },
  hammered: {
    size: 128,
    tilesPerMetre: 11,
    shade: 0.25,
    bump: 1.2,
    draw(ctx, s, rnd) {
      ctx.fillStyle = '#c0c0c0';
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 130; i++) {
        const x = rnd() * s;
        const y = rnd() * s;
        const r = 5 + rnd() * 9;
        for (const dx of [-s, 0, s]) for (const dy of [-s, 0, s]) {
          const g = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
          g.addColorStop(0, 'rgba(90,90,90,0.5)');
          g.addColorStop(0.8, 'rgba(230,230,230,0.25)');
          g.addColorStop(1, 'rgba(200,200,200,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    },
  },
};

export interface TexturePair {
  map: Texture | null;
  bump: Texture;
  bumpScale: number;
  shade: number;
}

const cache = new Map<string, TexturePair>();
let grunge: Texture | null = null;

function makeCanvas(kind: Exclude<TextureKind, 'none'>): HTMLCanvasElement {
  const def = DEFS[kind];
  const c = document.createElement('canvas');
  c.width = c.height = def.size;
  def.draw(c.getContext('2d')!, def.size, rng(kind.length * 7919 + 13));
  return c;
}

export function getTextures(kind: TextureKind): TexturePair | null {
  if (kind === 'none' || typeof document === 'undefined') return null;
  let t = cache.get(kind);
  if (!t) {
    const def = DEFS[kind];
    const canvas = makeCanvas(kind);
    const mk = (srgb: boolean) => {
      const tex = new CanvasTexture(canvas);
      tex.wrapS = tex.wrapT = RepeatWrapping;
      tex.repeat.set(def.tilesPerMetre, def.tilesPerMetre);
      tex.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
      tex.anisotropy = 4;
      return tex;
    };
    t = { map: def.shade > 0.2 ? mk(true) : null, bump: mk(false), bumpScale: def.bump, shade: def.shade };
    cache.set(kind, t);
  }
  return t;
}

/** Blotchy wear map, used as a roughness map on worn materials. */
export function getGrunge(): Texture | null {
  if (typeof document === 'undefined') return null;
  if (!grunge) {
    const s = 256;
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const ctx = c.getContext('2d')!;
    const rnd = rng(4242);
    ctx.fillStyle = '#9a9a9a';
    ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, rnd, 260, 6, 26, 0.12);
    speckle(ctx, s, rnd, 1600, 0.6, 3, 0.25);
    grunge = new CanvasTexture(c);
    grunge.wrapS = grunge.wrapT = RepeatWrapping;
    grunge.repeat.set(5, 5);
    grunge.colorSpace = NoColorSpace;
  }
  return grunge;
}
