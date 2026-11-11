// Dev helper: equip sets of parts on the mannequin and tile the renders into one sheet.
// usage: node scripts/gallery.mjs out.png '<json: {cam:[pos,target], cols, cell, items:[{label, add:[ids], js?}]}>'
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const [out, spec] = process.argv.slice(2);
const cfg = JSON.parse(spec);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-background-networking', '--disable-component-update', '--no-first-run', '--disable-sync'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(process.env.URL || 'http://localhost:4173');
await page.waitForFunction(() => window.__atelier && window.__atelier.bridge.camera, null, { timeout: 30000 });
const url = await page.evaluate(async (cfg) => {
  const a = window.__atelier;
  const S = () => a.store.getState();
  S().setTutorial(null); S().togglePanel('left'); S().togglePanel('right');
  await new Promise((r) => setTimeout(r, 400));
  const cols = cfg.cols || 4, cell = cfg.cell || 300;
  const sheet = document.createElement('canvas');
  sheet.width = cols * cell; sheet.height = Math.ceil(cfg.items.length / cols) * (cell + 16);
  const ctx = sheet.getContext('2d');
  ctx.fillStyle = '#222'; ctx.fillRect(0, 0, sheet.width, sheet.height);
  ctx.font = '12px sans-serif';
  for (let i = 0; i < cfg.items.length; i++) {
    const it = cfg.items[i];
    S().newDesign();
    for (const id of it.add || []) { if (a.templateById[id].kind === 'fitted') S().addFitted(id); else { const sel = S().design.roots[S().design.roots.length - 1]; S().autoAttach(id, it.on ? S().design.roots[it.on] : sel); } }
    if (it.js) new Function('a', 'S', it.js)(a, S);
    S().select(null);
    const cam = it.cam || cfg.cam;
    a.bridge.cameraAnim = null;
    a.bridge.camera.position.set(...cam[0]); a.bridge.controls.target.set(...cam[1]); a.bridge.controls.update();
    await new Promise((r) => setTimeout(r, 250));
    a.bridge.gl.render(a.bridge.scene, a.bridge.camera);
    const c = a.bridge.gl.domElement; const side = Math.min(c.width, c.height);
    const x = (i % cols) * cell, y = Math.floor(i / cols) * (cell + 16);
    ctx.drawImage(c, (c.width - side) / 2, (c.height - side) / 2, side, side, x, y, cell, cell);
    ctx.fillStyle = '#fff'; ctx.fillText(it.label || (it.add || []).join('+'), x + 4, y + cell + 12);
  }
  return sheet.toDataURL('image/png');
}, cfg);
fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
if (errors.length) console.log('ERRORS', errors.slice(0, 5));
await browser.close();
