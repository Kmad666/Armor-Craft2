// The 3D workspace: studio, mannequin, equipped components, gizmos and accessory placement.

import { OrbitControls, TransformControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ACESFilmicToneMapping,
  CanvasTexture,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  PCFSoftShadowMap,
  PMREMGenerator,
  SRGBColorSpace,
  Vector3,
  type PerspectiveCamera,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { PART_IDS, PARTS } from '../body/body';
import { buildMannequinPart } from '../body/mannequinGeometry';
import { CATEGORIES, TEMPLATE_BY_ID } from '../catalog/templates';
import type { Vec3 } from '../core/types';
import { buildComponent, defaultParams } from '../geometry/build';
import { attachMatrix, resolveAttachment } from '../state/ops';
import { useEditor } from '../state/store';
import { bridge, HOME_TARGET, pick, placementTarget, subtreeIds, type PlacementTarget } from './bridge';
import { ComponentNode } from './ComponentNode';

function Studio() {
  const { gl, scene } = useThree();
  const showGrid = useEditor((s) => s.design.mannequin.showGrid);
  useEffect(() => {
    const pmrem = new PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.62;
    scene.background = new Color('#b9b4ac');
    return () => {
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  const floorTex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
    g.addColorStop(0, 'rgba(214,209,200,1)');
    g.addColorStop(0.55, 'rgba(200,195,186,0.9)');
    g.addColorStop(1, 'rgba(185,180,172,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    return t;
  }, []);
  return (
    <>
      <hemisphereLight args={['#fff6e8', '#6f6a62', 0.38]} />
      <directionalLight
        position={[2.2, 4.2, 3.2]}
        intensity={1.9}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.012}
        shadow-camera-left={-1.4}
        shadow-camera-right={1.4}
        shadow-camera-top={2.2}
        shadow-camera-bottom={-0.4}
        shadow-camera-near={0.5}
        shadow-camera-far={9}
        shadow-radius={5}
      />
      <directionalLight position={[-3, 2.2, -2.5]} intensity={0.9} color="#cfe0ff" />
      <directionalLight position={[-2.5, 1.5, 3]} intensity={0.45} color="#ffe9cf" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]}>
        <circleGeometry args={[3.2, 64]} />
        <meshBasicMaterial map={floorTex} transparent toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.001, 0]} receiveShadow>
        <circleGeometry args={[3, 48]} />
        <shadowMaterial opacity={0.28} />
      </mesh>
      {showGrid && <gridHelper args={[3, 30, '#8d877e', '#a39d94']} position={[0, 0, 0]} />}
    </>
  );
}

function CameraRig() {
  const { camera, gl, scene, invalidate } = useThree();
  const ref = useRef<any>(null);
  useEffect(() => {
    bridge.camera = camera as PerspectiveCamera;
    bridge.gl = gl;
    bridge.scene = scene;
    bridge.invalidate = () => invalidate();
  }, [camera, gl, scene, invalidate]);
  useEffect(() => {
    bridge.controls = ref.current;
  });
  useFrame((_s, dt) => {
    const a = bridge.cameraAnim;
    const c = ref.current;
    if (!a || !c) return;
    a.t = Math.min(1, a.t + dt * 2.6);
    const k = 1 - Math.pow(1 - a.t, 3);
    camera.position.lerp(a.pos, k);
    c.target.lerp(a.target, k);
    c.update();
    if (a.t >= 1) bridge.cameraAnim = null;
    else invalidate();
  });
  return <OrbitControls ref={ref} makeDefault target={HOME_TARGET.toArray()} minDistance={0.25} maxDistance={9} enableDamping dampingFactor={0.12} maxPolarAngle={Math.PI * 0.93} />;
}

const CATEGORY_FOR_GROUP: Record<string, string> = { head: 'head', torso: 'torso', arm: 'arms', hand: 'hands', leg: 'legs', foot: 'feet' };

function Mannequin() {
  const color = useEditor((s) => s.design.mannequin.color);
  const parts = useMemo(() => PART_IDS.map((id) => ({ id, geo: buildMannequinPart(id) })), []);
  return (
    <group>
      {parts.map(({ id, geo }) => (
        <mesh
          key={id}
          ref={(m) => {
            if (m) bridge.mannequin.set(id, m);
            else bridge.mannequin.delete(id);
          }}
          geometry={geo}
          matrix={PARTS[id].matrix}
          matrixAutoUpdate={false}
          userData={{ part: id }}
          castShadow
          receiveShadow
          onClick={(e) => {
            const s = useEditor.getState();
            if (s.placing || e.delta > 5) return;
            e.stopPropagation();
            s.select(null);
            const p = PARTS[id];
            let cat = CATEGORY_FOR_GROUP[p.type];
            if (p.type === 'torso') {
              const y = e.point.y;
              cat = y > 1.49 ? 'head' : y < 1.1 ? 'waist' : 'torso';
            }
            if (cat && cat !== s.catalogCategory && CATEGORIES.some((c) => c.id === cat)) s.setCatalog(cat);
          }}
        >
          <meshStandardMaterial color={color} roughness={0.82} metalness={0} envMapIntensity={0.5} />
        </mesh>
      ))}
    </group>
  );
}

function Gizmo() {
  const id = useEditor((s) => s.selectedId);
  const tool = useEditor((s) => s.tool);
  const locked = useEditor((s) => (s.selectedId ? !!s.design.instances[s.selectedId]?.locked : false));
  useEditor((s) => s.nodeTick);
  const node = id ? bridge.nodes.get(id) : null;
  if (!id || !node || locked || (tool !== 'move' && tool !== 'rotate' && tool !== 'scale')) return null;
  const sync = () => {
    const n = bridge.nodes.get(id);
    if (!n) return;
    const piv = n.build.pivot;
    const o = n.user;
    useEditor.getState().updateTransform(
      id,
      {
        position: [o.position.x - piv[0], o.position.y - piv[1], o.position.z - piv[2]] as Vec3,
        rotation: [o.rotation.x, o.rotation.y, o.rotation.z] as Vec3,
        scale: [o.scale.x, o.scale.y, o.scale.z] as Vec3,
      },
      true,
    );
  };
  return (
    <TransformControls
      object={node.user as any}
      mode={tool === 'move' ? 'translate' : tool}
      space="local"
      size={0.62}
      onMouseDown={() => {
        useEditor.getState().beginEdit();
        useEditor.getState().setDragging(true);
      }}
      onMouseUp={() => {
        sync();
        useEditor.getState().endEdit();
        useEditor.getState().setDragging(false);
      }}
      onObjectChange={sync}
    />
  );
}

/** Ghost preview + confirmation for accessory placement. Controlled imperatively from DOM pointer events. */
export const placement = {
  update: (_x: number, _y: number) => {},
  confirm: (_x: number, _y: number) => false as boolean,
};

const ghostOk = new MeshBasicMaterial({ color: '#58e08a', transparent: true, opacity: 0.55, depthWrite: false });
const ghostBad = new MeshBasicMaterial({ color: '#ff5a4d', transparent: true, opacity: 0.5, depthWrite: false });

function PlacementGhost() {
  const placing = useEditor((s) => s.placing);
  const ref = useRef<Mesh>(null);
  const info = useMemo(() => {
    if (!placing) return null;
    const s = useEditor.getState();
    if (placing.kind === 'template') {
      const t = TEMPLATE_BY_ID[placing.templateId];
      if (!t || t.kind !== 'accessory') return null;
      return { templateId: t.id, params: defaultParams(t), exclude: new Set<string>() };
    }
    if (placing.kind === 'custom') {
      const part = s.customParts.find((p) => p.id === placing.partId);
      const root = part?.instances[part.rootId];
      if (!root) return null;
      return { templateId: root.templateId, params: root.params, exclude: new Set<string>() };
    }
    const inst = s.design.instances[placing.id];
    if (!inst) return null;
    return { templateId: inst.templateId, params: inst.params, exclude: subtreeIds(placing.id) };
  }, [placing]);

  useEffect(() => {
    if (!placing || !info) {
      placement.update = () => {};
      placement.confirm = () => false;
      return;
    }
    const t = TEMPLATE_BY_ID[info.templateId];
    const resolve = (x: number, y: number) => {
      const { target, hit } = placementTarget(x, y, info.exclude);
      return { target, hit };
    };
    const show = (target: PlacementTarget | null, hitPoint: Vector3 | null) => {
      const m = ref.current;
      if (!m) return;
      if (!target) {
        if (!hitPoint) {
          m.visible = false;
          bridge.invalidate();
          return;
        }
        m.visible = true;
        m.material = ghostBad;
        m.geometry = buildComponent(info.templateId, info.params, 0, false).geometry;
        m.matrix.makeTranslation(hitPoint.x, hitPoint.y, hitPoint.z);
        m.matrixWorldNeedsUpdate = true;
        bridge.invalidate();
        return;
      }
      const node = bridge.nodes.get(target.parentId);
      const parent = useEditor.getState().design.instances[target.parentId];
      if (!node || !parent) {
        m.visible = false;
        return;
      }
      m.geometry = buildComponent(info.templateId, info.params, 0, parent.symmetry.mirrored).geometry;
      m.material = ghostOk;
      m.visible = true;
      node.inner.updateWorldMatrix(true, false);
      m.matrix.copy(node.inner.matrixWorld).multiply(attachMatrix(resolveAttachment(target.attachment, node.build), t.attach ?? 'normalY'));
      m.matrixWorldNeedsUpdate = true;
      bridge.invalidate();
    };
    placement.update = (x, y) => {
      const { target, hit } = resolve(x, y);
      show(target, hit ? hit.point : null);
    };
    placement.confirm = (x, y) => {
      const { target } = resolve(x, y);
      const s = useEditor.getState();
      if (!target) {
        s.notify('Accessories attach to armour pieces - drop it onto a helmet, plate or other component.', 'info');
        return false;
      }
      if (placing.kind === 'template') s.addAccessory(placing.templateId, target.parentId, target.attachment);
      else if (placing.kind === 'custom') s.placeCustomPart(placing.partId, { parentId: target.parentId, attachment: target.attachment });
      else {
        s.updateTransform(placing.id, { position: [0, 0, 0] });
        s.reattach(placing.id, target.parentId, target.attachment);
      }
      s.setPlacing(null);
      return true;
    };
    return () => {
      placement.update = () => {};
      placement.confirm = () => false;
    };
  }, [placing, info]);

  if (!placing || !info) return null;
  return <mesh ref={ref} visible={false} matrixAutoUpdate={false} renderOrder={900} raycast={() => null} dispose={null} />;
}

function Components() {
  const roots = useEditor((s) => s.design.roots);
  return (
    <>
      {roots.map((id) => (
        <ComponentNode key={id} id={id} parentBuild={null} />
      ))}
    </>
  );
}

export function Viewport() {
  const placing = useEditor((s) => s.placing);
  const [webgl, setWebgl] = useState(true);
  const [handleTip, setHandleTip] = useState<string | null>(null);
  const downAt = useRef<[number, number] | null>(null);
  useEffect(() => {
    try {
      const c = document.createElement('canvas');
      if (!c.getContext('webgl2') && !c.getContext('webgl')) setWebgl(false);
    } catch {
      setWebgl(false);
    }
    const onTip = (e: Event) => setHandleTip((e as CustomEvent).detail);
    window.addEventListener('atelier-handle', onTip);
    return () => window.removeEventListener('atelier-handle', onTip);
  }, []);

  if (!webgl) {
    return (
      <div className="viewport viewport-fallback">
        <div>
          <h2>WebGL is not available</h2>
          <p>Armor Atelier needs WebGL to draw the 3D workspace. Try a current version of Chrome, Edge, Firefox or Safari, and make sure hardware acceleration is enabled.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`viewport${placing ? ' placing' : ''}`}
      data-testid="viewport"
      onPointerMove={(e) => {
        if (useEditor.getState().placing) placement.update(e.clientX, e.clientY);
      }}
      onPointerDown={(e) => {
        downAt.current = [e.clientX, e.clientY];
      }}
      onClick={(e) => {
        const d = downAt.current;
        if (!useEditor.getState().placing || !d || Math.hypot(e.clientX - d[0], e.clientY - d[1]) > 5) return;
        placement.confirm(e.clientX, e.clientY);
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('application/x-atelier')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        if (useEditor.getState().placing) placement.update(e.clientX, e.clientY);
      }}
      onDrop={(e) => {
        const raw = e.dataTransfer.getData('application/x-atelier');
        if (!raw) return;
        e.preventDefault();
        const s = useEditor.getState();
        const data = JSON.parse(raw) as { templateId?: string; partId?: string };
        if (s.placing) {
          if (!placement.confirm(e.clientX, e.clientY)) s.setPlacing(null);
          return;
        }
        const hit = pick(e.clientX, e.clientY);
        const side = hit && hit.point.x < 0 ? 'R' : 'L';
        if (data.templateId) s.addFitted(data.templateId, side);
        else if (data.partId) s.placeCustomPart(data.partId);
      }}
    >
      <Canvas
        frameloop="demand"
        shadows={{ type: PCFSoftShadowMap }}
        dpr={[1, 2]}
        camera={{ fov: 34, near: 0.05, far: 60, position: [1.9, 1.35, 3.05] }}
        gl={{ antialias: true, preserveDrawingBuffer: true, toneMapping: ACESFilmicToneMapping, toneMappingExposure: 0.95 }}
        onPointerMissed={(e) => {
          const s = useEditor.getState();
          if (!s.placing && e.type === 'click') s.select(null);
        }}
      >
        <Studio />
        <CameraRig />
        <Mannequin />
        <Components />
        <Gizmo />
        <PlacementGhost />
      </Canvas>
      {handleTip && <div className="handle-tip">{handleTip}</div>}
    </div>
  );
}

export type { Group };
