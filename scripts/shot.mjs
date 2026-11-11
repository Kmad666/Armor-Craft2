// Dev helper: open the built app in headless Chrome, run an optional script, save screenshots.
// usage: node scripts/shot.mjs out.png ["js to eval in page"] [clip x,y,w,h]
import { chromium } from '@playwright/test';
const [out = 'shots/shot.png', js = '', clip = ''] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
await page.goto(process.env.URL || 'http://localhost:4173');
await page.waitForFunction(() => window.__atelier && window.__atelier.bridge.camera, null, { timeout: 30000 });
await page.evaluate(() => window.__atelier.store.getState().setTutorial(null));
if (js) {
  const r = await page.evaluate(`(async () => { ${js} })()`);
  if (r !== undefined) console.log('RESULT', JSON.stringify(r));
}
await page.waitForTimeout(1500);
const opt = { path: out };
if (clip) { const [x, y, width, height] = clip.split(',').map(Number); opt.clip = { x, y, width, height }; }
await page.screenshot(opt);
if (errors.length) console.log('ERRORS:\n' + errors.slice(0, 12).join('\n'));
await browser.close();
