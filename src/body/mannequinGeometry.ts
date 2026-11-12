// Builds the mannequin meshes from the same body profiles that armour is fitted to.

import { BufferGeometry, Matrix4, SphereGeometry, Vector3 } from 'three';
import { linspace } from '../core/math';
import type { PartId } from '../core/types';
import { addFoot, addHand } from '../geometry/families/extremities';
import { MeshBuilder, type SurfFn } from '../geometry/MeshBuilder';
import { PARTS, PROFILES, ringXZ, sampleProfile, type PartProfile } from './body';

const sphere = new SphereGeometry(1, 20, 14);

function loft(b: MeshBuilder, prof: PartProfile, rings = 40, segs = 40) {
  const y0 = prof.ys[0];
  const y1 = prof.ys[prof.ys.length - 1];
  const fn: SurfFn = (u, v, _off, out) => {
    // v slightly outside [0,1] closes the ends
    const vv = Math.min(1, Math.max(0, v));
    const y = y0 + (y1 - y0) * vv;
    const sec = sampleProfile(prof, y);
    const k = v < 0 ? 0.02 : v > 1 ? 0.02 : 1;
    const [x, z] = ringXZ(sec, u, 0, k, k);
    out.set(x, y + (v < 0 ? -0.004 : v > 1 ? 0.004 : 0), v < 0 || v > 1 ? sec.cz : z);
  };
  b.addSurface({ us: linspace(-Math.PI, Math.PI, segs), vs: [-0.01, ...linspace(0, 1, rings), 1.01], fn, closedU: true });
}

export function buildMannequinPart(id: PartId): BufferGeometry {
  const part = PARTS[id];
  const b = new MeshBuilder();
  const m = new Matrix4();
  switch (part.type) {
    case 'head': {
      loft(b, PROFILES.head, 30, 40);
      // nose
      m.makeScale(0.013, 0.024, 0.016).setPosition(0, 1.655, 0.094);
      b.addGeometry(sphere, m);
      // ears
      for (const s of [-1, 1]) {
        m.makeScale(0.006, 0.017, 0.011).setPosition(s * 0.0755, 1.668, -0.006);
        b.addGeometry(sphere, m);
      }
      break;
    }
    case 'torso':
      loft(b, PROFILES.torso, 56, 48);
      break;
    case 'arm':
      loft(b, PROFILES.arm, 44, 24);
      break;
    case 'leg':
      loft(b, PROFILES.leg, 44, 28);
      break;
    case 'hand':
      addHand(b, { gap: 0, width: 1, wrap: 1, mitten: false, lames: 0, fingerLames: 0, thickness: 0, fingerLen: 1, idBase: 0 });
      break;
    case 'foot':
      addFoot(b, { gap: 0, toe: 0, pointy: 0, width: 1, lames: 0, hole: false, sole: false, id: 0 });
      break;
  }
  if (part.side === 'R') b.mirrorX();
  const g = b.finish();
  g.clearGroups();
  return g;
}

/** World-space centre of a part, handy for camera framing. */
export function partCenter(id: PartId): Vector3 {
  const g = buildMannequinPart(id);
  const c = g.boundingBox!.getCenter(new Vector3());
  g.dispose();
  return c.applyMatrix4(PARTS[id].matrix);
}
