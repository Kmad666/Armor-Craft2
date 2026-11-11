import { expect, test } from '@playwright/test';
import { boot, dragHandle, equip, ids, inst, normalise, select, setCamera, settle, state, worldBox } from './helpers';

const A = (page: any, fn: string) => page.evaluate(`(() => { const a = window.__atelier; const s = a.store.getState(); ${fn} })()`);

test.describe('acceptance scenarios', () => {
  test('A: a complete suit can be assembled from the catalogue', async ({ page }) => {
    await boot(page);
    const picks: [string, string][] = [
      ['head', 'helm_great'],
      ['torso', 'torso_cuirass'],
      ['arms', 'pauldron_round'],
      ['arms', 'arm_rerebrace'],
      ['arms', 'arm_vambrace'],
      ['hands', 'hand_gauntlet'],
      ['legs', 'leg_cuisse'],
      ['legs', 'leg_greave'],
      ['feet', 'foot_sabaton'],
    ];
    for (const [c, t] of picks) await equip(page, c, t);
    await settle(page, 600);
    const d = await state(page);
    const regions = new Set(Object.values(d.instances).map((i: any) => i.region));
    for (const r of ['skull', 'chest', 'shoulderL', 'shoulderR', 'upperArmL', 'upperArmR', 'forearmL', 'forearmR', 'handL', 'handR', 'thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR']) expect(regions.has(r), `region ${r} covered`).toBe(true);
    // every instance is an independently rendered, selectable mesh
    const rendered = await A(page, 'return [...a.bridge.nodes.keys()].length');
    expect(rendered).toBe(Object.keys(d.instances).length);
    // clicking a piece in the viewport selects it
    const gid = (await ids(page, 'torso_cuirass'))[0];
    const p = await page.evaluate((i) => (window as any).__atelier.surfacePos(i, 0, 0, 0.5), gid);
    await page.mouse.click(p.x, p.y);
    await settle(page);
    expect(await A(page, 'return s.selectedId')).toBe(gid);
    await select(page, '');
    await page.screenshot({ path: 'shots/e2e-A-suit.png' });
  });

  test('B + C: layered torso, cuirass trimming reveals the layers underneath and is reversible', async ({ page }) => {
    await boot(page);
    await equip(page, 'torso', 'torso_tunic');
    await equip(page, 'torso', 'torso_mail');
    await equip(page, 'torso', 'torso_cuirass');
    await settle(page, 500);
    const tunic = (await ids(page, 'torso_tunic'))[0];
    const mail = (await ids(page, 'torso_mail'))[0];
    const cuirass = (await ids(page, 'torso_cuirass'))[0];
    // three separate objects with strictly increasing shell offsets
    const fit = await A(page, 'return s.fitOffsets');
    expect(fit[tunic]).toBeLessThan(fit[mail]);
    expect(fit[mail]).toBeLessThan(fit[cuirass]);
    // each is independently selectable from the scene list
    for (const id of [tunic, mail, cuirass]) {
      await page.getByTestId(`tree-${id}`).click();
      expect(await A(page, 'return s.selectedId')).toBe(id);
    }
    await setCamera(page, [0.25, 1.2, 2.3], [0, 1.15, 0]);
    await select(page, cuirass);
    await page.screenshot({ path: 'shots/e2e-B-layers-before.png' });

    const before = await worldBox(page, cuirass);
    const p0 = (await inst(page, cuirass)).params;
    // a point low on the cuirass front currently hits the cuirass
    const probe = await page.evaluate((i) => (window as any).__atelier.surfacePos(i, 0, 0.35, 0.12), cuirass);
    await select(page, '');
    expect(await page.evaluate((q) => (window as any).__atelier.pick(q.x, q.y)?.id, probe)).toBe(cuirass);

    // drag the bottom-edge handle UP with the mouse
    await select(page, cuirass);
    await dragHandle(page, cuirass, 'trimBottom', 0, -110);
    const p1 = (await inst(page, cuirass)).params;
    const after = await worldBox(page, cuirass);
    expect(p1.trimBottom).toBeGreaterThan(p0.trimBottom + 0.05);
    expect(after.min[1]).toBeGreaterThan(before.min[1] + 0.05); // lower boundary moved up
    expect(Math.abs(after.max[1] - before.max[1])).toBeLessThan(0.004); // top stayed in place
    expect((await inst(page, cuirass)).transform.position).toEqual([0, 0, 0]); // it was not simply moved
    // the same screen point now shows the mail underneath
    await select(page, '');
    expect(await page.evaluate((q) => (window as any).__atelier.pick(q.x, q.y)?.id, probe)).toBe(mail);
    await page.screenshot({ path: 'shots/e2e-B-layers-trimmed.png' });

    // hiding the mail as well reveals the tunic: layers are real separate objects
    await page.getByTestId(`vis-${mail}`).click();
    await settle(page);
    expect(await page.evaluate((q) => (window as any).__atelier.pick(q.x, q.y)?.id, probe)).toBe(tunic);
    await page.getByTestId(`vis-${mail}`).click();

    // drag back DOWN: the geometry comes back
    await select(page, cuirass);
    await dragHandle(page, cuirass, 'trimBottom', 0, 110);
    const restored = await worldBox(page, cuirass);
    expect(Math.abs(restored.min[1] - before.min[1])).toBeLessThan(0.02);

    // C: width, front hem (lower profile) change the mesh and can be undone
    await dragHandle(page, cuirass, 'width', 60, 0);
    const wide = await worldBox(page, cuirass);
    expect(wide.max[0] - wide.min[0]).toBeGreaterThan(before.max[0] - before.min[0] + 0.02);
    await dragHandle(page, cuirass, 'frontDip', 0, -60);
    expect((await inst(page, cuirass)).params.frontDip).toBeGreaterThan(0.02);
    await page.screenshot({ path: 'shots/e2e-C-reshaped.png' });
    // each drag is ONE undo step
    await page.getByTestId('btn-undo').click();
    expect((await inst(page, cuirass)).params.frontDip).toBeCloseTo(p0.frontDip, 5);
    await page.getByTestId('btn-undo').click();
    expect((await inst(page, cuirass)).params.width).toBeCloseTo(p0.width, 5);
    await page.getByTestId('btn-redo').click();
    expect((await inst(page, cuirass)).params.width).toBeGreaterThan(p0.width);
    // reset restores the template shape without touching materials
    await page.getByTestId('tab-shape').click();
    await page.getByRole('button', { name: 'Reset shape' }).click();
    expect((await inst(page, cuirass)).params.width).toBeCloseTo(1, 5);
  });

  test('D: Roman helmet + faceplate placed on the lower face, attached, saved and reopened', async ({ page }) => {
    await boot(page);
    await equip(page, 'head', 'helm_roman');
    await settle(page, 400);
    const helm = (await ids(page, 'helm_roman'))[0];
    await setCamera(page, [0.5, 1.7, 1.25], [0, 1.66, 0]);
    // choose the faceplate, then click the mouth/jaw area of the mannequin
    await page.getByTestId('card-acc_faceplate').click();
    expect(await A(page, 'return s.placing?.templateId')).toBe('acc_faceplate');
    const mouth = await page.evaluate(() => (window as any).__atelier.projectWorld([0, 1.612, 0.1]));
    await page.mouse.move(mouth.x - 30, mouth.y - 10);
    await page.mouse.move(mouth.x, mouth.y, { steps: 4 });
    await page.screenshot({ path: 'shots/e2e-D-ghost.png' });
    await page.mouse.click(mouth.x, mouth.y);
    await settle(page, 400);
    const plate = (await ids(page, 'acc_faceplate'))[0];
    expect(plate).toBeTruthy();
    const pi = await inst(page, plate);
    expect(pi.parentId).toBe(helm); // attached into the helmet's hierarchy
    expect((await inst(page, helm)).children).toContain(plate);
    expect(await A(page, `return a.bridge.nodes.get('${plate}').mesh !== a.bridge.nodes.get('${helm}').mesh`)).toBe(true); // separate mesh
    const box = await worldBox(page, plate);
    expect(box.min[1]).toBeGreaterThan(1.53);
    expect(box.max[1]).toBeLessThan(1.69); // sits over mouth and jaw
    expect(box.max[2]).toBeGreaterThan(0.09);
    await page.screenshot({ path: 'shots/e2e-D-faceplate.png' });

    // own material, independent of the helmet
    await select(page, plate);
    await page.getByTestId('tab-material').click();
    await page.getByTestId('mat-darkSteel').click();
    expect((await inst(page, plate)).materials.base.preset).toBe('darkSteel');
    expect((await inst(page, helm)).materials.base.preset).toBe('bronze');
    // resizable / deformable / rotatable
    await A(page, `s.updateParams('${plate}', { width: 0.2, point: 0.6 }); s.updateTransform('${plate}', { rotation: [0.1, 0, 0], scale: [1.1, 1.1, 1.1] });`);
    // stays attached when the helmet is moved and rotated
    const b0 = await worldBox(page, plate);
    await A(page, `s.updateTransform('${helm}', { position: [0, 0.1, 0], rotation: [0, 0.4, 0] });`);
    await settle(page);
    const b1 = await worldBox(page, plate);
    expect(b1.min[1] - b0.min[1]).toBeGreaterThan(0.08);
    expect(Math.abs((b1.max[0] + b1.min[0]) / 2)).toBeGreaterThan(0.02); // swung round with the helmet
    await A(page, `s.updateTransform('${helm}', { position: [0, 0, 0], rotation: [0, 0, 0] });`);

    // save, reload the application, load
    await page.getByTestId('design-name').fill('Closed Roman Helm');
    await page.getByTestId('btn-save').click();
    const saved = normalise(await state(page));
    await page.reload();
    await page.waitForFunction(() => (window as any).__atelier?.bridge.camera);
    await A(page, 's.setTutorial(null); s.newDesign();');
    expect(Object.keys((await state(page)).instances).length).toBe(0);
    await page.getByTestId('btn-designs').click();
    await page.locator('[data-testid^="load-"]').first().click();
    await settle(page, 500);
    expect(normalise(await state(page))).toEqual(saved);
    expect((await inst(page, plate)).parentId).toBe(helm);

    // the plate can be removed without destroying the helmet
    await select(page, plate);
    await page.keyboard.press('Delete');
    await settle(page);
    expect(await inst(page, plate)).toBeUndefined();
    expect(await inst(page, helm)).toBeTruthy();
  });

  test('E: spangenhelm with two horns - mirrored, then edited independently; survives save/load', async ({ page }) => {
    await boot(page);
    await equip(page, 'head', 'helm_spangen');
    await settle(page, 400);
    const helm = (await ids(page, 'helm_spangen'))[0];
    await setCamera(page, [0.9, 1.95, 1.1], [0, 1.74, 0]);
    await page.getByTestId('cat-accessories').click();
    await page.getByTestId('card-acc_horn_curved').click();
    // click the side of the dome
    const spot = await page.evaluate((i) => (window as any).__atelier.surfacePos(i, 0, 1.15, 0.7), helm);
    await page.mouse.move(spot.x + 5, spot.y + 5);
    await page.mouse.move(spot.x, spot.y, { steps: 3 });
    await page.mouse.click(spot.x, spot.y);
    await settle(page, 400);
    const horns = await ids(page, 'acc_horn_curved');
    expect(horns.length).toBe(2); // symmetry created the opposite horn
    const [h1, h2] = horns;
    const i1 = await inst(page, h1);
    const i2 = await inst(page, h2);
    expect(i1.parentId).toBe(helm);
    expect(i2.parentId).toBe(helm);
    expect(i1.attachment.kind).toBe('param'); // rides the parametric surface
    const b1 = await worldBox(page, h1);
    const b2 = await worldBox(page, h2);
    expect((b1.min[0] + b1.max[0]) / 2).toBeGreaterThan(0.05);
    expect((b2.min[0] + b2.max[0]) / 2).toBeLessThan(-0.05);
    expect(Math.abs(b1.max[0] + b2.min[0])).toBeLessThan(0.01); // true mirror images
    // linked: editing one edits both
    await A(page, `s.updateParams('${h1}', { length: 0.28 });`);
    expect((await inst(page, h2)).params.length).toBeCloseTo(0.28, 5);
    // horns follow the helmet when its dome is stretched (attachment rides the surface)
    await A(page, `s.updateParams('${helm}', { height: 0.2 });`);
    await settle(page);
    const b1s = await worldBox(page, h1);
    expect(b1s.min[1]).toBeGreaterThan(b1.min[1] + 0.02);
    // break the link -> one big horn, one small horn
    await select(page, h2);
    await page.getByTestId('break-link').click();
    await A(page, `s.updateParams('${h2}', { length: 0.1, radius: 0.015, curvature: 0.6 }); s.setMaterial('${h2}', 'base', { color: '#222222' });`);
    expect((await inst(page, h1)).params.length).toBeCloseTo(0.28, 5);
    expect((await inst(page, h2)).params.length).toBeCloseTo(0.1, 5);
    expect((await inst(page, h1)).materials.base.color).not.toBe('#222222');
    // horns stay parented when the helmet moves
    const before = await worldBox(page, h1);
    await A(page, `s.updateTransform('${helm}', { position: [0, 0.05, 0] });`);
    await settle(page);
    expect((await worldBox(page, h1)).min[1] - before.min[1]).toBeCloseTo(0.05, 2);
    await page.screenshot({ path: 'shots/e2e-E-horns.png' });

    await page.getByTestId('btn-save').click();
    const saved = normalise(await state(page));
    await page.reload();
    await page.waitForFunction(() => (window as any).__atelier?.bridge.camera);
    await A(page, 's.setTutorial(null); s.newDesign();');
    await page.getByTestId('btn-designs').click();
    await page.locator('[data-testid^="load-"]').first().click();
    await settle(page, 500);
    expect(normalise(await state(page))).toEqual(saved);
    // still editable after loading
    await A(page, `s.updateParams('${h2}', { length: 0.2 });`);
    expect((await inst(page, h2)).params.length).toBeCloseTo(0.2, 5);
  });

  test('F: materials are independent per component and per region', async ({ page }) => {
    await boot(page);
    await equip(page, 'torso', 'torso_tunic');
    await equip(page, 'torso', 'torso_cuirass');
    const tunic = (await ids(page, 'torso_tunic'))[0];
    const cuirass = (await ids(page, 'torso_cuirass'))[0];
    await select(page, cuirass);
    await page.getByTestId('tab-material').click();
    await page.getByTestId('mat-darkSteel').click();
    await page.getByTestId('slot-trim').click();
    await page.getByTestId('mat-brass').click();
    await select(page, tunic);
    await page.getByTestId('tab-material').click();
    await page.getByTestId('slot-base').click();
    await page.getByTestId('mat-wool').click();
    await page.getByTestId('mat-color-hex').fill('#b3261e');
    const c = await inst(page, cuirass);
    const t = await inst(page, tunic);
    expect(c.materials.base.preset).toBe('darkSteel');
    expect(c.materials.trim.preset).toBe('brass');
    expect(t.materials.base.color).toBe('#b3261e');
    expect(t.materials.base.kind).toBe('fabric');
    expect(t.materials.base.metalness).toBe(0); // red fabric stays fabric
    expect(c.materials.base.metalness).toBe(1); // dark steel stays metal
    await setCamera(page, [0.5, 1.3, 2.0], [0, 1.2, 0]);
    await select(page, '');
    await page.screenshot({ path: 'shots/e2e-F-materials.png' });
  });

  test('G: a complex design round-trips through save, reload and JSON export/import', async ({ page }) => {
    await boot(page);
    await A(page, 's.replaceDesign(a.presets[2].build());');
    await settle(page, 800);
    await page.getByTestId('btn-save').click();
    const saved = normalise(await state(page));
    expect(saved.inst.length).toBeGreaterThan(20);
    const json = await A(page, 'return s.exportJSON()');
    await page.reload();
    await page.waitForFunction(() => (window as any).__atelier?.bridge.camera);
    // autosave recovered the draft; start clean and load the explicit save
    await A(page, 's.setTutorial(null); s.newDesign();');
    await page.getByTestId('btn-designs').click();
    await page.locator('[data-testid^="load-"]').first().click();
    await settle(page, 800);
    expect(normalise(await state(page))).toEqual(saved);
    expect(await A(page, 'return a.bridge.nodes.size')).toBe(saved.inst.length);
    // import of the exported file reproduces the same structure
    await A(page, 's.newDesign();');
    await page.getByTestId('import-file').setInputFiles({ name: 'guardian.armor.json', mimeType: 'application/json', buffer: Buffer.from(json) });
    await settle(page, 600);
    const imported = normalise(await state(page));
    expect(imported.inst).toEqual(saved.inst);
    // malformed files give a readable error and leave the app running
    await page.getByTestId('import-file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{ not json') });
    await page.getByTestId('confirm-yes').click();
    await expect(page.getByTestId('toast')).toContainText('not valid JSON');
    await page.getByTestId('import-file').setInputFiles({ name: 'other.json', mimeType: 'application/json', buffer: Buffer.from('{"app":"armor-atelier","schema":99,"instances":{}}') });
    await page.getByTestId('confirm-yes').click();
    await expect(page.getByTestId('toast')).toContainText('newer version');
    expect(normalise(await state(page)).inst).toEqual(saved.inst);
    await page.screenshot({ path: 'shots/e2e-G-loaded.png' });
  });

  test('H: a decorated helmet is saved as a custom part and placed on a new mannequin', async ({ page }) => {
    await boot(page);
    await equip(page, 'head', 'helm_spangen');
    const helm = (await ids(page, 'helm_spangen'))[0];
    await A(page, `s.updateParams('${helm}', { height: 0.19 }); s.autoAttach('acc_horn_curved', '${helm}'); s.autoAttach('acc_faceplate', '${helm}');`);
    await select(page, helm);
    await page.getByTestId('save-custom').click();
    await page.getByTestId('custom-name').fill('Horned Guard Helmet');
    await page.getByTestId('custom-save-confirm').click();
    const before = await inst(page, helm);
    // brand-new design, then place the saved assembly from the Custom category
    await A(page, 's.newDesign();');
    await page.getByTestId('cat-custom').click();
    await page.locator('[data-testid^="custom-"]').filter({ hasText: 'Horned Guard Helmet' }).click();
    await settle(page, 500);
    const d = await state(page);
    const all = Object.values(d.instances) as any[];
    const root = all.find((i) => i.templateId === 'helm_spangen');
    expect(root.name).toBe('Horned Guard Helmet');
    expect(root.params.height).toBeCloseTo(0.19, 5);
    expect(root.children.length).toBe(before.children.length);
    expect(all.filter((i) => i.templateId === 'acc_horn_curved').length).toBe(2);
    expect(all.filter((i) => i.templateId === 'acc_faceplate').every((i) => i.parentId === root.id)).toBe(true);
    // the original template is untouched
    await equip(page, 'head', 'helm_spangen');
    const fresh = (await ids(page, 'helm_spangen')).map((id) => id).filter((id) => id !== root.id)[0];
    expect((await inst(page, fresh)).params.height).toBeCloseTo(0.128, 5);
    expect((await inst(page, fresh)).children.length).toBe(0);
    // custom parts persist across reloads
    await page.reload();
    await page.waitForFunction(() => (window as any).__atelier?.bridge.camera);
    expect(await A(page, 'return s.customParts.length')).toBe(1);
    await page.screenshot({ path: 'shots/e2e-H-custom.png' });
  });
});
