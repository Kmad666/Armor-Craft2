import { useMemo, useState } from 'react';
import { MATERIAL_PRESETS } from '../catalog/materials';
import { TEMPLATE_BY_ID } from '../catalog/templates';
import type { ComponentInstance, MaterialSpec, TextureKind, Vec3 } from '../core/types';
import { familyOf, paramDefs } from '../geometry/build';
import type { ParamDef, ParamGroup } from '../geometry/types';
import { LAYER_NAMES, clipWarnings } from '../state/layering';
import { attachmentGap } from '../state/ops';
import { useEditor } from '../state/store';
import { Icon } from './Icon';

const RAD = 180 / Math.PI;

function toDisplay(v: number, unit?: ParamDef['unit']) {
  if (unit === 'cm' || unit === '%') return v * 100;
  if (unit === 'deg') return v * RAD;
  return v;
}
function fromDisplay(v: number, unit?: ParamDef['unit']) {
  if (unit === 'cm' || unit === '%') return v / 100;
  if (unit === 'deg') return v / RAD;
  return v;
}
const unitLabel = (u?: ParamDef['unit']) => (u === 'cm' ? 'cm' : u === 'deg' ? '°' : u === '%' ? '%' : u === 'x' ? '×' : '');
const decimals = (u?: ParamDef['unit']) => (u === 'cm' ? 1 : u === 'deg' || u === '%' || u === 'n' ? 0 : 2);

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: ParamDef['unit'];
  hint?: string;
  testId?: string;
  onChange(v: number, transient: boolean): void;
}

export function Slider({ label, value, min, max, step, unit, hint, onChange, testId }: SliderProps) {
  const s = useEditor.getState;
  const d = decimals(unit);
  const shown = toDisplay(value, unit);
  return (
    <label className="slider" title={hint ?? label}>
      <span className="slider-label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        data-testid={testId}
        onPointerDown={() => s().beginEdit()}
        onPointerUp={() => s().endEdit()}
        onKeyDown={() => s().beginEdit()}
        onKeyUp={() => s().endEdit()}
        onBlur={() => s().endEdit()}
        onChange={(e) => onChange(parseFloat(e.target.value), true)}
      />
      <span className="num">
        <input
          type="number"
          value={Number(shown.toFixed(d))}
          step={toDisplay(step, unit) || 1}
          data-testid={testId ? `${testId}-num` : undefined}
          onFocus={() => s().beginEdit()}
          onBlur={() => s().endEdit()}
          onKeyDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            const n = parseFloat(e.target.value);
            if (isFinite(n)) onChange(Math.min(max, Math.max(min, fromDisplay(n, unit))), true);
          }}
        />
        <em>{unitLabel(unit)}</em>
      </span>
    </label>
  );
}

const GROUP_ORDER: ParamGroup[] = ['Size', 'Trim', 'Shape', 'Detail', 'Fit', 'Deform'];

function ShapeTab({ inst }: { inst: ComponentInstance }) {
  const t = TEMPLATE_BY_ID[inst.templateId];
  const defs = useMemo(() => paramDefs(t), [t]);
  const [closed, setClosed] = useState<Record<string, boolean>>({ Detail: false, Fit: true, Deform: true });
  const s = useEditor.getState;
  return (
    <div className="tab-body">
      {GROUP_ORDER.map((g) => {
        const list = defs.filter((d) => d.group === g);
        if (!list.length) return null;
        return (
          <div className="group" key={g}>
            <button className="group-head" onClick={() => setClosed({ ...closed, [g]: !closed[g] })}>
              <Icon name={closed[g] ? 'chevronRight' : 'chevronDown'} size={12} />
              {g}
              <span className="count">{list.length}</span>
            </button>
            {!closed[g] &&
              list.map((d) => (
                <Slider
                  key={d.key}
                  label={d.label}
                  value={inst.params[d.key] ?? d.def}
                  min={d.min}
                  max={d.max}
                  step={d.step}
                  unit={d.unit}
                  hint={d.hint}
                  testId={`param-${d.key}`}
                  onChange={(v, tr) => s().updateParams(inst.id, { [d.key]: v }, tr)}
                />
              ))}
          </div>
        );
      })}
      <div className="row-buttons">
        <button className="btn" onClick={() => s().resetShape(inst.id)} title="Restore the template's original shape (materials and attachments are kept)">
          <Icon name="reset" size={13} /> Reset shape
        </button>
      </div>
    </div>
  );
}

function Vec3Row({ label, value, unit, step, onChange }: { label: string; value: Vec3; unit: ParamDef['unit']; step: number; onChange(v: Vec3): void }) {
  const s = useEditor.getState;
  const d = unit === 'x' ? 2 : 1;
  return (
    <div className="vec3">
      <span className="slider-label">{label}</span>
      {(['X', 'Y', 'Z'] as const).map((axis, i) => (
        <label key={axis}>
          <em>{axis}</em>
          <input
            type="number"
            step={step}
            value={Number(toDisplay(value[i], unit).toFixed(d))}
            onFocus={() => s().beginEdit()}
            onBlur={() => s().endEdit()}
            onKeyDown={(e) => e.stopPropagation()}
            onChange={(e) => {
              const n = parseFloat(e.target.value);
              if (!isFinite(n)) return;
              const next = [...value] as Vec3;
              next[i] = fromDisplay(n, unit);
              onChange(next);
            }}
          />
        </label>
      ))}
      <span className="unit">{unitLabel(unit)}</span>
    </div>
  );
}

function TransformTab({ inst }: { inst: ComponentInstance }) {
  const s = useEditor.getState;
  const [repeat, setRepeat] = useState(6);
  const fit = useEditor((st) => st.fitOffsets[inst.id]);
  const design = useEditor((st) => st.design);
  const gap = useMemo(() => (inst.parentId ? attachmentGap(design, inst.id) : 0), [design, inst.id, inst.parentId]);
  const uniform = inst.transform.scale;
  return (
    <div className="tab-body">
      <Vec3Row label="Position" unit="cm" step={0.5} value={inst.transform.position} onChange={(v) => s().updateTransform(inst.id, { position: v }, true)} />
      <Vec3Row label="Rotation" unit="deg" step={1} value={inst.transform.rotation} onChange={(v) => s().updateTransform(inst.id, { rotation: v }, true)} />
      <Vec3Row label="Scale" unit="x" step={0.05} value={inst.transform.scale} onChange={(v) => s().updateTransform(inst.id, { scale: v.map((x) => Math.max(0.05, x)) as Vec3 }, true)} />
      <Slider
        label="Overall scale"
        value={(uniform[0] + uniform[1] + uniform[2]) / 3}
        min={0.2}
        max={4}
        step={0.01}
        unit="x"
        testId="uniform-scale"
        onChange={(v, tr) => s().updateTransform(inst.id, { scale: [v, v, v] }, tr)}
      />
      {!inst.parentId && fit !== undefined && (
        <p className="note">
          Fitted {(fit * 1000).toFixed(1)} mm off the body by the layer stack. Use the Move / Rotate / Scale tools (W / E / R) to override the automatic fit.
        </p>
      )}
      {inst.parentId && (
        <>
          <p className="note">
            Attached to <strong>{design.instances[inst.parentId]?.name}</strong>
            {inst.attachment?.kind === 'param' ? ' — rides the surface when the parent is reshaped.' : ' at a fixed point.'} Drag the accessory in the viewport to slide it over the surface.
          </p>
          {gap > 0.045 && <p className="warn">This accessory sits {(gap * 100).toFixed(0)} cm from its parent's surface. If that is not intended, snap it back.</p>}
          <div className="row-buttons">
            <button className="btn" onClick={() => s().setPlacing({ kind: 'move', id: inst.id })}>
              <Icon name="pin" size={13} /> Re-place
            </button>
            <button className="btn" data-testid="snap-surface" onClick={() => s().snapToSurface(inst.id)}>
              Snap to surface
            </button>
          </div>
          <div className="row-buttons">
            <button className="btn" data-testid="repeat-around" title="Copy this accessory evenly around its parent (rivet rows, spike crowns)" onClick={() => s().repeatAround(inst.id, repeat)}>
              <Icon name="duplicate" size={13} /> Repeat around
            </button>
            <span className="num repeat">
              <input type="number" min={2} max={48} value={repeat} data-testid="repeat-count" onKeyDown={(e) => e.stopPropagation()} onChange={(e) => setRepeat(Math.min(48, Math.max(2, parseInt(e.target.value, 10) || 2)))} />
              <em>×</em>
            </span>
          </div>
        </>
      )}
      <div className="row-buttons">
        <button className="btn" onClick={() => s().resetTransform(inst.id)}>
          <Icon name="reset" size={13} /> Reset transform
        </button>
      </div>
    </div>
  );
}

const TEXTURES: TextureKind[] = ['none', 'brushed', 'hammered', 'mail', 'scales', 'weave', 'wool', 'velvet', 'leather', 'quilt'];
const SLOT_LABEL: Record<string, string> = { base: 'Main', trim: 'Trim', detail: 'Detail' };

export function MaterialEditor({ inst }: { inst: ComponentInstance }) {
  const slot = useEditor((s) => (inst.materials[s.materialSlot] ? s.materialSlot : 'base'));
  const s = useEditor.getState;
  const t = TEMPLATE_BY_ID[inst.templateId];
  const slots = familyOf(t).slots.filter((x) => inst.materials[x]);
  const m = inst.materials[slot];
  const set = (patch: Partial<MaterialSpec>, tr = false) => s().setMaterial(inst.id, slot, patch, tr);
  return (
    <div className="tab-body">
      <div className="slot-tabs">
        {slots.map((x) => (
          <button key={x} className={x === slot ? 'on' : ''} data-testid={`slot-${x}`} onClick={() => s().setMaterialSlot(x)}>
            <i style={{ background: inst.materials[x].color }} />
            {SLOT_LABEL[x] ?? x}
          </button>
        ))}
      </div>
      <div className="swatches">
        {MATERIAL_PRESETS.map((p) => (
          <button
            key={p.preset}
            className={`swatch ${p.kind}${m.preset === p.preset ? ' on' : ''}`}
            title={p.name}
            data-testid={`mat-${p.preset}`}
            style={{ background: p.kind === 'metal' || p.kind === 'mail' ? `linear-gradient(135deg, ${p.color}, #ffffff55 45%, ${p.color} 70%)` : p.color }}
            onClick={() => {
              const { name: _n, group: _g, ...spec } = p;
              set(spec);
            }}
          />
        ))}
      </div>
      <div className="mat-name">{MATERIAL_PRESETS.find((p) => p.preset === m.preset)?.name ?? 'Custom'} · customise below</div>
      <label className="slider">
        <span className="slider-label">Base colour</span>
        <input
          type="color"
          value={m.color}
          data-testid="mat-color"
          onFocus={() => s().beginEdit()}
          onBlur={() => s().endEdit()}
          onChange={(e) => set({ color: e.target.value }, true)}
        />
        <span className="num">
          <input
            type="text"
            value={m.color}
            data-testid="mat-color-hex"
            onKeyDown={(e) => e.stopPropagation()}
            onChange={(e) => {
              if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) set({ color: e.target.value });
            }}
          />
        </span>
      </label>
      <Slider label="Metallic" value={m.metalness} min={0} max={1} step={0.01} unit="%" onChange={(v, tr) => set({ metalness: v }, tr)} />
      <Slider label="Roughness" value={m.roughness} min={0.04} max={1} step={0.01} unit="%" onChange={(v, tr) => set({ roughness: v }, tr)} />
      <label className="slider">
        <span className="slider-label">Pattern</span>
        <select value={m.texture} onChange={(e) => set({ texture: e.target.value as TextureKind })}>
          {TEXTURES.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
      </label>
      <Slider label="Texture intensity" value={m.textureIntensity} min={0} max={1} step={0.01} unit="%" onChange={(v, tr) => set({ textureIntensity: v }, tr)} />
      <Slider label="Surface wear" value={m.wear} min={0} max={1} step={0.01} unit="%" onChange={(v, tr) => set({ wear: v }, tr)} />
    </div>
  );
}

function CustomSave({ inst }: { inst: ComponentInstance }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  if (!open)
    return (
      <button
        className="btn wide"
        data-testid="save-custom"
        onClick={() => {
          setName(inst.name);
          setOpen(true);
        }}
        title="Save this component with its attached accessories as a reusable catalogue part"
      >
        <Icon name="star" size={13} /> Save as custom part
      </button>
    );
  const save = () => {
    useEditor.getState().saveCustomPart(inst.id, name);
    setOpen(false);
  };
  return (
    <div className="inline-form">
      <input
        autoFocus
        value={name}
        placeholder="Custom part name"
        data-testid="custom-name"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') setOpen(false);
        }}
      />
      <button className="btn primary" data-testid="custom-save-confirm" onClick={save}>
        Save
      </button>
      <button className="btn" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </div>
  );
}

export function Inspector() {
  const inst = useEditor((s) => (s.selectedId ? s.design.instances[s.selectedId] : null));
  const design = useEditor((s) => s.design);
  const [tab, setTab] = useState<'shape' | 'transform' | 'material'>('shape');
  const s = useEditor.getState;
  const warnings = useMemo(() => (inst ? clipWarnings(design, inst.id) : []), [design, inst]);

  if (!inst) {
    return (
      <div className="inspector" data-testid="inspector">
        <div className="panel-title">
          <Icon name="edit" size={14} /> Inspector
        </div>
        <div className="tab-body">
          <div className="empty">
            <strong>Nothing selected.</strong>
            <span>Click an armour piece to reshape it with the coloured handles, recolour it, or attach decorations to it.</span>
          </div>
          <div className="group">
            <div className="group-head static">Mannequin</div>
            <label className="slider">
              <span className="slider-label">Body colour</span>
              <input type="color" value={design.mannequin.color} onChange={(e) => s().setMannequin({ color: e.target.value })} />
              <span className="num" />
            </label>
            <label className="check">
              <input type="checkbox" checked={design.mannequin.showGrid} onChange={(e) => s().setMannequin({ showGrid: e.target.checked })} /> Floor grid
            </label>
          </div>
        </div>
      </div>
    );
  }
  const t = TEMPLATE_BY_ID[inst.templateId];
  return (
    <div className="inspector" data-testid="inspector">
      <div className="panel-title">
        <Icon name="edit" size={14} /> Inspector
      </div>
      <div className="insp-head">
        <input
          className="name-input"
          value={inst.name}
          data-testid="inst-name"
          onKeyDown={(e) => e.stopPropagation()}
          onFocus={() => s().beginEdit()}
          onBlur={() => s().endEdit()}
          onChange={(e) => s().apply({ ...design, instances: { ...design.instances, [inst.id]: { ...inst, name: e.target.value.slice(0, 80) } } }, false)}
        />
        <div className="meta">
          <span>{t.name}</span>
          {!inst.parentId ? (
            <select value={inst.layer} title="Layer" onChange={(e) => s().setLayer(inst.id, parseInt(e.target.value, 10))}>
              {[1, 2, 3, 4, 5].map((l) => (
                <option key={l} value={l}>
                  L{l} · {LAYER_NAMES[l]}
                </option>
              ))}
            </select>
          ) : (
            <span className="pill">Accessory</span>
          )}
        </div>
        {inst.symmetry.partnerId && (
          <div className="link-row">
            <Icon name="link" size={12} />
            <span>{design.symmetry ? 'Mirrored twin follows edits' : 'Linked twin (symmetry is off)'}</span>
            <button className="btn tiny" data-testid="break-link" onClick={() => s().breakLink(inst.id)} title="Edit this side independently">
              <Icon name="unlink" size={12} /> Break link
            </button>
          </div>
        )}
        {inst.locked && <p className="warn">Locked — unlock it in the scene list to edit.</p>}
        {warnings.map((w, i) => (
          <p className="warn" key={i}>
            {w}
          </p>
        ))}
      </div>
      <div className="tabs">
        {(['shape', 'transform', 'material'] as const).map((x) => (
          <button key={x} className={tab === x ? 'on' : ''} data-testid={`tab-${x}`} onClick={() => setTab(x)}>
            {x === 'shape' ? 'Shape' : x === 'transform' ? 'Transform' : 'Material'}
          </button>
        ))}
      </div>
      {tab === 'shape' && <ShapeTab inst={inst} />}
      {tab === 'transform' && <TransformTab inst={inst} />}
      {tab === 'material' && <MaterialEditor inst={inst} />}
      <div className="insp-foot">
        <CustomSave inst={inst} />
      </div>
    </div>
  );
}
