// Local persistence: saved designs, autosave draft and the custom component library.
// Storage is injectable so the same code runs in unit tests.

import type { CustomPart, Design } from '../core/types';
import { parseCustomPart, parseDesign, serializeDesign, type LoadResult } from './schema';

export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

export interface DesignMeta {
  id: string;
  name: string;
  updatedAt: number;
  count: number;
}

const K_INDEX = 'armorAtelier.designs';
const K_DESIGN = (id: string) => `armorAtelier.design.${id}`;
const K_DRAFT = 'armorAtelier.autosave';
const K_CUSTOM = 'armorAtelier.customParts';
const K_TUTORIAL = 'armorAtelier.tutorialDone';

export class MemoryKV implements KV {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

function defaultKV(): KV {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('armorAtelier.probe', '1');
      localStorage.removeItem('armorAtelier.probe');
      return localStorage;
    }
  } catch {
    /* storage unavailable (private mode / sandbox): fall back to memory */
  }
  return new MemoryKV();
}

export class DesignStorage {
  constructor(private kv: KV = defaultKV()) {}

  list(): DesignMeta[] {
    try {
      const raw = JSON.parse(this.kv.getItem(K_INDEX) ?? '[]');
      return Array.isArray(raw) ? raw.filter((m) => m && typeof m.id === 'string').sort((a, b) => b.updatedAt - a.updatedAt) : [];
    } catch {
      return [];
    }
  }

  private writeIndex(list: DesignMeta[]) {
    this.kv.setItem(K_INDEX, JSON.stringify(list));
  }

  save(d: Design): DesignMeta {
    const meta: DesignMeta = { id: d.id, name: d.name, updatedAt: Date.now(), count: Object.keys(d.instances).length };
    this.kv.setItem(K_DESIGN(d.id), serializeDesign({ ...d, updatedAt: meta.updatedAt }));
    this.writeIndex([meta, ...this.list().filter((m) => m.id !== d.id)]);
    return meta;
  }

  load(id: string): LoadResult {
    const raw = this.kv.getItem(K_DESIGN(id));
    if (!raw) throw new Error('That saved design could not be found.');
    return parseDesign(raw);
  }

  remove(id: string) {
    this.kv.removeItem(K_DESIGN(id));
    this.writeIndex(this.list().filter((m) => m.id !== id));
  }

  rename(id: string, name: string) {
    const { design } = this.load(id);
    this.save({ ...design, name });
  }

  duplicate(id: string, newId: string): DesignMeta {
    const { design } = this.load(id);
    return this.save({ ...design, id: newId, name: `${design.name} copy`, createdAt: Date.now() });
  }

  saveDraft(d: Design) {
    try {
      this.kv.setItem(K_DRAFT, serializeDesign(d));
    } catch {
      /* quota exceeded: autosave is best-effort */
    }
  }

  loadDraft(): LoadResult | null {
    const raw = this.kv.getItem(K_DRAFT);
    if (!raw) return null;
    try {
      return parseDesign(raw);
    } catch {
      return null;
    }
  }

  clearDraft() {
    this.kv.removeItem(K_DRAFT);
  }

  loadCustomParts(): CustomPart[] {
    try {
      const raw = JSON.parse(this.kv.getItem(K_CUSTOM) ?? '[]');
      return Array.isArray(raw) ? (raw.map(parseCustomPart).filter(Boolean) as CustomPart[]) : [];
    } catch {
      return [];
    }
  }

  saveCustomParts(parts: CustomPart[]) {
    this.kv.setItem(K_CUSTOM, JSON.stringify(parts));
  }

  get tutorialDone() {
    return this.kv.getItem(K_TUTORIAL) === '1';
  }
  set tutorialDone(v: boolean) {
    if (v) this.kv.setItem(K_TUTORIAL, '1');
    else this.kv.removeItem(K_TUTORIAL);
  }
}
