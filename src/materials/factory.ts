// MaterialSpec (plain data) -> three.js materials, cached and shared between components.

import { Color, DoubleSide, FrontSide, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, type Material } from 'three';
import type { MaterialSpec } from '../core/types';
import { getGrunge, getTextures } from './textures';

const cache = new Map<string, Material>();
const MAX = 400;

export const voidMaterial = new MeshBasicMaterial({ color: 0x050505 });

function key(s: MaterialSpec, doubleSided: boolean) {
  return `${s.kind}|${s.color}|${s.metalness.toFixed(3)}|${s.roughness.toFixed(3)}|${s.texture}|${s.textureIntensity.toFixed(2)}|${s.wear.toFixed(2)}|${doubleSided ? 2 : 1}`;
}

export function getMaterial(spec: MaterialSpec, doubleSided = false): Material {
  const k = key(spec, doubleSided);
  const hit = cache.get(k);
  if (hit) return hit;
  const tex = getTextures(spec.texture);
  const wear = spec.wear;
  const color = new Color(spec.color);
  if (wear > 0) color.lerp(new Color(spec.kind === 'metal' || spec.kind === 'mail' ? '#5b4a3c' : '#6f675c'), wear * 0.3);
  const soft = spec.kind === 'fabric';
  const rough = Math.min(1, spec.roughness + wear * 0.35);
  const common = {
    color,
    metalness: spec.metalness,
    roughness: rough,
    side: doubleSided ? DoubleSide : FrontSide,
    map: tex && tex.map && spec.textureIntensity > 0.15 ? tex.map : null,
    bumpMap: tex && spec.textureIntensity > 0.01 ? tex.bump : null,
    bumpScale: tex ? tex.bumpScale * spec.textureIntensity : 0,
    roughnessMap: wear > 0.05 ? getGrunge() : null,
  };
  let m: Material;
  if (soft) {
    m = new MeshPhysicalMaterial({ ...common, sheen: 0.5, sheenRoughness: 0.6, sheenColor: color.clone().lerp(new Color('#ffffff'), 0.2), envMapIntensity: 0.3 });
  } else if (spec.kind === 'metal' && spec.metalness < 0.7) {
    // painted / lacquered metal: a glossy coat over a partly metallic base
    m = new MeshPhysicalMaterial({ ...common, clearcoat: 0.7, clearcoatRoughness: 0.18, envMapIntensity: 1 });
  } else {
    m = new MeshStandardMaterial({ ...common, envMapIntensity: spec.kind === 'leather' ? 0.5 : 1.15 });
  }
  if (cache.size > MAX) {
    const first = cache.keys().next().value as string;
    cache.get(first)?.dispose();
    cache.delete(first);
  }
  cache.set(k, m);
  return m;
}

/** Material array in geometry-group order: base, trim, detail, void. */
export function materialsFor(mats: Record<string, MaterialSpec>, doubleSided: boolean): Material[] {
  const base = mats.base;
  return [getMaterial(base, doubleSided), getMaterial(mats.trim ?? base, doubleSided), getMaterial(mats.detail ?? mats.trim ?? base, doubleSided), voidMaterial];
}
