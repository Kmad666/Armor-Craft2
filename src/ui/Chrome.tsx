// Application chrome: top bar, viewport toolbar, dialogs, toasts and the first-run tutorial.

import { useEffect, useRef, useState } from 'react';
import { TEMPLATE_BY_ID } from '../catalog/templates';
import type { ToolId } from '../core/types';
import { defaultParams } from '../geometry/build';
import { PRESETS } from '../presets';
import { bridge, focusOn, screenshot, setView } from '../scene/bridge';
import { storage, useEditor } from '../state/store';
import { requestDelete } from './Hierarchy';
import { Icon } from './Icon';

function download(name: string, href: string) {
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
const fileSafe = (s: string) => s.replace(/[^a-z0-9-_ ]/gi, '').trim().replace(/\s+/g, '-').toLowerCase() || 'design';

export function exportDesign() {
  const s = useEditor.getState();
  const blob = new Blob([s.exportJSON()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  download(`${fileSafe(s.design.name)}.armor.json`, url);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function takeScreenshot() {
  const url = screenshot();
  if (!url) return useEditor.getState().notify('Could not capture the viewport.', 'error');
  download(`${fileSafe(useEditor.getState().design.name)}.png`, url);
  useEditor.getState().notify('Image captured.', 'ok');
}

/** Replace the working design, asking first when there are unsaved changes. */
function guarded(title: string, go: () => void) {
  const s = useEditor.getState();
  if (s.dirty && s.design.roots.length) s.ask({ title, body: 'Your current design has unsaved changes that will be lost.', action: 'Continue', onYes: go });
  else go();
}

export function TopBar() {
  const name = useEditor((s) => s.design.name);
  const dirty = useEditor((s) => s.dirty);
  const symmetry = useEditor((s) => s.design.symmetry);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const s = useEditor.getState;
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <header className="topbar">
      <div className="brand">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
          <path d="M12 2l8 3v7c0 5-3.500 8.500-8 10-4.500-1.500-8-5-8-10V5z" />
          <path d="M12 2v20M4 9h16" opacity=".55" />
        </svg>
        <span>Armor Atelier</span>
      </div>
      <input className="design-name" value={name} data-testid="design-name" title="Design name" onKeyDown={(e) => e.stopPropagation()} onChange={(e) => s().renameDesign(e.target.value)} />
      {dirty && <span className="dirty" title="Unsaved changes (a recovery draft is kept automatically)">●</span>}
      <div className="bar-group">
        <button className="btn" data-testid="btn-new" title="New design" onClick={() => guarded('Start a new design?', () => s().newDesign())}>
          <Icon name="plus" /> New
        </button>
        <button className="btn" data-testid="btn-save" title="Save design (Ctrl+S)" onClick={() => s().saveDesign()}>
          <Icon name="save" /> Save
        </button>
        <button className="btn" data-testid="btn-designs" title="Saved designs and demonstration presets" onClick={() => s().setDialog('designs')}>
          <Icon name="folder" /> Designs
        </button>
        <button className="btn icon" data-testid="btn-export" title="Export design as JSON" onClick={exportDesign}>
          <Icon name="download" />
        </button>
        <button className="btn icon" data-testid="btn-import" title="Import a design JSON file" onClick={() => fileRef.current?.click()}>
          <Icon name="upload" />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          data-testid="import-file"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            const text = await f.text();
            guarded('Import this design?', () => s().importJSON(text));
          }}
        />
      </div>
      <div className="bar-group">
        <button className="btn icon" data-testid="btn-undo" disabled={!canUndo} title="Undo (Ctrl+Z)" onClick={() => s().undo()}>
          <Icon name="undo" />
        </button>
        <button className="btn icon" data-testid="btn-redo" disabled={!canRedo} title="Redo (Ctrl+Shift+Z)" onClick={() => s().redo()}>
          <Icon name="redo" />
        </button>
      </div>
      <div className="bar-group">
        <button className={`btn toggle${symmetry ? ' on' : ''}`} data-testid="btn-symmetry" title="Symmetry: place and edit left and right sides together" onClick={() => s().setSymmetry(!symmetry)}>
          <Icon name="symmetry" /> Symmetry {symmetry ? 'on' : 'off'}
        </button>
      </div>
      <div className="spacer" />
      <div className="bar-group">
        <button className="btn icon" data-testid="btn-shot" title="Capture image" onClick={takeScreenshot}>
          <Icon name="camera" />
        </button>
        <button className="btn icon" data-testid="btn-help" title="Tutorial and shortcuts" onClick={() => s().setDialog('help')}>
          <Icon name="help" />
        </button>
      </div>
    </header>
  );
}

const TOOLS: { id: ToolId; label: string; key: string; icon: string; tip: string }[] = [
  { id: 'select', label: 'Select', key: 'Q', icon: 'select', tip: 'Select components' },
  { id: 'move', label: 'Move', key: 'W', icon: 'move', tip: 'Move the selected component' },
  { id: 'rotate', label: 'Rotate', key: 'E', icon: 'rotate', tip: 'Rotate the selected component' },
  { id: 'scale', label: 'Scale', key: 'R', icon: 'scale', tip: 'Scale the selected component' },
  { id: 'morph', label: 'Morph', key: 'T', icon: 'morph', tip: 'Reshape and trim with handles' },
];

export function Toolbar() {
  const tool = useEditor((s) => s.tool);
  const sel = useEditor((s) => (s.selectedId ? s.design.instances[s.selectedId] : null));
  const s = useEditor.getState;
  return (
    <div className="toolbar" data-testid="toolbar">
      {TOOLS.map((t) => (
        <button key={t.id} className={tool === t.id ? 'on' : ''} data-testid={`tool-${t.id}`} title={`${t.tip} (${t.key})`} onClick={() => s().setTool(t.id)}>
          <Icon name={t.icon} />
          <span>{t.label}</span>
        </button>
      ))}
      <i className="sep" />
      <button disabled={!sel} title="Duplicate (Ctrl+D)" data-testid="act-duplicate" onClick={() => sel && s().duplicate(sel.id)}>
        <Icon name="duplicate" />
      </button>
      <button disabled={!sel} title="Mirror to the opposite side (M)" data-testid="act-mirror" onClick={() => sel && s().mirror(sel.id)}>
        <Icon name="mirror" />
      </button>
      <button disabled={!sel} title="Focus camera on selection (F)" data-testid="act-focus" onClick={() => sel && focusOn(sel.id)}>
        <Icon name="focus" />
      </button>
      <button disabled={!sel} title="Delete (Del)" data-testid="act-delete" onClick={() => sel && requestDelete(sel.id)}>
        <Icon name="trash" />
      </button>
    </div>
  );
}

export function ViewButtons() {
  const views: [string, string][] = [
    ['quarter', '¾'],
    ['front', 'Front'],
    ['back', 'Rear'],
    ['left', 'Left'],
    ['right', 'Right'],
  ];
  return (
    <div className="views" data-testid="views">
      {views.map(([id, label]) => (
        <button key={id} data-testid={`view-${id}`} title={`${id === 'quarter' ? 'Three-quarter' : label} view`} onClick={() => setView(id)}>
          {label}
        </button>
      ))}
      <button title="Reset camera (Home)" data-testid="view-reset" onClick={() => setView('quarter')}>
        <Icon name="reset" size={13} />
      </button>
    </div>
  );
}

export function StatusBar() {
  const placing = useEditor((s) => s.placing);
  const sel = useEditor((s) => (s.selectedId ? s.design.instances[s.selectedId] : null));
  const tool = useEditor((s) => s.tool);
  const empty = useEditor((s) => s.design.roots.length === 0);
  const s = useEditor.getState;
  if (placing) {
    const what = placing.kind === 'template' ? TEMPLATE_BY_ID[placing.templateId]?.name : placing.kind === 'custom' ? 'custom part' : 'accessory';
    return (
      <div className="status placing" data-testid="status">
        <strong>Placing {what}</strong> — move over the armour and click to attach. <span className="ok">Green</span> = valid, <span className="bad">red</span> = nothing to attach to.
        {sel && placing.kind === 'template' && (
          <button
            className="btn tiny"
            data-testid="auto-place"
            onClick={() => {
              s().autoAttach(placing.templateId, sel.id);
              s().setPlacing(null);
            }}
          >
            Auto-place on {sel.name}
          </button>
        )}
        <button className="btn tiny" onClick={() => s().setPlacing(null)}>
          Cancel (Esc)
        </button>
      </div>
    );
  }
  let text = 'Drag to orbit · right-drag to pan · scroll to zoom · click a body part to browse what fits there.';
  if (!empty && !sel) text = 'Click a component to select it. Double-click to focus the camera on it.';
  if (sel) {
    if (sel.locked) text = `${sel.name} is locked.`;
    else if (tool === 'morph') text = `Drag the coloured handles to reshape ${sel.name}: amber = trim edges, blue = size, green = profile.${sel.parentId ? ' Drag the accessory itself to slide it over the surface.' : ''}`;
    else if (tool === 'select') text = `${sel.name} selected. Press T for shape handles, W / E / R to move, rotate or scale.`;
    else text = `Drag the gizmo to ${tool} ${sel.name}. Press T to return to shape handles.`;
  }
  return (
    <div className="status" data-testid="status">
      {text}
    </div>
  );
}

export function Toasts() {
  const toast = useEditor((s) => s.toast);
  if (!toast) return null;
  return (
    <div className={`toast ${toast.kind}`} data-testid="toast" role="status">
      {toast.text}
    </div>
  );
}

export function ConfirmDialog() {
  const c = useEditor((s) => s.confirm);
  if (!c) return null;
  const close = () => useEditor.getState().ask(null);
  return (
    <div className="modal-back" onClick={close}>
      <div className="modal small" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h3>{c.title}</h3>
        <p>{c.body}</p>
        <div className="modal-actions">
          <button className="btn" data-testid="confirm-no" onClick={close}>
            Cancel
          </button>
          <button
            className="btn primary"
            data-testid="confirm-yes"
            autoFocus
            onClick={() => {
              close();
              c.onYes();
            }}
          >
            {c.action}
          </button>
        </div>
      </div>
    </div>
  );
}

function SavedRow({ id, name, updatedAt, count, current }: { id: string; name: string; updatedAt: number; count: number; current: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const s = useEditor.getState;
  return (
    <div className={`saved-row${current ? ' current' : ''}`} data-testid={`saved-${id}`}>
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') {
              s().renameSaved(id, draft);
              setEditing(false);
            }
            if (e.key === 'Escape') setEditing(false);
          }}
          onBlur={() => {
            s().renameSaved(id, draft);
            setEditing(false);
          }}
        />
      ) : (
        <div className="saved-name">
          <strong>{name}</strong>
          <span>
            {count} component{count === 1 ? '' : 's'} · {new Date(updatedAt).toLocaleString()}
          </span>
        </div>
      )}
      <button className="btn primary" data-testid={`load-${id}`} onClick={() => guarded(`Load "${name}"?`, () => { s().loadSaved(id); s().setDialog(null); })}>
        Load
      </button>
      <button className="btn icon" title="Rename" onClick={() => { setDraft(name); setEditing(true); }}>
        <Icon name="edit" size={14} />
      </button>
      <button className="btn icon" title="Duplicate" data-testid={`dup-${id}`} onClick={() => s().duplicateSaved(id)}>
        <Icon name="duplicate" size={14} />
      </button>
      <button className="btn icon" title="Delete" onClick={() => s().ask({ title: `Delete "${name}"?`, body: 'This saved design will be permanently removed from this browser.', action: 'Delete', onYes: () => useEditor.getState().deleteSaved(id) })}>
        <Icon name="trash" size={14} />
      </button>
    </div>
  );
}

export function DesignsDialog() {
  const open = useEditor((s) => s.dialog === 'designs');
  const saved = useEditor((s) => s.saved);
  const currentId = useEditor((s) => s.design.id);
  if (!open) return null;
  const s = useEditor.getState;
  const close = () => s().setDialog(null);
  return (
    <div className="modal-back" onClick={close}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" data-testid="designs-dialog">
        <div className="modal-head">
          <h3>Designs</h3>
          <button className="btn icon" onClick={close} title="Close">
            <Icon name="close" />
          </button>
        </div>
        <h4>Demonstration designs</h4>
        <div className="preset-grid">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              className="preset"
              data-testid={`preset-${p.id}`}
              onClick={() =>
                guarded(`Open "${p.name}"?`, () => {
                  try {
                    s().replaceDesign(p.build(), `Opened "${p.name}" — every piece is editable.`);
                    setView('quarter');
                  } catch (e: any) {
                    s().notify(`Could not build the preset: ${e?.message}`, 'error');
                  }
                  close();
                })
              }
            >
              <strong>{p.name}</strong>
              <span>{p.desc}</span>
            </button>
          ))}
        </div>
        <h4>Saved in this browser</h4>
        {!saved.length && <div className="empty"><strong>No saved designs yet.</strong><span>Use Save in the top bar. Designs are stored locally in this browser; use Export to keep a JSON copy.</span></div>}
        <div className="saved-list">
          {saved.map((m) => (
            <SavedRow key={m.id} {...m} current={m.id === currentId} />
          ))}
        </div>
      </div>
    </div>
  );
}

const SHORTCUTS: [string, string][] = [
  ['Q / W / E / R / T', 'Select · Move · Rotate · Scale · Morph'],
  ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / Redo'],
  ['Ctrl+S', 'Save design'],
  ['Ctrl+D', 'Duplicate selection'],
  ['M', 'Mirror selection'],
  ['F', 'Focus camera on selection'],
  ['H', 'Hide / show selection'],
  ['Delete', 'Delete selection'],
  ['Enter', 'Auto-place the accessory being placed'],
  ['Esc', 'Cancel placement or drag · deselect'],
  ['Home', 'Reset camera'],
];

export function HelpDialog() {
  const open = useEditor((s) => s.dialog === 'help');
  if (!open) return null;
  const s = useEditor.getState;
  const close = () => s().setDialog(null);
  return (
    <div className="modal-back" onClick={close}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h3>How Armor Atelier works</h3>
          <button className="btn icon" onClick={close} title="Close">
            <Icon name="close" />
          </button>
        </div>
        <ol className="how">
          <li><strong>Equip</strong> — click a part in the catalogue (or drag it onto the mannequin). It fits itself to the body.</li>
          <li><strong>Reshape</strong> — select it and drag the coloured handles. Amber handles trim edges, blue ones resize, green ones change the profile.</li>
          <li><strong>Layer</strong> — cloth, mail and plate stack as separate objects. Shorten or hide an upper layer to reveal what is underneath.</li>
          <li><strong>Decorate</strong> — pick an accessory, then click any armour surface. Accessories stay attached and can be slid, mirrored and reshaped.</li>
          <li><strong>Recolour</strong> — every component has its own main / trim materials in the Inspector's Material tab.</li>
          <li><strong>Keep</strong> — save designs, export JSON, or save a decorated piece as a reusable custom part.</li>
        </ol>
        <h4>Shortcuts</h4>
        <table className="keys">
          <tbody>
            {SHORTCUTS.map(([k, v]) => (
              <tr key={k}>
                <td><kbd>{k}</kbd></td>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="modal-actions">
          <button className="btn primary" data-testid="start-tutorial" onClick={() => { close(); s().setTutorial(0); }}>
            Start the guided tutorial
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- tutorial

interface Step {
  title: string;
  text: string;
  done(base: { cam: string }): boolean;
}

const camKey = () => (bridge.camera ? bridge.camera.position.toArray().map((n) => n.toFixed(2)).join(',') : '');

const STEPS: Step[] = [
  { title: 'Look around', text: 'Drag on the workspace to orbit the mannequin. Scroll to zoom, right-drag to pan.', done: (b) => camKey() !== b.cam && !bridge.cameraAnim },
  { title: 'Open the catalogue', text: 'The catalogue on the right holds every part. Choose the Head category.', done: () => { const s = useEditor.getState(); return s.rightOpen && s.catalogCategory === 'head'; } },
  { title: 'Add a helmet', text: 'Click any helmet to equip it. It fits itself to the head.', done: () => Object.values(useEditor.getState().design.instances).some((i) => TEMPLATE_BY_ID[i.templateId]?.family === 'dome') },
  { title: 'Select it', text: 'Click the helmet in the workspace (or in the scene list on the left).', done: () => { const s = useEditor.getState(); const i = s.selectedId ? s.design.instances[s.selectedId] : null; return !!i && TEMPLATE_BY_ID[i.templateId]?.family === 'dome'; } },
  {
    title: 'Reshape it',
    text: 'Drag a coloured handle — try the blue one on top to stretch the crown, or an amber one to trim an edge.',
    done: () => Object.values(useEditor.getState().design.instances).some((i) => { const t = TEMPLATE_BY_ID[i.templateId]; if (t?.family !== 'dome') return false; const d = defaultParams(t); return Object.keys(d).some((k) => Math.abs((i.params[k] ?? 0) - d[k]) > 1e-4) || i.transform.scale.some((x) => x !== 1); }),
  },
  { title: 'Attach an accessory', text: 'Open Accessories, pick a horn or crest, then click the helmet where you want it.', done: () => Object.values(useEditor.getState().design.instances).some((i) => !!i.parentId) },
  { title: 'Change a material', text: 'With a piece selected, open the Material tab in the Inspector and choose a different material or colour.', done: () => Object.values(useEditor.getState().design.instances).some((i) => { const t = TEMPLATE_BY_ID[i.templateId]; return !!t && Object.entries(i.materials).some(([slot, m]) => m.preset !== t.materials[slot] || m.color.toLowerCase() !== (MATERIAL_COLOR[t.materials[slot]] ?? '').toLowerCase()); }) },
  { title: 'Save your design', text: 'Press Save in the top bar (or Ctrl+S). You can reopen it any time from Designs.', done: () => { const s = useEditor.getState(); return s.saved.some((m) => m.id === s.design.id); } },
];

import { MATERIAL_BY_ID } from '../catalog/materials';
const MATERIAL_COLOR: Record<string, string> = Object.fromEntries(Object.values(MATERIAL_BY_ID).map((m) => [m.preset, m.color]));

export function Tutorial() {
  const step = useEditor((s) => s.tutorialStep);
  const base = useRef({ cam: '' });
  useEffect(() => {
    if (step === null) return;
    base.current = { cam: camKey() };
    const t = window.setInterval(() => {
      const cur = useEditor.getState().tutorialStep;
      if (cur === null || cur >= STEPS.length) return;
      if (!base.current.cam) base.current.cam = camKey();
      if (STEPS[cur].done(base.current)) useEditor.getState().setTutorial(cur + 1 >= STEPS.length ? STEPS.length : cur + 1);
    }, 400);
    return () => window.clearInterval(t);
  }, [step]);
  if (step === null) return null;
  const s = useEditor.getState;
  if (step >= STEPS.length) {
    return (
      <div className="tutorial" data-testid="tutorial">
        <div className="tut-title">You're an armourer now.</div>
        <p>That is the whole loop: equip, reshape, layer, decorate, recolour, save. Open Designs to explore three finished examples.</p>
        <div className="tut-actions">
          <button className="btn primary" data-testid="tutorial-done" onClick={() => s().setTutorial(null)}>
            Finish
          </button>
        </div>
      </div>
    );
  }
  const st = STEPS[step];
  return (
    <div className="tutorial" data-testid="tutorial">
      <div className="tut-progress">
        {STEPS.map((_, i) => (
          <i key={i} className={i < step ? 'done' : i === step ? 'cur' : ''} />
        ))}
      </div>
      <div className="tut-title">
        {step + 1}. {st.title}
      </div>
      <p>{st.text}</p>
      <div className="tut-actions">
        <button className="btn" data-testid="tutorial-skip" onClick={() => s().setTutorial(null)}>
          Dismiss
        </button>
        <button className="btn" data-testid="tutorial-next" onClick={() => s().setTutorial(step + 1)}>
          Skip step
        </button>
      </div>
    </div>
  );
}

export function tutorialShouldStart() {
  return !storage.tutorialDone;
}
