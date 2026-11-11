// Editor store: the design (single source of truth), selection, tools, history and persistence.

import { create } from 'zustand';
import { TEMPLATE_BY_ID } from '../catalog/templates';
import { newId } from '../core/math';
import type { Attachment, ComponentInstance, CustomPart, Design, MaterialSpec, Side, ToolId, Transform } from '../core/types';
import { DesignFormatError, parseDesign, serializeDesign } from '../persistence/schema';
import { DesignStorage, type DesignMeta } from '../persistence/storage';
import { computeFitOffsets } from './layering';
import * as ops from './ops';

export type Placing =
  | { kind: 'template'; templateId: string }
  | { kind: 'custom'; partId: string }
  | { kind: 'move'; id: string };

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error' | 'ok';
}

export interface Confirm {
  title: string;
  body: string;
  action: string;
  onYes: () => void;
}

const HISTORY_LIMIT = 120;
export const storage = new DesignStorage();

function stableOffsets(prev: Record<string, number>, design: Design): Record<string, number> {
  const next = computeFitOffsets(design);
  const pk = Object.keys(prev);
  const nk = Object.keys(next);
  if (pk.length === nk.length && nk.every((k) => prev[k] === next[k])) return prev;
  return next;
}

export interface EditorState {
  design: Design;
  fitOffsets: Record<string, number>;
  selectedId: string | null;
  hoveredId: string | null;
  tool: ToolId;
  materialSlot: string;
  placing: Placing | null;
  dragging: boolean;
  past: Design[];
  future: Design[];
  editBase: Design | null;
  dirty: boolean;
  customParts: CustomPart[];
  saved: DesignMeta[];
  toast: Toast | null;
  confirm: Confirm | null;
  dialog: null | 'designs' | 'help';
  tutorialStep: number | null;
  leftOpen: boolean;
  rightOpen: boolean;
  catalogCategory: string;
  catalogEra: string;
  nodeTick: number;

  // core
  apply(next: Design, history?: boolean): void;
  beginEdit(): void;
  endEdit(): void;
  cancelEdit(): void;
  undo(): void;
  redo(): void;
  notify(text: string, kind?: Toast['kind']): void;
  ask(c: Confirm | null): void;

  // selection / tools
  select(id: string | null): void;
  hover(id: string | null): void;
  setTool(t: ToolId): void;
  setPlacing(p: Placing | null): void;
  setDragging(b: boolean): void;
  setMaterialSlot(s: string): void;
  setDialog(d: EditorState['dialog']): void;
  setTutorial(step: number | null): void;
  togglePanel(side: 'left' | 'right'): void;
  setCatalog(category: string, era?: string): void;
  bumpNodes(): void;

  // design edits
  addFitted(templateId: string, side?: Side): string | null;
  addAccessory(templateId: string, parentId: string, att: Attachment): string | null;
  autoAttach(templateId: string, parentId: string): string | null;
  updateParams(id: string, patch: Record<string, number>, transient?: boolean): void;
  updateTransform(id: string, patch: Partial<Transform>, transient?: boolean): void;
  setMaterial(id: string, slot: string, patch: Partial<MaterialSpec>, transient?: boolean): void;
  setAttachment(id: string, att: Attachment, transient?: boolean): void;
  reattach(id: string, parentId: string, att: Attachment): void;
  rename(id: string, name: string): void;
  setVisible(id: string, v: boolean): void;
  setLocked(id: string, v: boolean): void;
  remove(id: string): void;
  duplicate(id: string): void;
  mirror(id: string): void;
  breakLink(id: string): void;
  moveLayer(id: string, dir: 1 | -1): void;
  setLayer(id: string, layer: number): void;
  resetShape(id: string): void;
  resetTransform(id: string): void;
  snapToSurface(id: string): void;
  setSymmetry(on: boolean): void;
  setMannequin(patch: Partial<Design['mannequin']>): void;
  renameDesign(name: string): void;

  // custom parts
  saveCustomPart(id: string, name: string): void;
  deleteCustomPart(partId: string): void;
  placeCustomPart(partId: string, opts?: { parentId?: string; attachment?: Attachment }): string | null;

  // persistence
  newDesign(): void;
  replaceDesign(d: Design, note?: string): void;
  saveDesign(): void;
  loadSaved(id: string): void;
  deleteSaved(id: string): void;
  renameSaved(id: string, name: string): void;
  duplicateSaved(id: string): void;
  exportJSON(): string;
  importJSON(text: string): boolean;
  refreshSaved(): void;
}

let toastId = 0;

export const useEditor = create<EditorState>((set, get) => {
  const run = (fn: (d: Design) => Design, transient = false) => {
    try {
      const next = fn(get().design);
      get().apply(next, !transient);
    } catch (e: any) {
      get().notify(e?.message ?? 'That action failed.', 'error');
    }
  };
  const runAdd = (fn: (d: Design) => ops.AddResult): string | null => {
    try {
      const r = fn(get().design);
      if (!r.ids.length) return null;
      get().apply(r.design);
      set({ selectedId: r.ids[0] });
      return r.ids[0];
    } catch (e: any) {
      get().notify(e?.message ?? 'That action failed.', 'error');
      return null;
    }
  };

  const initial = ops.emptyDesign();
  return {
    design: initial,
    fitOffsets: {},
    selectedId: null,
    hoveredId: null,
    tool: 'morph',
    materialSlot: 'base',
    placing: null,
    dragging: false,
    past: [],
    future: [],
    editBase: null,
    dirty: false,
    customParts: storage.loadCustomParts(),
    saved: storage.list(),
    toast: null,
    confirm: null,
    dialog: null,
    tutorialStep: null,
    leftOpen: true,
    rightOpen: true,
    catalogCategory: 'head',
    catalogEra: 'all',
    nodeTick: 0,

    apply(next, history = true) {
      const s = get();
      if (next === s.design) return;
      const patch: Partial<EditorState> = { design: next, fitOffsets: stableOffsets(s.fitOffsets, next), dirty: true };
      if (history && !s.editBase) {
        patch.past = [...s.past.slice(-HISTORY_LIMIT + 1), s.design];
        patch.future = [];
      }
      if (s.selectedId && !next.instances[s.selectedId]) patch.selectedId = null;
      set(patch);
    },
    beginEdit() {
      if (!get().editBase) set({ editBase: get().design });
    },
    endEdit() {
      const s = get();
      if (!s.editBase) return;
      if (s.editBase !== s.design) set({ past: [...s.past.slice(-HISTORY_LIMIT + 1), s.editBase], future: [], editBase: null });
      else set({ editBase: null });
    },
    cancelEdit() {
      const s = get();
      if (!s.editBase) return;
      set({ design: s.editBase, fitOffsets: stableOffsets(s.fitOffsets, s.editBase), editBase: null });
    },
    undo() {
      const s = get();
      if (s.editBase || !s.past.length) return;
      const prev = s.past[s.past.length - 1];
      set({
        design: prev,
        fitOffsets: stableOffsets(s.fitOffsets, prev),
        past: s.past.slice(0, -1),
        future: [s.design, ...s.future],
        selectedId: s.selectedId && prev.instances[s.selectedId] ? s.selectedId : null,
        placing: null,
        dirty: true,
      });
    },
    redo() {
      const s = get();
      if (s.editBase || !s.future.length) return;
      const next = s.future[0];
      set({
        design: next,
        fitOffsets: stableOffsets(s.fitOffsets, next),
        past: [...s.past, s.design],
        future: s.future.slice(1),
        selectedId: s.selectedId && next.instances[s.selectedId] ? s.selectedId : null,
        placing: null,
        dirty: true,
      });
    },
    notify(text, kind = 'info') {
      const id = ++toastId;
      set({ toast: { id, text, kind } });
      setTimeout(() => {
        if (get().toast?.id === id) set({ toast: null });
      }, kind === 'error' ? 6000 : 3200);
    },
    ask(c) {
      set({ confirm: c });
    },

    select(id) {
      if (id === get().selectedId) return;
      const inst = id ? get().design.instances[id] : null;
      const patch: Partial<EditorState> = { selectedId: inst ? id : null };
      if (inst && !inst.materials[get().materialSlot]) patch.materialSlot = 'base';
      set(patch);
    },
    hover(id) {
      if (id !== get().hoveredId) set({ hoveredId: id });
    },
    setTool(tool) {
      set({ tool });
    },
    setPlacing(placing) {
      set({ placing });
    },
    setDragging(dragging) {
      if (dragging !== get().dragging) set({ dragging });
    },
    setMaterialSlot(materialSlot) {
      set({ materialSlot });
    },
    setDialog(dialog) {
      set({ dialog });
    },
    setTutorial(tutorialStep) {
      if (tutorialStep === null) storage.tutorialDone = true;
      set({ tutorialStep });
    },
    togglePanel(side) {
      if (side === 'left') set({ leftOpen: !get().leftOpen });
      else set({ rightOpen: !get().rightOpen });
    },

    setCatalog(category, era) {
      set({ catalogCategory: category, catalogEra: era ?? get().catalogEra, rightOpen: true });
    },
    bumpNodes() {
      set({ nodeTick: get().nodeTick + 1 });
    },

    addFitted: (templateId, side) => runAdd((d) => ops.addFitted(d, templateId, { side })),
    addAccessory: (templateId, parentId, att) => runAdd((d) => ops.addAccessory(d, templateId, parentId, att)),
    autoAttach: (templateId, parentId) => runAdd((d) => ops.autoAttach(d, templateId, parentId)),
    updateParams: (id, patch, transient) => run((d) => ops.updateParams(d, id, patch), transient),
    updateTransform: (id, patch, transient) => run((d) => ops.updateTransform(d, id, patch), transient),
    setMaterial: (id, slot, patch, transient) => run((d) => ops.setMaterial(d, id, slot, patch), transient),
    setAttachment: (id, att, transient) => run((d) => ops.setAttachment(d, id, att), transient),
    reattach: (id, parentId, att) => run((d) => ops.reattach(d, id, parentId, att)),
    rename: (id, name) => run((d) => ops.patchInstance(d, id, { name: name.trim().slice(0, 80) || d.instances[id].name })),
    setVisible: (id, visible) => run((d) => ops.patchInstance(d, id, { visible })),
    setLocked: (id, locked) => run((d) => ops.patchInstance(d, id, { locked })),
    remove: (id) => run((d) => ops.removeInstance(d, id)),
    duplicate: (id) => {
      runAdd((d) => ops.duplicate(d, id));
    },
    mirror: (id) => {
      try {
        const r = ops.mirrorInstance(get().design, id);
        if (r.message) get().notify(r.message, r.ids.length ? 'ok' : 'info');
        if (r.ids.length) get().apply(r.design);
      } catch (e: any) {
        get().notify(e?.message ?? 'Mirror failed.', 'error');
      }
    },
    breakLink: (id) => run((d) => ops.breakLink(d, id)),
    moveLayer: (id, dir) => run((d) => ops.moveLayer(d, id, dir)),
    setLayer: (id, layer) => run((d) => ops.setLayer(d, id, layer)),
    resetShape: (id) => run((d) => ops.resetShape(d, id)),
    resetTransform: (id) => run((d) => ops.resetTransform(d, id)),
    snapToSurface: (id) => run((d) => ops.snapToSurface(d, id)),
    setSymmetry: (on) => run((d) => ops.setSymmetry(d, on)),
    setMannequin: (patch) => run((d) => ({ ...d, mannequin: { ...d.mannequin, ...patch } })),
    renameDesign: (name) => run((d) => ({ ...d, name: name.trim().slice(0, 80) || d.name })),

    saveCustomPart(id, name) {
      try {
        const part = ops.extractCustomPart(get().design, id, name.trim() || 'Custom part');
        const customParts = [part, ...get().customParts];
        storage.saveCustomParts(customParts);
        set({ customParts });
        get().notify(`Saved "${part.name}" to the Custom category.`, 'ok');
      } catch (e: any) {
        get().notify(e?.message ?? 'Could not save the custom part.', 'error');
      }
    },
    deleteCustomPart(partId) {
      const customParts = get().customParts.filter((p) => p.id !== partId);
      storage.saveCustomParts(customParts);
      set({ customParts });
    },
    placeCustomPart(partId, opts = {}) {
      const part = get().customParts.find((p) => p.id === partId);
      if (!part) return null;
      return runAdd((d) => ops.insertCustomPart(d, part, opts));
    },

    newDesign() {
      const d = ops.emptyDesign();
      set({ design: d, fitOffsets: {}, past: [], future: [], editBase: null, selectedId: null, placing: null, dirty: false });
      storage.clearDraft();
    },
    replaceDesign(d, note) {
      set({ design: d, fitOffsets: computeFitOffsets(d), past: [], future: [], editBase: null, selectedId: null, placing: null, dirty: false });
      if (note) get().notify(note, 'ok');
    },
    saveDesign() {
      try {
        storage.save(get().design);
        set({ saved: storage.list(), dirty: false });
        get().notify(`Saved "${get().design.name}".`, 'ok');
      } catch (e: any) {
        get().notify(`Could not save: ${e?.message ?? 'storage is unavailable'}`, 'error');
      }
    },
    loadSaved(id) {
      try {
        const { design, warnings } = storage.load(id);
        get().replaceDesign(design, `Loaded "${design.name}".`);
        if (warnings.length) get().notify(warnings.join(' '), 'error');
      } catch (e: any) {
        get().notify(e?.message ?? 'Could not load that design.', 'error');
      }
    },
    deleteSaved(id) {
      storage.remove(id);
      set({ saved: storage.list() });
    },
    renameSaved(id, name) {
      try {
        storage.rename(id, name.trim() || 'Untitled design');
        if (get().design.id === id) set({ design: { ...get().design, name: name.trim() || 'Untitled design' } });
        set({ saved: storage.list() });
      } catch (e: any) {
        get().notify(e?.message ?? 'Rename failed.', 'error');
      }
    },
    duplicateSaved(id) {
      try {
        storage.duplicate(id, newId('d'));
        set({ saved: storage.list() });
      } catch (e: any) {
        get().notify(e?.message ?? 'Duplicate failed.', 'error');
      }
    },
    exportJSON() {
      return serializeDesign(get().design);
    },
    importJSON(text) {
      try {
        const { design, warnings } = parseDesign(text);
        // imported designs get a fresh id so they never overwrite a saved design by accident
        get().replaceDesign({ ...design, id: newId('d') }, `Imported "${design.name}".`);
        if (warnings.length) get().notify(warnings.join(' '), 'error');
        set({ dirty: true });
        return true;
      } catch (e: any) {
        get().notify(e instanceof DesignFormatError ? e.message : `Import failed: ${e?.message ?? 'unknown error'}`, 'error');
        return false;
      }
    },
    refreshSaved() {
      set({ saved: storage.list() });
    },
  };
});

/** Is this template something that attaches to another component? */
export function isAccessory(templateId: string): boolean {
  return TEMPLATE_BY_ID[templateId]?.kind === 'accessory';
}

export function instanceOf(id: string | null): ComponentInstance | null {
  return id ? (useEditor.getState().design.instances[id] ?? null) : null;
}
