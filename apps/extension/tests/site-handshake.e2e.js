// Browser test of the real /extension page with the unpacked ResumeMate Assistant bundle.
// Requirements: the website must be running (npm run start in apps/web, default port 3100).
// Hostnames are routed to that local server, so the page runs with its production origin.
// This is NOT a test of the deployed site. Set SITE_LOCAL to change the local address.
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');

const EXT = path.resolve(__dirname, '..');
const SITE_LOCAL = process.env.SITE_LOCAL || 'http://localhost:3100';
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail !== undefined && !ok ? ' :: ' + JSON.stringify(detail).slice(0, 200) : ''}`);
};

async function routeHosts(ctx) {
  const proxy = async (route) => {
    const u = new URL(route.request().url());
    try {
      const res = await fetch(SITE_LOCAL + u.pathname + u.search);
      const body = Buffer.from(await res.arrayBuffer());
      await route.fulfill({ status: res.status, headers: { 'content-type': res.headers.get('content-type') || 'application/octet-stream' }, body });
    } catch (e) {
      await route.fulfill({ status: 502, body: 'local site not reachable' });
    }
  };
  await ctx.route('https://resumemate.prajwalkedari.tech/**', proxy);
  await ctx.route('https://prajwalkedari.tech/**', proxy);
  await ctx.route('https://unrelated.prajwalkedari.tech/**', proxy);
}

async function clickCheck(page) {
  const btn = page.getByRole('button', { name: /Check connection|Check again|Retry/ }).first();
  await btn.click();
  // Wait for the check to finish (button no longer shows "Checking...").
  await page.waitForFunction(() => !document.querySelector('button[aria-busy="true"]'), null, { timeout: 15000 });
}

const heading = (page) => page.locator('#ext-status').innerText();

(async () => {
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rm-site-'));
  const ctx = await chromium.launchPersistentContext(userDir, {
    channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox'],
  });
  await routeHosts(ctx);
  await ctx.route('https://gemini.google.com/**', (r) => r.abort());

  // A. Production origin with the extension installed: connected after a real handshake.
  const page = await ctx.newPage();
  await page.goto('https://resumemate.prajwalkedari.tech/extension');
  check('page shows idle state before any check (no fake "connected")', /Check the connection/.test(await heading(page)));
  await clickCheck(page);
  check('production origin + extension -> "ResumeMate Assistant is connected."', /ResumeMate Assistant is connected\./.test(await heading(page)), await heading(page));
  const body = await page.locator('main').innerText();
  check('connected view shows extension version 0.1.0 and protocol v1', /0\.1\.0/.test(body) && /v1/.test(body), body.slice(0, 300));
  check('no simulation or mock controls on the page', !/Simulated|mock|Development/i.test(body));

  // B. Reload and reconnect.
  await page.reload();
  await clickCheck(page);
  check('refresh and reconnect -> connected again', /is connected\./.test(await heading(page)), await heading(page));

  // C. Old root domain: the extension ignores this origin, so the page must not claim a connection.
  const oldRoot = await ctx.newPage();
  await oldRoot.goto('https://prajwalkedari.tech/extension');
  await clickCheck(oldRoot);
  check('old root domain -> not detected (no false connected)', /was not detected/.test(await heading(oldRoot)), await heading(oldRoot));
  await oldRoot.close();

  // D. Unrelated subdomain: same expectation.
  const other = await ctx.newPage();
  await other.goto('https://unrelated.prajwalkedari.tech/extension');
  await clickCheck(other);
  check('unrelated subdomain -> not detected', /was not detected/.test(await heading(other)), await heading(other));
  await other.close();

  // E. Retry button is offered when not detected.
  await page.close();
  await ctx.close();
  fs.rmSync(userDir, { recursive: true, force: true });

  // F. No extension installed at all.
  const userDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'rm-site-noext-'));
  const ctx2 = await chromium.launchPersistentContext(userDir2, { channel: 'chromium', headless: true, args: ['--no-sandbox'] });
  await routeHosts(ctx2);
  const p2 = await ctx2.newPage();
  await p2.goto('https://resumemate.prajwalkedari.tech/extension');
  await clickCheck(p2);
  const h2 = await heading(p2);
  check('extension not installed -> "was not detected" with install link', /was not detected/.test(h2) && (await p2.getByRole('link', { name: 'Installation instructions' }).count()) > 0, h2);
  check('not-installed view offers Retry', (await p2.getByRole('button', { name: 'Retry' }).count()) === 1);
  check('page still renders its content without the extension', (await p2.locator('main').innerText()).includes('Connect the extension'));
  await ctx2.close();
  fs.rmSync(userDir2, { recursive: true, force: true });

  const passed = results.filter((r) => r.ok).length;
  console.log(`\nSUMMARY ${passed}/${results.length} passed (site served locally at ${SITE_LOCAL} under production hostnames)`);
  process.exit(passed === results.length ? 0 : 1);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
