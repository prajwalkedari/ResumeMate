// Regression tests for the bridge client's reply handling. They use a fake window host,
// so they run without the extension source. The message order matches what the extension
// bundle sends (verified in Chromium; see docs/TEST-REPORT.md): GEMINI_STATUS progress
// arrives before the REVIEW_PROMPT reply.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ExtensionBridge, BRIDGE_CHANNEL, BRIDGE_VERSION, interpretHelloReply, type BridgeHost, type BridgeReply } from '../lib/extension-bridge';

type Listener = (event: { source: unknown; origin: string; data: unknown }) => void;
const WIN = { name: 'window' };
const ORIGIN = 'https://resume.example.test';

function makeHost() {
  const listeners: Listener[] = [];
  const sent: any[] = [];
  const host: BridgeHost = {
    origin: ORIGIN,
    postMessage: (message) => { sent.push(message); },
    addEventListener: (_t, l) => { listeners.push(l); },
    removeEventListener: (_t, l) => { listeners.splice(listeners.indexOf(l), 1); },
    isOwnWindow: (source) => source === WIN,
  };
  const deliver = (data: unknown, origin = ORIGIN, source: unknown = WIN) => {
    for (const l of [...listeners]) l({ source, origin, data });
  };
  return { host, sent, deliver };
}

const reply = (message: Record<string, unknown>) => ({ channel: BRIDGE_CHANNEL, v: BRIDGE_VERSION, direction: 'to-page', message });
const payload = {
  task: 'improve' as const, template: 'none' as const, outputFormat: 'markdown' as const,
  resumeText: 'Name: Alex Morgan\nEmail: alex.morgan@example.com\nSkills:\n- TypeScript', jobDescription: '', customInstructions: '',
};

describe('prepare() waits for the final reply, not progress', () => {
  it('accepts a request when GEMINI_STATUS progress arrives before REVIEW_PROMPT', async () => {
    const { host, sent, deliver } = makeHost();
    const bridge = new ExtensionBridge(host);
    const pending = bridge.prepare(payload, 2000);
    const requestId = sent[0].message.requestId;
    deliver(reply({ type: 'GEMINI_STATUS', requestId, status: 'awaiting-send-approval', message: 'Review the prompt.' }));
    deliver(reply({ type: 'REVIEW_PROMPT', requestId, status: 'awaiting-user-review' }));
    const result = await pending;
    assert.deepEqual(result, { ok: true, requestId });
    bridge.dispose();
  });

  it('returns the extension error when the request is refused', async () => {
    const { host, sent, deliver } = makeHost();
    const bridge = new ExtensionBridge(host);
    const pending = bridge.prepare(payload, 2000);
    const requestId = sent[0].message.requestId;
    deliver(reply({ type: 'ERROR', requestId, code: 'INVALID_PAYLOAD', message: 'Resume text too short.' }));
    assert.deepEqual(await pending, { ok: false, code: 'INVALID_PAYLOAD', message: 'Resume text too short.' });
    bridge.dispose();
  });

  it('times out when no final reply arrives, even after progress', async () => {
    const { host, sent, deliver } = makeHost();
    const bridge = new ExtensionBridge(host);
    const pending = bridge.prepare(payload, 50);
    const requestId = sent[0].message.requestId;
    deliver(reply({ type: 'GEMINI_STATUS', requestId, status: 'awaiting-send-approval', message: 'Review the prompt.' }));
    const result = await pending;
    assert.equal(result.ok, false);
    assert.equal((result as { code: string }).code, 'TIMEOUT');
    bridge.dispose();
  });

  it('ignores a REVIEW_PROMPT from a foreign origin or window', async () => {
    const { host, sent, deliver } = makeHost();
    const bridge = new ExtensionBridge(host);
    const pending = bridge.prepare(payload, 50);
    const requestId = sent[0].message.requestId;
    deliver(reply({ type: 'REVIEW_PROMPT', requestId, status: 'awaiting-user-review' }), 'https://evil.example.test');
    deliver(reply({ type: 'REVIEW_PROMPT', requestId, status: 'awaiting-user-review' }), ORIGIN, { name: 'other' });
    assert.equal((await pending).ok, false);
    bridge.dispose();
  });
});

describe('hello() never sends resume data', () => {
  it('sends only type and requestId', async () => {
    const { host, sent, deliver } = makeHost();
    const bridge = new ExtensionBridge(host);
    const pending = bridge.hello(2000);
    const requestId = sent[0].message.requestId;
    assert.deepEqual(Object.keys(sent[0].message).sort(), ['requestId', 'type']);
    deliver(reply({ type: 'CONNECTION_STATUS', requestId, connected: true, busy: false, extensionVersion: '0.1.0', protocolVersion: 1 }));
    assert.deepEqual(await pending, { state: 'connected', extensionVersion: '0.1.0', protocolVersion: 1, code: null });
    bridge.dispose();
  });

  it('reports not-installed when no reply arrives before the timeout', async () => {
    const { host } = makeHost();
    const bridge = new ExtensionBridge(host);
    const result = await bridge.hello(30);
    assert.equal(result.state, 'not-installed');
    assert.equal(result.extensionVersion, null);
    bridge.dispose();
  });
});

describe('interpretHelloReply: only a valid CONNECTION_STATUS counts as verified', () => {
  const status = (extra: Record<string, unknown> = {}): BridgeReply => ({
    type: 'CONNECTION_STATUS', requestId: 'rm-x', connected: true, busy: false,
    extensionVersion: '0.1.0', protocolVersion: 1, ...extra,
  });

  it('connected for a valid, idle reply', () => {
    assert.equal(interpretHelloReply(status()).state, 'connected');
  });
  it('busy when the extension has an active request', () => {
    assert.equal(interpretHelloReply(status({ busy: true })).state, 'busy');
  });
  it('incompatible when the protocol version differs, and keeps the reported versions', () => {
    const r = interpretHelloReply(status({ protocolVersion: 2 }));
    assert.equal(r.state, 'incompatible');
    assert.equal(r.protocolVersion, 2);
    assert.equal(r.extensionVersion, '0.1.0');
  });
  it('error (malformed) for a reply missing the protocol version, never connected', () => {
    const r = interpretHelloReply(status({ protocolVersion: undefined }));
    assert.equal(r.state, 'error');
    assert.equal(r.code, 'MALFORMED_REPLY');
  });
  it('error (malformed) when connected is not true', () => {
    assert.equal(interpretHelloReply(status({ connected: false })).state, 'error');
  });
  it('error for an ERROR reply, with its code', () => {
    const r = interpretHelloReply({ type: 'ERROR', requestId: 'rm-x', code: 'INTERNAL_ERROR', message: 'x' });
    assert.deepEqual([r.state, r.code], ['error', 'INTERNAL_ERROR']);
  });
  it('not-installed when there is no reply', () => {
    assert.equal(interpretHelloReply(null).state, 'not-installed');
  });
});
