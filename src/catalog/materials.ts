import type { MaterialSpec } from '../core/types';

export interface MaterialPreset extends MaterialSpec {
  name: string;
  group: 'Metals' | 'Fabrics' | 'Mail & Leather';
}

const P = (
  preset: string,
  name: string,
  group: MaterialPreset['group'],
  kind: MaterialSpec['kind'],
  color: string,
  metalness: number,
  roughness: number,
  texture: MaterialSpec['texture'],
  textureIntensity = 0.5,
  wear = 0,
): MaterialPreset => ({ preset, name, group, kind, color, metalness, roughness, texture, textureIntensity, wear });

export const MATERIAL_PRESETS: MaterialPreset[] = [
  P('steel', 'Polished steel', 'Metals', 'metal', '#c8ccd2', 1, 0.24, 'brushed', 0.25),
  P('darkSteel', 'Darkened steel', 'Metals', 'metal', '#474b54', 1, 0.36, 'brushed', 0.3),
  P('blackened', 'Blackened iron', 'Metals', 'metal', '#1f2126', 0.9, 0.48, 'hammered', 0.4),
  P('iron', 'Iron', 'Metals', 'metal', '#77726c', 0.95, 0.52, 'hammered', 0.5, 0.25),
  P('bronze', 'Bronze', 'Metals', 'metal', '#a8733a', 1, 0.34, 'brushed', 0.3),
  P('brass', 'Brass', 'Metals', 'metal', '#c9a24a', 1, 0.3, 'brushed', 0.25),
  P('copper', 'Copper', 'Metals', 'metal', '#b8643c', 1, 0.32, 'brushed', 0.25),
  P('gold', 'Gold', 'Metals', 'metal', '#e3b23a', 1, 0.2, 'none', 0.2),
  P('paintedBlue', 'Painted metal (blue)', 'Metals', 'metal', '#2a4f9c', 0.35, 0.34, 'none', 0.2, 0.15),
  P('paintedRed', 'Painted metal (red)', 'Metals', 'metal', '#9c2a2a', 0.35, 0.34, 'none', 0.2, 0.15),
  P('lacquer', 'Black lacquer', 'Metals', 'metal', '#16161a', 0.3, 0.16, 'none', 0.1),
  P('linen', 'Linen', 'Fabrics', 'fabric', '#d6cab0', 0, 0.95, 'weave', 0.6),
  P('wool', 'Wool', 'Fabrics', 'fabric', '#8a2f2b', 0, 1, 'wool', 0.7),
  P('heavyCloth', 'Heavy cloth', 'Fabrics', 'fabric', '#34466b', 0, 0.92, 'weave', 0.9),
  P('velvet', 'Velvet', 'Fabrics', 'fabric', '#5a1d4c', 0, 0.85, 'velvet', 0.5),
  P('padded', 'Padded fabric', 'Fabrics', 'fabric', '#c9bd9c', 0, 0.97, 'quilt', 0.8),
  P('blackCloth', 'Black cloth', 'Fabrics', 'fabric', '#1e1e22', 0, 0.96, 'weave', 0.6),
  P('silk', 'Silk cord', 'Fabrics', 'fabric', '#b3262b', 0, 0.6, 'weave', 0.4),
  P('plume', 'Horsehair / feather', 'Fabrics', 'fabric', '#b0201f', 0, 0.9, 'wool', 0.9),
  P('leather', 'Leather', 'Mail & Leather', 'leather', '#6a4326', 0, 0.68, 'leather', 0.6),
  P('darkLeather', 'Dark leather', 'Mail & Leather', 'leather', '#33241a', 0, 0.62, 'leather', 0.6),
  P('mail', 'Steel mail', 'Mail & Leather', 'mail', '#a2a7ae', 0.9, 0.42, 'mail', 1),
  P('darkMail', 'Blackened mail', 'Mail & Leather', 'mail', '#4b4e55', 0.9, 0.5, 'mail', 1),
  P('bronzeMail', 'Bronze mail', 'Mail & Leather', 'mail', '#a67a44', 0.9, 0.42, 'mail', 1),
  P('bone', 'Horn / bone', 'Mail & Leather', 'leather', '#d9cfb5', 0, 0.45, 'none', 0.2),
  P('darkHorn', 'Dark horn', 'Mail & Leather', 'leather', '#2c241f', 0, 0.38, 'none', 0.2),
];

export const MATERIAL_BY_ID: Record<string, MaterialPreset> = Object.fromEntries(MATERIAL_PRESETS.map((m) => [m.preset, m]));

export function materialFromPreset(id: string): MaterialSpec {
  const m = MATERIAL_BY_ID[id] ?? MATERIAL_BY_ID.steel;
  const { name: _n, group: _g, ...spec } = m;
  return { ...spec };
}
