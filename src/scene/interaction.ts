// Imperative viewport interactions that outlive React renders: morph-handle drags and
// sliding accessories across surfaces.

import { Matrix3, Vector3 } from 'three';
import { TEMPLATE_BY_ID } from '../catalog/templates';
import type { Vec3 } from '../core/types';
import { clampParams } from '../geometry/build';
import type { HandleSpec } from '../geometry/types';
import { useEditor } from '../state/store';
import { bridge, placementTarget, setRayFromClient, subtreeIds } from './bridge';

let active: null | { cancel: () => void } = null;

function lockCamera(lock: boolean) {
  if (bridge.controls) bridge.controls.enabled = !lock;
  useEditor.getState().setDragging(lock);
}

/** Parameter along an axis line (origin + t * dir) closest to the pointer ray. */
function axisParam(origin: Vector3, dir: Vector3, clientX: number, clientY: number): number | null {
  const rc = setRayFromClient(clientX, clientY);
  if (!rc) return null;
  const D = rc.ray.direction;
  const w = rc.ray.origin.clone().sub(origin);
  const b = D.dot(dir);
  const d = D.dot(w);
  const e = dir.dot(w);
  const denom = 1 - b * b;
  if (denom < 1e-4) return null;
  return (e - b * d) / denom;
}

function begin(onMove: (ev: PointerEvent) => void, onEnd: (cancelled: boolean) => void) {
  active?.cancel();
  const move = (ev: PointerEvent) => onMove(ev);
  const finish = (cancelled: boolean) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancelEv);
    window.removeEventListener('keydown', key, true);
    active = null;
    lockCamera(false);
    onEnd(cancelled);
  };
  const up = () => finish(false);
  const cancelEv = () => finish(true);
  const key = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') {
      ev.stopPropagation();
      finish(true);
    }
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', cancelEv);
  window.addEventListener('keydown', key, true);
  active = { cancel: () => finish(true) };
  lockCamera(true);
}

/** Drag a morph handle: the bound shape parameter follows the pointer along the handle's axis, live. */
export function startHandleDrag(id: string, h: HandleSpec, clientX: number, clientY: number) {
  const store = useEditor.getState();
  const inst = store.design.instances[id];
  const node = bridge.nodes.get(id);
  if (!inst || !node || inst.locked) return;
  node.inner.updateWorldMatrix(true, false);
  const origin = new Vector3(...h.position).applyMatrix4(node.inner.matrixWorld);
  const dir = new Vector3(...h.axis).applyMatrix3(new Matrix3().setFromMatrix4(node.inner.matrixWorld));
  const scale = dir.length() || 1;
  dir.normalize();
  const start = inst.params[h.param];
  const t0 = axisParam(origin, dir, clientX, clientY);
  if (t0 === null) return;
  store.beginEdit();
  begin(
    (ev) => {
      const t = axisParam(origin, dir, ev.clientX, ev.clientY);
      if (t === null) return;
      useEditor.getState().updateParams(id, { [h.param]: start + (h.gain * (t - t0)) / scale }, true);
    },
    (cancelled) => {
      if (cancelled) useEditor.getState().cancelEdit();
      else useEditor.getState().endEdit();
    },
  );
}

/** Value a handle drag would produce (exposed for tests / tooltips). */
export function previewHandleValue(templateId: string, param: string, value: number): number {
  return clampParams(TEMPLATE_BY_ID[templateId], { [param]: value })[param];
}

/** Press on an already-selected accessory and drag: it slides over whatever surface is under the pointer. */
export function startSlide(id: string, clientX: number, clientY: number) {
  const store = useEditor.getState();
  const inst = store.design.instances[id];
  if (!inst || !inst.parentId || inst.locked) return;
  let moved = false;
  const exclude = subtreeIds(id);
  begin(
    (ev) => {
      if (!moved) {
        if (Math.hypot(ev.clientX - clientX, ev.clientY - clientY) < 5) return;
        moved = true;
        useEditor.getState().beginEdit();
      }
      const { target } = placementTarget(ev.clientX, ev.clientY, exclude);
      if (!target) return;
      const s = useEditor.getState();
      const cur = s.design.instances[id];
      if (!cur) return;
      if (cur.transform.position.some((v) => v !== 0)) s.updateTransform(id, { position: [0, 0, 0] as Vec3 }, true);
      if (target.parentId === cur.parentId) s.setAttachment(id, target.attachment, true);
      else s.reattach(id, target.parentId, target.attachment);
    },
    (cancelled) => {
      if (!moved) return;
      if (cancelled) useEditor.getState().cancelEdit();
      else useEditor.getState().endEdit();
    },
  );
}

export function cancelActiveDrag() {
  active?.cancel();
}
