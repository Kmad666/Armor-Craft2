// Demonstration designs. They are assembled with the very same operations the editor UI calls,
// so they double as integration tests and stay fully editable once opened.

import { materialFromPreset } from '../catalog/materials';
import { TEMPLATE_BY_ID } from '../catalog/templates';
import type { Design, MaterialSpec, Transform } from '../core/types';
import * as ops from '../state/ops';

class Builder {
  d: Design;
  constructor(name: string) {
    this.d = ops.emptyDesign(name);
  }
  private style(id: string, params?: Record<string, number>, mats?: Record<string, string | Partial<MaterialSpec>>) {
    if (params) this.d = ops.updateParams(this.d, id, params);
    if (mats) {
      for (const [slot, m] of Object.entries(mats)) this.d = ops.setMaterial(this.d, id, slot, typeof m === 'string' ? materialFromPreset(m) : m);
    }
  }
  /** Equip a fitted piece (both sides when it is a sided piece). Returns the first instance id. */
  add(templateId: string, params?: Record<string, number>, mats?: Record<string, string | Partial<MaterialSpec>>): string {
    const r = ops.addFitted(this.d, templateId, { symmetric: true });
    this.d = r.design;
    this.style(r.ids[0], params, mats);
    return r.ids[0];
  }
  /** Attach an accessory at its default mount (mirrored twin included where symmetry applies). */
  attach(templateId: string, parentId: string, params?: Record<string, number>, mats?: Record<string, string | Partial<MaterialSpec>>, at?: { u?: number; v?: number; surface?: number }, transform?: Partial<Transform>): string[] {
    const t0 = ops.defaultAttachment(this.d, { ...(require_template(templateId)) }, this.d.instances[parentId]);
    let att = t0;
    if (at && t0.kind === 'param') {
      att = { ...t0, u: at.u ?? t0.u, v: at.v ?? t0.v, surface: at.surface ?? t0.surface };
      const parent = this.d.instances[parentId];
      const build = ops.resolveAttachment(att, parentBuild(this.d, parent.id));
      att.position = build.position.toArray() as any;
      att.normal = build.normal.toArray() as any;
    }
    const r = ops.addAccessory(this.d, templateId, parentId, att);
    this.d = r.design;
    this.style(r.ids[0], params, mats);
    if (transform) this.d = ops.updateTransform(this.d, r.ids[0], transform);
    return r.ids;
  }
  /** Edit one side only (no propagation to the mirrored twin). */
  solo(id: string, params: Record<string, number>, transform?: Partial<Transform>) {
    this.d = ops.breakLink(this.d, id);
    this.d = ops.updateParams(this.d, id, params, false);
    if (transform) this.d = ops.updateTransform(this.d, id, transform, false);
  }
  partner(id: string): string {
    return this.d.instances[id].symmetry.partnerId!;
  }
  done(): Design {
    return this.d;
  }
}

function require_template(id: string) {
  const t = TEMPLATE_BY_ID[id];
  if (!t) throw new Error(`Preset references unknown template ${id}`);
  return t;
}
function parentBuild(d: Design, id: string) {
  return ops.buildOf(d, d.instances[id]);
}

export function romanGuard(): Design {
  const b = new Builder('Roman-inspired Guard');
  b.add('torso_tunic', { trimBottom: 0.06, sleeve: 0.3, folds: 0.5 }, { base: { ...materialFromPreset('wool'), color: '#8e2a23' }, trim: 'linen' });
  b.add('waist_pteruges', { trimBottom: 0.02 }, { base: 'leather', trim: 'brass' });
  b.add('torso_segmentata', {}, { base: 'iron', trim: 'brass' });
  b.add('waist_belt', {}, { base: 'darkLeather', trim: 'brass' });
  const helm = b.add('helm_roman', {}, { base: 'bronze', trim: 'brass' });
  b.attach('acc_faceplate', helm, { height: 0.092 }, { base: 'iron', trim: 'bronze' });
  b.attach('acc_crest_brush', helm, { height: 0.08, length: 0.24 }, { base: { ...materialFromPreset('plume'), color: '#a51d1d' }, trim: 'brass' });
  b.add('pauldron_segmented', { size: 1.0 }, { base: 'iron', trim: 'brass' });
  b.add('arm_vambrace', {}, { base: 'bronze', trim: 'brass' });
  b.add('leg_greave', { trimTop: 0.02 }, { base: 'bronze', trim: 'brass' });
  b.add('foot_caliga', {}, { base: 'leather' });
  return b.done();
}

export function gothicKnight(): Design {
  const b = new Builder('Gothic-inspired Knight');
  b.add('torso_gambeson', { trimBottom: 0.04 }, { base: { ...materialFromPreset('padded'), color: '#2b2d36' }, trim: 'blackCloth' });
  b.add('leg_hose', {}, { base: 'blackCloth' });
  const breast = b.add('torso_gothic', {}, { base: 'steel', trim: 'steel' });
  b.add('torso_backplate', {}, { base: 'steel', trim: 'steel' });
  b.add('torso_plackart', {}, { base: 'steel', trim: 'steel' });
  b.add('waist_fauld', {}, { base: 'steel', trim: 'steel' });
  b.add('waist_tassets', {}, { base: 'steel', trim: 'steel' });
  b.add('neck_gorget', {}, { base: 'steel', trim: 'steel' });
  b.add('helm_sallet', {}, { base: 'steel', trim: 'steel' });
  b.add('pauldron_gothic', {}, { base: 'steel', trim: 'steel' });
  b.add('arm_rerebrace', {}, { base: 'steel', trim: 'steel' });
  b.add('elbow_cop', {}, { base: 'steel', trim: 'steel' });
  b.add('arm_vambrace_taper', {}, { base: 'steel', trim: 'steel' });
  b.add('hand_gauntlet', {}, { base: 'steel', trim: 'steel' });
  b.add('leg_cuisse_lamed', {}, { base: 'steel', trim: 'steel' });
  b.add('knee_round', {}, { base: 'steel', trim: 'steel' });
  b.add('leg_greave_seg', { arc: 1 }, { base: 'steel', trim: 'darkSteel' });
  b.add('foot_sabaton_pointed', {}, { base: 'steel', trim: 'steel', detail: 'darkSteel' });
  b.attach('acc_rivet', breast, {}, { base: 'brass' }, { u: 0.55, v: 0.86 });
  return b.done();
}

export function hornedGuardian(): Design {
  const b = new Builder('Fantasy Horned Guardian');
  const purple = { ...materialFromPreset('heavyCloth'), color: '#3d2459' };
  const teal = { ...materialFromPreset('paintedBlue'), color: '#1f5c63' };
  b.add('waist_skirt_full', { trimBottom: 0.12, flare: 0.6 }, { base: purple, trim: 'gold' });
  b.add('torso_tunic', { sleeve: 0.9, trimBottom: 0.1 }, { base: purple, trim: 'gold' });
  b.add('torso_mail', { trimBottom: 0.1, sleeve: 0.55 }, { base: 'darkMail' });
  const cuirass = b.add('torso_cuirass', { trimBottom: 0.07, frontDip: -0.04, bulge: 0.55, ridge: 0.6 }, { base: teal, trim: 'gold' });
  b.add('waist_tassets', { flare: 0.4 }, { base: teal, trim: 'gold' });
  b.attach('acc_plate_diamond', cuirass, { width: 0.11, height: 0.12, bow: 0.014, wrap: 0.75 }, { base: 'darkSteel', trim: 'gold' }, { u: 0, v: 0.74 });
  b.attach('acc_emblem_sun', cuirass, { radius: 0.03 }, { base: 'gold' }, { u: 0, v: 0.76 }, { position: [0, 0, 0.022] });
  // Spangenhelm base with a stretched dome and deliberately mismatched horns.
  const helm = b.add('helm_spangen', { height: 0.175, width: 1.06, crown: 1.7, cheek: 0.09, back: 0.09, tail: 0.6 }, { base: 'darkSteel', trim: 'gold' });
  const horns = b.attach('acc_horn_curved', helm, { length: 0.3, radius: 0.03, curvature: 1.9, rings: 0.5 }, { base: 'bone', trim: 'gold' }, { u: 1.2, v: 0.66 });
  b.solo(horns[1], { length: 0.14, radius: 0.022, curvature: 1.1 });
  const pauldron = b.add('pauldron_spiked', {}, { base: teal, trim: 'gold' });
  b.attach('acc_spike', pauldron, { length: 0.07 }, { base: 'gold', trim: 'gold' }, { u: 0, v: 0.55 });
  b.add('arm_vambrace_taper', {}, { base: 'darkSteel', trim: 'gold' });
  b.add('hand_articulated', {}, { base: 'darkSteel', trim: 'gold' });
  b.add('knee_angular', {}, { base: 'darkSteel', trim: 'gold' });
  b.add('leg_greave', {}, { base: teal, trim: 'gold' });
  b.add('foot_armored_boot', {}, { base: 'darkSteel', trim: 'gold', detail: 'darkLeather' });
  return b.done();
}

export const PRESETS: { id: string; name: string; desc: string; build: () => Design }[] = [
  { id: 'roman', name: 'Roman-inspired Guard', desc: 'Galea with an added faceplate and crest, segmented cuirass over a short tunic.', build: romanGuard },
  { id: 'gothic', name: 'Gothic-inspired Knight', desc: 'Sallet, fluted breastplate, large pauldrons and segmented legs in polished steel.', build: gothicKnight },
  { id: 'horned', name: 'Fantasy Horned Guardian', desc: 'A stretched spangenhelm with mismatched horns, layered chest armour and a cloth skirt.', build: hornedGuardian },
];
