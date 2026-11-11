import { expect, test } from '@playwright/test';
import { boot, dragHandle, equip, ids, inst, select, setCamera, settle, state, worldBox } from './helpers';

const A = (page: any, fn: string) => page.evaluate(`(() => { const a = window.__atelier; const s = a.store.getState(); ${fn} })()`);

test.describe('editor behaviour', () => {
  test('first run: clean workspace, neutral mannequin, tutorial that can be completed or dismissed', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForFunction(() => (window as any).__atelier?.bridge.camera);
    // empty mannequin, nothing equipped, catalogue populated, no console errors about missing models
    expect(Object.keys((await state(page)).instances).length).toBe(0);
    expect(await A(page, 'return a.bridge.mannequin.size')).toBe(10);
    await expect(page.getByTestId('hierarchy')).toContainText('Nothing equipped yet');
    await expect(page.getByTestId('tutorial')).toContainText('Look around');
    await page.screenshot({ path: 'shots/e2e-first-run.png' });

    // 1 orbit
    const vp = await page.getByTestId('viewport').boundingBox();
    const cx = vp!.x + vp!.width / 2;
    const cy = vp!.y + vp!.height / 2;
    const cam0 = await A(page, 'return a.bridge.camera.position.toArray()');
    await page.mouse.move(cx + 200, cy + 150);
    await page.mouse.down();
    await page.mouse.move(cx + 300, cy + 170, { steps: 6 });
    await page.mouse.up();
    const cam1 = await A(page, 'return a.bridge.camera.position.toArray()');
    expect(Math.hypot(cam1[0] - cam0[0], cam1[2] - cam0[2])).toBeGreaterThan(0.2);
    // zoom
    await page.mouse.wheel(0, -400);
    await settle(page, 400);
    const cam2 = await A(page, 'return a.bridge.camera.position.toArray()');
    expect(Math.hypot(...cam2)).toBeLessThan(Math.hypot(...cam1));
    await expect(page.getByTestId('tutorial')).toContainText('Add a helmet', { timeout: 6000 }); // steps 1 and 2 auto-complete
    // 3 add, 4 select, 5 reshape
    await page.getByTestId('card-helm_kettle').click();
    await expect(page.getByTestId('tutorial')).toContainText('Reshape it', { timeout: 6000 }); // adding selects it
    const helm = (await ids(page, 'helm_kettle'))[0];
    await page.getByTestId('view-quarter').click();
    await settle(page, 900);
    await dragHandle(page, helm, 'height', 0, -50);
    expect((await inst(page, helm)).params.height).toBeGreaterThan(0.1);
    await expect(page.getByTestId('tutorial')).toContainText('Attach an accessory', { timeout: 6000 });
    // 6 accessory, 7 material, 8 save
    await page.getByTestId('cat-accessories').click();
    await page.getByTestId('card-acc_plume').click();
    await page.keyboard.press('Enter'); // auto-place on the selected helmet
    await expect(page.getByTestId('tutorial')).toContainText('Change a material', { timeout: 6000 });
    await select(page, helm);
    await page.getByTestId('tab-material').click();
    await page.getByTestId('mat-gold').click();
    await expect(page.getByTestId('tutorial')).toContainText('Save your design', { timeout: 6000 });
    await page.keyboard.press('Control+s');
    await expect(page.getByTestId('tutorial')).toContainText('armourer', { timeout: 6000 });
    await page.getByTestId('tutorial-done').click();
    await expect(page.getByTestId('tutorial')).toHaveCount(0);
    // not shown again on the next visit; the draft is recovered instead
    await page.reload();
    await page.waitForFunction(() => (window as any).__atelier?.bridge.camera);
    await settle(page, 500);
    await expect(page.getByTestId('tutorial')).toHaveCount(0);
    expect(Object.keys((await state(page)).instances).length).toBe(2);
    // and it can be dismissed immediately when restarted
    await page.getByTestId('btn-help').click();
    await page.getByTestId('start-tutorial').click();
    await page.getByTestId('tutorial-skip').click();
    await expect(page.getByTestId('tutorial')).toHaveCount(0);
  });

  test('move / rotate / scale gizmos, uniform scale and reset', async ({ page }) => {
    await boot(page);
    await equip(page, 'arms', 'pauldron_round');
    const [l, r] = await ids(page, 'pauldron_round');
    await setCamera(page, [0.9, 1.6, 1.6], [0.2, 1.45, 0]);
    await select(page, l);
    await page.keyboard.press('w');
    await settle(page, 300);
    const g = await page.evaluate((i) => (window as any).__atelier.gizmoPoint(i, 1), l);
    await page.mouse.move(g.x, g.y);
    await page.mouse.down();
    await page.mouse.move(g.x, g.y - 30, { steps: 5 });
    await page.mouse.move(g.x, g.y - 70, { steps: 5 });
    await page.mouse.up();
    await settle(page);
    const moved = await inst(page, l);
    expect(Math.hypot(...(moved.transform.position as number[]))).toBeGreaterThan(0.02);
    // the mirrored twin moved the mirrored way
    const twin = await inst(page, r);
    expect(twin.transform.position[0]).toBeCloseTo(-moved.transform.position[0], 6);
    expect(twin.transform.position[1]).toBeCloseTo(moved.transform.position[1], 6);
    await page.screenshot({ path: 'shots/e2e-gizmo.png' });
    // one undo step for the whole drag
    await page.keyboard.press('Control+z');
    expect((await inst(page, l)).transform.position).toEqual([0, 0, 0]);
    await page.keyboard.press('Control+Shift+z');
    expect((await inst(page, l)).transform.position).toEqual(moved.transform.position);
    // rotate + scale tools mount, precise inputs work
    await page.keyboard.press('e');
    await expect(page.getByTestId('tool-rotate')).toHaveClass(/on/);
    await page.keyboard.press('r');
    await expect(page.getByTestId('tool-scale')).toHaveClass(/on/);
    await page.getByTestId('tab-transform').click();
    const b0 = await worldBox(page, l);
    await page.getByTestId('uniform-scale-num').fill('1.5');
    await page.getByTestId('uniform-scale-num').blur();
    await settle(page);
    const b1 = await worldBox(page, l);
    expect(b1.max[1] - b1.min[1]).toBeGreaterThan((b0.max[1] - b0.min[1]) * 1.4);
    await page.getByRole('button', { name: 'Reset transform' }).click();
    expect((await inst(page, l)).transform).toEqual({ position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });
    await page.keyboard.press('t');
    await expect(page.getByTestId('tool-morph')).toHaveClass(/on/);
  });

  test('drag and drop from the catalogue: fitted parts land on the dropped side, accessories attach where dropped', async ({ page }) => {
    await boot(page);
    await page.getByTestId('btn-symmetry').click(); // symmetry off: only the side dropped on
    await page.getByTestId('cat-legs').click();
    const shin = await page.evaluate(() => (window as any).__atelier.projectWorld([-0.13, 0.3, 0.05]));
    const vp = (await page.getByTestId('viewport').boundingBox())!;
    await page.getByTestId('card-leg_greave').dragTo(page.getByTestId('viewport'), { targetPosition: { x: shin.x - vp.x, y: shin.y - vp.y } });
    await settle(page, 400);
    const greaves = await ids(page, 'leg_greave');
    expect(greaves.length).toBe(1);
    expect((await inst(page, greaves[0])).region).toBe('shinR'); // dropped on the mannequin's right leg
    // accessory dropped onto that greave
    await page.getByTestId('cat-accessories').click();
    const spot = await page.evaluate((i) => (window as any).__atelier.surfacePos(i, 0, 0, 0.6), greaves[0]);
    await page.getByTestId('card-acc_boss').dragTo(page.getByTestId('viewport'), { targetPosition: { x: spot.x - vp.x, y: spot.y - vp.y } });
    await settle(page, 400);
    const boss = (await ids(page, 'acc_boss'))[0];
    expect(boss).toBeTruthy();
    expect((await inst(page, boss)).parentId).toBe(greaves[0]);
    expect(await A(page, 'return s.placing')).toBeNull();
    // dropping an accessory on empty space cancels cleanly
    await page.getByTestId('card-acc_rivet').dragTo(page.getByTestId('viewport'), { targetPosition: { x: 40, y: vp.height - 60 } });
    await settle(page, 300);
    expect((await ids(page, 'acc_rivet')).length).toBe(0);
    expect(await A(page, 'return s.placing')).toBeNull();
  });

  test('accessories slide over surfaces, re-parent, mirror, duplicate and respect invalid targets', async ({ page }) => {
    await boot(page);
    await equip(page, 'torso', 'torso_cuirass');
    await equip(page, 'arms', 'pauldron_round');
    const cuirass = (await ids(page, 'torso_cuirass'))[0];
    const [pl, pr] = await ids(page, 'pauldron_round');
    await setCamera(page, [0.5, 1.4, 2.0], [0.05, 1.3, 0]);
    // placement: invalid over empty floor, valid over armour
    await page.getByTestId('cat-accessories').click();
    await page.getByTestId('card-acc_emblem').click();
    const vp = (await page.getByTestId('viewport').boundingBox())!;
    await page.mouse.click(vp.x + 60, vp.y + vp.height - 80);
    await expect(page.getByTestId('toast')).toContainText('attach to armour');
    expect((await ids(page, 'acc_emblem')).length).toBe(0);
    expect(await A(page, 'return s.placing?.templateId')).toBe('acc_emblem'); // still placing
    const chest = await page.evaluate((i) => (window as any).__atelier.surfacePos(i, 0, 0, 0.7), cuirass);
    await page.mouse.move(chest.x, chest.y, { steps: 3 });
    await page.mouse.click(chest.x, chest.y);
    await settle(page, 300);
    const emblem = (await ids(page, 'acc_emblem'))[0];
    expect((await inst(page, emblem)).parentId).toBe(cuirass);
    expect((await ids(page, 'acc_emblem')).length).toBe(1); // centred: no mirrored twin
    // Esc cancels placement mode
    await page.getByTestId('card-acc_rivet').click();
    await page.keyboard.press('Escape');
    expect(await A(page, 'return s.placing')).toBeNull();

    // slide it across the cuirass by dragging the accessory itself
    const a0 = (await inst(page, emblem)).attachment;
    const from = await page.evaluate((i) => (window as any).__atelier.projectLocal(i, [-0.022, -0.022, 0.003]), emblem);
    const to = await page.evaluate((i) => (window as any).__atelier.surfacePos(i, 0, 0.45, 0.45), cuirass);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
    await page.mouse.move(to.x, to.y, { steps: 4 });
    await page.mouse.up();
    await settle(page);
    const a1 = (await inst(page, emblem)).attachment;
    expect(a1.kind).toBe('param');
    expect(Math.abs(a1.u - a0.u) + Math.abs(a1.v - a0.v)).toBeGreaterThan(0.2);
    expect((await inst(page, emblem)).parentId).toBe(cuirass);
    await page.screenshot({ path: 'shots/e2e-slide.png' });
    // ... and onto a different component: it re-parents
    const onPauldron = await page.evaluate((i) => (window as any).__atelier.surfacePos(i, 0, 0.3, 0.6), pl);
    const cur = await page.evaluate((i) => (window as any).__atelier.projectLocal(i, [-0.022, -0.022, 0.003]), emblem);
    await page.mouse.move(cur.x, cur.y);
    await page.mouse.down();
    await page.mouse.move((cur.x + onPauldron.x) / 2, (cur.y + onPauldron.y) / 2, { steps: 4 });
    await page.mouse.move(onPauldron.x, onPauldron.y, { steps: 4 });
    await page.mouse.up();
    await settle(page);
    expect((await inst(page, emblem)).parentId).toBe(pl);
    expect((await inst(page, cuirass)).children).toEqual([]);
    // the whole slide (including the re-parent) is one undo step
    await page.keyboard.press('Control+z');
    expect((await inst(page, emblem)).parentId).toBe(cuirass);
    await page.keyboard.press('Control+Shift+z');
    expect((await inst(page, emblem)).parentId).toBe(pl);

    // mirror the accessory: it appears on the opposite pauldron
    await select(page, emblem);
    await page.keyboard.press('m');
    await settle(page);
    const emblems = await ids(page, 'acc_emblem');
    expect(emblems.length).toBe(2);
    const other = emblems.find((e) => e !== emblem)!;
    expect((await inst(page, other)).parentId).toBe(pr);
    const be = await worldBox(page, emblem);
    const bo = await worldBox(page, other);
    expect((bo.min[0] + bo.max[0]) / 2).toBeCloseTo(-(be.min[0] + be.max[0]) / 2, 2);
    expect((bo.min[1] + bo.max[1]) / 2).toBeCloseTo((be.min[1] + be.max[1]) / 2, 2);
    // duplicate makes an independent copy
    await page.keyboard.press('Control+d');
    await settle(page);
    expect((await ids(page, 'acc_emblem')).length).toBe(3);
    // deleting a parent with accessories asks first
    await select(page, pl);
    await page.keyboard.press('Delete');
    await expect(page.getByTestId('confirm-yes')).toBeVisible();
    await page.getByTestId('confirm-no').click();
    expect(await inst(page, pl)).toBeTruthy();
    await page.keyboard.press('Delete');
    await page.getByTestId('confirm-yes').click();
    expect(await inst(page, pl)).toBeUndefined();
    expect(await inst(page, emblem)).toBeUndefined();
    expect(await inst(page, pr)).toBeTruthy(); // the other side survives, unlinked
    expect((await inst(page, pr)).symmetry.partnerId).toBeNull();
  });

  test('scene list: rename, hide, lock, reorder layers; catalogue search and style filters; camera views', async ({ page }) => {
    await boot(page);
    await equip(page, 'torso', 'torso_cuirass');
    await equip(page, 'torso', 'torso_tabard_long');
    const cuirass = (await ids(page, 'torso_cuirass'))[0];
    const tabard = (await ids(page, 'torso_tabard_long'))[0];
    // rename via double-click
    await page.getByTestId(`tree-${cuirass}`).dblclick();
    await page.locator('.rename').fill('Parade Cuirass');
    await page.keyboard.press('Enter');
    expect((await inst(page, cuirass)).name).toBe('Parade Cuirass');
    // hide / show
    await page.getByTestId(`vis-${cuirass}`).click();
    await settle(page);
    expect(await A(page, `return a.bridge.nodes.has('${cuirass}')`)).toBe(false);
    await page.getByTestId(`vis-${cuirass}`).click();
    await settle(page);
    expect(await A(page, `return a.bridge.nodes.has('${cuirass}')`)).toBe(true);
    // lock: viewport clicks no longer select it and edits are refused
    await page.getByTestId(`tree-${cuirass}`).hover();
    await page.getByTestId(`tree-${cuirass}`).getByTitle('Lock against editing').click();
    await A(page, `s.updateParams('${cuirass}', { width: 1.5 });`);
    expect((await inst(page, cuirass)).params.width).toBe(1);
    await page.getByTestId(`tree-${cuirass}`).getByTitle('Unlock').click();
    // reorder: put the cuirass over the tabard and back
    const f0 = await A(page, 'return s.fitOffsets');
    expect(f0[tabard]).toBeGreaterThan(f0[cuirass]);
    await page.getByTestId(`tree-${cuirass}`).hover();
    await page.getByTestId(`tree-${cuirass}`).getByTitle('Move up a layer').click();
    const f1 = await A(page, 'return s.fitOffsets');
    expect(f1[cuirass]).toBeGreaterThan(f1[tabard]);
    await page.keyboard.press('Control+z');
    // search finds parts across categories; accessories ignore the style filter
    await page.getByTestId('cat-search').fill('horn');
    await expect(page.locator('[data-testid^="card-acc_horn"]')).toHaveCount(4);
    await page.getByTestId('cat-search').fill('');
    await page.getByTestId('cat-head').click();
    await page.getByTestId('era-filter').selectOption('roman');
    await expect(page.getByTestId('card-helm_roman')).toBeVisible();
    await expect(page.getByTestId('card-helm_kabuto')).toHaveCount(0);
    await expect(page.getByTestId('card-acc_faceplate')).toBeVisible();
    await page.getByTestId('cat-accessories').click();
    await expect(page.getByTestId('card-acc_horn_curved')).toBeVisible();
    await page.getByTestId('era-filter').selectOption('all');
    // every catalogue thumbnail in view is a real render
    await page.getByTestId('cat-head').click();
    await expect(page.locator('.card .thumb img').first()).toBeVisible({ timeout: 20000 });
    // camera presets
    for (const [view, axis, sign] of [['front', 2, 1], ['back', 2, -1], ['left', 0, 1], ['right', 0, -1]] as const) {
      await page.getByTestId(`view-${view}`).click();
      await settle(page, 900);
      const p = await A(page, 'return a.bridge.camera.position.toArray()');
      expect(Math.sign(p[axis])).toBe(sign);
      expect(Math.abs(p[axis])).toBeGreaterThan(3);
    }
    // focus on selection moves the orbit target onto the piece
    await select(page, cuirass);
    await page.keyboard.press('f');
    await settle(page, 900);
    const t = await A(page, 'return a.bridge.controls.target.toArray()');
    expect(t[1]).toBeGreaterThan(1.1);
    expect(t[1]).toBeLessThan(1.4);
    await page.getByTestId('view-reset').click();
    // panels collapse to give the viewport more room
    const w0 = (await page.getByTestId('viewport').boundingBox())!.width;
    await page.getByTestId('toggle-left').click();
    await page.getByTestId('toggle-right').click();
    expect((await page.getByTestId('viewport').boundingBox())!.width).toBeGreaterThan(w0 + 400);
    // capture image produces a PNG download
    const dl = page.waitForEvent('download');
    await page.getByTestId('btn-shot').click();
    expect((await dl).suggestedFilename()).toMatch(/\.png$/);
  });

  test('designs dialog: presets open editable, saved designs can be renamed, duplicated and deleted; export downloads JSON', async ({ page }) => {
    await boot(page);
    await page.getByTestId('btn-designs').click();
    await page.getByTestId('preset-gothic').click();
    await settle(page, 1200);
    const d = await state(page);
    expect(d.name).toBe('Gothic-inspired Knight');
    expect(await A(page, 'return a.bridge.nodes.size')).toBe(Object.keys(d.instances).length);
    await page.screenshot({ path: 'shots/e2e-preset-gothic.png' });
    // presets are ordinary editable designs
    const helm = (await ids(page, 'helm_sallet'))[0];
    await A(page, `s.updateParams('${helm}', { tail: 2.4 });`);
    expect((await inst(page, helm)).params.tail).toBe(2.4);
    await page.getByTestId('btn-save').click();
    await page.getByTestId('btn-designs').click();
    await expect(page.locator('.saved-row')).toHaveCount(1);
    await page.locator('[data-testid^="dup-"]').click();
    await expect(page.locator('.saved-row')).toHaveCount(2);
    await expect(page.locator('.saved-row').filter({ hasText: 'copy' })).toHaveCount(1);
    await page.locator('.saved-row').filter({ hasText: 'copy' }).getByTitle('Delete').click();
    await page.getByTestId('confirm-yes').click();
    await expect(page.locator('.saved-row')).toHaveCount(1);
    await page.keyboard.press('Escape');
    const dl = page.waitForEvent('download');
    await page.getByTestId('btn-export').click();
    const file = await dl;
    expect(file.suggestedFilename()).toBe('gothic-inspired-knight.armor.json');
    // New asks before discarding unsaved work
    await A(page, `s.updateParams('${helm}', { tail: 1.0 });`);
    await page.getByTestId('btn-new').click();
    await page.getByTestId('confirm-no').click();
    expect(Object.keys((await state(page)).instances).length).toBeGreaterThan(10);
    await page.getByTestId('btn-new').click();
    await page.getByTestId('confirm-yes').click();
    expect(Object.keys((await state(page)).instances).length).toBe(0);
    for (const p of ['roman', 'horned']) {
      await page.getByTestId('btn-designs').click();
      await page.getByTestId(`preset-${p}`).click();
      await settle(page, 1500);
      await page.screenshot({ path: `shots/e2e-preset-${p}.png` });
    }
  });
});
