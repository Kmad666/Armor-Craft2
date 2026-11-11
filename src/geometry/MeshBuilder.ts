// A small procedural mesh builder.
//
// Armour geometry is assembled from parametric surfaces  P(u, v, offset) -> point.
// `offset` pushes the point along the surface's outward direction, which gives us wall
// thickness (inner wall = negative offset) and layer spacing for free.
// Faces are assigned to material groups (base / trim / detail / void) so one component
// can carry several independently editable materials.

import { BufferGeometry, Float32BufferAttribute, Matrix4, Vector3 } from 'three';

export type SurfFn = (u: number, v: number, off: number, out: Vector3) => void;

export const GROUP_BASE = 0;
export const GROUP_TRIM = 1;
export const GROUP_DETAIL = 2;
export const GROUP_VOID = 3;
export const GROUP_COUNT = 4;

export interface SurfaceOpts {
  us: number[];
  vs: number[];
  fn: SurfFn;
  /** `us` spans a full loop (first and last column coincide); seam normals are welded. */
  closedU?: boolean;
  /** Wall thickness in metres. > 0 adds an inner wall and edge rims. */
  thickness?: number;
  /** Material group per cell; return -1 to leave a hole. */
  group?: number | ((i: number, j: number, uc: number, vc: number) => number);
  flip?: boolean;
  /** Faceted shading (unique vertices per cell). */
  flat?: boolean;
  /** Attachment surface index (parametric attachments can ride this surface). */
  id?: number;
  /** Texture scale: metres per unit of u and v. */
  uvScale?: [number, number];
}

export interface SurfacePoint {
  position: Vector3;
  normal: Vector3;
}

export class MeshBuilder {
  positions: number[] = [];
  uvs: number[] = [];
  puv: number[] = [];
  surf: number[] = [];
  tris: number[][] = [[], [], [], []];
  welds: number[] = [];
  surfaces: (SurfFn | null)[] = [];
  deformers: ((p: Vector3) => void)[] = [];
  private mirrored = false;
  private tmp = new Vector3();

  get vertexCount() {
    return this.positions.length / 3;
  }

  private pushVertex(p: Vector3, u: number, v: number, id: number, uvScale: [number, number]) {
    this.positions.push(p.x, p.y, p.z);
    this.puv.push(u, v);
    this.surf.push(id);
    this.uvs.push(u * uvScale[0], v * uvScale[1]);
    return this.positions.length / 3 - 1;
  }

  private tri(g: number, a: number, b: number, c: number, flip: boolean) {
    if (flip) this.tris[g].push(a, c, b);
    else this.tris[g].push(a, b, c);
  }

  addSurface(o: SurfaceOpts) {
    const { us, vs, fn } = o;
    const nu = us.length;
    const nv = vs.length;
    const id = o.id ?? -1;
    if (id >= 0) this.surfaces[id] = fn;
    const uvScale = o.uvScale ?? [0.1, 1];
    const flip = !!o.flip;
    const groupOf = (i: number, j: number) =>
      typeof o.group === 'function'
        ? o.group(i, j, (us[i] + us[i + 1]) / 2, (vs[j] + vs[j + 1]) / 2)
        : (o.group ?? GROUP_BASE);
    const p = this.tmp;
    const thick = o.thickness ?? 0;

    if (o.flat) {
      for (let j = 0; j < nv - 1; j++) {
        for (let i = 0; i < nu - 1; i++) {
          const g = groupOf(i, j);
          if (g < 0) continue;
          const idx: number[] = [];
          for (const [di, dj] of [
            [0, 0],
            [1, 0],
            [0, 1],
            [1, 1],
          ]) {
            fn(us[i + di], vs[j + dj], 0, p);
            idx.push(this.pushVertex(p, us[i + di], vs[j + dj], id, uvScale));
          }
          this.tri(g, idx[0], idx[1], idx[2], flip);
          this.tri(g, idx[1], idx[3], idx[2], flip);
        }
      }
      if (thick <= 0) return;
    }

    const makeGrid = (off: number, surfId: number) => {
      const base = this.vertexCount;
      for (let j = 0; j < nv; j++) {
        for (let i = 0; i < nu; i++) {
          fn(us[i], vs[j], off, p);
          this.pushVertex(p, us[i], vs[j], surfId, uvScale);
        }
      }
      return base;
    };

    const outer = o.flat ? -1 : makeGrid(0, id);
    const inner = thick > 0 ? makeGrid(-thick, -1) : -1;
    const groups: number[] = new Array((nu - 1) * (nv - 1));
    for (let j = 0; j < nv - 1; j++) {
      for (let i = 0; i < nu - 1; i++) {
        const g = groupOf(i, j);
        groups[j * (nu - 1) + i] = g;
        if (g < 0) continue;
        if (outer >= 0) {
          const a = outer + j * nu + i;
          this.tri(g, a, a + 1, a + nu, flip);
          this.tri(g, a + 1, a + nu + 1, a + nu, flip);
        }
        if (inner >= 0) {
          const a = inner + j * nu + i;
          this.tri(g, a, a + nu, a + 1, flip);
          this.tri(g, a + 1, a + nu, a + nu + 1, flip);
        }
      }
    }
    if (o.closedU && outer >= 0) {
      for (let j = 0; j < nv; j++) this.welds.push(outer + j * nu, outer + j * nu + nu - 1);
    }
    if (inner >= 0 && outer >= 0) {
      const O = (i: number, j: number) => outer + j * nu + i;
      const I = (i: number, j: number) => inner + j * nu + i;
      const cell = (i: number, j: number) =>
        i < 0 || j < 0 || i >= nu - 1 || j >= nv - 1 ? -1 : groups[j * (nu - 1) + i];
      // Rims are generated wherever a filled cell borders an empty one (outer boundary or a cut-out).
      for (let j = 0; j < nv - 1; j++) {
        for (let i = 0; i < nu - 1; i++) {
          const g = cell(i, j);
          if (g < 0) continue;
          if (cell(i, j - 1) < 0) {
            this.tri(g, O(i, j), I(i, j), O(i + 1, j), flip);
            this.tri(g, O(i + 1, j), I(i, j), I(i + 1, j), flip);
          }
          if (cell(i, j + 1) < 0) {
            this.tri(g, O(i, j + 1), O(i + 1, j + 1), I(i, j + 1), flip);
            this.tri(g, O(i + 1, j + 1), I(i + 1, j + 1), I(i, j + 1), flip);
          }
          const leftEmpty = i === 0 ? !o.closedU : cell(i - 1, j) < 0;
          const rightEmpty = i === nu - 2 ? !o.closedU : cell(i + 1, j) < 0;
          if (leftEmpty) {
            this.tri(g, O(i, j), O(i, j + 1), I(i, j), flip);
            this.tri(g, O(i, j + 1), I(i, j + 1), I(i, j), flip);
          }
          if (rightEmpty) {
            this.tri(g, O(i + 1, j), I(i + 1, j), O(i + 1, j + 1), flip);
            this.tri(g, O(i + 1, j + 1), I(i + 1, j), I(i + 1, j + 1), flip);
          }
        }
      }
    }
  }

  /** Append an existing geometry (e.g. a rivet sphere) transformed by `matrix`. */
  addGeometry(geo: BufferGeometry, matrix: Matrix4, group = GROUP_BASE) {
    const pos = geo.getAttribute('position');
    const base = this.vertexCount;
    const p = this.tmp;
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos as any, i).applyMatrix4(matrix);
      this.positions.push(p.x, p.y, p.z);
      this.puv.push(0, 0);
      this.surf.push(-1);
      this.uvs.push(p.x * 4, p.y * 4);
    }
    const flip = matrix.determinant() < 0;
    const index = geo.getIndex();
    const n = index ? index.count : pos.count;
    for (let i = 0; i < n; i += 3) {
      const a = base + (index ? index.getX(i) : i);
      const b = base + (index ? index.getX(i + 1) : i + 1);
      const c = base + (index ? index.getX(i + 2) : i + 2);
      this.tri(group, a, b, c, flip);
    }
  }

  /** Register a whole-mesh deformer (bend / twist / skew ...). Also applied to surface evaluation. */
  deform(fn: (p: Vector3) => void) {
    this.deformers.push(fn);
  }

  mirrorX() {
    this.mirrored = true;
  }

  applyPost(p: Vector3) {
    for (const d of this.deformers) d(p);
    if (this.mirrored) p.x = -p.x;
  }

  /** Evaluate an attachment surface after deformation / mirroring. */
  evalSurface(id: number, u: number, v: number): SurfacePoint | null {
    const fn = this.surfaces[id];
    if (!fn) return null;
    const p = new Vector3();
    const a = new Vector3();
    const b = new Vector3();
    const q = new Vector3();
    const e = 1e-3;
    fn(u, v, 0, p);
    this.applyPost(p);
    fn(u + e, v, 0, a);
    this.applyPost(a);
    fn(u, v + e, 0, b);
    this.applyPost(b);
    fn(u, v, 0.004, q);
    this.applyPost(q);
    const n = a.sub(p).cross(b.sub(p));
    q.sub(p);
    if (n.lengthSq() < 1e-16) n.copy(q);
    if (n.dot(q) < 0) n.negate();
    n.normalize();
    if (!isFinite(n.x)) n.set(0, 1, 0);
    return { position: p, normal: n };
  }

  finish(): BufferGeometry {
    const n = this.vertexCount;
    const pos = new Float32Array(this.positions);
    const p = this.tmp;
    if (this.deformers.length || this.mirrored) {
      for (let i = 0; i < n; i++) {
        p.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
        this.applyPost(p);
        pos[i * 3] = p.x;
        pos[i * 3 + 1] = p.y;
        pos[i * 3 + 2] = p.z;
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new Float32BufferAttribute(new Float32Array(this.uvs), 2));
    geo.setAttribute('puv', new Float32BufferAttribute(new Float32Array(this.puv), 2));
    geo.setAttribute('surf', new Float32BufferAttribute(new Float32Array(this.surf), 1));
    const index: number[] = [];
    let start = 0;
    for (let g = 0; g < GROUP_COUNT; g++) {
      const t = this.tris[g];
      if (this.mirrored) {
        for (let i = 0; i < t.length; i += 3) index.push(t[i], t[i + 2], t[i + 1]);
      } else {
        for (let i = 0; i < t.length; i++) index.push(t[i]);
      }
      if (t.length) geo.addGroup(start, t.length, g);
      start += t.length;
    }
    geo.setIndex(index);
    geo.computeVertexNormals();
    const nrm = geo.getAttribute('normal');
    for (let i = 0; i < this.welds.length; i += 2) {
      const a = this.welds[i];
      const b = this.welds[i + 1];
      const x = nrm.getX(a) + nrm.getX(b);
      const y = nrm.getY(a) + nrm.getY(b);
      const z = nrm.getZ(a) + nrm.getZ(b);
      const l = Math.hypot(x, y, z) || 1;
      nrm.setXYZ(a, x / l, y / l, z / l);
      nrm.setXYZ(b, x / l, y / l, z / l);
    }
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    return geo;
  }
}

/** Sample list with optional duplicated values (creases) removed of near-duplicates only when requested. */
export function uniqueSorted(values: number[], eps = 1e-6): number[] {
  const s = [...values].sort((a, b) => a - b);
  const out: number[] = [];
  for (const v of s) if (!out.length || v - out[out.length - 1] > eps) out.push(v);
  return out;
}
