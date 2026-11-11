// Bridge between the React-three scene and imperative editor logic (picking, placement, camera, screenshots).

import { Box3, Matrix4, Mesh, Object3D, PerspectiveCamera, Raycaster, Scene, Sphere, Triangle, Vector2, Vector3, WebGLRenderer } from 'three';
import { PARTS, REGION_BY_ID, regionAt, type Region } from '../body/body';
import { TEMPLATE_BY_ID } from '../catalog/templates';
import type { Attachment, PartId, Vec3 } from '../core/types';
import { buildComponent } from '../geometry/build';
import type { BuildResult } from '../geometry/types';
import { isBelow } from '../state/layering';
import { descendants } from '../state/ops';
import { useEditor } from '../state/store';

export interface NodeRef {
  id: string;
  /** Group whose local space equals geometry-local space (children attach here). */
  inner: Object3D;
  /** Group carrying the user's move / rotate / scale. */
  user: Object3D;
  mesh: Mesh;
  build: BuildResult;
}

export const bridge = {
  scene: null as Scene | null,
  camera: null as PerspectiveCamera | null,
  gl: null as WebGLRenderer | null,
  controls: null as any,
  nodes: new Map<string, NodeRef>(),
  mannequin: new Map<PartId, Mesh>(),
  cameraAnim: null as null | { pos: Vector3; target: Vector3; t: number },
};

const raycaster = new Raycaster();
const ndc = new Vector2();

export function setRayFromClient(clientX: number, clientY: number): Raycaster | null {
  const { gl, camera } = bridge;
  if (!gl || !camera) return null;
  const r = gl.domElement.getBoundingClientRect();
  ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  return raycaster;
}

export type PickResult =
  | { kind: 'component'; id: string; point: Vector3; attachment: Attachment }
  | { kind: 'mannequin'; part: PartId; region: Region; point: Vector3; normal: Vector3 }
  | null;

const tri = new Triangle();
const bary = new Vector3();
const pa = new Vector3();
const pb = new Vector3();
const pc = new Vector3();

function attachmentFromHit(mesh: Mesh, hit: { point: Vector3; face?: any }, rayDir: Vector3): Attachment {
  const inv = new Matrix4().copy(mesh.matrixWorld).invert();
  const local = hit.point.clone().applyMatrix4(inv);
  const n = hit.face ? (hit.face.normal as Vector3).clone() : new Vector3(0, 0, 1);
  const worldN = n.clone().transformDirection(mesh.matrixWorld);
  if (worldN.dot(rayDir) > 0) n.negate();
  const att: Attachment = { kind: 'static', surface: -1, u: 0, v: 0, position: local.toArray() as Vec3, normal: n.toArray() as Vec3 };
  const g = mesh.geometry;
  const surf = g.getAttribute('surf');
  const puv = g.getAttribute('puv');
  const pos = g.getAttribute('position');
  if (hit.face && surf && puv) {
    const { a, b, c } = hit.face;
    const s = surf.getX(a);
    if (s >= 0 && surf.getX(b) === s && surf.getX(c) === s) {
      pa.fromBufferAttribute(pos as any, a);
      pb.fromBufferAttribute(pos as any, b);
      pc.fromBufferAttribute(pos as any, c);
      tri.set(pa, pb, pc);
      tri.getBarycoord(local, bary);
      att.kind = 'param';
      att.surface = s;
      att.u = puv.getX(a) * bary.x + puv.getX(b) * bary.y + puv.getX(c) * bary.z;
      att.v = puv.getY(a) * bary.x + puv.getY(b) * bary.y + puv.getY(c) * bary.z;
    }
  }
  return att;
}

/** Raycast armour + mannequin under a screen point. */
export function pick(clientX: number, clientY: number, exclude: Set<string> = new Set()): PickResult {
  const rc = setRayFromClient(clientX, clientY);
  if (!rc) return null;
  const targets: Object3D[] = [];
  const design = useEditor.getState().design;
  for (const [id, node] of bridge.nodes) {
    if (exclude.has(id) || !design.instances[id]) continue;
    targets.push(node.mesh);
  }
  for (const m of bridge.mannequin.values()) targets.push(m);
  const hits = rc.intersectObjects(targets, false);
  const hit = hits[0];
  if (!hit) return null;
  const mesh = hit.object as Mesh;
  const id = mesh.userData.instanceId as string | undefined;
  if (id) return { kind: 'component', id, point: hit.point.clone(), attachment: attachmentFromHit(mesh, hit, rc.ray.direction) };
  const part = mesh.userData.part as PartId;
  const local = hit.point.clone().applyMatrix4(PARTS[part].inverse);
  const normal = hit.face ? hit.face.normal.clone().transformDirection(mesh.matrixWorld) : new Vector3(0, 0, 1);
  return { kind: 'mannequin', part, region: regionAt(part, local), point: hit.point.clone(), normal };
}

/** The outermost visible armour piece on a body part - accessories dropped on bare body attach to it. */
export function hostForPart(part: PartId): string | null {
  const { design } = useEditor.getState();
  let best: string | null = null;
  for (const id of design.roots) {
    const inst = design.instances[id];
    if (!inst || !inst.visible || REGION_BY_ID[inst.region]?.part !== part) continue;
    if (!bridge.nodes.has(id)) continue;
    if (!best || isBelow(design.instances[best], inst)) best = id;
  }
  return best;
}

export interface PlacementTarget {
  parentId: string;
  attachment: Attachment;
}

/** Resolve a screen point to an attachment target for an accessory. */
export function placementTarget(clientX: number, clientY: number, exclude: Set<string>): { target: PlacementTarget | null; hit: PickResult } {
  const hit = pick(clientX, clientY, exclude);
  if (!hit) return { target: null, hit };
  const design = useEditor.getState().design;
  if (hit.kind === 'component') {
    if (design.instances[hit.id]?.locked) return { target: null, hit };
    return { target: { parentId: hit.id, attachment: hit.attachment }, hit };
  }
  const host = hostForPart(hit.part);
  const node = host ? bridge.nodes.get(host) : null;
  if (!host || !node || design.instances[host].locked) return { target: null, hit };
  const lift = (useEditor.getState().fitOffsets[host] ?? 0) + 0.012;
  const inv = new Matrix4().copy(node.inner.matrixWorld).invert();
  const p = hit.point.clone().addScaledVector(hit.normal, lift).applyMatrix4(inv);
  const n = hit.normal.clone().transformDirection(inv);
  return { target: { parentId: host, attachment: { kind: 'static', surface: -1, u: 0, v: 0, position: p.toArray() as Vec3, normal: n.toArray() as Vec3 } }, hit };
}

export function subtreeIds(id: string): Set<string> {
  return new Set(descendants(useEditor.getState().design, id));
}

// ---------------------------------------------------------------- camera

const VIEWS: Record<string, [number, number, number]> = {
  front: [0, 0.98, 3.7],
  back: [0, 0.98, -3.7],
  left: [3.7, 0.98, 0],
  right: [-3.7, 0.98, 0],
  quarter: [1.9, 1.35, 3.05],
};
export const HOME_TARGET = new Vector3(0, 0.93, 0);

export function setView(name: keyof typeof VIEWS | string) {
  const v = VIEWS[name] ?? VIEWS.quarter;
  bridge.cameraAnim = { pos: new Vector3(...v), target: HOME_TARGET.clone(), t: 0 };
}

export function focusOn(id: string | null) {
  const { camera, controls } = bridge;
  if (!camera || !controls) return;
  const node = id ? bridge.nodes.get(id) : null;
  if (!node) return setView('quarter');
  const box = new Box3().setFromObject(node.user);
  const sphere = box.getBoundingSphere(new Sphere());
  const dir = camera.position.clone().sub(controls.target).normalize();
  const dist = Math.max(0.35, (sphere.radius / Math.sin((camera.fov * Math.PI) / 360)) * 1.25);
  bridge.cameraAnim = { pos: sphere.center.clone().addScaledVector(dir, dist), target: sphere.center.clone(), t: 0 };
}

/** Project a geometry-local point of a component to client (CSS pixel) coordinates. Used by tests and tutorials. */
export function projectLocal(id: string, local: Vec3): { x: number; y: number } | null {
  const node = bridge.nodes.get(id);
  const { camera, gl } = bridge;
  if (!node || !camera || !gl) return null;
  node.inner.updateWorldMatrix(true, false);
  const p = new Vector3(...local).applyMatrix4(node.inner.matrixWorld).project(camera);
  const r = gl.domElement.getBoundingClientRect();
  return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
}

export function screenshot(): string | null {
  const { gl, scene, camera } = bridge;
  if (!gl || !scene || !camera) return null;
  gl.render(scene, camera);
  return gl.domElement.toDataURL('image/png');
}

/** Current build of an instance as rendered (same cache the scene uses). */
export function currentBuild(id: string): BuildResult | null {
  const s = useEditor.getState();
  const inst = s.design.instances[id];
  if (!inst || !TEMPLATE_BY_ID[inst.templateId]) return null;
  const root = inst.parentId ? null : inst;
  return buildComponent(inst.templateId, inst.params, root ? (s.fitOffsets[inst.id] ?? 0) : 0, inst.symmetry.mirrored);
}
