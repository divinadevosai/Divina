// Visual verification harness (dev only). Upstream data is replaced with
// tests/fixtures/modules.json at the network layer — the app itself never
// ships fake data.
//   node scripts/shoot.mjs <name> [--wait=ms] [--eval="js"] [--tier=n] [--size=WxH]
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(3).map((a) => a.replace(/^--/, '').split(/=(.*)/s)));
const name = process.argv[2] ?? 'shot';
const fixtures = JSON.parse(readFileSync(new URL('../tests/fixtures/modules.json', import.meta.url)));
const [w, h] = (args.size ?? '1440x900').split('x').map(Number);

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.route('**/api/modules/*', async (route) => {
  const id = new URL(route.request().url()).pathname.split('/').pop();
  if (fixtures[id]) return route.fulfill({ json: fixtures[id] });
  return route.continue();
});
await page.goto(`http://localhost:3000/?tier=${args.tier ?? 1}${args.q ? '&' + args.q : ''}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(Number(args.wait ?? 7000));
const steps = (args.eval ?? '').split(';;').filter(Boolean);
for (const s of steps) {
  if (s.startsWith('wait:')) { await page.waitForTimeout(Number(s.slice(5))); continue; }
  if (s.startsWith('shot:')) { await page.screenshot({ path: `screenshots/${s.slice(5)}.png` }); continue; }
  if (s.startsWith('key:')) { await page.keyboard.press(s.slice(4)); continue; }
  const r = await page.evaluate(s).catch((e) => `EVAL ERROR ${e.message}`);
  if (r !== undefined) console.log('eval>', typeof r === 'string' ? r : JSON.stringify(r));
}
await page.screenshot({ path: `screenshots/${name}.png` });
const uniq=[...new Set(logs)]; console.log(uniq.filter((l) => !l.includes('[debug]') || args.debug).slice(-40).join('\n'));
await browser.close();
