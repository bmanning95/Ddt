// Usage: node scripts/shot.mjs <url> <out.png> [waitMs] [js-to-eval-before-shot]
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }
const [,, url, out, wait = '2500', script = '', w = '1280', h = '720'] = process.argv;
const browser = await pw.chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(+wait);
if (script) {
  const r = await page.evaluate(script);
  if (r !== undefined) logs.push('[eval] ' + JSON.stringify(r));
  await page.waitForTimeout(1200);
}
await page.screenshot({ path: out });
console.log(logs.join('\n'));
await browser.close();
