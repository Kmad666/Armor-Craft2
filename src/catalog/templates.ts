// The component catalogue.
//
// Every entry is DATA: it names a geometry family, a structural config for that family,
// a preset of shape parameters and default materials. Adding a new armour piece is a matter
// of adding an entry here - the editor, handles, layering, attachment and save systems are
// all driven from these definitions.

import type { Vec3 } from '../core/types';
import type { CapCfg } from '../geometry/families/cap';
import type { ShellCfg } from '../geometry/families/shell';

export type Era = 'roman' | 'earlyMedieval' | 'highMedieval' | 'gothic' | 'renaissance' | 'japanese' | 'fantasy';
export type CategoryId = 'head' | 'torso' | 'arms' | 'hands' | 'waist' | 'legs' | 'feet' | 'accessories';

export const ERAS: { id: Era; label: string }[] = [
  { id: 'roman', label: 'Classical Roman' },
  { id: 'earlyMedieval', label: 'Early Medieval' },
  { id: 'highMedieval', label: 'Norman & High Medieval' },
  { id: 'gothic', label: 'Late Medieval Gothic' },
  { id: 'renaissance', label: 'Renaissance & Milanese' },
  { id: 'japanese', label: 'Japanese' },
  { id: 'fantasy', label: 'Fantasy' },
];

export const CATEGORIES: { id: CategoryId; label: string; subs: string[] }[] = [
  { id: 'head', label: 'Head', subs: ['Helmets', 'Faceplates', 'Visors', 'Neck protection', 'Helmet decorations'] },
  { id: 'torso', label: 'Torso', subs: ['Cuirasses', 'Breastplates', 'Backplates', 'Mail shirts', 'Brigandines', 'Gambesons', 'Tunics', 'Tabards'] },
  { id: 'arms', label: 'Shoulders & Arms', subs: ['Pauldrons', 'Upper-arm armor', 'Elbow armor', 'Forearm armor', 'Bracers'] },
  { id: 'hands', label: 'Hands', subs: ['Gloves', 'Gauntlets', 'Wrist guards', 'Hand plates'] },
  { id: 'waist', label: 'Waist', subs: ['Faulds', 'Tassets', 'Armored skirts', 'Cloth skirts', 'Hanging mail', 'Decorative belts'] },
  { id: 'legs', label: 'Legs', subs: ['Thigh armor', 'Knee armor', 'Greaves', 'Leg coverings'] },
  { id: 'feet', label: 'Feet', subs: ['Sabatons', 'Boots', 'Armored footwear'] },
  {
    id: 'accessories',
    label: 'Accessories',
    subs: ['Horns', 'Crests', 'Plumes', 'Ornamental plates', 'Decorative spikes', 'Rivets', 'Chains', 'Buckles', 'Cloth strips', 'Engraved emblems', 'Trim & decoration'],
  },
];

export interface MountSpec {
  surface?: number;
  u?: number;
  v?: number;
  /** Static mount in the parent's local frame (used where the parent has no surface there, e.g. an open face). */
  position?: Vec3;
  normal?: Vec3;
}

export interface TemplateDef {
  id: string;
  name: string;
  category: CategoryId;
  sub: string;
  eras: Era[];
  family: string;
  cfg: Record<string, any>;
  kind: 'fitted' | 'accessory';
  /** Region type this piece mounts on ("forearm", "chest", ...); accessories use "any". */
  regionType: string;
  layer: number;
  /** Nominal thickness used by the layer manager (metres). */
  stack: number;
  preset: Record<string, number>;
  materials: Record<string, string>;
  attach?: 'normalY' | 'normalZ';
  /** Default mount per parent family when auto-attaching. */
  mounts?: Record<string, MountSpec>;
  doubleSided?: boolean;
  desc: string;
}

const ALL_ERAS: Era[] = ['roman', 'earlyMedieval', 'highMedieval', 'gothic', 'renaissance', 'japanese', 'fantasy'];
const list: TemplateDef[] = [];
const add = (t: TemplateDef) => list.push(t);

type Mats = [string, string?, string?];
const mats = (m: Mats) => ({ base: m[0], trim: m[1] ?? m[0], detail: m[2] ?? m[1] ?? m[0] });

// ------------------------------------------------------------------ helmets (dome family)

function helmet(id: string, name: string, eras: Era[], preset: Record<string, number>, m: Mats, desc: string, extra: Partial<TemplateDef> = {}) {
  add({
    id,
    name,
    category: 'head',
    sub: 'Helmets',
    eras,
    family: 'dome',
    cfg: {},
    kind: 'fitted',
    regionType: 'skull',
    layer: 3,
    stack: 0.006,
    preset,
    materials: mats(m),
    desc,
    ...extra,
  });
}

helmet('helm_roman', 'Roman Galea', ['roman'], { height: 0.094, crown: 2.05, front: 0.012, side: 0.03, back: 0.085, cheek: 0.105, faceWidth: 0.98, tail: 1.5, peak: 0.022, brimDrop: 0.004, browBand: 1, rivets: 1, hug: 0.25, trim: 0.007 }, ['bronze', 'brass'], 'Open-faced legionary helmet with cheek guards and a flared neck guard.');
helmet('helm_spangen', 'Spangenhelm', ['earlyMedieval'], { height: 0.128, crown: 1.5, front: 0.022, side: 0.03, back: 0.04, faceWidth: 1.2, bands: 4, browBand: 1, nasal: 0.058, rivets: 1, hug: 0.05 }, ['iron', 'brass'], 'Segmented conical helmet held together by riveted bands.');
helmet('helm_nasal', 'Norman Nasal Helm', ['highMedieval', 'earlyMedieval'], { height: 0.14, crown: 1.32, front: 0.02, side: 0.028, back: 0.036, faceWidth: 1.2, browBand: 1, nasal: 0.075, hug: 0.05 }, ['steel', 'darkSteel'], 'One-piece conical helm with a long nasal bar.');
helmet('helm_great', 'Great Helm', ['highMedieval'], { height: 0.07, crown: 5.2, width: 1.06, depth: 1.02, front: 0.19, side: 0.19, back: 0.19, faceWidth: 1.2, slit: 1, bands: 2, browBand: 1, rivets: 1, hug: 0, flare: 0.05, trim: 0.01 }, ['steel', 'brass'], 'Flat-topped barrel helm enclosing the whole head.');
helmet('helm_bascinet', 'Bascinet', ['gothic', 'highMedieval'], { height: 0.155, crown: 1.28, apexShift: -0.028, front: 0.175, side: 0.175, back: 0.165, faceWidth: 1.2, faceHole: 1, hug: 0.35, trim: 0.008 }, ['steel', 'brass'], 'Tall pointed skull with an open face - made for a visor.');
helmet('helm_sallet', 'Sallet', ['gothic'], { height: 0.092, crown: 2.1, front: 0.07, side: 0.075, back: 0.1, faceWidth: 1.2, slit: 1, tail: 1.9, ridge: 0.008, flare: 0.25, hug: 0, trim: 0.008 }, ['steel', 'steel'], 'Sweeping German helm with a long tail and eye slit.');
helmet('helm_barbute', 'Barbute', ['renaissance', 'gothic'], { height: 0.1, crown: 2, front: 0.014, side: 0.185, back: 0.185, faceWidth: 0.2, hug: 0.55, ridge: 0.004, trim: 0.009 }, ['steel', 'brass'], 'Italian helm with a narrow T-shaped face opening.');
helmet('helm_kettle', 'Kettle Hat', ['highMedieval', 'gothic'], { height: 0.088, crown: 2.2, front: 0.014, side: 0.014, back: 0.014, faceWidth: 1.2, brim: 0.075, brimDrop: 0.034, ridge: 0.006, hug: 0, trim: 0.006 }, ['steel', 'darkSteel'], 'Wide-brimmed infantry helmet.');
helmet('helm_armet', 'Close Helm', ['renaissance', 'gothic'], { height: 0.098, crown: 2.1, front: 0.185, side: 0.185, back: 0.17, faceWidth: 1.2, slit: 0.9, snout: 0.034, ridge: 0.012, hug: 0.4, trim: 0.008 }, ['steel', 'brass'], 'Fully enclosing helm with a pointed visor profile.');
helmet('helm_corinthian', 'Crested Classical Helm', ['roman'], { height: 0.1, crown: 2, front: 0.012, side: 0.17, back: 0.13, faceWidth: 0.3, nasal: 0.062, hug: 0.4, tail: 0.5, trim: 0.008 }, ['bronze', 'brass'], 'Classical bronze helm with cheek pieces sweeping round the face.');
helmet('helm_kabuto', 'Kabuto', ['japanese'], { height: 0.09, crown: 2.3, front: 0.01, side: 0.085, back: 0.095, faceWidth: 1.05, bands: 12, browBand: 1, peak: 0.034, brimDrop: 0.012, flare: 1.7, lames: 4, hug: 0, spike: 0.012, trim: 0.006 }, ['lacquer', 'gold'], 'Multi-plate bowl with a lamellar neck guard.');
helmet('helm_fantasy', 'Winged-crest War Helm', ['fantasy'], { height: 0.145, crown: 1.55, front: 0.014, side: 0.05, back: 0.12, cheek: 0.13, faceWidth: 0.9, tail: 0.7, ridge: 0.03, peak: 0.02, browBand: 1, hug: 0.3, trim: 0.01 }, ['darkSteel', 'gold'], 'Open-faced fantasy helm with a tall crown ridge.');
helmet('helm_coif', 'Mail Coif', ['earlyMedieval', 'highMedieval'], { height: 0.1, crown: 2, front: 0.26, side: 0.27, back: 0.26, faceWidth: 1.2, faceHole: 0.95, drape: 1, hug: 0.35, trim: 0 }, ['mail'], 'Mail hood covering head, neck and shoulders.', {
  cfg: { soft: true },
  layer: 2,
  stack: 0.005,
  doubleSided: true,
});

// ------------------------------------------------------------------ shells

function shellT(
  id: string,
  name: string,
  category: CategoryId,
  sub: string,
  eras: Era[],
  regionType: string,
  layer: number,
  stack: number,
  cfg: ShellCfg,
  preset: Record<string, number>,
  m: Mats,
  desc: string,
) {
  add({ id, name, category, sub, eras, family: 'shell', cfg, kind: 'fitted', regionType, layer, stack, preset, materials: mats(m), doubleSided: !!cfg.cloth, desc });
}

// torso - plate
shellT('torso_cuirass', 'Full Cuirass', 'torso', 'Cuirasses', ['gothic', 'renaissance', 'highMedieval'], 'chest', 3, 0.006, { part: 'torso', y0: 1.03, y1: 1.475, bulgeFront: true }, { armhole: 0.105, neckline: 0.035, bulge: 0.35, ridge: 0.25, flare: 0.08, trim: 0.012 }, ['steel', 'brass'], 'Breast and back plate enclosing the torso.');
shellT('torso_breastplate', 'Simple Breastplate', 'torso', 'Breastplates', ['highMedieval', 'gothic', 'renaissance'], 'chest', 3, 0.006, { part: 'torso', y0: 1.08, y1: 1.46, bulgeFront: true }, { arc: 0.54, armhole: 0.09, neckline: 0.04, bulge: 0.4, round: 0.25, trim: 0.01 }, ['steel', 'steel'], 'A single front plate strapped over the chest.');
shellT('torso_muscle', 'Muscle Cuirass', 'torso', 'Cuirasses', ['roman'], 'chest', 3, 0.006, { part: 'torso', y0: 1.02, y1: 1.475, style: 'muscle' }, { armhole: 0.105, neckline: 0.04, point: 0.22, trim: 0.01 }, ['bronze', 'gold'], 'Anatomical bronze cuirass.');
shellT('torso_gothic', 'Gothic Breastplate', 'torso', 'Breastplates', ['gothic'], 'chest', 3, 0.006, { part: 'torso', y0: 1.06, y1: 1.465, style: 'gothic', bulgeFront: true }, { armhole: 0.105, neckline: 0.045, bulge: 0.55, ridge: 0.9, point: 0.5, lames: 0, flare: 0.1, trim: 0.012 }, ['steel', 'brass'], 'Fluted German breastplate with a sharp medial ridge.');
shellT('torso_brigandine', 'Brigandine', 'torso', 'Brigandines', ['gothic', 'highMedieval', 'renaissance'], 'chest', 3, 0.007, { part: 'torso', y0: 0.98, y1: 1.475, style: 'brigandine' }, { armhole: 0.1, neckline: 0.035, flare: 0.1, trim: 0.012 }, ['wool', 'brass'], 'Cloth-covered coat of small plates, studded with rivets.');
shellT('torso_lamellar', 'Lamellar Cuirass', 'torso', 'Cuirasses', ['earlyMedieval', 'japanese'], 'chest', 3, 0.007, { part: 'torso', y0: 0.98, y1: 1.47, style: 'lamellar' }, { armhole: 0.1, neckline: 0.035, flare: 0.08, trim: 0.01 }, ['iron', 'leather'], 'Rows of laced plates.');
shellT('torso_segmentata', 'Segmented Cuirass', 'torso', 'Cuirasses', ['roman'], 'chest', 3, 0.006, { part: 'torso', y0: 1.04, y1: 1.45, rivets: true }, { armhole: 0.1, neckline: 0.06, lames: 6, lameDepth: 0.0045, trim: 0 }, ['steel', 'brass'], 'Overlapping iron hoops around the body.');
shellT('torso_do', 'Dō Cuirass', 'torso', 'Cuirasses', ['japanese'], 'chest', 3, 0.006, { part: 'torso', y0: 1.04, y1: 1.47, style: 'scales' }, { armhole: 0.1, neckline: 0.05, flare: 0.05, trim: 0.012 }, ['lacquer', 'silk'], 'Lacquered rows of scales laced with silk.');
shellT('torso_backplate', 'Backplate', 'torso', 'Backplates', ['highMedieval', 'gothic', 'renaissance'], 'back', 3, 0.006, { part: 'torso', y0: 1.05, y1: 1.47, arcCenter: Math.PI }, { arc: 0.52, armhole: 0.09, bulge: 0.15, round: 0.2, trim: 0.01 }, ['steel', 'steel'], 'Rear plate, pairs with any breastplate.');
shellT('torso_plackart', 'Segmented Plackart', 'torso', 'Breastplates', ['gothic', 'renaissance'], 'abdomen', 4, 0.005, { part: 'torso', y0: 1.02, y1: 1.2 }, { lames: 3, lameDepth: 0.005, point: 0.3, flare: 0.12, trim: 0.008 }, ['steel', 'brass'], 'Banded lower-torso reinforcement that layers over a breastplate.');
// torso - flexible
shellT('torso_mail', 'Mail Shirt', 'torso', 'Mail shirts', ['earlyMedieval', 'highMedieval', 'roman'], 'chest', 2, 0.005, { part: 'torso', y0: 0.8, y1: 1.5, cloth: true, sleeves: true }, { sleeve: 0.5, neckline: 0.02, flare: 0.12, folds: 0.12, trim: 0 }, ['mail'], 'Knee-length hauberk of riveted rings.');
shellT('torso_jerkin', 'Leather Jerkin', 'torso', 'Tunics', ['earlyMedieval', 'highMedieval', 'fantasy'], 'chest', 2, 0.005, { part: 'torso', y0: 0.94, y1: 1.485, cloth: true }, { armhole: 0.1, neckline: 0.05, flare: 0.1, trim: 0.012 }, ['leather', 'darkLeather'], 'Sleeveless leather garment.');
// torso - cloth
shellT('torso_gambeson', 'Gambeson', 'torso', 'Gambesons', ['highMedieval', 'gothic', 'earlyMedieval'], 'chest', 1, 0.009, { part: 'torso', y0: 0.84, y1: 1.525, cloth: true, sleeves: true, style: 'quilt' }, { sleeve: 1, flare: 0.14, trim: 0.012 }, ['padded', 'linen'], 'Quilted padded coat worn under armour.');
shellT('torso_tunic', 'Cloth Tunic', 'torso', 'Tunics', ALL_ERAS, 'chest', 1, 0.004, { part: 'torso', y0: 0.78, y1: 1.495, cloth: true, sleeves: true }, { sleeve: 0.38, neckline: 0.035, flare: 0.2, folds: 0.55, trim: 0.014 }, ['wool', 'linen'], 'Simple belted tunic.');
shellT('torso_tabard_long', 'Long Tabard', 'torso', 'Tabards', ['highMedieval', 'gothic', 'fantasy'], 'chest', 4, 0.004, { part: 'torso', y0: 0.5, y1: 1.475, cloth: true, panels: 'frontback' }, { arc: 0.44, neckline: 0.03, folds: 0.3, foldCount: 8, flare: 0.12, trim: 0.016 }, ['heavyCloth', 'gold'], 'Heraldic over-garment hanging front and back.');
shellT('torso_tabard_short', 'Short Tabard', 'torso', 'Tabards', ['highMedieval', 'gothic', 'fantasy'], 'chest', 4, 0.004, { part: 'torso', y0: 0.9, y1: 1.475, cloth: true, panels: 'frontback' }, { arc: 0.46, neckline: 0.03, folds: 0.2, foldCount: 8, point: 0.25, trim: 0.014 }, ['wool', 'gold'], 'Hip-length tabard.');
// neck
shellT('neck_gorget', 'Plate Gorget', 'head', 'Neck protection', ['gothic', 'renaissance', 'highMedieval'], 'neck', 3, 0.005, { part: 'torso', y0: 1.455, y1: 1.565 }, { flare: 1.25, lames: 2, flareTop: 0.25, trim: 0.007 }, ['steel', 'brass'], 'Articulated collar protecting the throat.');
shellT('neck_mantle', 'Mail Mantle', 'head', 'Neck protection', ['earlyMedieval', 'highMedieval', 'gothic'], 'neck', 2, 0.005, { part: 'torso', y0: 1.4, y1: 1.56, cloth: true }, { flare: 1.3, folds: 0.15, point: 0.2, trim: 0 }, ['mail'], "Bishop's mantle: a mail collar spreading over the shoulders.");

// waist
shellT('waist_fauld', 'Fauld', 'waist', 'Faulds', ['gothic', 'renaissance'], 'waist', 3, 0.006, { part: 'torso', y0: 0.915, y1: 1.07 }, { lames: 3, lameDepth: 0.005, flare: 0.55, trim: 0.008 }, ['steel', 'brass'], 'Hooped skirt of lames below the breastplate.');
shellT('waist_tassets', 'Tassets', 'waist', 'Tassets', ['gothic', 'renaissance'], 'pelvis', 3, 0.006, { part: 'torso', y0: 0.72, y1: 0.955, panels: 'pair', arcCenter: 0.6 }, { arc: 0.3, lames: 3, lameDepth: 0.004, round: 0.5, flare: 0.3, bulge: 0.1, offset: 0.012, trim: 0.007 }, ['steel', 'brass'], 'Hanging thigh plates.');
shellT('waist_plate_skirt', 'Armored Skirt', 'waist', 'Armored skirts', ['roman', 'fantasy', 'japanese'], 'waist', 3, 0.006, { part: 'torso', y0: 0.62, y1: 1.06, style: 'scales' }, { flare: 0.42, arc: 1, trim: 0.012 }, ['bronze', 'leather'], 'Skirt of overlapping scales.');
shellT('waist_pteruges', 'Leather Pteruges', 'waist', 'Armored skirts', ['roman'], 'waist', 2, 0.005, { part: 'torso', y0: 0.66, y1: 1.045, style: 'strips', cloth: true }, { flare: 0.4, trim: 0.012 }, ['leather', 'brass'], 'Skirt of hanging leather straps.');
shellT('waist_skirt_full', 'Full Cloth Skirt', 'waist', 'Cloth skirts', ALL_ERAS, 'waist', 1, 0.004, { part: 'torso', y0: 0.3, y1: 1.07, cloth: true }, { flare: 0.5, folds: 0.9, foldCount: 14, trim: 0.018 }, ['wool', 'linen'], 'Long pleated skirt.');
shellT('waist_skirt_split', 'Split Cloth Skirt', 'waist', 'Cloth skirts', ['fantasy', 'japanese', 'highMedieval'], 'waist', 1, 0.004, { part: 'torso', y0: 0.32, y1: 1.07, cloth: true, arcCenter: Math.PI }, { arc: 0.82, flare: 0.55, folds: 0.8, foldCount: 12, round: 0.25, trim: 0.018 }, ['heavyCloth', 'gold'], 'Skirt open at the front.');
shellT('waist_cloth', 'Hanging Waist Cloth', 'waist', 'Cloth skirts', ALL_ERAS, 'waist', 4, 0.004, { part: 'torso', y0: 0.5, y1: 1.06, cloth: true, panels: 'frontback' }, { arc: 0.2, folds: 0.25, foldCount: 9, point: 0.5, flare: 0.3, trim: 0.014 }, ['velvet', 'gold'], 'Narrow cloth panels hanging front and back.');
shellT('waist_mail', 'Hanging Mail Skirt', 'waist', 'Hanging mail', ['earlyMedieval', 'highMedieval', 'gothic'], 'waist', 2, 0.005, { part: 'torso', y0: 0.72, y1: 1.06, cloth: true }, { flare: 0.4, folds: 0.15, trim: 0 }, ['mail'], 'Mail skirt protecting the hips.');
shellT('waist_belt', 'Studded Belt', 'waist', 'Decorative belts', ALL_ERAS, 'waist', 4, 0.004, { part: 'torso', y0: 1.025, y1: 1.085, rivets: true }, { lames: 1, lameDepth: 0, thickness: 0.004, trim: 0.006, offset: 0.002 }, ['darkLeather', 'brass'], 'Leather belt with metal studs.');

// arms
shellT('arm_rerebrace', 'Rerebrace', 'arms', 'Upper-arm armor', ['gothic', 'renaissance', 'highMedieval'], 'upperArm', 3, 0.005, { part: 'arm', y0: -0.25, y1: -0.09 }, { ridge: 0.2, trim: 0.007, bulge: 0.12 }, ['steel', 'brass'], 'Plate tube for the upper arm.');
shellT('arm_vambrace', 'Straight Vambrace', 'arms', 'Forearm armor', ['highMedieval', 'gothic', 'roman'], 'forearm', 3, 0.005, { part: 'arm', y0: -0.535, y1: -0.335 }, { trim: 0.007, bulge: 0.08 }, ['steel', 'brass'], 'Plain plate forearm guard.');
shellT('arm_vambrace_taper', 'Tapered Vambrace', 'arms', 'Forearm armor', ['gothic', 'renaissance', 'fantasy'], 'forearm', 3, 0.005, { part: 'arm', y0: -0.54, y1: -0.315 }, { taper: 0.22, flareTop: 0.45, ridge: 0.5, bulge: 0.15, trim: 0.008 }, ['steel', 'brass'], 'Forearm guard that flares toward the elbow.');
shellT('arm_forearm_plate', 'Decorative Forearm Plate', 'arms', 'Forearm armor', ['fantasy', 'japanese', 'earlyMedieval'], 'forearm', 4, 0.005, { part: 'arm', y0: -0.53, y1: -0.32, arcCenter: Math.PI / 2 }, { arc: 0.46, ridge: 0.9, point: 0.5, round: 0.3, bulge: 0.2, offset: 0.004, trim: 0.007 }, ['brass', 'gold'], 'Shaped outer plate that layers over a sleeve or vambrace.');
shellT('arm_splint', 'Splinted Vambrace', 'arms', 'Forearm armor', ['earlyMedieval'], 'forearm', 3, 0.005, { part: 'arm', y0: -0.535, y1: -0.33, style: 'quilt', rivets: true }, { relief: 0.9, lames: 2, lameDepth: 0, trim: 0.008 }, ['iron', 'leather'], 'Iron splints riveted to a leather backing.');
shellT('arm_bracer', 'Leather Bracer', 'arms', 'Bracers', ALL_ERAS, 'forearm', 2, 0.004, { part: 'arm', y0: -0.545, y1: -0.4, cloth: true }, { trim: 0.008, taper: 0.05 }, ['leather', 'darkLeather'], 'Laced leather wrist bracer.');
shellT('arm_mail_sleeve', 'Mail Sleeve', 'arms', 'Upper-arm armor', ['earlyMedieval', 'highMedieval', 'gothic'], 'upperArm', 2, 0.005, { part: 'arm', y0: -0.555, y1: -0.03, cloth: true }, { trim: 0 }, ['mail'], 'Full-length mail sleeve.');
shellT('arm_cloth_sleeve', 'Cloth Arm Covering', 'arms', 'Upper-arm armor', ALL_ERAS, 'upperArm', 1, 0.004, { part: 'arm', y0: -0.55, y1: -0.03, cloth: true }, { folds: 0.5, foldCount: 7, trim: 0.012, flare: 0.05 }, ['linen', 'wool'], 'Loose fabric sleeve.');
shellT('arm_sode', 'Sode Shoulder Shield', 'arms', 'Pauldrons', ['japanese'], 'shoulder', 4, 0.005, { part: 'arm', y0: -0.25, y1: 0.03, arcCenter: Math.PI / 2 }, { arc: 0.4, lames: 6, lameDepth: 0.004, flare: 0.25, offset: 0.02, trim: 0.006 }, ['lacquer', 'silk'], 'Broad lamellar shoulder shield.');
shellT('wrist_cuff', 'Extended Wrist Cuff', 'hands', 'Wrist guards', ['gothic', 'renaissance', 'fantasy'], 'wrist', 4, 0.004, { part: 'arm', y0: -0.565, y1: -0.455 }, { flareTop: 0.9, lames: 2, trim: 0.006, offset: 0.004 }, ['steel', 'brass'], 'Flared plate cuff guarding the wrist.');

function capT(id: string, name: string, sub: string, category: CategoryId, eras: Era[], regionType: string, cfg: CapCfg, preset: Record<string, number>, m: Mats, desc: string, layer = 4) {
  add({ id, name, category, sub, eras, family: 'cap', cfg, kind: 'fitted', regionType, layer, stack: 0.006, preset, materials: mats(m), desc });
}
const PAULDRON: CapCfg = {
  part: 'arm',
  center: [0.012, -0.004, 0],
  apex: [0.68, 0.73, 0],
  e1: [0.73, -0.68, 0],
  R: 0.072,
  phiIn: 1.0,
  phiOut: 1.8,
  cover: [
    { part: 'arm', y0: -0.13, y1: 0.07, passive: true },
    { part: 'torso', y0: 1.38, y1: 1.5, passive: true },
  ],
};
const KNEE: CapCfg = { part: 'leg', center: [0, -0.44, 0.012], apex: [0, 0, 1], e1: [0, -1, 0], R: 0.06, phiIn: 1.4, phiOut: 1.4, cover: [{ part: 'leg', y0: -0.5, y1: -0.38, passive: true }] };
const ELBOW: CapCfg = { part: 'arm', center: [0, -0.29, -0.004], apex: [0, 0, -1], e1: [0, 1, 0], R: 0.047, phiIn: 1.4, phiOut: 1.4, cover: [{ part: 'arm', y0: -0.34, y1: -0.24, passive: true }] };

capT('pauldron_round', 'Rounded Pauldron', 'Pauldrons', 'arms', ['highMedieval', 'gothic', 'renaissance'], 'shoulder', PAULDRON, { size: 0.95, length: 1.1, flare: 0.25, trim: 0.007 }, ['steel', 'brass'], 'Small domed shoulder cop.');
capT('pauldron_gothic', 'Gothic Pauldron', 'Pauldrons', 'arms', ['gothic'], 'shoulder', PAULDRON, { size: 1.22, length: 1.35, width: 1.15, flare: 0.8, ridge: 0.9, flute: 1, cover: 1.08, trim: 0.009 }, ['steel', 'brass'], 'Large fluted pauldron with a flared rim.');
capT('pauldron_segmented', 'Segmented Shoulder Guard', 'Pauldrons', 'arms', ['roman', 'renaissance', 'fantasy'], 'shoulder', PAULDRON, { size: 1.02, length: 1.45, lames: 5, lameDepth: 0.0045, cover: 1.1, flare: 0.2, trim: 0 }, ['steel', 'brass'], 'Spaulder of overlapping lames.');
capT('pauldron_spiked', 'Peaked War Pauldron', 'Pauldrons', 'arms', ['fantasy'], 'shoulder', PAULDRON, { size: 1.3, length: 1.2, height: 1.25, pointed: 1.1, flare: 1.1, ridge: 1.2, lames: 2, trim: 0.012 }, ['darkSteel', 'gold'], 'Oversized fantasy pauldron rising to a point.');
capT('elbow_cop', 'Elbow Cop', 'Elbow armor', 'arms', ['gothic', 'renaissance', 'highMedieval'], 'elbow', ELBOW, { wing: 1, ridge: 0.4, trim: 0.005 }, ['steel', 'brass'], 'Rounded couter with a side wing.');
capT('elbow_angular', 'Angular Elbow Guard', 'Elbow armor', 'arms', ['fantasy', 'gothic'], 'elbow', ELBOW, { facets: 8, pointed: 0.9, height: 1.2, wing: 0, trim: 0 }, ['darkSteel', 'gold'], 'Faceted pointed couter.');
capT('knee_round', 'Rounded Knee Guard', 'Knee armor', 'legs', ['gothic', 'renaissance', 'highMedieval'], 'knee', KNEE, { wing: 1, length: 1.15, ridge: 0.3, trim: 0.006 }, ['steel', 'brass'], 'Domed poleyn with a side wing.');
capT('knee_angular', 'Angular Knee Guard', 'Knee armor', 'legs', ['fantasy', 'gothic', 'japanese'], 'knee', KNEE, { facets: 8, pointed: 0.8, length: 1.2, height: 1.15, wing: 0, trim: 0 }, ['darkSteel', 'gold'], 'Faceted pointed poleyn.');

// legs
shellT('leg_cuisse', 'Thigh Plates', 'legs', 'Thigh armor', ['gothic', 'renaissance', 'highMedieval'], 'thigh', 3, 0.005, { part: 'leg', y0: -0.365, y1: -0.07 }, { arc: 0.66, ridge: 0.5, round: 0.2, bulge: 0.15, trim: 0.008 }, ['steel', 'brass'], 'Cuisses covering the front of the thigh.');
shellT('leg_cuisse_lamed', 'Lamed Thigh Guard', 'legs', 'Thigh armor', ['renaissance', 'fantasy', 'roman'], 'thigh', 3, 0.005, { part: 'leg', y0: -0.37, y1: -0.05 }, { lames: 5, lameDepth: 0.004, trim: 0 }, ['steel', 'brass'], 'Fully enclosing thigh armour of lames.');
shellT('leg_greave', 'Greaves', 'legs', 'Greaves', ['roman', 'highMedieval', 'gothic', 'renaissance'], 'shin', 3, 0.005, { part: 'leg', y0: -0.805, y1: -0.495 }, { ridge: 0.7, bulge: 0.12, trim: 0.007 }, ['steel', 'brass'], 'Full plate greave enclosing the lower leg.');
shellT('leg_greave_seg', 'Segmented Shin Guard', 'legs', 'Greaves', ['earlyMedieval', 'japanese', 'fantasy'], 'shin', 3, 0.005, { part: 'leg', y0: -0.8, y1: -0.5, style: 'quilt', rivets: true }, { arc: 0.7, lames: 3, lameDepth: 0, relief: 0.9, trim: 0.008 }, ['iron', 'leather'], 'Splinted shin protection.');
shellT('leg_mail', 'Mail Leggings', 'legs', 'Leg coverings', ['earlyMedieval', 'highMedieval', 'gothic'], 'thigh', 2, 0.005, { part: 'leg', y0: -0.835, y1: -0.02, cloth: true }, { trim: 0 }, ['mail'], 'Mail chausses covering the whole leg.');
shellT('leg_hose', 'Cloth Leggings', 'legs', 'Leg coverings', ALL_ERAS, 'thigh', 1, 0.003, { part: 'leg', y0: -0.835, y1: 0.0, cloth: true }, { folds: 0.12, foldCount: 9, trim: 0 }, ['blackCloth'], 'Fitted cloth hose.');
shellT('leg_haidate', 'Haidate Thigh Apron', 'legs', 'Thigh armor', ['japanese'], 'thigh', 3, 0.005, { part: 'leg', y0: -0.4, y1: -0.02, style: 'scales' }, { arc: 0.6, flare: 0.25, round: 0.2, trim: 0.012, offset: 0.004 }, ['lacquer', 'silk'], 'Scaled apron guarding the thighs.');

// hands
function gauntletT(id: string, name: string, sub: string, eras: Era[], preset: Record<string, number>, m: Mats, desc: string, soft = false) {
  add({ id, name, category: 'hands', sub, eras, family: 'gauntlet', cfg: { soft }, kind: 'fitted', regionType: 'hand', layer: soft ? 1 : 3, stack: soft ? 0.003 : 0.004, preset, materials: mats(m), desc });
}
gauntletT('hand_glove', 'Leather Glove', 'Gloves', ALL_ERAS, { cuff: 0.05, cuffFlare: 0.3, fingerLames: 0, trim: 0.006 }, ['leather', 'darkLeather'], 'Plain leather glove.', true);
gauntletT('hand_armored_glove', 'Armored Glove', 'Gloves', ['highMedieval', 'gothic', 'fantasy'], { cuff: 0.07, cuffFlare: 0.6, lames: 2, fingerLames: 2, knuckles: 0.8, trim: 0.006 }, ['darkLeather', 'steel'], 'Glove reinforced with knuckle plates.');
gauntletT('hand_gauntlet', 'Plate Gauntlet', 'Gauntlets', ['gothic', 'renaissance'], { cuff: 0.11, cuffFlare: 1, lames: 3, fingerLames: 3, knuckles: 1, trim: 0.007 }, ['steel', 'brass'], 'Fingered plate gauntlet with a flared cuff.');
gauntletT('hand_mitten', 'Mitten Gauntlet', 'Gauntlets', ['gothic', 'highMedieval'], { cuff: 0.1, cuffFlare: 0.9, mitten: 1, lames: 2, fingerLames: 4, knuckles: 0, trim: 0.007 }, ['steel', 'brass'], 'Mitten gauntlet of broad overlapping lames.');
gauntletT('hand_articulated', 'Articulated Gauntlet', 'Gauntlets', ['renaissance', 'fantasy'], { cuff: 0.13, cuffFlare: 1.3, cuffLames: 3, lames: 4, fingerLames: 5, knuckles: 1.3, trim: 0.008 }, ['steel', 'gold'], 'Finely articulated gauntlet with many small lames.');
gauntletT('hand_plate', 'Hand Plate', 'Hand plates', ['japanese', 'earlyMedieval', 'fantasy'], { cuff: 0, wrap: 0.5, lames: 2, fingerLames: 0, mitten: 1, fingerLen: 0.8, knuckles: 0 }, ['lacquer', 'gold'], 'Half-gauntlet covering only the back of the hand.');

// feet
function footT(id: string, name: string, sub: string, eras: Era[], preset: Record<string, number>, m: Mats, desc: string, layer = 3) {
  add({ id, name, category: 'feet', sub, eras, family: 'footwear', cfg: {}, kind: 'fitted', regionType: 'foot', layer, stack: 0.004, preset, materials: mats(m), desc });
}
footT('foot_sabaton', 'Sabatons', 'Sabatons', ['gothic', 'renaissance', 'highMedieval'], { lames: 5, toe: 0.012, pointy: 0.25, shaft: 0.05, trim: 0.006 }, ['steel', 'brass', 'darkSteel'], 'Articulated plate shoes.');
footT('foot_sabaton_pointed', 'Pointed Sabatons', 'Sabatons', ['gothic'], { lames: 6, toe: 0.075, pointy: 1, shaft: 0.05, trim: 0.006 }, ['steel', 'brass', 'darkSteel'], 'Gothic sabatons with long pointed toes.');
footT('foot_boot', 'Leather Boots', 'Boots', ALL_ERAS, { shaft: 0.3, cuff: 0.5, toe: 0.008, pointy: 0.15, trim: 0.03 }, ['leather', 'darkLeather', 'darkLeather'], 'Tall leather boots.', 1);
footT('foot_armored_boot', 'Armored Boots', 'Armored footwear', ['fantasy', 'renaissance', 'japanese'], { shaft: 0.26, cuff: 0.9, lames: 3, shaftLames: 4, toe: 0.01, pointy: 0.1, trim: 0.012 }, ['darkSteel', 'gold', 'darkLeather'], 'Plated boots reaching up the shin.');
footT('foot_caliga', 'Low Shoes', 'Boots', ['roman', 'earlyMedieval'], { shaft: 0.03, cuff: 0.1, toe: 0.004, pointy: 0.05, trim: 0.008 }, ['leather', 'darkLeather', 'darkLeather'], 'Low ankle shoes.', 1);

// ------------------------------------------------------------------ accessories

function acc(id: string, name: string, sub: string, family: string, attach: 'normalY' | 'normalZ', preset: Record<string, number>, m: Mats, desc: string, extra: Partial<TemplateDef> = {}) {
  add({
    id,
    name,
    category: 'accessories',
    sub,
    eras: ALL_ERAS,
    family,
    cfg: {},
    kind: 'accessory',
    regionType: 'any',
    layer: 5,
    stack: 0,
    preset,
    materials: mats(m),
    attach,
    mounts: { dome: { surface: 0, u: 1.15, v: 0.68 }, cap: { surface: 0, u: 0, v: 0.8 }, shell: { surface: 0, u: 0, v: 0.72 } },
    desc,
    ...extra,
  });
}
const TOP: Record<string, MountSpec> = { dome: { surface: 0, u: 0, v: 1 }, cap: { surface: 0, u: 0, v: 0.9 }, shell: { surface: 0, u: 0, v: 0.8 } };
const FRONT: Record<string, MountSpec> = { dome: { surface: 0, u: 0, v: 0.62 }, cap: { surface: 0, u: 0, v: 0.6 }, shell: { surface: 0, u: 0, v: 0.72 } };
const FACE_LOW: Record<string, MountSpec> = { dome: { position: [0, 1.607, 0.112], normal: [0, 0, 1] }, shell: { surface: 0, u: 0, v: 0.5 }, cap: { surface: 0, u: 0, v: 0.6 } };
const FACE_FULL: Record<string, MountSpec> = { dome: { position: [0, 1.648, 0.118], normal: [0, 0, 1] }, shell: { surface: 0, u: 0, v: 0.5 }, cap: { surface: 0, u: 0, v: 0.6 } };

acc('acc_horn_straight', 'Straight Horn', 'Horns', 'horn', 'normalY', { length: 0.15, radius: 0.02, curvature: 0.15, taper: 1.1 }, ['bone', 'brass'], 'A straight tapering horn.');
acc('acc_horn_curved', 'Curved Horn', 'Horns', 'horn', 'normalY', { length: 0.2, radius: 0.023, curvature: 1.5, taper: 1 }, ['bone', 'brass'], 'A horn sweeping upward.');
acc('acc_horn_broad', 'Broad Curved Horn', 'Horns', 'horn', 'normalY', { length: 0.26, radius: 0.036, curvature: 1.9, taper: 0.8, flatten: 0.8, rings: 0.6 }, ['darkHorn', 'gold'], 'A heavy bull horn with growth rings.');
acc('acc_horn_ram', 'Ram Horn', 'Horns', 'horn', 'normalY', { length: 0.34, radius: 0.03, curvature: 4.6, spiral: 1.6, taper: 0.9, rings: 1.1 }, ['bone', 'brass'], 'A tightly curling ram horn.');
acc('acc_spike', 'Decorative Spike', 'Decorative spikes', 'horn', 'normalY', { length: 0.06, radius: 0.012, curvature: 0, taper: 1, tip: 0.02, ferrule: 0.25 }, ['steel', 'brass'], 'A short conical spike.', { mounts: TOP });
acc('acc_blade_fin', 'Blade Fin', 'Decorative spikes', 'horn', 'normalY', { length: 0.12, radius: 0.03, curvature: 0.7, flatten: 0.18, tip: 0.05, ferrule: 0 }, ['darkSteel', 'gold'], 'A flat curved blade for crests and vambraces.', { cfg: { profile: 'blade' }, mounts: TOP });
acc('acc_plume', 'Feather Plume', 'Plumes', 'horn', 'normalY', { length: 0.3, radius: 0.034, curvature: 1.7, flatten: 0.45, ferrule: 0 }, ['plume', 'brass'], 'A sweeping feather plume.', { cfg: { profile: 'feather' }, mounts: { dome: { surface: 0, u: 3.0, v: 0.93 }, cap: { surface: 0, u: 0, v: 0.9 }, shell: { surface: 0, u: 0, v: 0.8 } } });
acc('acc_crest_brush', 'Horsehair Crest', 'Crests', 'crest', 'normalY', { length: 0.25, height: 0.085, thick: 0.024, arch: 2.1 }, ['plume', 'brass'], 'Roman-style brush crest. Use Turn to set it crosswise.', { mounts: TOP });
acc('acc_crest_base', 'Crest Base (Comb)', 'Crests', 'crest', 'normalY', { length: 0.24, height: 0.032, thick: 0.012, arch: 2.1, holder: 0.6, wave: 0 }, ['steel', 'brass'], 'A low metal comb running over the crown.', { mounts: TOP });
acc('acc_crest_fan', 'Fan Crest', 'Crests', 'crest', 'normalY', { length: 0.12, height: 0.2, thick: 0.01, arch: 0.6, fan: 1.6, holder: 0.12, wave: 0.4 }, ['gold', 'brass'], 'A tall fan-shaped parade crest.', { mounts: TOP });
acc('acc_faceplate', 'Simple Faceplate', 'Ornamental plates', 'plate', 'normalZ', { width: 0.186, height: 0.1, wrap: 2.25, taper: 0.4, point: 0.2, bow: 0.006, trim: 0.006 }, ['steel', 'brass'], 'A curved plate for the mouth and jaw.', { category: 'head', sub: 'Faceplates', mounts: FACE_LOW });
acc('acc_faceplate_angular', 'Angular Faceplate', 'Ornamental plates', 'plate', 'normalZ', { width: 0.18, height: 0.105, wrap: 2.1, taper: 0.75, point: 0.8, ridge: 1.2, breaths: 4, trim: 0.006 }, ['darkSteel', 'gold'], 'A sharp-ridged jaw plate with breath slots.', { category: 'head', sub: 'Faceplates', mounts: FACE_LOW });
acc('acc_menpo', 'Menpō Half-mask', 'Ornamental plates', 'plate', 'normalZ', { width: 0.178, height: 0.092, wrap: 2.2, taper: 0.5, point: 0.35, snout: 0.016, lames: 2, trim: 0.005 }, ['lacquer', 'gold'], 'Lacquered half-mask.', { category: 'head', sub: 'Faceplates', eras: ['japanese'], mounts: FACE_LOW });
acc('acc_visor_hound', 'Hounskull Visor', 'Ornamental plates', 'plate', 'normalZ', { width: 0.2, height: 0.17, wrap: 2.3, taper: 0.3, snout: 0.075, slit: 0.7, breaths: 5, point: 0.25, trim: 0.006 }, ['steel', 'brass'], 'Pointed snout visor for a bascinet.', { category: 'head', sub: 'Visors', eras: ['gothic'], mounts: FACE_FULL });
acc('acc_visor_slit', 'Slit Visor', 'Ornamental plates', 'plate', 'normalZ', { width: 0.2, height: 0.15, wrap: 2.3, taper: 0.25, slit: 0.6, bow: 0.012, ridge: 0.5, point: 0.3, trim: 0.006 }, ['steel', 'brass'], 'Rounded visor with a single sight slit.', { category: 'head', sub: 'Visors', eras: ['gothic', 'renaissance'], mounts: FACE_FULL });
acc('acc_plate_diamond', 'Ornamental Plate', 'Ornamental plates', 'plate', 'normalZ', { width: 0.09, height: 0.1, wrap: 0.5, point: 1.2, arch: 0.8, ridge: 0.8, bow: 0.008, trim: 0.006 }, ['brass', 'gold'], 'A shield-shaped decorative plate.', { mounts: FRONT });
acc('acc_plate_square', 'Reinforcing Plate', 'Ornamental plates', 'plate', 'normalZ', { width: 0.11, height: 0.08, wrap: 0.7, bow: 0.008, trim: 0.007 }, ['steel', 'brass'], 'A rectangular plate to rivet anywhere.', { mounts: FRONT });
acc('acc_crescent', 'Crescent Crest (Maedate)', 'Helmet decorations', 'plate', 'normalZ', { width: 0.26, height: 0.05, wrap: 0.25, crescent: 1.15, trim: 0 }, ['gold', 'gold'], 'A broad crescent worn on the brow.', { category: 'head', sub: 'Helmet decorations', eras: ['japanese', 'fantasy'], mounts: { dome: { surface: 0, u: 0, v: 0.6 }, cap: { surface: 0, u: 0, v: 0.6 }, shell: { surface: 0, u: 0, v: 0.8 } } });
acc('acc_band', 'Ornamental Metal Band', 'Trim & decoration', 'plate', 'normalZ', { width: 0.2, height: 0.018, wrap: 1.6, trim: 0, thickness: 0.003 }, ['brass', 'brass'], 'A thin band that wraps around a surface.', { mounts: FRONT });
acc('acc_cloth_strip', 'Cloth Strip', 'Cloth strips', 'plate', 'normalZ', { width: 0.05, height: 0.3, wrap: 0.1, wave: 0.8, taper: -0.2, point: 0.6, trim: 0.004 }, ['wool', 'gold'], 'A hanging ribbon of cloth.', { cfg: { cloth: true, anchorTop: true }, doubleSided: true, mounts: FRONT });
acc('acc_rivet', 'Decorative Rivet', 'Rivets', 'medallion', 'normalZ', { radius: 0.006, dome: 0.004, rim: 0 }, ['brass'], 'A single domed rivet.', { mounts: FRONT });
acc('acc_boss', 'Round Boss', 'Rivets', 'medallion', 'normalZ', { radius: 0.03, dome: 0.012, boss: 0.008, rim: 0.2 }, ['steel', 'brass'], 'A domed boss with a raised rim.', { mounts: FRONT });
acc('acc_emblem', 'Raised Emblem', 'Engraved emblems', 'medallion', 'normalZ', { radius: 0.04, dome: 0.004, star: 0.9, points: 8, boss: 0.007, rim: 0 }, ['gold', 'gold'], 'An eight-pointed star emblem.', { mounts: FRONT });
acc('acc_emblem_sun', 'Sunburst Emblem', 'Engraved emblems', 'medallion', 'normalZ', { radius: 0.05, dome: 0.003, star: 1.2, points: 12, boss: 0.012, rim: 0 }, ['gold', 'gold'], 'A twelve-rayed sunburst.', { mounts: FRONT });
acc('acc_spike_boss', 'Spiked Boss', 'Decorative spikes', 'medallion', 'normalZ', { radius: 0.028, dome: 0.006, spike: 0.06, rim: 0.22 }, ['darkSteel', 'brass'], 'A boss with a central spike.', { mounts: FRONT });
acc('acc_buckle', 'Buckle', 'Buckles', 'medallion', 'normalZ', { radius: 0.02, dome: 0.004, aspect: 1.3, rim: 0 }, ['brass', 'brass'], 'A belt or strap buckle.', { cfg: { ring: true }, mounts: FRONT });
acc('acc_chain', 'Decorative Chain', 'Chains', 'chain', 'normalZ', { span: 0.16, sag: 0.05, link: 0.011 }, ['brass'], 'A chain that hangs between two points.', { mounts: FRONT });

export const TEMPLATES: TemplateDef[] = list;
export const TEMPLATE_BY_ID: Record<string, TemplateDef> = Object.fromEntries(list.map((t) => [t.id, t]));
