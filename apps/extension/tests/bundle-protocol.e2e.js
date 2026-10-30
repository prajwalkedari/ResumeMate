// Browser test: loads the unpacked ResumeMate Assistant bundle into Chromium and checks its protocol replies.
// Fixture-based. Uses stubbed https://resumemate.prajwalkedari.tech, the old root domain, an unrelated subdomain,
// and gemini.google.com. It does NOT contact live sites or Gemini.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const EXT = path.resolve(__dirname, "..");
const P = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "sample-payloads.json"), 'utf8'));
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' :: ' + JSON.stringify(detail).slice(0, 220) : ''}`); };

(async () => {
  const userDir = fs.mkdtempSync(path.join(require("os").tmpdir(), "rm-profile-"));
  const ctx = await chromium.launchPersistentContext(userDir, {
    channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--no-sandbox'],
  });
  let geminiRequests = 0;
  await ctx.route('https://gemini.google.com/**', (r) => { geminiRequests++; r.fulfill({ status: 200, body: '' }); });
  const fixturePage = (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><head><title>fixture</title></head><body>fixture</body></html>' });
  await ctx.route('https://resumemate.prajwalkedari.tech/**', fixturePage);
  await ctx.route('https://prajwalkedari.tech/**', fixturePage);
  await ctx.route('https://unrelated.prajwalkedari.tech/**', fixturePage);
  await ctx.route('https://evil.example/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><body>other origin</body></html>' }));

  let sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', { timeout: 20000 });
  check('service worker starts from bundle', !!sw, sw && sw.url());

  const page = await ctx.newPage();
  await page.goto('https://resumemate.prajwalkedari.tech/');
  await page.waitForTimeout(1500);

  // Helper: posts an envelope like the website bridge and waits for a reply with a matching requestId.
  const collect = (message, { timeout = 2500, raw = null } = {}) => page.evaluate(({ message, timeout, raw }) => new Promise((resolve) => {
    const env = raw ?? { channel: 'resumemate-web', v: 1, direction: 'to-extension', message };
    const seen = [];
    const h = (e) => {
      const d = e.data;
      if (e.source !== window || !d || d.channel !== 'resumemate-web' || d.direction !== 'to-page') return;
      if (message && d.message && d.message.requestId !== message.requestId) return;
      seen.push(d.message);
    };
    window.addEventListener('message', h);
    window.postMessage(env, window.location.origin);
    setTimeout(() => { window.removeEventListener('message', h); resolve(seen); }, timeout);
  }), { message, timeout, raw });
  // First reply of the given type, or the first reply if no type is given.
  const firstOf = (replies, type) => (replies || []).find((m) => !type || m.type === type) || null;
  const send = async (message, opts = {}) => firstOf(await collect(message, opts), opts.type);

  // 1. Handshake: no resume data, reports version and connection.
  const hello = await send({ type: 'HELLO', requestId: 'rm-hello-0001' });
  check('HELLO returns CONNECTION_STATUS', hello && hello.type === 'CONNECTION_STATUS' && hello.connected === true, hello);
  check('HELLO reply reports protocol v1 and version 0.1.0', hello && hello.protocolVersion === 1 && hello.extensionVersion === '0.1.0', hello);

  // 2. Valid prepare for each task goes to review, then is cancelled (nothing reaches Gemini).
  for (const task of ['improve', 'generate', 'latex', 'review', 'extract']) {
    const id = `rm-${task}-0001`;
    const seq = await collect({ type: 'PREPARE_PROMPT', requestId: id, payload: P[task].payload });
    const r = firstOf(seq, 'REVIEW_PROMPT');
    check(`PREPARE_PROMPT ${task} -> REVIEW_PROMPT (after progress)`, r && r.status === 'awaiting-user-review' && seq[0].type === 'GEMINI_STATUS' && seq[0].status === 'awaiting-send-approval', seq);
    const cs = await collect({ type: 'CANCEL_REQUEST', requestId: id });
    const c = cs.find((m) => m.type === 'GEMINI_STATUS' && m.status === 'cancelled');
    check(`CANCEL_REQUEST ${task} -> cancelled`, !!c, cs);
  }

  // 3. Invalid payload: tailor without job description is refused with an explicit error.
  const bad = await send({ type: 'PREPARE_PROMPT', requestId: 'rm-bad-0001', payload: { task: 'tailor', template: 'none', outputFormat: 'markdown', resumeText: 'x'.repeat(50), jobDescription: '', customInstructions: '' } });
  check('invalid payload -> ERROR INVALID_PAYLOAD with same requestId', bad && bad.type === 'ERROR' && bad.code === 'INVALID_PAYLOAD' && bad.requestId === 'rm-bad-0001', bad);

  // 4. Oversized resume is refused.
  const big = await send({ type: 'PREPARE_PROMPT', requestId: 'rm-big-00001', payload: { ...P.improve.payload, resumeText: 'x'.repeat(20001) } });
  check('oversized resume -> ERROR', big && big.type === 'ERROR', big);

  // 5. Cancel for an unknown request is an explicit stale error.
  const stale = await send({ type: 'CANCEL_REQUEST', requestId: 'rm-unknown-01' });
  check('CANCEL unknown id -> ERROR STALE_REQUEST', stale && stale.type === 'ERROR' && stale.code === 'STALE_REQUEST', stale);

  // 6. Wrong protocol version or channel gets no reply.
  const wrongV = await send(null, { raw: { channel: 'resumemate-web', v: 2, direction: 'to-extension', message: { type: 'HELLO', requestId: 'rm-v2-000001' } }, timeout: 2500 });
  check('wrong protocol version -> no reply', wrongV === null, wrongV);
  const wrongCh = await send(null, { raw: { channel: 'other', v: 1, direction: 'to-extension', message: { type: 'HELLO', requestId: 'rm-ch-0000001' } }, timeout: 2500 });
  check('wrong channel -> no reply', wrongCh === null, wrongCh);

  // 7. Malformed message type.
  const unk = await send({ type: 'DELETE_ALL', requestId: 'rm-unk-000001' });
  check('unknown message type -> ERROR', unk && unk.type === 'ERROR', unk);

  // 8. Malformed request id.
  const shortId = await send({ type: 'HELLO', requestId: 'x' }, { timeout: 2500 });
  check('malformed requestId -> ERROR or no reply', shortId === null || shortId.type === 'ERROR', shortId);

  // 9. Non-allow-listed origin gets no reply.
  const other = await ctx.newPage();
  await other.goto('https://evil.example/');
  await other.waitForTimeout(800);
  const foreign = await other.evaluate(() => new Promise((resolve) => {
    const log = [];
    const h = (e) => { if (e.source === window && e.data && e.data.direction === 'to-page') log.push(e.data); };
    window.addEventListener('message', h);
    window.postMessage({ channel: 'resumemate-web', v: 1, direction: 'to-extension', message: { type: 'HELLO', requestId: 'rm-evil-00001' } }, window.location.origin);
    setTimeout(() => resolve(log), 2500);
  }));
  check('non-allow-listed origin -> no reply from extension', foreign.length === 0, foreign);

  // 10. The old root domain and an unrelated subdomain must not get replies (exact-origin allow-list).
  for (const [label, url] of [['old root domain', 'https://prajwalkedari.tech/'], ['unrelated subdomain', 'https://unrelated.prajwalkedari.tech/']]) {
    const p2 = await ctx.newPage();
    await p2.goto(url);
    await p2.waitForTimeout(800);
    const replies = await p2.evaluate(() => new Promise((resolve) => {
      const log = [];
      const h = (e) => { if (e.source === window && e.data && e.data.direction === 'to-page') log.push(e.data); };
      window.addEventListener('message', h);
      window.postMessage({ channel: 'resumemate-web', v: 1, direction: 'to-extension', message: { type: 'HELLO', requestId: 'rm-origin-0001' } }, window.location.origin);
      setTimeout(() => resolve(log), 2500);
    }));
    check(`${label} (${url}) -> no extension reply`, replies.length === 0, replies);
    await p2.close();
  }

  // 11. Busy: while a request is awaiting review, HELLO reports busy:true (still verified).
  await send({ type: 'PREPARE_PROMPT', requestId: 'rm-busy-00001', payload: P.improve.payload });
  const busy = await send({ type: 'HELLO', requestId: 'rm-busy-hello1' });
  check('HELLO while a request is pending -> CONNECTION_STATUS busy:true', busy && busy.type === 'CONNECTION_STATUS' && busy.busy === true, busy);
  await collect({ type: 'CANCEL_REQUEST', requestId: 'rm-busy-00001' });

  check('no request reached gemini.google.com during protocol tests', geminiRequests === 0, { geminiRequests });

  const passed = results.filter((r) => r.ok).length;
  console.log(`\nSUMMARY ${passed}/${results.length} passed`);
  await ctx.close();
  fs.rmSync(userDir, { recursive: true, force: true });
  process.exit(passed === results.length ? 0 : 1);
})().catch((e) => { console.error('HARNESS ERROR', e); process.exit(2); });
