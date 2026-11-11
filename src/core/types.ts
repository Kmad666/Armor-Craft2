// Core data model for Armor Atelier.
// Everything in here is plain JSON-serialisable data: the scene is always derived from it.

export type Vec3 = [number, number, number];
export type Side = 'L' | 'R' | 'C';

export type PartId =
  | 'head'
  | 'torso'
  | 'armL'
  | 'armR'
  | 'handL'
  | 'handR'
  | 'legL'
  | 'legR'
  | 'footL'
  | 'footR';

export type PartType = 'head' | 'torso' | 'arm' | 'hand' | 'leg' | 'foot';

export type MaterialKind = 'metal' | 'fabric' | 'leather' | 'mail';
export type TextureKind =
  | 'none'
  | 'brushed'
  | 'hammered'
  | 'mail'
  | 'weave'
  | 'wool'
  | 'velvet'
  | 'leather'
  | 'quilt'
  | 'scales';

export interface MaterialSpec {
  preset: string;
  kind: MaterialKind;
  color: string;
  metalness: number;
  roughness: number;
  texture: TextureKind;
  textureIntensity: number;
  wear: number;
}

/** Where an accessory sits on its parent. */
export interface Attachment {
  /** 'param' = parametric surface coordinates that survive parent reshaping; 'static' = fixed parent-local frame. */
  kind: 'param' | 'static';
  surface: number;
  u: number;
  v: number;
  /** Parent-local fallback / last resolved position and outward normal. */
  position: Vec3;
  normal: Vec3;
}

export interface Transform {
  position: Vec3;
  /** Euler XYZ, radians. */
  rotation: Vec3;
  scale: Vec3;
}

export interface SymmetryLink {
  /** Linked opposite-side component (edits propagate while linked). */
  partnerId: string | null;
  /** True when this instance renders the x-mirrored version of its template geometry. */
  mirrored: boolean;
}

export interface ComponentInstance {
  id: string;
  templateId: string;
  name: string;
  /** Region id for root components (e.g. "forearmL"); for accessories the region of the root ancestor. */
  region: string;
  parentId: string | null;
  children: string[];
  transform: Transform;
  params: Record<string, number>;
  materials: Record<string, MaterialSpec>;
  layer: number;
  order: number;
  visible: boolean;
  locked: boolean;
  symmetry: SymmetryLink;
  attachment: Attachment | null;
}

export interface MannequinConfig {
  color: string;
  showGrid: boolean;
}

export interface Design {
  schema: number;
  app: 'armor-atelier';
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  symmetry: boolean;
  mannequin: MannequinConfig;
  instances: Record<string, ComponentInstance>;
  /** Root component ids in insertion order. */
  roots: string[];
  /** Monotonic counter used for layer ordering. */
  orderCounter: number;
}

/** A reusable saved sub-assembly (component + attached accessories). */
export interface CustomPart {
  id: string;
  name: string;
  createdAt: number;
  rootTemplateId: string;
  /** Instances keyed by their original ids; `rootId` is the top of the sub-tree. */
  rootId: string;
  instances: Record<string, ComponentInstance>;
}

export type ToolId = 'select' | 'move' | 'rotate' | 'scale' | 'morph';

export const SCHEMA_VERSION = 1;
