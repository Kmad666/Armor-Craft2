// Catalogue thumbnails are real renders of each template's procedural geometry, produced lazily
// by a small offscreen renderer and cached as data URLs.

import {
  ACESFilmicToneMapping,
  AmbientLight,
  DirectionalLight,
  Group,
  Mesh,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  Sphere,
  Box3,
  Vector3,
  WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { create } from 'zustand';
import { TEMPLATE_BY_ID } from '../catalog/templates';
import type { ComponentInstance, CustomPart } from '../core/types';
import { buildComponent, defaultParams } from '../geometry/build';
import { materialFromPreset } from '../catalog/materials';
import { materialsFor } from '../materials/factory';
import { attachMatrix, resolveAttachment } from '../state/ops';

const SIZE = 168;

export const useThumbs = create<{ urls: Record<string, string> }>(() => ({ urls: {} }));

let renderer: WebGLRenderer | null = null;
let scene: Scene | null = null;
let camera: PerspectiveCamera | null = null;
let failed = false;
const queue: { key: string; make: () => Group; back: boolean }[] = [];
const requested = new Set<string>();
let timer: number | null = null;

function ensure() {
  if (renderer || failed) return;
  try {
    renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(SIZE, SIZE, false);
    renderer.setPixelRatio(1);
    renderer.toneMapping = ACESFilmicToneMapping;
    scene = new Scene();
    const pm = new PMREMGenerator(renderer);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.03).texture;
    scene.environmentIntensity = 0.9;
    scene.add(new AmbientLight(0xffffff, 0.35));
    const key = new DirectionalLight(0xffffff, 2.4);
    key.position.set(1.5, 2.5, 3);
    scene.add(key);
    const rim = new DirectionalLight(0xcfe0ff, 1);
    rim.position.set(-2, 1, -2);
    scene.add(rim);
    camera = new PerspectiveCamera(26, 1, 0.01, 20);
  } catch {
    failed = true;
  }
}

/** Build a standalone Object3D for a component sub-tree (geometry-local frame of the root). */
export function assemble(instances: Record<string, ComponentInstance>, rootId: string): Group {
  const make = (id: string, parentBuild: ReturnType<typeof buildComponent> | null, isRoot: boolean): Group => {
    const inst = instances[id];
    const t = TEMPLATE_BY_ID[inst.templateId];
    const build = buildComponent(inst.templateId, inst.params, 0.002, inst.symmetry.mirrored);
    const frame = new Group();
    if (!isRoot && inst.attachment) {
      frame.matrixAutoUpdate = false;
      frame.matrix.copy(attachMatrix(resolveAttachment(inst.attachment, parentBuild), t.attach ?? 'normalY'));
    }
    const user = new Group();
    const p = build.pivot;
    if (!isRoot) {
      user.position.set(p[0] + inst.transform.position[0], p[1] + inst.transform.position[1], p[2] + inst.transform.position[2]);
      user.rotation.set(...inst.transform.rotation);
      user.scale.set(...inst.transform.scale);
    } else user.position.set(p[0], p[1], p[2]);
    const inner = new Group();
    inner.position.set(-p[0], -p[1], -p[2]);
    inner.add(new Mesh(build.geometry, materialsFor(inst.materials, !!t.doubleSided)));
    for (const c of inst.children) if (instances[c] && TEMPLATE_BY_ID[instances[c].templateId]) inner.add(make(c, build, false));
    user.add(inner);
    frame.add(user);
    return frame;
  };
  return make(rootId, null, true);
}

function templateGroup(templateId: string): Group {
  const t = TEMPLATE_BY_ID[templateId];
  const materials = Object.fromEntries(Object.entries(t.materials).map(([k, v]) => [k, materialFromPreset(v)]));
  const g = new Group();
  g.add(new Mesh(buildComponent(templateId, defaultParams(t), 0.002, false).geometry, materialsFor(materials, !!t.doubleSided)));
  return g;
}

function pump() {
  timer = null;
  ensure();
  if (!renderer || !scene || !camera) return;
  const batch = queue.splice(0, 3);
  const urls: Record<string, string> = {};
  for (const job of batch) {
    try {
      const obj = job.make();
      scene.add(obj);
      obj.updateMatrixWorld(true);
      const sphere = new Box3().setFromObject(obj).getBoundingSphere(new Sphere());
      const dir = new Vector3(0.55, 0.28, job.back ? -1 : 1).normalize();
      const dist = (sphere.radius / Math.sin((camera.fov * Math.PI) / 360)) * 1.08;
      camera.position.copy(sphere.center).addScaledVector(dir, dist);
      camera.near = Math.max(0.005, dist - sphere.radius * 2);
      camera.far = dist + sphere.radius * 2;
      camera.updateProjectionMatrix();
      camera.lookAt(sphere.center);
      renderer.render(scene, camera);
      urls[job.key] = renderer.domElement.toDataURL('image/png');
      scene.remove(obj);
    } catch {
      urls[job.key] = '';
    }
  }
  useThumbs.setState((s) => ({ urls: { ...s.urls, ...urls } }));
  if (queue.length) timer = window.setTimeout(pump, 16);
}

function enqueue(key: string, make: () => Group, back: boolean) {
  if (requested.has(key)) return;
  requested.add(key);
  queue.push({ key, make, back });
  if (timer === null) timer = window.setTimeout(pump, 30);
}

export function requestTemplateThumb(templateId: string) {
  const t = TEMPLATE_BY_ID[templateId];
  if (!t) return;
  const back = (typeof t.cfg.arcCenter === 'number' && Math.cos(t.cfg.arcCenter) < -0.5) || (Array.isArray(t.cfg.apex) && t.cfg.apex[2] < -0.5);
  enqueue(templateId, () => templateGroup(templateId), back);
}

export function requestCustomThumb(part: CustomPart) {
  enqueue(`custom:${part.id}`, () => assemble(part.instances, part.rootId), false);
}
