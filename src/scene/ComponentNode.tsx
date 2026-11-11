// Renders one component instance (and, recursively, its attached accessories) from design state.

import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { BackSide, Color, Group, Matrix4, Mesh, ShaderMaterial, Vector3 } from 'three';
import { PARTS, REGION_BY_ID } from '../body/body';
import { TEMPLATE_BY_ID } from '../catalog/templates';
import { buildComponent } from '../geometry/build';
import type { BuildResult, HandleSpec } from '../geometry/types';
import { materialsFor } from '../materials/factory';
import { attachMatrix, resolveAttachment } from '../state/ops';
import { useEditor } from '../state/store';
import { bridge, focusOn } from './bridge';
import { startHandleDrag, startSlide } from './interaction';

function outlineMaterial(color: string, width: number) {
  return new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    uniforms: { uColor: { value: new Color(color) }, uWidth: { value: width } },
    vertexShader: `uniform float uWidth; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vec3 n = normalize(normalMatrix * normal); mv.xyz += n * uWidth * (-mv.z) ; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; void main(){ gl_FragColor = vec4(uColor,1.0); }`,
  });
}
const selectedOutline = outlineMaterial('#ffb347', 0.0019);
const hoverOutline = outlineMaterial('#7fc4ff', 0.0012);

const HANDLE_COLORS: Record<string, string> = { trim: '#ffb347', size: '#5fb2ff', shape: '#7be08d' };
const tmpV = new Vector3();

function HandleDot({ id, h }: { id: string; h: HandleSpec }) {
  const ref = useRef<Group>(null);
  const hit = useRef<Mesh>(null);
  const axis = useMemo(() => {
    const m = new Matrix4();
    const y = new Vector3(...h.axis).normalize();
    const ref0 = Math.abs(y.y) > 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
    const x = new Vector3().crossVectors(ref0, y).normalize();
    const z = new Vector3().crossVectors(x, y);
    return m.makeBasis(x, y, z);
  }, [h.axis[0], h.axis[1], h.axis[2]]);
  useLayoutEffect(() => {
    // handles win ray tests against the armour they sit on
    const m = hit.current;
    if (!m) return;
    const base = Mesh.prototype.raycast;
    m.raycast = function (rc, out) {
      const tmp: any[] = [];
      base.call(this, rc, tmp);
      for (const i of tmp) {
        i.distance = 0.0001;
        out.push(i);
      }
    };
  }, []);
  useEffect(
    () => () => {
      document.body.style.cursor = '';
      window.dispatchEvent(new CustomEvent('atelier-handle', { detail: null }));
    },
    [],
  );
  useFrame(({ camera }) => {
    const g = ref.current;
    if (!g || !g.parent) return;
    g.getWorldPosition(tmpV);
    const d = tmpV.distanceTo(camera.position);
    const ps = g.parent.getWorldScale(tmpV);
    const s = Math.min(0.03, Math.max(0.0035, d * 0.0075));
    g.scale.set(s / (ps.x || 1), s / (ps.y || 1), s / (ps.z || 1));
  });
  const color = HANDLE_COLORS[h.kind];
  return (
    <group ref={ref} position={h.position} userData={{ handle: h.id }}>
      <group matrix={axis} matrixAutoUpdate={false}>
        <mesh position={[0, 1.9, 0]} renderOrder={1000}>
          <coneGeometry args={[0.55, 1.5, 12]} />
          <meshBasicMaterial color={color} depthTest={false} transparent opacity={0.95} />
        </mesh>
        <mesh position={[0, -1.9, 0]} rotation={[Math.PI, 0, 0]} renderOrder={1000}>
          <coneGeometry args={[0.55, 1.5, 12]} />
          <meshBasicMaterial color={color} depthTest={false} transparent opacity={0.6} />
        </mesh>
      </group>
      <mesh renderOrder={1001}>
        <sphereGeometry args={[1, 16, 12]} />
        <meshBasicMaterial color="#ffffff" depthTest={false} transparent />
      </mesh>
      <mesh renderOrder={1002}>
        <sphereGeometry args={[0.72, 16, 12]} />
        <meshBasicMaterial color={color} depthTest={false} transparent />
      </mesh>
      <mesh
        ref={hit}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.stopPropagation();
          startHandleDrag(id, h, e.clientX, e.clientY);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = 'grab';
          window.dispatchEvent(new CustomEvent('atelier-handle', { detail: h.label }));
        }}
        onPointerOut={() => {
          document.body.style.cursor = '';
          window.dispatchEvent(new CustomEvent('atelier-handle', { detail: null }));
        }}
      >
        <sphereGeometry args={[1.5, 10, 8]} />
        <meshBasicMaterial visible={false} />
      </mesh>
    </group>
  );
}

interface Props {
  id: string;
  parentBuild: BuildResult | null;
}

export const ComponentNode = memo(function ComponentNode({ id, parentBuild }: Props) {
  const inst = useEditor((s) => s.design.instances[id]);
  if (!inst || !inst.visible || !TEMPLATE_BY_ID[inst.templateId]) return null;
  return <NodeBody id={id} parentBuild={parentBuild} />;
});

function NodeBody({ id, parentBuild }: Props) {
  const inst = useEditor((s) => s.design.instances[id])!;
  const fit = useEditor((s) => (inst.parentId ? 0 : (s.fitOffsets[id] ?? 0)));
  const selected = useEditor((s) => s.selectedId === id);
  const hovered = useEditor((s) => s.hoveredId === id && s.selectedId !== id);
  const tool = useEditor((s) => s.tool);
  const t = TEMPLATE_BY_ID[inst.templateId];
  const userRef = useRef<Group>(null);
  const innerRef = useRef<Group>(null);
  const meshRef = useRef<Mesh>(null);

  const squeeze = useEditor((s) => (inst.parentId ? undefined : s.squeeze[id]));
  const build = useMemo(() => buildComponent(inst.templateId, inst.params, fit, inst.symmetry.mirrored, squeeze), [inst.templateId, inst.params, fit, inst.symmetry.mirrored, squeeze]);
  const materials = useMemo(() => materialsFor(inst.materials, !!t.doubleSided), [inst.materials, t.doubleSided]);

  const frame = useMemo(() => {
    if (!inst.parentId || !inst.attachment) return PARTS[REGION_BY_ID[inst.region].part].matrix;
    return attachMatrix(resolveAttachment(inst.attachment, parentBuild), t.attach ?? 'normalY');
  }, [inst.parentId, inst.attachment, inst.region, parentBuild, t.attach]);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!innerRef.current || !userRef.current || !mesh) return;
    bridge.nodes.set(id, { id, inner: innerRef.current, user: userRef.current, mesh, build });
    return () => {
      if (bridge.nodes.get(id)?.mesh === mesh) bridge.nodes.delete(id);
    };
  });
  useEffect(() => {
    useEditor.getState().bumpNodes();
    return () => useEditor.getState().bumpNodes();
  }, [id]);

  const p = build.pivot;
  const tr = inst.transform;
  const showHandles = selected && tool === 'morph' && !inst.locked;

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    const s = useEditor.getState();
    if (s.placing || e.delta > 5 || inst.locked) return;
    e.stopPropagation();
    s.select(id);
  };
  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    const s = useEditor.getState();
    if (e.button !== 0 || s.placing || inst.locked) return;
    if (selected && inst.parentId && (tool === 'morph' || tool === 'select')) {
      e.stopPropagation();
      startSlide(id, e.clientX, e.clientY);
    }
  };

  return (
    <group matrix={frame} matrixAutoUpdate={false}>
      <group ref={userRef} position={[p[0] + tr.position[0], p[1] + tr.position[1], p[2] + tr.position[2]]} rotation={tr.rotation} scale={tr.scale}>
        <group ref={innerRef} position={[-p[0], -p[1], -p[2]]}>
          <mesh
            ref={meshRef}
            geometry={build.geometry}
            material={materials}
            castShadow
            receiveShadow
            dispose={null}
            userData={{ instanceId: id }}
            onClick={onClick}
            onPointerDown={onPointerDown}
            onDoubleClick={(e) => {
              if (inst.locked) return;
              e.stopPropagation();
              focusOn(id);
            }}
            onPointerOver={(e) => {
              if (inst.locked || useEditor.getState().dragging) return;
              e.stopPropagation();
              useEditor.getState().hover(id);
            }}
            onPointerOut={() => {
              if (useEditor.getState().hoveredId === id) useEditor.getState().hover(null);
            }}
          />
          {(selected || hovered) && <mesh geometry={build.geometry} material={selected ? selectedOutline : hoverOutline} dispose={null} raycast={() => null} />}
          {showHandles && build.handles.map((h) => <HandleDot key={h.id} id={id} h={h} />)}
          {inst.children.map((c) => (
            <ComponentNode key={c} id={c} parentBuild={build} />
          ))}
        </group>
      </group>
    </group>
  );
}
