// Browser test for the website's /extension connection check.
// It serves the PRODUCTION build of the website (apps/web/.next) through Playwright route
// interception, loads the real unpacked extension bundle, and drives the page UI.
// This is a Chromium fixture test. It does not contact live DNS, the live site, or Gemini.
//
// Requires: `npm run build` in apps/web with NEXT_PUBLIC_SITE_ORIGIN=https://resumemate.prajwalkedari.tech
// Optional env: RM_WEB_OUT (path to apps/web/.next), RM_CHROMIUM_PATH (Chromium executable),
//               RM_SCREENSHOT_DIR (where to save screenshots).
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');

const EXT = path.resolve(__dirname, '..');
const WEB_NEXT = path.resolve(process.env.RM_WEB_OUT || path.join(EXT, '..', 'web', '.next'));
const SHOTS = process.env.RM_SCREENSHOT_DIR || null;
const APP = 'https://resumemate.prajwalkedari.tech';
const PAYLOADS = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'sample-payloads.json'), 'utf8'));

if (!fs.existsSync(path.join(WEB_NEXT, 'server', 'app', 'extension.html'))) {
  console.error(`No production build found at ${WEB_NEXT}. Run: cd apps/web && NEXT_PUBLIC_SITE_ORIGIN=${APP} npm run build`);
  process.exit(2);
}

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== undefined && !ok ? ' :: ' + JSON.stringify(detail).slice(0, 300) : ''}`);
};

const MIME = { '.js': 'application/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml' };

// Serves the production page for any path on the given origin. Static assets come from the build.
async function serveWebsite(ctx, origin, counters) {
  await ctx.route(`${origin}/**`, (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/_next/')) {
      const file = path.join(WEB_NEXT, 'static', url.pathname.replace('/_next/static/', ''));
      if (fs.existsSync(file) && fs.statSync(file).isFile()) {
        return route.fulfill({ status: 200, contentType: MIME[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
      }
      return route.fulfill({ status: 404, body: 'not found' });
    }
    counters.pageLoads += 1;
    const html = path.join(WEB_NEXT, 'server', 'app', url.pathname === '/' ? 'index.html' : `${url.pathname.replace(/^\//, '')}.html`);
    if (fs.existsSync(html)) return route.fulfill({ status: 200, contentType: 'text/html', body: fs.readFileSync(html) });
    return route.fulfill({ status: 404, contentType: 'text/html', body: '<!doctype html><title>404</title>' });
  });
}

async function launch(withExtension) {
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rm-page-'));
  const launchOpts = process.env.RM_CHROMIUM_PATH ? { executablePath: process.env.RM_CHROMIUM_PATH } : { channel: 'chromium' };
  const args = withExtension ? [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox'] : ['--no-sandbox'];
  const ctx = await chromium.launchPersistentContext(userDir, { ...launchOpts, headless: true, args, viewport: { width: 1280, height: 900 } });
  const counters = { pageLoads: 0, gemini: 0 };
  await ctx.route('https://gemini.google.com/**', (r) => { counters.gemini += 1; r.fulfill({ status: 200, body: '' }); });
  await serveWebsite(ctx, APP, counters);
  await serveWebsite(ctx, 'https://prajwalkedari.tech', counters);
  await serveWebsite(ctx, 'https://other.prajwalkedari.tech', counters);
  const cleanup = async () => { await ctx.close(); fs.rmSync(userDir, { recursive: true, force: true }); };
  return { ctx, counters, cleanup };
}

const statusText = (page) => page.locator('#ext-status').innerText();
// Waits until the status heading matches the given text. Fails clearly if it does not appear in time.
async function waitForHeadline(page, text, timeout = 9000) {
  try {
    await page.waitForFunction((t) => document.querySelector('#ext-status')?.textContent?.includes(t), text, { timeout });
    return true;
  } catch {
    return false;
  }
}
const shot = async (page, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true }); } };

// Posts a message from the page exactly as the website bridge does, and resolves with the first reply for that request ID.
const postFromPage = (page, message) => page.evaluate((message) => new Promise((resolve) => {
  const env = { channel: 'resumemate-web', v: 1, direction: 'to-extension', message };
  const replies = [];
  const h = (e) => { if (e.source === window && e.data && e.data.direction === 'to-page' && e.data.message && e.data.message.requestId === message.requestId) replies.push(e.data.message); };
  window.addEventListener('message', h);
  window.postMessage(env, window.location.origin);
  setTimeout(() => { window.removeEventListener('message', h); resolve(replies); }, 2000);
}), message);

(async () => {
  // ---------- Scenario 1: installed extension, production origin ----------
  {
    const { ctx, counters, cleanup } = await launch(true);
    const pageErrors = [];
    const page = await ctx.newPage();
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    await page.goto(`${APP}/extension`, { waitUntil: 'load' });
    await page.waitForSelector('#ext-status');

    check('page starts unchecked, not as connected', (await statusText(page)).includes('Check the connection'), await statusText(page));
    check('no connected state is shown before a check', !(await page.locator('text=ResumeMate Assistant is connected.').count()), null);

    // Wait for hydration, then run the real check.
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: 'Check connection' }).click();
    const connected = await waitForHeadline(page, 'ResumeMate Assistant is connected.');
    check('real handshake shows connected on the production origin', connected, await statusText(page));
    const versionRow = await page.locator('dl').innerText().catch(() => '');
    check('connected state shows extension version 0.1.0 from the reply', /0\.1\.0/.test(versionRow), versionRow);
    check('connected state shows protocol 1 and compatible', /Protocol\s+1\s+\(compatible\)/.test(versionRow.replace(/\n/g, ' ')), versionRow);
    await shot(page, '01-connected-desktop');

    // ---------- Scenario 2: busy, then recovery ----------
    const busyId = 'rm-busy-page-01';
    const prepared = await postFromPage(page, { type: 'PREPARE_PROMPT', requestId: busyId, payload: PAYLOADS.improve.payload });
    check('setup: a request is queued for review so the extension is busy', prepared.some((m) => m.type === 'REVIEW_PROMPT'), prepared);
    await page.getByRole('button', { name: 'Check again' }).click();
    const busy = await waitForHeadline(page, 'The extension is currently processing another request.');
    check('while a request is pending, the page shows busy', busy, await statusText(page));
    await shot(page, '02-busy-desktop');
    const cancelled = await postFromPage(page, { type: 'CANCEL_REQUEST', requestId: busyId });
    check('setup: the pending request is cancelled, nothing is sent to Gemini', cancelled.some((m) => m.type === 'GEMINI_STATUS' && m.status === 'cancelled'), cancelled);
    await page.getByRole('button', { name: 'Check again' }).click();
    check('after cancelling, the next check is connected again', await waitForHeadline(page, 'ResumeMate Assistant is connected.'), await statusText(page));

    // ---------- Scenario 3: refresh and reconnect ----------
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('#ext-status');
    await page.waitForTimeout(800);
    check('after refresh the page is unchecked until the user checks again', (await statusText(page)).includes('Check the connection'), await statusText(page));
    await page.getByRole('button', { name: 'Check connection' }).click();
    check('after refresh, a new check reconnects', await waitForHeadline(page, 'ResumeMate Assistant is connected.'), await statusText(page));

    check('no uncaught page errors during the connection checks', pageErrors.length === 0, pageErrors);
    check('no requests reached gemini.google.com', counters.gemini === 0, counters);
    await cleanup();
  }

  // ---------- Scenario 5: wrong origins do not get a verified connection ----------
  {
    const { ctx, counters, cleanup } = await launch(true);
    for (const origin of ['https://prajwalkedari.tech', 'https://other.prajwalkedari.tech']) {
      const page = await ctx.newPage();
      await page.goto(`${origin}/extension`, { waitUntil: 'load' });
      await page.waitForSelector('#ext-status');
      await page.waitForTimeout(800);
      await page.getByRole('button', { name: 'Check connection' }).click();
      const notDetected = await waitForHeadline(page, 'was not detected', 12000);
      check(`extension is not reachable from ${origin} (no connected state)`, notDetected, await statusText(page));
      check(`${origin} never shows connected`, !((await statusText(page)).includes('is connected')), await statusText(page));
      await page.close();
    }
    check('no requests reached gemini.google.com (wrong-origin pages)', counters.gemini === 0, counters);
    await cleanup();
  }

  // ---------- Scenario 6: extension not installed on the production origin ----------
  {
    const { ctx, cleanup } = await launch(false);
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(String(e)));
    await page.goto(`${APP}/extension`, { waitUntil: 'load' });
    await page.waitForSelector('#ext-status');
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: 'Check connection' }).click();
    const notInstalled = await waitForHeadline(page, 'ResumeMate Assistant was not detected. Install the extension to continue.', 12000);
    check('without the extension, the page shows not installed and never connected', notInstalled, await statusText(page));
    check('the page offers the installation instructions link', (await page.getByRole('link', { name: 'Installation instructions' }).count()) === 1, null);
    check('the page still renders when the extension is absent (no page errors)', pageErrors.length === 0, pageErrors);
    await page.getByRole('button', { name: 'Try again' }).click();
    check('try again runs another check and reports not installed', await waitForHeadline(page, 'was not detected', 12000), await statusText(page));
    await shot(page, '03-not-installed');
    await cleanup();
  }

  // ---------- Scenario 7: mobile layout renders and remains usable ----------
  {
    const { ctx, cleanup } = await launch(true);
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${APP}/extension`, { waitUntil: 'load' });
    await page.waitForSelector('#ext-status');
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: 'Check connection' }).click();
    check('mobile: the connection check completes', await waitForHeadline(page, 'ResumeMate Assistant is connected.'), await statusText(page));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    check('mobile: no horizontal page overflow at 390px', !overflow, { overflow });
    await shot(page, '04-connected-mobile');
    await cleanup();
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\nSUMMARY ${passed}/${results.length} passed`);
  process.exit(passed === results.length ? 0 : 1);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
