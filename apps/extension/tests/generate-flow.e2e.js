// End-to-end browser test of the resume generation workflow, with the real unpacked extension bundle
// and the real website (served from SITE_LOCAL, routed under production hostnames).
//
// IMPORTANT: gemini.google.com is a FIXTURE page built to match the selectors in content/gemini.js.
// It is NOT live Gemini. Passing this test proves the extension and website logic and the user approval gates.
// It does not prove that Gemini's real page still uses these selectors. Live Gemini is tested manually.
//
// Requires: website running at SITE_LOCAL (default http://localhost:3100) built with the production origin.
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');

const EXT = path.resolve(__dirname, '..');
const SITE_LOCAL = process.env.SITE_LOCAL || 'http://localhost:3100';
const SITE = 'https://resumemate.prajwalkedari.tech';
const FIXTURE_RESPONSE = 'FIXTURE RESPONSE: Alex Morgan, software engineer with TypeScript experience.';
const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${!ok && detail !== undefined ? ' :: ' + JSON.stringify(detail).slice(0, 300) : ''}`);
};

const GEMINI_FIXTURE = `<!doctype html><html><head><meta charset="utf-8"><title>FIXTURE Gemini (not live)</title></head><body>
<p>FIXTURE: this is a test page, not Gemini.</p>
<div id="conv"></div>
<div style="padding:16px"><div contenteditable="true" role="textbox" aria-label="Enter a prompt" id="composer" style="min-height:40px;width:600px;border:1px solid #999"></div>
<button type="button" aria-label="Send message" id="send">Send</button></div>
<script>
var composer=document.getElementById('composer'), send=document.getElementById('send'), conv=document.getElementById('conv');
send.addEventListener('click', function(){
  var text=composer.textContent||''; if(!text.trim()) return;
  composer.textContent='';
  setTimeout(function(){
    var m=document.createElement('div'); m.setAttribute('data-message-author-role','model');
    m.innerHTML='<p>${FIXTURE_RESPONSE}</p>'; conv.appendChild(m);
  }, 1500);
});
</script></body></html>`;

async function routeAll(ctx, geminiFixture = true) {
  const proxy = async (route) => {
    const u = new URL(route.request().url());
    // Forward request headers (RSC, accept, etc.). Without them Next falls back to a full reload on client navigation.
    const headers = { ...route.request().headers() };
    delete headers.host; delete headers['accept-encoding']; delete headers.connection;
    try {
      const res = await fetch(SITE_LOCAL + u.pathname + u.search, { headers, redirect: 'manual' });
      await route.fulfill({ status: res.status, headers: { 'content-type': res.headers.get('content-type') || 'application/octet-stream' }, body: Buffer.from(await res.arrayBuffer()) });
    } catch { await route.fulfill({ status: 502, body: 'local site not reachable' }); }
  };
  await ctx.route(`${SITE}/**`, proxy);
  if (geminiFixture) {
    await ctx.route('https://gemini.google.com/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: GEMINI_FIXTURE }));
  }
}

async function fillResume(page) {
  await page.goto(`${SITE}/create`);
  await page.locator('#personal-name').waitFor({ timeout: 20000 });
  await page.fill('#personal-name', 'Alex Morgan');
  await page.fill('#personal-email', 'alex.morgan@example.com');
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Next', exact: true }).click();
  await page.getByRole('button', { name: 'Add entry' }).click();
  await page.fill('#experience-0-role', 'Software Engineer');
  await page.fill('#experience-0-company', 'Example Labs');
  await page.fill('#experience-0-dates', '2022 - 2025');
  await page.fill('#experience-0-details', 'Built TypeScript tools\nShipped a Chrome extension');
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await page.waitForURL(`${SITE}/generate`);
}

const statusText = (page) => page.locator('[aria-live="polite"]').first().innerText().catch(() => '');
async function waitForText(page, re, timeout = 60000) {
  try {
    await page.waitForFunction((src) => new RegExp(src, 'i').test(document.body.innerText), re.source, { timeout });
  } catch (e) {
    const shown = await page.locator('main').innerText().catch(() => '(no main)');
    console.log('  [debug] waiting for', re.source, 'but page shows:', shown.slice(0, 500).replace(/\n+/g, ' | '));
    throw e;
  }
}
async function popupPage(ctx, extId) {
  const p = await ctx.newPage();
  await p.goto(`chrome-extension://${extId}/popup/index.html`);
  return p;
}
const geminiPages = (ctx) => ctx.pages().filter((p) => p.url().startsWith('https://gemini.google.com'));

(async () => {
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rm-flow-'));
  const ctx = await chromium.launchPersistentContext(userDir, {
    channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox'],
  });
  await routeAll(ctx);
  let sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  const extId = sw.url().split('/')[2];

  // 1. Connected extension: the Continue CTA goes to /create.
  const ext = await ctx.newPage();
  await ext.goto(`${SITE}/extension`);
  await ext.getByRole('button', { name: /Check connection/ }).click();
  await waitForText(ext, /is connected\./);
  const cta = ext.getByRole('link', { name: /Continue to Create Resume/ });
  check('connected: "Continue to Create Resume" CTA is visible', await cta.isVisible());
  check('CTA points to the existing /create route', (await cta.getAttribute('href')) === '/create', await cta.getAttribute('href'));
  check('connected view shows the real extension version from the handshake', (await ext.locator('main').innerText()).includes('0.1.0'));
  await cta.click();
  await ext.waitForURL(`${SITE}/create`);
  check('clicking the CTA navigates to /create', ext.url() === `${SITE}/create`, ext.url());
  await ext.close();

  // 2. Enter details and review: the review step goes to /generate, not /extension.
  const page = await ctx.newPage();
  await fillResume(page);
  check('Review on /create moves to /generate', page.url() === `${SITE}/generate`, page.url());
  await waitForText(page, /is connected\./);
  const geminiBefore = geminiPages(ctx).length;

  // 3. Start a request: nothing is sent to Gemini until the user approves in the popup.
  await page.getByRole('button', { name: 'Generate with AI' }).click();
  await waitForText(page, /Approve the prompt in the ResumeMate Assistant popup/);
  await page.waitForTimeout(1500);
  check('no Gemini tab opened before the user approves', geminiPages(ctx).length === geminiBefore, geminiPages(ctx).map((p) => p.url()));

  // 4. Rejection: the user cancels in the popup before approving.
  const pop = await popupPage(ctx, extId);
  await pop.locator('#btn-cancel-review').waitFor({ timeout: 15000 });
  await pop.locator('#btn-cancel-review').click();
  await waitForText(page, /Cancelled|Nothing has been added/i, 20000);
  check('rejecting in the popup shows cancelled, not failed', await page.getByText('Cancelled', { exact: false }).first().isVisible());
  check('no Gemini tab opened after rejection', geminiPages(ctx).length === geminiBefore, geminiPages(ctx).map((p) => p.url()));
  check('resume data is intact after cancel (aside still shows the name)', (await page.locator('aside').innerText()).includes('Alex Morgan'));

  // 5. Retry, approve, submit, review output, return to the website.
  await page.getByRole('button', { name: 'Try again' }).click();
  await waitForText(page, /Approve the prompt in the ResumeMate Assistant popup/);
  const pop2 = await popupPage(ctx, extId);
  await pop2.locator('#btn-send-gemini').waitFor({ timeout: 15000 });
  await pop2.locator('#btn-send-gemini').click();
  await pop2.locator('#btn-confirm-submit').waitFor({ timeout: 60000 });
  const gem = await (async () => { for (let i = 0; i < 40; i++) { const g = geminiPages(ctx)[0]; if (g) return g; await page.waitForTimeout(250); } return null; })();
  check('approval opened the Gemini tab', !!gem);
  if (gem) {
    const composerText = await gem.locator('#composer').innerText().catch(() => '');
    check('approved prompt was placed in the Gemini composer (contains resume name)', composerText.includes('Alex Morgan'), composerText.slice(0, 120));
  }
  check('second approval: extension asks to confirm submission', await pop2.locator('#btn-confirm-submit').isVisible());
  await pop2.locator('#btn-confirm-submit').click();

  await waitForText(page, /Response ready/, 90000);
  check('Gemini response arrives on the website as "Response ready" with a character count', /Gemini returned \d+ characters/.test(await page.locator('main').innerText()));
  check('website does not show the text before the popup sends it', !(await page.locator('main').innerText()).includes('FIXTURE RESPONSE'));
  const btn = pop2.locator('#btn-transfer');
  check('send-to-website is disabled until the user ticks confirmation', await btn.isDisabled());
  await pop2.locator('#confirm-transfer').check();
  await btn.click();

  await waitForText(page, /Generated output/, 30000);
  const outText = await page.locator('pre[aria-label="Generated output"]').innerText();
  check('returned output appears for review', outText.includes('FIXTURE RESPONSE'), outText.slice(0, 120));
  check('output is not saved automatically (Save button still needed)', await page.getByRole('button', { name: /Save as AI draft/ }).isVisible());

  // 6. Accept and see it in the preview, with resume fields unchanged.
  await page.getByRole('button', { name: /Save as AI draft/ }).click();
  await waitForText(page, /Saved as an AI draft/);
  await page.getByRole('link', { name: 'View preview' }).click();
  await page.waitForURL(`${SITE}/preview`);
  const prev = await page.locator('main').innerText();
  check('preview shows the labelled AI draft section', /AI draft \(not part of your resume fields\)/.test(prev));
  check('preview shows the returned text in the AI draft section', prev.includes('FIXTURE RESPONSE'));
  check('preview keeps the resume document unchanged (name still rendered)', prev.includes('Alex Morgan'));
  await pop2.close();

  // 7. Discard the AI draft from the preview.
  await page.getByRole('button', { name: /Discard draft/ }).click();
  await page.waitForFunction(() => !/AI draft \(not part/.test(document.body.innerText), null, { timeout: 5000 });
  check('discarding removes the AI draft section', !(await page.locator('main').innerText()).includes('AI draft (not part'));
  await page.close();

  // 8. Not installed: a context without the extension shows installation guidance and keeps the details.
  const bareDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rm-bare-'));
  const bare = await chromium.launchPersistentContext(bareDir, { channel: 'chromium', headless: true, args: ['--no-sandbox'] });
  await routeAll(bare, false);
  const bp = await bare.newPage();
  await fillResume(bp);
  await waitForText(bp, /was not detected/, 20000);
  check('extension not installed: installation guidance shown', /was not detected/.test(await bp.locator('main').innerText()));
  check('extension not installed: Generate button is disabled', await bp.getByRole('button', { name: 'Generate with AI' }).isDisabled());
  check('extension not installed: details are preserved', (await bp.locator('aside').innerText()).includes('Alex Morgan'));
  await bare.close();

  await ctx.close();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed (fixture Gemini; not live)`);
  fs.rmSync(userDir, { recursive: true, force: true });
  fs.rmSync(bareDir, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('FLOW ERROR', e); process.exit(2); });
