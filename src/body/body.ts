// The mannequin's body model.
//
// The body is described as a small set of "parts" (head, torso, arms, hands, legs, feet).
// Each tube-like part is a stack of superellipse cross-sections along its local Y axis.
// The SAME profile data is used to (a) build the mannequin mesh and (b) fit armour shells,
// which is what keeps armour conforming to the body instead of floating at the origin.
//
// Conventions (metres): Y up, the mannequin faces +Z, its LEFT side is +X.
// Angles around a part: u = 0 is the front (+Z), u = +PI/2 is the +X side.

import { Matrix4, Vector3 } from 'three';
import { hermite } from '../core/math';
import type { PartId, PartType, Side, Vec3 } from '../core/types';

export interface Section {
  y: number;
  cz: number;
  rx: number;
  rz: number;
  /** Superellipse exponent (2 = ellipse, larger = boxier). */
  n: number;
}

export interface PartProfile {
  type: PartType;
  sections: Section[];
  landmarks: Record<string, number>;
  ys: number[];
  cols: { cz: number[]; rx: number[]; rz: number[]; n: number[] };
}

function profile(type: PartType, rows: number[][], landmarks: Record<string, number>): PartProfile {
  const sections = rows
    .map(([y, rx, rz, cz = 0, n = 2]) => ({ y, rx, rz, cz, n }))
    .sort((a, b) => a.y - b.y);
  return {
    type,
    sections,
    landmarks,
    ys: sections.map((s) => s.y),
    cols: {
      cz: sections.map((s) => s.cz),
      rx: sections.map((s) => s.rx),
      rz: sections.map((s) => s.rz),
      n: sections.map((s) => s.n),
    },
  };
}

// rows: [y, rx, rz, cz, n]
export const PROFILES: Record<'head' | 'torso' | 'arm' | 'leg', PartProfile> = {
  head: profile(
    'head',
    [
      [1.552, 0.02, 0.022, 0.05, 2],
      [1.562, 0.036, 0.042, 0.036, 2],
      [1.585, 0.054, 0.066, 0.02, 2.1],
      [1.62, 0.066, 0.084, 0.01, 2.1],
      [1.665, 0.074, 0.093, 0.004, 2.1],
      [1.71, 0.077, 0.097, 0.0, 2.1],
      [1.75, 0.073, 0.093, -0.003, 2.1],
      [1.78, 0.06, 0.078, -0.005, 2],
      [1.798, 0.038, 0.05, -0.006, 2],
      [1.806, 0.012, 0.016, -0.006, 2],
    ],
    { chin: 1.555, jaw: 1.6, mouth: 1.62, nose: 1.66, eyes: 1.695, brow: 1.715, crown: 1.806, center: 1.69 },
  ),
  torso: profile(
    'torso',
    [
      [0.83, 0.05, 0.05, 0, 2],
      [0.86, 0.12, 0.088, 0, 2.2],
      [0.9, 0.16, 0.104, 0, 2.3],
      [0.96, 0.172, 0.112, 0, 2.3],
      [1.02, 0.16, 0.105, 0, 2.3],
      [1.08, 0.142, 0.096, 0.002, 2.3],
      [1.16, 0.148, 0.101, 0.004, 2.4],
      [1.24, 0.162, 0.11, 0.006, 2.5],
      [1.32, 0.176, 0.12, 0.008, 2.6],
      [1.4, 0.186, 0.113, 0.004, 2.6],
      [1.45, 0.178, 0.096, 0, 2.5],
      [1.48, 0.128, 0.08, 0, 2.3],
      [1.505, 0.068, 0.064, 0.002, 2],
      [1.53, 0.055, 0.058, 0.004, 2],
      [1.6, 0.054, 0.058, 0.006, 2],
    ],
    {
      crotch: 0.85,
      hip: 0.96,
      waist: 1.08,
      ribs: 1.2,
      chest: 1.32,
      shoulder: 1.455,
      neckBase: 1.5,
      neckTop: 1.565,
    },
  ),
  arm: profile(
    'arm',
    [
      [-0.57, 0.022, 0.029, 0, 2],
      [-0.5, 0.029, 0.034, 0, 2],
      [-0.4, 0.04, 0.043, 0, 2],
      [-0.34, 0.042, 0.045, 0, 2],
      [-0.29, 0.038, 0.041, 0, 2],
      [-0.2, 0.043, 0.046, 0, 2],
      [-0.1, 0.05, 0.052, 0, 2],
      [-0.03, 0.056, 0.058, 0, 2],
      [0.012, 0.056, 0.058, 0, 2],
      [0.04, 0.044, 0.046, 0, 2],
      [0.056, 0.02, 0.021, 0, 2],
    ],
    { wrist: -0.56, elbow: -0.29, shoulder: 0, top: 0.056 },
  ),
  leg: profile(
    'leg',
    [
      [-0.84, 0.034, 0.038, -0.004, 2],
      [-0.76, 0.037, 0.042, -0.006, 2],
      [-0.62, 0.052, 0.058, -0.014, 2],
      [-0.52, 0.05, 0.052, -0.006, 2],
      [-0.44, 0.052, 0.054, 0.004, 2],
      [-0.38, 0.056, 0.058, 0.004, 2],
      [-0.25, 0.072, 0.074, 0.002, 2],
      [-0.1, 0.084, 0.086, 0, 2],
      [0.0, 0.086, 0.088, 0, 2],
      [0.05, 0.07, 0.075, 0, 2],
    ],
    { ankle: -0.82, calf: -0.62, knee: -0.44, hip: 0, top: 0.05 },
  ),
};

/** Hand layout in the hand frame (origin at the wrist, fingers toward -Y, palm facing -X, thumb toward +Z). */
export const HAND = {
  palm: [
    // [y, rx (thickness), rz (width), cz]
    [0.0, 0.021, 0.028, 0],
    [-0.03, 0.017, 0.04, 0.002],
    [-0.085, 0.014, 0.044, 0],
    [-0.1, 0.01, 0.038, 0],
  ] as number[][],
  fingers: [
    { z: 0.031, len: 0.074, r: 0.0088 },
    { z: 0.0105, len: 0.084, r: 0.0092 },
    { z: -0.0105, len: 0.078, r: 0.0088 },
    { z: -0.03, len: 0.062, r: 0.008 },
  ],
  fingerBaseY: -0.095,
  /** Finger curl toward the palm, radians per phalanx. */
  curl: 0.16,
  thumb: { base: [-0.004, -0.028, 0.038] as Vec3, dir: [-0.18, -0.72, 0.62] as Vec3, len: 0.062, r: 0.0105 },
  length: 0.185,
};

/** Foot layout in the foot frame (origin on the ground under the ankle, toes toward +Z). */
export const FOOT = {
  // [z, rx (half width), ry (half height), cy]
  sections: [
    [-0.066, 0.016, 0.02, 0.028],
    [-0.05, 0.034, 0.04, 0.041],
    [0.0, 0.04, 0.05, 0.05],
    [0.05, 0.043, 0.034, 0.034],
    [0.11, 0.048, 0.023, 0.023],
    [0.16, 0.043, 0.017, 0.017],
    [0.186, 0.022, 0.01, 0.012],
  ] as number[][],
  heelZ: -0.066,
  toeZ: 0.186,
  ankleY: 0.0915,
};

export interface SectionSample {
  cz: number;
  rx: number;
  rz: number;
  n: number;
}

/** Sample a part profile at a local height (clamped to the profile's extent). */
export function sampleProfile(p: PartProfile, y: number): SectionSample {
  return {
    cz: hermite(p.ys, p.cols.cz, y),
    rx: Math.max(0.001, hermite(p.ys, p.cols.rx, y)),
    rz: Math.max(0.001, hermite(p.ys, p.cols.rz, y)),
    n: hermite(p.ys, p.cols.n, y),
  };
}

const HIP_Y = 0.96;

/**
 * Cross-section used by garments hanging from the torso. Above the hips it is the torso itself;
 * below, it is the envelope around both legs so skirts, hauberk hems and tassets clear the thighs.
 */
export function sampleTorsoHang(y: number): SectionSample {
  if (y >= HIP_Y) return sampleProfile(PROFILES.torso, y);
  const hip = sampleProfile(PROFILES.torso, HIP_Y);
  const yl = Math.max(-LEG_LEN, y - LEG_ORIGIN[1]);
  const leg = sampleProfile(PROFILES.leg, yl);
  const legOuter = LEG_ORIGIN[0] + Math.sin(LEG_ROT) * -yl + leg.rx;
  const k = Math.min(1, (HIP_Y - y) / 0.08);
  return {
    cz: hip.cz,
    rx: Math.max(hip.rx, hip.rx + (legOuter + 0.004 - hip.rx) * k),
    rz: Math.max(hip.rz * (1 - 0.12 * k), leg.rz + Math.abs(leg.cz) + 0.004),
    n: hip.n,
  };
}

/** Point on a (possibly offset) superellipse ring. Writes [x, z]. */
export function ringXZ(sec: SectionSample, u: number, off: number, sx = 1, sz = 1): [number, number] {
  const s = Math.sin(u);
  const c = Math.cos(u);
  const e = 2 / sec.n;
  const x = (sec.rx + off) * sx * Math.sign(s) * Math.pow(Math.abs(s), e);
  const z = sec.cz + (sec.rz + off) * sz * Math.sign(c) * Math.pow(Math.abs(c), e);
  return [x, z];
}

export interface BodyPart {
  id: PartId;
  type: PartType;
  side: Side;
  label: string;
  matrix: Matrix4;
  inverse: Matrix4;
}

const ARM_ORIGIN: Vec3 = [0.195, 1.445, 0];
const ARM_ROT = 0.22;
const LEG_ORIGIN: Vec3 = [0.095, 0.93, 0];
const LEG_ROT = 0.06;
const ARM_LEN = 0.57;
const LEG_LEN = 0.84;

function frame(origin: Vec3, rotZ: number, mirror: boolean): Matrix4 {
  const m = new Matrix4().makeRotationZ(mirror ? -rotZ : rotZ);
  m.setPosition(mirror ? -origin[0] : origin[0], origin[1], origin[2]);
  return m;
}

function mk(id: PartId, type: PartType, side: Side, label: string, matrix: Matrix4): BodyPart {
  return { id, type, side, label, matrix, inverse: matrix.clone().invert() };
}

function handFrame(mirror: boolean): Matrix4 {
  return frame(ARM_ORIGIN, ARM_ROT, mirror).multiply(new Matrix4().makeTranslation(0, -ARM_LEN, 0));
}
function footFrame(mirror: boolean): Matrix4 {
  const x = LEG_ORIGIN[0] + Math.sin(LEG_ROT) * LEG_LEN;
  return new Matrix4().makeTranslation(mirror ? -x : x, 0, 0);
}

export const PARTS: Record<PartId, BodyPart> = {
  head: mk('head', 'head', 'C', 'Head', new Matrix4()),
  torso: mk('torso', 'torso', 'C', 'Torso', new Matrix4()),
  armL: mk('armL', 'arm', 'L', 'Left Arm', frame(ARM_ORIGIN, ARM_ROT, false)),
  armR: mk('armR', 'arm', 'R', 'Right Arm', frame(ARM_ORIGIN, ARM_ROT, true)),
  handL: mk('handL', 'hand', 'L', 'Left Hand', handFrame(false)),
  handR: mk('handR', 'hand', 'R', 'Right Hand', handFrame(true)),
  legL: mk('legL', 'leg', 'L', 'Left Leg', frame(LEG_ORIGIN, LEG_ROT, false)),
  legR: mk('legR', 'leg', 'R', 'Right Leg', frame(LEG_ORIGIN, LEG_ROT, true)),
  footL: mk('footL', 'foot', 'L', 'Left Foot', footFrame(false)),
  footR: mk('footR', 'foot', 'R', 'Right Foot', footFrame(true)),
};

export const PART_IDS = Object.keys(PARTS) as PartId[];

/**
 * Matrix taking coordinates of LEFT/centre part `from` into the frame of LEFT/centre part `to`.
 * Geometry is always generated for the left side and mirrored afterwards, so only left frames are needed.
 */
export function leftPartToPart(from: PartType, to: PartType): Matrix4 {
  const id = (t: PartType): PartId => (t === 'head' || t === 'torso' ? t : (`${t}L` as PartId));
  return PARTS[id(to)].inverse.clone().multiply(PARTS[id(from)].matrix);
}

export interface Region {
  id: string;
  type: string;
  part: PartId;
  side: Side;
  label: string;
  /** Local-space range along the part axis that the region spans. */
  y0: number;
  y1: number;
  /** Hierarchy group shown in the scene tree. */
  group: string;
}

function buildRegions(): Region[] {
  const out: Region[] = [];
  const c = (id: string, part: PartId, label: string, y0: number, y1: number, group: string) =>
    out.push({ id, type: id, part, side: 'C', label, y0, y1, group });
  c('skull', 'head', 'Skull', 1.7, 1.81, 'Head');
  c('face', 'head', 'Face', 1.62, 1.7, 'Head');
  c('jaw', 'head', 'Jaw', 1.55, 1.62, 'Head');
  c('neck', 'torso', 'Neck', 1.49, 1.6, 'Head');
  c('chest', 'torso', 'Chest', 1.26, 1.49, 'Torso');
  c('back', 'torso', 'Back', 1.1, 1.49, 'Torso');
  c('abdomen', 'torso', 'Abdomen', 1.1, 1.26, 'Torso');
  c('waist', 'torso', 'Waist', 1.02, 1.1, 'Waist');
  c('pelvis', 'torso', 'Pelvis', 0.83, 1.02, 'Waist');
  for (const side of ['L', 'R'] as const) {
    const S = side === 'L' ? 'Left' : 'Right';
    const s = (type: string, part: PartType, label: string, y0: number, y1: number, group: string) =>
      out.push({
        id: `${type}${side}`,
        type,
        part: `${part}${side}` as PartId,
        side,
        label: `${S} ${label}`,
        y0,
        y1,
        group: `${S} ${group}`,
      });
    s('shoulder', 'arm', 'Shoulder', -0.07, 0.06, 'Arm');
    s('upperArm', 'arm', 'Upper Arm', -0.25, -0.07, 'Arm');
    s('elbow', 'arm', 'Elbow', -0.33, -0.25, 'Arm');
    s('forearm', 'arm', 'Forearm', -0.52, -0.33, 'Arm');
    s('wrist', 'arm', 'Wrist', -0.57, -0.52, 'Arm');
    s('hand', 'hand', 'Hand', -0.1, 0.0, 'Hand');
    s('fingers', 'hand', 'Fingers', -0.19, -0.1, 'Hand');
    s('thigh', 'leg', 'Thigh', -0.37, 0.05, 'Leg');
    s('knee', 'leg', 'Knee', -0.49, -0.37, 'Leg');
    s('shin', 'leg', 'Shin', -0.78, -0.49, 'Leg');
    s('ankle', 'leg', 'Ankle', -0.84, -0.78, 'Leg');
    s('foot', 'foot', 'Foot', 0, 0.1, 'Foot');
  }
  return out;
}

export const REGIONS: Region[] = buildRegions();
export const REGION_BY_ID: Record<string, Region> = Object.fromEntries(REGIONS.map((r) => [r.id, r]));

export const HIERARCHY_GROUPS = [
  'Head',
  'Torso',
  'Waist',
  'Left Arm',
  'Right Arm',
  'Left Hand',
  'Right Hand',
  'Left Leg',
  'Right Leg',
  'Left Foot',
  'Right Foot',
];

/** Region id for a region type on a given side ('C' types ignore the side). */
export function regionId(type: string, side: Side): string {
  if (REGION_BY_ID[type]) return type;
  const id = `${type}${side === 'C' ? 'L' : side}`;
  return id;
}

export function mirrorRegionId(id: string): string | null {
  const r = REGION_BY_ID[id];
  if (!r || r.side === 'C') return null;
  return `${r.type}${r.side === 'L' ? 'R' : 'L'}`;
}

/** Identify the body region under a point on a part (point given in that part's local frame). */
export function regionAt(partId: PartId, local: Vector3): Region {
  const part = PARTS[partId];
  const candidates = REGIONS.filter((r) => r.part === partId);
  if (partId === 'torso') {
    const y = local.y;
    if (y >= 1.49) return REGION_BY_ID.neck;
    if (y >= 1.26) return local.z < -0.02 ? REGION_BY_ID.back : REGION_BY_ID.chest;
    if (y >= 1.1) return local.z < -0.02 ? REGION_BY_ID.back : REGION_BY_ID.abdomen;
    if (y >= 1.02) return REGION_BY_ID.waist;
    return REGION_BY_ID.pelvis;
  }
  if (part.type === 'foot') return candidates[0];
  let best = candidates[0];
  let bestD = Infinity;
  for (const r of candidates) {
    const d = local.y < r.y0 ? r.y0 - local.y : local.y > r.y1 ? local.y - r.y1 : 0;
    if (d < bestD) {
      bestD = d;
      best = r;
    }
  }
  return best;
}

export const BODY_DIMS = { ARM_LEN, LEG_LEN, ARM_ROT, LEG_ROT, height: 1.806 };
