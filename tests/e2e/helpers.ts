import { expect, type Page } from '@playwright/test';

export async function boot(page: Page, opts: { keepStorage?: boolean } = {}) {
  await page.goto('/');
  if (!opts.keepStorage) {
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  }
  await page.waitForFunction(() => (window as any).__atelier?.bridge.camera, null, { timeout: 30_000 });
  await page.evaluate(() => (window as any).__atelier.store.getState().setTutorial(null));
  await page.waitForTimeout(300);
}

/** Equip a part through the catalogue UI (category tab + card click). */
export async function equip(page: Page, category: string, templateId: string) {
  await page.getByTestId(`cat-${category}`).click();
  await page.getByTestId(`card-${templateId}`).click();
}

export const state = (page: Page) => page.evaluate(() => (window as any).__atelier.store.getState().design);

export async function ids(page: Page, templateId: string): Promise<string[]> {
  return page.evaluate((t) => Object.values((window as any).__atelier.store.getState().design.instances).filter((i: any) => i.templateId === t).map((i: any) => i.id), templateId);
}

export async function inst(page: Page, id: string): Promise<any> {
  return page.evaluate((i) => (window as any).__atelier.store.getState().design.instances[i], id);
}

export async function settle(page: Page, ms = 250) {
  await page.waitForTimeout(ms);
}

/** Drag a morph handle of the selected component by a screen-space delta using the real mouse. */
export async function dragHandle(page: Page, id: string, handle: string, dx: number, dy: number) {
  const p = await page.evaluate(([i, h]) => (window as any).__atelier.handlePos(i, h), [id, handle]);
  expect(p, `handle ${handle} should be on screen`).toBeTruthy();
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  const steps = 8;
  for (let k = 1; k <= steps; k++) await page.mouse.move(p.x + (dx * k) / steps, p.y + (dy * k) / steps);
  await page.mouse.up();
  await settle(page);
}

export async function select(page: Page, id: string) {
  await page.evaluate((i) => (window as any).__atelier.store.getState().select(i), id);
  await settle(page, 150);
}

export async function worldBox(page: Page, id: string): Promise<{ min: number[]; max: number[] }> {
  return page.evaluate((i) => (window as any).__atelier.worldBox(i), id);
}

export async function setCamera(page: Page, pos: number[], target: number[]) {
  await page.evaluate(([p, t]) => {
    const a = (window as any).__atelier;
    a.bridge.cameraAnim = null;
    a.bridge.camera.position.set(p[0], p[1], p[2]);
    a.bridge.controls.target.set(t[0], t[1], t[2]);
    a.bridge.controls.update();
    a.bridge.invalidate();
  }, [pos, target]);
  await settle(page, 300);
}

/** Structure of a design with volatile fields removed, for save/load comparisons. */
export function normalise(d: any) {
  const inst = Object.values(d.instances as Record<string, any>)
    .map((i) => ({ ...i }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return { name: d.name, symmetry: d.symmetry, roots: [...d.roots], inst };
}
