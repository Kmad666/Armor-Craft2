import { beforeEach, describe, expect, it } from 'vitest';
import { SCHEMA_VERSION } from '../../src/core/types';
import { DesignFormatError, MIGRATIONS, parseDesign, serializeDesign } from '../../src/persistence/schema';
import { DesignStorage, MemoryKV } from '../../src/persistence/storage';
import { PRESETS } from '../../src/presets';
import * as ops from '../../src/state/ops';
import { useEditor } from '../../src/state/store';

const strip = (d: any) => ({ ...d, updatedAt: 0 });

describe('design serialisation', () => {
  it('round-trips every preset exactly (parameters, transforms, materials, hierarchy, links)', () => {
    for (const p of PRESETS) {
      const d = p.build();
      const { design, warnings } = parseDesign(serializeDesign(d));
      expect(warnings).toEqual([]);
      expect(strip(design)).toEqual(strip(d));
    }
  });

  it('stores template references and parameters, never meshes', () => {
    const json = serializeDesign(PRESETS[2].build());
    expect(json).not.toMatch(/"position":\s*\[[^\]]{400,}/);
    expect(json.length).toBeLessThan(200_000);
    expect(JSON.parse(json).schema).toBe(SCHEMA_VERSION);
  });

  it('rejects malformed or foreign files with readable errors', () => {
    expect(() => parseDesign('{ nope')).toThrow(/not valid JSON/);
    expect(() => parseDesign('[]')).toThrow(DesignFormatError);
    expect(() => parseDesign({ app: 'something-else', schema: 1, instances: {} })).toThrow(/not made by Armor Atelier/);
    expect(() => parseDesign({ app: 'armor-atelier', instances: {} })).toThrow(/schema version/);
    expect(() => parseDesign({ app: 'armor-atelier', schema: SCHEMA_VERSION + 1, instances: {} })).toThrow(/newer version/);
    expect(() => parseDesign({ app: 'armor-atelier', schema: SCHEMA_VERSION })).toThrow(/component list/);
  });

  it('skips unknown templates and orphaned accessories with warnings instead of failing', () => {
    const d = PRESETS[0].build();
    const raw = JSON.parse(serializeDesign(d));
    const helm: any = Object.values(raw.instances).find((i: any) => i.templateId === 'helm_roman');
    helm.templateId = 'helm_from_the_future';
    const { design, warnings } = parseDesign(raw);
    expect(design.instances[helm.id]).toBeUndefined();
    // the helmet's faceplate and crest lost their parent
    expect(Object.values(design.instances).some((i) => i.templateId === 'acc_faceplate')).toBe(false);
    expect(warnings.length).toBeGreaterThanOrEqual(2);
    expect(design.roots.length).toBe(d.roots.length - 1);
  });

  it('repairs hostile values: clamps parameters, fills new parameters, fixes dangling links', () => {
    const d = ops.addFitted(ops.emptyDesign(), 'leg_greave').design;
    const raw = JSON.parse(serializeDesign(d));
    const [a, b]: any[] = Object.values(raw.instances);
    a.params.width = 1e9;
    delete a.params.ridge; // as if "ridge" was added by a later version
    a.materials.base.color = 'javascript:alert(1)';
    a.transform.position = ['x', null, 3];
    b.symmetry.partnerId = 'ghost';
    const { design } = parseDesign(raw);
    const ca = design.instances[a.id];
    expect(ca.params.width).toBe(1.8);
    expect(ca.params.ridge).toBe(0.7);
    expect(ca.materials.base.color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(ca.transform.position).toEqual([0, 0, 0]);
    expect(design.instances[b.id].symmetry.partnerId).toBeNull();
    expect(ca.symmetry.partnerId).toBeNull(); // links must be mutual
  });

  it('runs migrations in order for older schema versions', () => {
    const d = ops.addFitted(ops.emptyDesign(), 'helm_great').design;
    const old = { ...JSON.parse(serializeDesign(d)), schema: SCHEMA_VERSION - 1, title: 'Old name' };
    delete (old as any).name;
    expect(() => parseDesign(old)).toThrow(/No migration/);
    MIGRATIONS[SCHEMA_VERSION - 1] = (raw) => ({ ...raw, name: raw.title });
    try {
      expect(parseDesign(old).design.name).toBe('Old name');
    } finally {
      delete MIGRATIONS[SCHEMA_VERSION - 1];
    }
  });
});

describe('storage', () => {
  it('saves, lists, renames, duplicates and deletes designs', () => {
    const s = new DesignStorage(new MemoryKV());
    const d = PRESETS[1].build();
    s.save(d);
    expect(s.list().map((m) => m.name)).toEqual(['Gothic-inspired Knight']);
    expect(strip(s.load(d.id).design)).toEqual(strip(d));
    s.rename(d.id, 'Sir Renamed');
    expect(s.list()[0].name).toBe('Sir Renamed');
    const copy = s.duplicate(d.id, 'd_copy');
    expect(copy.name).toBe('Sir Renamed copy');
    expect(s.list().length).toBe(2);
    s.remove(d.id);
    expect(s.list().map((m) => m.id)).toEqual(['d_copy']);
    expect(() => s.load(d.id)).toThrow(/could not be found/);
  });

  it('keeps an autosave draft and survives corrupt storage', () => {
    const kv = new MemoryKV();
    const s = new DesignStorage(kv);
    expect(s.loadDraft()).toBeNull();
    s.saveDraft(PRESETS[0].build());
    expect(s.loadDraft()!.design.name).toBe('Roman-inspired Guard');
    kv.setItem('armorAtelier.autosave', '{broken');
    kv.setItem('armorAtelier.designs', 'not json');
    kv.setItem('armorAtelier.customParts', '{"a":1}');
    expect(s.loadDraft()).toBeNull();
    expect(s.list()).toEqual([]);
    expect(s.loadCustomParts()).toEqual([]);
  });
});

describe('history (undo / redo)', () => {
  const S = () => useEditor.getState();
  beforeEach(() => S().newDesign());

  it('undoes and redoes structural and parameter edits', () => {
    const helm = S().addFitted('helm_spangen')!;
    S().updateParams(helm, { height: 0.2 });
    const horn = S().autoAttach('acc_horn_curved', helm)!;
    expect(Object.keys(S().design.instances).length).toBe(3);
    S().undo();
    expect(Object.keys(S().design.instances).length).toBe(1);
    S().undo();
    expect(S().design.instances[helm].params.height).toBe(0.128);
    S().undo();
    expect(S().design.roots.length).toBe(0);
    S().undo(); // nothing left: no-op
    S().redo();
    S().redo();
    S().redo();
    expect(S().design.instances[horn].parentId).toBe(helm);
    expect(S().design.instances[helm].params.height).toBe(0.2);
    // a new edit clears the redo stack
    S().undo();
    S().rename(helm, 'Tall helm');
    expect(S().future.length).toBe(0);
  });

  it('groups a whole drag into one history step, and can cancel it', () => {
    const c = S().addFitted('torso_cuirass')!;
    const steps = S().past.length;
    S().beginEdit();
    for (let i = 1; i <= 20; i++) S().updateParams(c, { trimBottom: i * 0.005 }, true);
    S().endEdit();
    expect(S().past.length).toBe(steps + 1);
    expect(S().design.instances[c].params.trimBottom).toBeCloseTo(0.1, 6);
    S().undo();
    expect(S().design.instances[c].params.trimBottom).toBe(0);
    S().beginEdit();
    S().updateParams(c, { width: 1.5 }, true);
    S().cancelEdit();
    expect(S().design.instances[c].params.width).toBe(1);
    expect(S().past.length).toBe(steps);
  });

  it('locked components refuse edits; selection is cleared when its target is undone away', () => {
    const c = S().addFitted('torso_cuirass')!;
    S().setLocked(c, true);
    S().updateParams(c, { width: 1.4 });
    S().setMaterial(c, 'base', { color: '#000000' });
    expect(S().design.instances[c].params.width).toBe(1);
    expect(S().design.instances[c].materials.base.color).not.toBe('#000000');
    S().setLocked(c, false);
    S().select(c);
    S().undo();
    S().undo();
    S().undo();
    expect(S().selectedId).toBeNull();
  });

  it('import refuses bad files without touching the current design', () => {
    const c = S().addFitted('torso_cuirass')!;
    expect(S().importJSON('{"app":"armor-atelier","schema":999,"instances":{}}')).toBe(false);
    expect(S().design.instances[c]).toBeTruthy();
    expect(S().toast?.kind).toBe('error');
    expect(S().importJSON(S().exportJSON())).toBe(true);
  });
});
