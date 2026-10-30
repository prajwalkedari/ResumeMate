// Connection-check tests for the website bridge. They use a fake window host, so they run without
// a browser or the extension source. They cover the state mapping, reply validation, origin and
// request-ID checks, replay handling, and that the website origin matches the extension build.
// Real-browser checks against the unpacked extension are in docs/TEST-REPORT.md.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ExtensionBridge, BRIDGE_CHANNEL, BRIDGE_VERSION, EXTENSION_SUPPORTED_ORIGIN, INCOMPATIBLE_MESSAGE, interpretHelloReply, parseVersionMismatch, type BridgeHost } from '../lib/extension-bridge';

type Listener = (event: { source: unknown; origin: string; data: unknown }) => void;
const WIN = { name: 'window' };
const PAGE_ORIGIN = EXTENSION_SUPPORTED_ORIGIN;

function makeHost(origin: string = PAGE_ORIGIN) {
  const listeners: Listener[] = [];
  const sent: { message: any; target: string }[] = [];
  const host: BridgeHost = {
    origin,
    postMessage: (message, target) => { sent.push({ message, target }); },
    addEventListener: (_t, l) => { listeners.push(l); },
    removeEventListener: (_t, l) => { listeners.splice(listeners.indexOf(l), 1); },
    isOwnWindow: (source) => source === WIN,
  };
  const deliver = (data: unknown, o = origin, source: unknown = WIN) => {
    for (const l of [...listeners]) l({ source, origin: o, data });
  };
  return { host, sent, deliver };
}

const toPage = (message: Record<string, unknown>, v: number = BRIDGE_VERSION) => ({ channel: BRIDGE_CHANNEL, v, direction: 'to-page', message });
const lastId = (sent: { message: any }[]) => sent[sent.length - 1].message.message.requestId as string;
const status = (requestId: string, extra: Record<string, unknown> = {}) => ({
  type: 'CONNECTION_STATUS', requestId, connected: true, busy: false, extensionVersion: '0.1.0', protocolVersion: 1, ...extra,
});

describe('checkConnection reports only verified states', () => {
  it('connected: a valid CONNECTION_STATUS with matching protocol', async () => {
    const { host, sent, deliver } = makeHost();
    const bridge = new ExtensionBridge(host);
    const pending = bridge.checkConnection(1000);
    deliver(toPage(status(lastId(sent))));
    assert.deepEqual(await pending, { state: 'connected', extensionVersion: '0.1.0', protocolVersion: 1 });
    bridge.dispose();
  });

  it('busy: the extension reports an active request', async () => {
    const { host, sent, deliver } = makeHost();
    const bridge = new ExtensionBridge(host);
    const pending = bridge.checkConnection(1000);
    deliver(toPage(status(lastId(sent), { busy: true })));
    assert.deepEqual(await pending, { state: 'busy', extensionVersion: '0.1.0', protocolVersion: 1 });
    bridge.dispose();
  });

  it('not-detected: no reply before the timeout', async () => {
    const { host } = makeHost();
    const bridge = new ExtensionBridge(host);
    assert.deepEqual(await bridge.checkConnection(20), { state: 'not-detected' });
    bridge.dispose();
  });

  it('error: the extension returns an ERROR for the HELLO', async () => {
    const { host, sent, deliver } = makeHost();
    const bridge = new ExtensionBridge(host);
    const pending = bridge.checkConnection(1000);
    deliver(toPage({ type: 'ERROR', requestId: lastId(sent), code: 'INVALID_MESSAGE', message: 'x' }));
    const outcome = await pending;
    assert.equal(outcome.state, 'error');
    assert.equal(outcome.state === 'error' && outcome.code, 'INVALID_MESSAGE');
    bridge.dispose();
  });

  it('incompatible: the reply reports a different protocol version', async () => {
    const { host, sent, deliver } = makeHost();
    const bridge = new ExtensionBridge(host);
    const pending = bridge.checkConnection(1000);
    deliver(toPage(status(lastId(sent), { protocolVersion: 2 })));
    assert.deepEqual(await pending, { state: 'incompatible', extensionVersion: '0.1.0', protocolVersion: 2, message: INCOMPATIBLE_MESSAGE });
    bridge.dispose();
  });

  it('incompatible: an older extension that reports no protocol version', async () => {
    const { host, sent, deliver } = makeHost();
    const bridge = new ExtensionBridge(host);
    const pending = bridge.checkConnection(1000);
    const { protocolVersion: _omit, ...legacy } = status(lastId(sent));
    deliver(toPage(legacy));
    const outcome = await pending;
    assert.equal(outcome.state, 'incompatible');
    bridge.dispose();
  });

  it('incompatible: an envelope with a newer version and a matching request ID', async () => {
    const { host, sent, deliver } = makeHost();
    const bridge = new ExtensionBridge(host);
    const pending = bridge.checkConnection(1000);
    deliver(toPage(status(lastId(sent)), 2));
    assert.deepEqual(await pending, { state: 'incompatible', extensionVersion: null, protocolVersion: null, message: INCOMPATIBLE_MESSAGE });
    bridge.dispose();
  });

  it('a newer-version envelope with an unknown request ID is ignored, so the check times out', async () => {
    const { host, deliver } = makeHost();
    const bridge = new ExtensionBridge(host);
    const pending = bridge.checkConnection(50);
    deliver(toPage(status('rm-unknown-0001'), 2));
    assert.deepEqual(await pending, { state: 'not-detected' });
    bridge.dispose();
  });

  it('error: connected is not true, so the status is not trusted', async () => {
    const { host, sent, deliver } = makeHost();
    const bridge = new ExtensionBridge(host);
    const pending = bridge.checkConnection(1000);
    deliver(toPage(status(lastId(sent), { connected: false })));
    assert.equal((await pending).state, 'error');
    bridge.dispose();
  });

  it('error: an extension version that is not a plausible version string is rejected', async () => {
    const { host, sent, deliver } = makeHost();
    const bridge = new ExtensionBridge(host);
    const pending = bridge.checkConnection(1000);
    deliver(toPage(status(lastId(sent), { extensionVersion: '<img src=x onerror=alert(1)>' })));
    assert.equal((await pending).state, 'error');
    bridge.dispose();
  });
});

describe('replies that must be ignored', () => {
  it('a reply from another origin does not count as connected', async () => {
    const { host, sent, deliver } = makeHost();
    const bridge = new ExtensionBridge(host);
    const pending = bridge.checkConnection(50);
    deliver(toPage(status(lastId(sent))), 'https://evil.example');
    assert.deepEqual(await pending, { state: 'not-detected' });
    bridge.dispose();
  });

  it('a reply from the old root domain does not count as connected on the new origin', async () => {
    const { host, sent, deliver } = makeHost();
    const bridge = new ExtensionBridge(host);
    const pending = bridge.checkConnection(50);
    deliver(toPage(status(lastId(sent))), 'https://prajwalkedari.tech');
    assert.deepEqual(await pending, { state: 'not-detected' });
    bridge.dispose();
  });

  it('a version-mismatch envelope from another origin is ignored', async () => {
    const { host, sent, deliver } = makeHost();
    const bridge = new ExtensionBridge(host);
    const pending = bridge.checkConnection(50);
    deliver(toPage(status(lastId(sent)), 2), 'https://evil.example');
    assert.deepEqual(await pending, { state: 'not-detected' });
    bridge.dispose();
  });

  it('a reply from a foreign window source is ignored', async () => {
    const { host, sent, deliver } = makeHost();
    const bridge = new ExtensionBridge(host);
    const pending = bridge.checkConnection(50);
    deliver(toPage(status(lastId(sent))), PAGE_ORIGIN, 'iframe');
    assert.deepEqual(await pending, { state: 'not-detected' });
    bridge.dispose();
  });

  it('a reply with the wrong channel or direction is ignored', async () => {
    const { host, sent, deliver } = makeHost();
    const bridge = new ExtensionBridge(host);
    const pending = bridge.checkConnection(50);
    deliver({ channel: 'other', v: BRIDGE_VERSION, direction: 'to-page', message: status(lastId(sent)) });
    deliver({ channel: BRIDGE_CHANNEL, v: BRIDGE_VERSION, direction: 'to-extension', message: status(lastId(sent)) });
    assert.deepEqual(await pending, { state: 'not-detected' });
    bridge.dispose();
  });

  it('a reply whose request ID was never issued by this client is dropped', async () => {
    const { host, deliver } = makeHost();
    const bridge = new ExtensionBridge(host);
    const pending = bridge.checkConnection(50);
    deliver(toPage(status('rm-foreign-00001')));
    assert.deepEqual(await pending, { state: 'not-detected' });
    bridge.dispose();
  });

  it('a duplicate or replayed reply after the check has finished is ignored', async () => {
    const { host, sent, deliver } = makeHost();
    const bridge = new ExtensionBridge(host);
    const seen: unknown[] = [];
    bridge.subscribe((r) => seen.push(r));
    const pending = bridge.checkConnection(1000);
    const id = lastId(sent);
    deliver(toPage(status(id)));
    assert.equal((await pending).state, 'connected');
    // The same reply arrives again. The check has already resolved, so nothing may change.
    deliver(toPage(status(id, { protocolVersion: 2 })));
    assert.equal(seen.length, 1, 'the first reply reaches subscribers once; the replay is dropped');
    bridge.dispose();
  });

  it('each check uses a fresh request ID, so an old reply cannot satisfy a new check', async () => {
    const { host, sent, deliver } = makeHost();
    const bridge = new ExtensionBridge(host);
    const first = bridge.checkConnection(1000);
    const firstId = lastId(sent);
    deliver(toPage(status(firstId)));
    await first;
    const second = bridge.checkConnection(50);
    assert.notEqual(lastId(sent), firstId);
    deliver(toPage(status(firstId)));
    assert.deepEqual(await second, { state: 'not-detected' });
    bridge.dispose();
  });
});

describe('the HELLO message', () => {
  it('contains only a type and a request ID, never resume or user content', async () => {
    const { host, sent } = makeHost();
    const bridge = new ExtensionBridge(host);
    const pending = bridge.checkConnection(20);
    assert.deepEqual(Object.keys(sent[0].message.message).sort(), ['requestId', 'type']);
    assert.equal(sent[0].message.message.type, 'HELLO');
    assert.equal(sent[0].target, PAGE_ORIGIN, 'messages are targeted at the page origin only');
    await pending;
    bridge.dispose();
  });
});

describe('interpretHelloReply and parseVersionMismatch', () => {
  it('null is not-detected, never connected', () => {
    assert.deepEqual(interpretHelloReply(null), { state: 'not-detected' });
  });

  it('ignores envelopes of the current version when looking for mismatches', () => {
    assert.equal(parseVersionMismatch(toPage(status('rm-same-000001'))), null);
  });

  it('ignores mismatched envelopes that are not CONNECTION_STATUS', () => {
    assert.equal(parseVersionMismatch(toPage({ type: 'REVIEW_PROMPT', requestId: 'rm-x-0000001' }, 2)), null);
  });

  it('ignores mismatched envelopes from the wrong channel', () => {
    assert.equal(parseVersionMismatch({ channel: 'other', v: 2, direction: 'to-page', message: status('rm-x-0000001') }), null);
  });
});

describe('domain consistency across the monorepo', () => {
  // These read files from the sibling extension app. They do not need the extension's TypeScript source.
  const manifestUrl = new URL('../../extension/manifest.json', import.meta.url);
  const bundleUrl = (rel: string) => new URL(`../../extension/${rel}`, import.meta.url);
  const manifest = JSON.parse(readFileSync(manifestUrl, 'utf8'));

  it('the website origin is exactly https://resumemate.prajwalkedari.tech', () => {
    assert.equal(EXTENSION_SUPPORTED_ORIGIN, 'https://resumemate.prajwalkedari.tech');
  });

  it('the extension host permission is exactly the website origin, with no wildcard', () => {
    const hosts = manifest.host_permissions.filter((h: string) => h.startsWith('https://resumemate') || h.includes('prajwalkedari'));
    assert.deepEqual(hosts, [`${EXTENSION_SUPPORTED_ORIGIN}/*`]);
  });

  it('the ResumeMate content script matches only the website origin', () => {
    const matches = manifest.content_scripts.flatMap((cs: { matches: string[] }) => cs.matches).filter((m: string) => m.includes('prajwalkedari'));
    assert.deepEqual(matches, [`${EXTENSION_SUPPORTED_ORIGIN}/*`]);
  });

  for (const rel of ['background/service-worker.js', 'content/resumemate.js']) {
    it(`${rel} allow-lists exactly the website origin`, () => {
      const text = readFileSync(bundleUrl(rel), 'utf8');
      const m = text.match(/var PRODUCTION_WEBSITE_ORIGIN = "([^"]+)"/);
      assert.ok(m, 'production origin constant not found');
      assert.equal(m[1], EXTENSION_SUPPORTED_ORIGIN);
      assert.equal(text.includes('"https://prajwalkedari.tech"'), false, 'stale root-domain origin must not remain');
    });
  }

  it('the extension protocol version matches the website bridge version', () => {
    const text = readFileSync(bundleUrl('content/resumemate.js'), 'utf8');
    const m = text.match(/var PROTOCOL_VERSION = (\d+);/);
    assert.ok(m, 'PROTOCOL_VERSION not found in the extension bundle');
    assert.equal(Number(m[1]), BRIDGE_VERSION);
  });
});
