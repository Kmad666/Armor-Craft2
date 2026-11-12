import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { TEMPLATE_BY_ID } from '../../src/catalog/templates';
import { buildComponent, clampParams, defaultParams } from '../../src/geometry/build';
import { computeFit, stackOf } from '../../src/state/layering';
import * as ops from '../../src/state/ops';
import { PRESETS } from '../../src/presets';

const box = (id: string, params: Record<string, number>, fit = 0.002) => buildComponent(id, { ...defaultParams(TEMPLATE_BY_ID[id]), ...params }, fit).geometry.boundingBox!;

describe('shape parameters', () => {
  it('clamps values to the template range and rounds counts', () => {
    const t = TEMPLATE_BY_ID.torso_cuirass;
    expect(clampParams(t, { width: 99 }).width).toBe(1.8);
    expect(clampParams(t, { width: -5 }).width).toBe(0.7);
    expect(clampParams(t, { lames: 3.6 }).lames).toBe(4);
    expect(clampParams(t, { nonsense: 1 } as any)).toEqual({});
    expect(clampParams(t, { width: NaN })).toEqual({});
  });

  it('trimming the cuirass raises its lower edge, keeps the top, and is fully reversible', () => {
    const base = box('torso_cuirass', {});
    const trimmed = box('torso_cuirass', { trimBottom: 0.15 });
    expect(trimmed.min.y - base.min.y).toBeGreaterThan(0.13);
    expect(Math.abs(trimmed.max.y - base.max.y)).toBeLessThan(1e-3);
    const again = box('torso_cuirass', { trimBottom: 0 });
    expect(again.min.y).toBeCloseTo(base.min.y, 6);
    // geometry is regenerated, not scaled: vertex count changes with the span
    const a = buildComponent('torso_cuirass', { ...defaultParams(TEMPLATE_BY_ID.torso_cuirass), trimBottom: 0.2 }, 0.002).geometry;
    const b = buildComponent('torso_cuirass', defaultParams(TEMPLATE_BY_ID.torso_cuirass), 0.002).geometry;
    expect(a.getAttribute('position').count).toBeLessThan(b.getAttribute('position').count);
  });

  it('front hem reshapes only the front of the lower edge', () => {
    const t = TEMPLATE_BY_ID.torso_cuirass;
    const r0 = buildComponent(t.id, defaultParams(t), 0.002);
    const r1 = buildComponent(t.id, { ...defaultParams(t), frontDip: 0.1 }, 0.002);
    const front0 = r0.builder.evalSurface(0, 0, 0)!.position.y;
    const front1 = r1.builder.evalSurface(0, 0, 0)!.position.y;
    const back0 = r0.builder.evalSurface(0, Math.PI, 0)!.position.y;
    const back1 = r1.builder.evalSurface(0, Math.PI, 0)!.position.y;
    expect(front1 - front0).toBeCloseTo(0.1, 3);
    expect(back1 - back0).toBeCloseTo(0, 4);
  });

  it('width / depth / flare / taper deform locally rather than scaling the whole object', () => {
    const base = box('torso_cuirass', {});
    const wide = box('torso_cuirass', { width: 1.3 });
    expect(wide.max.x).toBeGreaterThan(base.max.x * 1.2);
    expect(wide.max.y).toBeCloseTo(base.max.y, 5);
    expect(wide.max.z).toBeCloseTo(base.max.z, 3);
    const flared = buildComponent('torso_cuirass', { ...defaultParams(TEMPLATE_BY_ID.torso_cuirass), flare: 1 }, 0.002);
    const plain = buildComponent('torso_cuirass', defaultParams(TEMPLATE_BY_ID.torso_cuirass), 0.002);
    const lowF = flared.builder.evalSurface(0, Math.PI / 2, 0)!.position.x;
    const lowP = plain.builder.evalSurface(0, Math.PI / 2, 0)!.position.x;
    const topF = flared.builder.evalSurface(0, Math.PI / 2, 1)!.position.x;
    const topP = plain.builder.evalSurface(0, Math.PI / 2, 1)!.position.x;
    expect(lowF - lowP).toBeGreaterThan(0.05);
    expect(Math.abs(topF - topP)).toBeLessThan(1e-4);
  });

  it('helmet crown height stretches the dome without moving the brow line', () => {
    const base = box('helm_spangen', {});
    const tall = box('helm_spangen', { height: 0.2 });
    expect(tall.max.y - base.max.y).toBeGreaterThan(0.06);
    expect(tall.min.y).toBeCloseTo(base.min.y, 3);
  });

  it('mirrored builds are exact x-reflections with outward-facing normals', () => {
    for (const id of ['pauldron_gothic', 'arm_vambrace_taper', 'hand_gauntlet', 'foot_sabaton', 'acc_horn_curved']) {
      const t = TEMPLATE_BY_ID[id];
      const l = buildComponent(id, defaultParams(t), 0.002, false).geometry;
      const r = buildComponent(id, defaultParams(t), 0.002, true).geometry;
      const pl = l.getAttribute('position');
      const pr = r.getAttribute('position');
      const nl = l.getAttribute('normal');
      const nr = r.getAttribute('normal');
      expect(pr.count).toBe(pl.count);
      for (let i = 0; i < pl.count; i += 37) {
        expect(pr.getX(i)).toBeCloseTo(-pl.getX(i), 6);
        expect(pr.getY(i)).toBeCloseTo(pl.getY(i), 6);
        // normals are mirrored too (not inverted, which is what a negative scale would give)
        expect(nr.getX(i)).toBeCloseTo(-nl.getX(i), 4);
        expect(nr.getY(i)).toBeCloseTo(nl.getY(i), 4);
        expect(nr.getZ(i)).toBeCloseTo(nl.getZ(i), 4);
      }
    }
  });

  it('shell normals point away from the body', () => {
    const g = buildComponent('arm_vambrace', defaultParams(TEMPLATE_BY_ID.arm_vambrace), 0.002).geometry;
    const pos = g.getAttribute('position');
    const nrm = g.getAttribute('normal');
    const surf = g.getAttribute('surf');
    let out = 0;
    let total = 0;
    for (let i = 0; i < pos.count; i++) {
      if (surf.getX(i) !== 0) continue; // outer wall only
      total++;
      if (pos.getX(i) * nrm.getX(i) + pos.getZ(i) * nrm.getZ(i) > 0) out++;
    }
    expect(out / total).toBeGreaterThan(0.97);
  });
});

describe('layering', () => {
  it('orders cloth < mail < plate and spaces them with real offsets', () => {
    let d = ops.emptyDesign();
    const cuirass = (d = ops.addFitted(d, 'torso_cuirass').design).roots[0];
    const mail = (d = ops.addFitted(d, 'torso_mail').design).roots[1];
    const tunic = (d = ops.addFitted(d, 'torso_tunic').design).roots[2];
    const fit = computeFit(d);
    // insertion order does not matter: layer categories decide
    expect(fit.offsets[tunic]).toBeLessThan(fit.offsets[mail]);
    expect(fit.offsets[mail]).toBeLessThan(fit.offsets[cuirass]);
    expect(stackOf(d, mail).map((i) => i.id)).toEqual([tunic, mail, cuirass]);
    // removing the lower layers lets the cuirass settle back toward the body
    const d2 = ops.removeInstance(ops.removeInstance(d, mail), tunic);
    expect(computeFit(d2).offsets[cuirass]).toBeLessThan(fit.offsets[cuirass]);
  });

  it('soft layers are squeezed where an upper layer covers them, and released when it is hidden', () => {
    let d = ops.emptyDesign();
    const tunic = (d = ops.addFitted(d, 'torso_tunic').design).roots[0];
    const cuirass = (d = ops.addFitted(d, 'torso_cuirass').design).roots[1];
    const fit = computeFit(d);
    expect(fit.squeeze[tunic]?.some((q) => q.part === 'torso')).toBe(true);
    expect(fit.squeeze[cuirass]).toBeUndefined();
    const hidden = computeFit(ops.patchInstance(d, cuirass, { visible: false }));
    expect(hidden.squeeze[tunic]).toBeUndefined();
    // the squeezed tunic stays inside the cuirass around the waist
    const tb = ops.buildOf(d, d.instances[tunic], fit).builder.evalSurface(0, Math.PI / 2, 0.55)!.position;
    const cb = ops.buildOf(d, d.instances[cuirass], fit);
    const cy = (tb.y - cb.geometry.boundingBox!.min.y) / (cb.geometry.boundingBox!.max.y - cb.geometry.boundingBox!.min.y);
    expect(cy).toBeGreaterThan(0.05);
    const cx = cb.builder.evalSurface(0, Math.PI / 2, Math.min(0.95, cy))!.position.x;
    expect(tb.x).toBeLessThan(cx);
  });

  it('moveLayer swaps a component with its neighbour in the stack', () => {
    let d = ops.emptyDesign();
    const a = (d = ops.addFitted(d, 'torso_cuirass').design).roots[0];
    const b = (d = ops.addFitted(d, 'torso_tabard_long').design).roots[1];
    expect(stackOf(d, a).map((i) => i.id)).toEqual([a, b]);
    d = ops.moveLayer(d, a, 1);
    expect(stackOf(d, a).map((i) => i.id)).toEqual([b, a]);
    expect(computeFit(d).offsets[a]).toBeGreaterThan(computeFit(d).offsets[b]);
    d = ops.moveLayer(d, a, -1);
    expect(stackOf(d, a).map((i) => i.id)).toEqual([a, b]);
    expect(ops.moveLayer(d, a, -1)).toBe(d); // already at the bottom
  });

  it('sided pieces only stack with pieces on the same side', () => {
    let d = ops.emptyDesign();
    d = ops.addFitted(d, 'arm_mail_sleeve', { symmetric: true }).design;
    d = ops.addFitted(d, 'arm_vambrace', { side: 'L', symmetric: false }).design;
    const fit = computeFit(d);
    const sleeveL = d.roots.find((id) => d.instances[id].region === 'upperArmL')!;
    const vamb = d.roots.find((id) => d.instances[id].templateId === 'arm_vambrace')!;
    expect(fit.offsets[vamb]).toBeGreaterThan(fit.offsets[sleeveL]);
    expect(d.roots.filter((id) => d.instances[id].templateId === 'arm_vambrace').length).toBe(1);
  });
});

describe('symmetry and mirroring', () => {
  it('adds both sides when symmetry is on, linked as partners', () => {
    const r = ops.addFitted(ops.emptyDesign(), 'leg_greave');
    expect(r.ids.length).toBe(2);
    const [l, rr] = r.ids.map((id) => r.design.instances[id]);
    expect(l.region).toBe('shinL');
    expect(rr.region).toBe('shinR');
    expect(l.symmetry).toEqual({ partnerId: rr.id, mirrored: false });
    expect(rr.symmetry).toEqual({ partnerId: l.id, mirrored: true });
  });

  it('propagates params, materials and mirrored transforms while linked', () => {
    let { design: d, ids } = ops.addFitted(ops.emptyDesign(), 'leg_greave');
    d = ops.updateParams(d, ids[0], { width: 1.25 });
    d = ops.setMaterial(d, ids[0], 'base', { color: '#112233' });
    d = ops.updateTransform(d, ids[0], { position: [0.02, 0.01, 0.03], rotation: [0.1, 0.2, 0.3] });
    const r = d.instances[ids[1]];
    expect(r.params.width).toBe(1.25);
    expect(r.materials.base.color).toBe('#112233');
    expect(r.transform.position).toEqual([-0.02, 0.01, 0.03]);
    expect(r.transform.rotation).toEqual([0.1, -0.2, -0.3]);
  });

  it('does not propagate when symmetry is disabled or the link is broken', () => {
    let { design: d, ids } = ops.addFitted(ops.emptyDesign(), 'leg_greave');
    const off = ops.updateParams(ops.setSymmetry(d, false), ids[0], { width: 1.3 });
    expect(off.instances[ids[1]].params.width).toBe(1);
    d = ops.breakLink(d, ids[0]);
    expect(d.instances[ids[1]].symmetry.partnerId).toBeNull();
    d = ops.updateParams(d, ids[0], { width: 1.4 });
    expect(d.instances[ids[1]].params.width).toBe(1);
  });

  it('with symmetry off only the requested side is placed; mirror creates and then updates the twin', () => {
    let d = ops.setSymmetry(ops.emptyDesign(), false);
    const add = ops.addFitted(d, 'pauldron_round', { side: 'R' });
    expect(add.ids.length).toBe(1);
    d = ops.updateParams(add.design, add.ids[0], { size: 1.3 }, false);
    const m = ops.mirrorInstance(d, add.ids[0]);
    expect(m.ids.length).toBe(1);
    const twin = m.design.instances[m.ids[0]];
    expect(twin.region).toBe('shoulderL');
    expect(twin.symmetry.mirrored).toBe(false);
    expect(twin.params.size).toBe(1.3);
    // mirroring again updates rather than duplicating
    const d2 = ops.updateParams(m.design, add.ids[0], { size: 1.1 }, false);
    const m2 = ops.mirrorInstance(d2, add.ids[0]);
    expect(Object.keys(m2.design.instances).length).toBe(2);
    expect(m2.design.instances[m.ids[0]].params.size).toBe(1.1);
    // centre pieces have no opposite side
    const c = ops.addFitted(d, 'helm_great');
    expect(ops.mirrorInstance(c.design, c.ids[0]).ids.length).toBe(0);
  });

  it('mirrors accessories across a centre piece as true reflections', () => {
    let { design: d, ids } = ops.addFitted(ops.emptyDesign(), 'helm_spangen');
    const helm = ids[0];
    const r = ops.autoAttach(d, 'acc_horn_curved', helm);
    expect(r.ids.length).toBe(2);
    d = r.design;
    const [a, b] = r.ids.map((id) => d.instances[id]);
    expect(a.symmetry.mirrored).not.toBe(b.symmetry.mirrored);
    expect(b.attachment!.u).toBeCloseTo(-a.attachment!.u, 6);
    const build = ops.buildOf(d, d.instances[helm]);
    const ra = ops.resolveAttachment(a.attachment!, build);
    const rb = ops.resolveAttachment(b.attachment!, build);
    expect(rb.position.x).toBeCloseTo(-ra.position.x, 5);
    expect(rb.position.y).toBeCloseTo(ra.position.y, 5);
    // world-space tips of the two horns mirror each other
    const tip = (inst: typeof a, res: typeof ra) => {
      const g = buildComponent(inst.templateId, inst.params, 0, inst.symmetry.mirrored);
      const h = g.handles.find((x) => x.id === 'length')!;
      return new Vector3(...h.position).applyMatrix4(ops.attachMatrix(res, 'normalY'));
    };
    const ta = tip(a, ra);
    const tb = tip(b, rb);
    expect(tb.x).toBeCloseTo(-ta.x, 4);
    expect(tb.y).toBeCloseTo(ta.y, 4);
    expect(tb.z).toBeCloseTo(ta.z, 4);
  });
});

describe('attachments', () => {
  it('parametric attachments ride the parent surface when it is reshaped', () => {
    let { design: d, ids } = ops.addFitted(ops.emptyDesign(), 'helm_spangen');
    const r = ops.autoAttach(d, 'acc_horn_curved', ids[0], { symmetric: false });
    d = r.design;
    const att = d.instances[r.ids[0]].attachment!;
    expect(att.kind).toBe('param');
    const before = ops.resolveAttachment(att, ops.buildOf(d, d.instances[ids[0]])).position.clone();
    d = ops.updateParams(d, ids[0], { height: 0.22, width: 1.2 });
    const after = ops.resolveAttachment(d.instances[r.ids[0]].attachment!, ops.buildOf(d, d.instances[ids[0]])).position;
    expect(after.y).toBeGreaterThan(before.y + 0.02);
    expect(after.x).toBeGreaterThan(before.x + 0.005);
    expect(ops.attachmentGap(d, r.ids[0])).toBeLessThan(0.02); // still seated on the surface
  });

  it('attach frames are right-handed and aligned to the surface normal', () => {
    for (const n of [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, -1), new Vector3(0.3, 0.8, 0.5).normalize()]) {
      for (const mode of ['normalY', 'normalZ'] as const) {
        const m = ops.attachMatrix({ position: new Vector3(1, 2, 3), normal: n }, mode);
        expect(m.determinant()).toBeCloseTo(1, 6);
        const axis = new Vector3().setFromMatrixColumn(m, mode === 'normalY' ? 1 : 2);
        expect(axis.dot(n)).toBeCloseTo(1, 6);
        expect(new Vector3().setFromMatrixPosition(m).toArray()).toEqual([1, 2, 3]);
      }
    }
  });

  it('works on any parent family, not just helmets', () => {
    let d = ops.emptyDesign();
    for (const host of ['pauldron_round', 'torso_cuirass', 'hand_gauntlet', 'arm_vambrace', 'leg_greave', 'foot_sabaton', 'knee_round']) {
      const a = ops.addFitted(d, host, { symmetric: false });
      const r = ops.autoAttach(a.design, 'acc_spike', a.ids[0], { symmetric: false });
      d = r.design;
      const inst = d.instances[r.ids[0]];
      expect(inst.parentId).toBe(a.ids[0]);
      expect(d.instances[a.ids[0]].children).toContain(inst.id);
      expect(ops.attachmentGap(d, inst.id)).toBeLessThan(0.03);
    }
    // accessories can carry accessories
    const horn = Object.values(d.instances).find((i) => i.templateId === 'acc_spike')!;
    const nested = ops.autoAttach(d, 'acc_rivet', horn.id, { symmetric: false });
    expect(nested.design.instances[nested.ids[0]].parentId).toBe(horn.id);
  });

  it('deleting a parent removes its accessories; deleting an accessory leaves the parent', () => {
    let { design: d, ids } = ops.addFitted(ops.emptyDesign(), 'helm_roman');
    const plate = ops.autoAttach(d, 'acc_faceplate', ids[0]);
    d = plate.design;
    const without = ops.removeInstance(d, plate.ids[0]);
    expect(without.instances[ids[0]].children).toEqual([]);
    expect(without.instances[ids[0]]).toBeTruthy();
    const gone = ops.removeInstance(d, ids[0]);
    expect(Object.keys(gone.instances)).toEqual([]);
    expect(gone.roots).toEqual([]);
  });

  it('duplicate copies the whole assembly with fresh ids', () => {
    let { design: d, ids } = ops.addFitted(ops.emptyDesign(), 'helm_spangen');
    d = ops.autoAttach(d, 'acc_horn_curved', ids[0]).design;
    const r = ops.duplicate(d, ids[0]);
    const copy = r.design.instances[r.ids[0]];
    expect(copy.children.length).toBe(2);
    expect(copy.children.every((c) => !d.instances[c] && r.design.instances[c].parentId === copy.id)).toBe(true);
    expect(Object.keys(r.design.instances).length).toBe(6);
    // the copies' horns are linked to each other, not to the originals
    const [h1, h2] = copy.children.map((c) => r.design.instances[c]);
    expect(h1.symmetry.partnerId).toBe(h2.id);
  });

  it('snapToSurface reseats a floating accessory', () => {
    let { design: d, ids } = ops.addFitted(ops.emptyDesign(), 'torso_cuirass');
    const r = ops.addAccessory(d, 'acc_boss', ids[0], { kind: 'static', surface: -1, u: 0, v: 0, position: [0, 1.3, 0.4], normal: [0, 0, 1] }, { symmetric: false });
    expect(ops.attachmentGap(r.design, r.ids[0])).toBeGreaterThan(0.2);
    const snapped = ops.snapToSurface(r.design, r.ids[0]);
    expect(ops.attachmentGap(snapped, r.ids[0])).toBeLessThan(0.01);
    expect(snapped.instances[r.ids[0]].attachment!.kind).toBe('param');
  });
});

describe('custom parts and presets', () => {
  it('extracts an assembly and places it again without touching the template', () => {
    let { design: d, ids } = ops.addFitted(ops.emptyDesign(), 'helm_spangen');
    d = ops.updateParams(d, ids[0], { height: 0.2 });
    d = ops.autoAttach(d, 'acc_horn_curved', ids[0]).design;
    d = ops.autoAttach(d, 'acc_faceplate', ids[0]).design;
    const part = ops.extractCustomPart(d, ids[0], 'Horned Guard Helmet');
    expect(Object.keys(part.instances).length).toBe(4);
    const placed = ops.insertCustomPart(ops.emptyDesign(), part);
    const root = placed.design.instances[placed.ids[0]];
    expect(root.name).toBe('Horned Guard Helmet');
    expect(root.params.height).toBe(0.2);
    expect(root.children.length).toBe(3);
    expect(defaultParams(TEMPLATE_BY_ID.helm_spangen).height).toBe(0.128);
    // JSON round trip (this is how the library is persisted)
    const again = ops.insertCustomPart(ops.emptyDesign(), JSON.parse(JSON.stringify(part)));
    expect(Object.keys(again.design.instances).length).toBe(4);
  });

  it('every demonstration preset builds, covers the body and renders finite geometry', () => {
    for (const p of PRESETS) {
      const d = p.build();
      const fit = computeFit(d);
      expect(d.roots.length).toBeGreaterThan(8);
      for (const inst of Object.values(d.instances)) {
        const b = ops.buildOf(d, inst, fit);
        const pos = b.geometry.getAttribute('position').array;
        for (let i = 0; i < pos.length; i += 97) expect(Number.isFinite(pos[i])).toBe(true);
        if (inst.parentId) expect(d.instances[inst.parentId].children).toContain(inst.id);
      }
    }
    const horned = PRESETS.find((p) => p.id === 'horned')!.build();
    const horns = Object.values(horned.instances).filter((i) => i.templateId === 'acc_horn_curved');
    expect(horns.length).toBe(2);
    expect(horns[0].params.length).not.toBe(horns[1].params.length); // deliberately asymmetric
    const roman = PRESETS.find((p) => p.id === 'roman')!.build();
    const helm = Object.values(roman.instances).find((i) => i.templateId === 'helm_roman')!;
    expect(helm.children.map((c) => roman.instances[c].templateId).sort()).toEqual(['acc_crest_brush', 'acc_faceplate']);
  });
});

describe('repeated ornaments', () => {
  it('repeats an accessory evenly around a closed surface', () => {
    let { design: d, ids } = ops.addFitted(ops.emptyDesign(), 'helm_kettle');
    const rivet = ops.autoAttach(d, 'acc_rivet', ids[0], { symmetric: false });
    const r = ops.repeatAround(rivet.design, rivet.ids[0], 8);
    expect(r.ids.length).toBe(7);
    const us = [rivet.ids[0], ...r.ids].map((id) => r.design.instances[id].attachment!.u).sort((a, b) => a - b);
    for (let i = 1; i < us.length; i++) expect(us[i] - us[i - 1]).toBeCloseTo(Math.PI / 4, 5);
    for (const id of r.ids) expect(ops.attachmentGap(r.design, id)).toBeLessThan(0.02);
    // copies that would fall off an open edge are skipped
    const bp = ops.addFitted(ops.emptyDesign(), 'torso_breastplate');
    const boss = ops.autoAttach(bp.design, 'acc_rivet', bp.ids[0], { symmetric: false });
    expect(ops.repeatAround(boss.design, boss.ids[0], 8).ids.length).toBeLessThan(7);
  });
});
