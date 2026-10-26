// Phase 6 + 7 verification (dev only). Prints a JSON report and writes
// screenshots to screenshots/verify-*.png. Upstream data comes from
// tests/fixtures at the network layer; one fixture is edited to force a
// warning so gold/warning isolation can be checked.
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync } from 'node:fs';

const fixtures = JSON.parse(readFileSync(new URL('../tests/fixtures/modules.json', import.meta.url)));
// Force a warned card: the portfolio is down 4.2% today.
const warned = structuredClone(fixtures.stocks);
warned.data.dayChangePct = -4.2;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.route('**/api/modules/*', (route) => {
  const id = new URL(route.request().url()).pathname.split('/').pop();
  if (id === 'stocks') return route.fulfill({ json: warned });
  if (fixtures[id]) return route.fulfill({ json: fixtures[id] });
  return route.continue();
});
await page.goto('http://localhost:3000/?tier=0');
await page.waitForTimeout(24000);
const report = {};
const ev = (fn, arg) => page.evaluate(fn, arg);
const cardUniforms = () =>
  ev(() => {
    const out = {};
    __three.scene.traverse((o) => {
      if (o.isMesh && o.userData.module) out[o.userData.module] = { gold: +o.material.uniforms.uGold.value.toFixed(4), warn: o.material.uniforms.uWarn.value };
    });
    return out;
  });

// 1. Measured stillness: motion locked by default; zero input for 5 s.
report.stillness = await ev(() => __divina.verifyStillness(5000));

// 2. Gold / warning isolation.
report.goldCentred = (await cardUniforms()).instagram;
await ev(() => __divina.bus.emit({ type: 'rotate', steps: 1, source: 'system' }));
await page.waitForTimeout(12000);
const u = await cardUniforms();
report.warnedCardAtCentre = { module: 'stocks', ...u.stocks, front: await ev(() => __divina.stores.ring.getState().frontStep) };
await page.screenshot({ path: 'screenshots/verify-warned-centre.png' });

// 3. Embodiment: journey screenshots, then the figure holds still.
await ev(() => __divina.bus.emit({ type: 'transform', to: 'human', source: 'palette' }));
await page.waitForTimeout(1500);
for (const [t, name] of [[1.6, 'collapsing'], [3.95, 'core'], [5.5, 'skeleton'], [7.3, 'forming'], [9.6, 'active']]) {
  await ev((x) => __divina.clock.seekEmbodiment(x), t);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `screenshots/verify-emb-${name}.png` });
}
report.phase = await ev(() => __divina.clock.embodyPhase);
report.figureStill = await ev(async () => {
  const s0 = JSON.stringify({ h: Array.from(__divina.rig.headR.elements), j: __divina.rig.jaw, b: __divina.rig.breath, m: __divina.rig.mouth });
  let changed = 0;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 100));
    const s = JSON.stringify({ h: Array.from(__divina.rig.headR.elements), j: __divina.rig.jaw, b: __divina.rig.breath, m: __divina.rig.mouth });
    if (s !== s0) changed++;
  }
  return { samples: 40, changed, jaw: __divina.rig.jaw, mouth: __divina.rig.mouth, breath: __divina.rig.breath };
});

// 4. Mouth: closed in silence, moves with the (local) voice.
report.mouth = await ev(async () => {
  const silent = __divina.rig.mouth;
  __divina.voice.simulateLocal('Your portfolio is up point seven percent today, led by Nvidia and ASML.');
  const seen = new Set();
  let maxJaw = 0;
  for (let i = 0; i < 45; i++) {
    await new Promise((r) => setTimeout(r, 90));
    seen.add(__divina.rig.mouth);
    maxJaw = Math.max(maxJaw, __divina.rig.jaw);
  }
  await new Promise((r) => setTimeout(r, 2500));
  return { silentBefore: silent, steps: [...seen].sort(), maxJawRad: +maxJaw.toFixed(3), closedAfter: __divina.rig.mouth };
});

// 5. Hand presents a panel; the panel does not move once settled.
await ev(() => __divina.bus.emit({ type: 'open', module: 'weather', source: 'palette' }));
await page.waitForTimeout(4000);
await page.screenshot({ path: 'screenshots/verify-hand.png' });
await page.waitForTimeout(9000);
report.panel = await ev(async () => {
  const el = document.querySelector('section[aria-label$="summary"]');
  if (!el) return { found: false };
  const r0 = el.getBoundingClientRect();
  let maxDelta = 0;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 100));
    const r = el.getBoundingClientRect();
    maxDelta = Math.max(maxDelta, Math.abs(r.x - r0.x), Math.abs(r.y - r0.y));
  }
  return { found: true, x: Math.round(r0.x), y: Math.round(r0.y), maxDeltaPx: maxDelta };
});
await page.screenshot({ path: 'screenshots/verify-panel-settled.png' });

// 6. Rotation is refused while embodied; the return runs the clock backward.
report.rotateWhileEmbodied = await ev(async () => {
  const before = __divina.stores.ring.getState().frontStep;
  __divina.bus.emit({ type: 'rotate', steps: 1, source: 'hand' });
  __divina.bus.emit({ type: 'rotate', steps: 1, source: 'voice' });
  return { before, after: __divina.stores.ring.getState().frontStep };
});
await ev(() => __divina.bus.emit({ type: 'transform', to: 'spatial', source: 'palette' }));
await page.waitForTimeout(1200);
report.returning = await ev(() => __divina.clock.embodyPhase);
await ev(() => __divina.clock.seekEmbodiment(2.2));
await page.waitForTimeout(2500);
await page.screenshot({ path: 'screenshots/verify-return.png' });
await ev(() => __divina.clock.seekEmbodiment(0));
await page.waitForTimeout(3000);
report.backToNormal = await ev(() => __divina.clock.embodyPhase);
await page.screenshot({ path: 'screenshots/verify-normal-again.png' });
report.pageErrors = errors;
writeFileSync('screenshots/verify-report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
