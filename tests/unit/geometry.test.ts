import { describe, expect, it } from 'vitest';
import { TEMPLATES } from '../../src/catalog/templates';
import { buildComponent, defaultParams } from '../../src/geometry/build';

describe('catalogue geometry', () => {
  it('has at least 45 entries', () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(45);
  });
  for (const t of TEMPLATES) {
    it(`${t.id} builds finite, non-empty geometry (both sides)`, () => {
      for (const mirror of [false, true]) {
        const r = buildComponent(t.id, defaultParams(t), 0.002, mirror);
        const pos = r.geometry.getAttribute('position');
        expect(pos.count).toBeGreaterThan(20);
        expect(r.geometry.getIndex()!.count).toBeGreaterThan(30);
        for (let i = 0; i < pos.array.length; i++) if (!Number.isFinite(pos.array[i])) throw new Error(`non-finite position at ${i}`);
        const n = r.geometry.getAttribute('normal');
        for (let i = 0; i < n.array.length; i++) if (!Number.isFinite(n.array[i])) throw new Error(`non-finite normal at ${i}`);
        const bb = r.geometry.boundingBox!;
        expect(bb.max.y - bb.min.y).toBeLessThan(2.2);
        expect(r.handles.length).toBeGreaterThan(0);
        for (const h of r.handles) expect(h.position.every(Number.isFinite)).toBe(true);
      }
    });
  }
});
