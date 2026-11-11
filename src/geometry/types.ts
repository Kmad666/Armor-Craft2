import type { BufferGeometry } from 'three';
import type { PartType, Vec3 } from '../core/types';
import type { MeshBuilder } from './MeshBuilder';

export type ParamGroup = 'Size' | 'Trim' | 'Shape' | 'Detail' | 'Deform' | 'Fit';

export interface ParamDef {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  def: number;
  /** Display unit. Values are stored in SI (metres / radians / plain factors). */
  unit?: 'cm' | 'deg' | '%' | 'x' | 'n';
  group: ParamGroup;
  hint?: string;
}

export type HandleKind = 'trim' | 'size' | 'shape';

/** A draggable viewport handle bound to one shape parameter. */
export interface HandleSpec {
  id: string;
  param: string;
  label: string;
  /** Geometry-local position and drag axis. */
  position: Vec3;
  axis: Vec3;
  /** Parameter change per metre dragged along the axis. */
  gain: number;
  kind: HandleKind;
}

/** Body coverage used by the layer manager to space shells apart. */
export interface CoverRange {
  part: PartType;
  y0: number;
  y1: number;
  /** Passive ranges receive spacing from layers below but do not push other layers out. */
  passive?: boolean;
}

export interface BuildCtx {
  /** Shell offset from the body surface assigned by the layer manager (metres). */
  fitOffset: number;
  /** Build the x-mirrored (right side) version. */
  mirror: boolean;
  /** Stretches of the body where a layer above presses this (soft) piece flat against the body. */
  squeeze?: SqueezeRange[];
}

export interface SqueezeRange {
  part: PartType;
  y0: number;
  y1: number;
}

export interface BuildResult {
  geometry: BufferGeometry;
  builder: MeshBuilder;
  handles: HandleSpec[];
  /** Local pivot for move / rotate / scale. */
  pivot: Vec3;
}

export interface Family {
  id: string;
  params: ParamDef[];
  /** Material slots this family can populate, in group order (base, trim, detail). */
  slots: string[];
  build(p: Record<string, number>, ctx: BuildCtx, cfg: Record<string, any>): BuildResult;
  coverage?(p: Record<string, number>, cfg: Record<string, any>): CoverRange[];
  /** Extra bulk (metres) that layers above must clear, beyond the nominal thickness. */
  bulk?(p: Record<string, number>, cfg: Record<string, any>): number;
}
