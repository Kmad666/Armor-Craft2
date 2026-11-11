// Dev helper: render every catalogue thumbnail into contact sheets for visual QA.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-background-networking', '--disable-component-update', '--no-first-run', '--disable-sync'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
await page.goto(process.env.URL || 'http://localhost:4173');
await page.waitForFunction(() => window.__atelier && window.__atelier.bridge.camera, null, { timeout: 30000 });
const sheets = await page.evaluate(async () => {
  const a = window.__atelier;
  const ids = a.templates.map((t) => t.id);
  ids.forEach((id) => a.thumbs.request(id));
  await new Promise((res) => { const t = setInterval(() => { if (ids.every((id) => a.thumbs.store.getState().urls[id] !== undefined)) { clearInterval(t); res(); } }, 200); });
  const urls = a.thumbs.store.getState().urls;
  const per = 35, cols = 7, cell = 168, out = [];
  for (let s = 0; s < ids.length; s += per) {
    const part = ids.slice(s, s + per);
    const c = document.createElement('canvas');
    c.width = cols * cell; c.height = Math.ceil(part.length / cols) * (cell + 18);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#3a3c41'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.font = '11px sans-serif'; ctx.fillStyle = '#fff';
    for (let i = 0; i < part.length; i++) {
      const img = new Image(); img.src = urls[part[i]];
      await img.decode().catch(() => {});
      const x = (i % cols) * cell, y = Math.floor(i / cols) * (cell + 18);
      try { ctx.drawImage(img, x, y); } catch {}
      ctx.fillText(part[i], x + 4, y + cell + 12);
    }
    out.push(c.toDataURL('image/png'));
  }
  return out;
});
sheets.forEach((u, i) => fs.writeFileSync(`shots/sheet-${i}.png`, Buffer.from(u.split(',')[1], 'base64')));
console.log('sheets', sheets.length);
await browser.close();
