import { Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Vector3 } from 'three';
import { App } from './App';
import { TEMPLATES, TEMPLATE_BY_ID } from './catalog/templates';
import { buildStats } from './geometry/build';
import { PRESETS } from './presets';
import { bridge, currentBuild, pick, projectLocal, setView } from './scene/bridge';
import * as ops from './state/ops';
import { storage, useEditor } from './state/store';
import './styles.css';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash">
        <h2>Something went wrong</h2>
        <p>{this.state.error.message}</p>
        <p>Your work is autosaved. Reload to recover the last draft.</p>
        <button className="btn primary" onClick={() => location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}

// Debug / automation surface used by the Playwright suite and handy in the console.
(window as any).__atelier = {
  store: useEditor,
  ops,
  bridge,
  storage,
  templates: TEMPLATES,
  templateById: TEMPLATE_BY_ID,
  presets: PRESETS,
  buildStats,
  setView,
  pick,
  projectLocal,
  /** Client coordinates of a morph handle of a component. */
  handlePos(id: string, handleId: string) {
    const b = currentBuild(id);
    const h = b?.handles.find((x) => x.id === handleId);
    return h ? projectLocal(id, h.position) : null;
  },
  /** Client coordinates of a point on a component's parametric surface. */
  surfacePos(id: string, surface: number, u: number, v: number) {
    const b = currentBuild(id);
    const sp = b?.builder.evalSurface(surface, u, v);
    return sp ? projectLocal(id, sp.position.toArray() as [number, number, number]) : null;
  },
  /** World-space bounding box of a component's mesh. */
  worldBox(id: string) {
    const n = bridge.nodes.get(id);
    if (!n) return null;
    n.mesh.updateWorldMatrix(true, false);
    const bb = n.mesh.geometry.boundingBox!;
    const min = new Vector3(Infinity, Infinity, Infinity);
    const max = new Vector3(-Infinity, -Infinity, -Infinity);
    for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) {
      const p = new Vector3(x, y, z).applyMatrix4(n.mesh.matrixWorld);
      min.min(p);
      max.max(p);
    }
    return { min: min.toArray(), max: max.toArray() };
  },
};

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
