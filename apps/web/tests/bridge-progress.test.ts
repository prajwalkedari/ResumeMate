// Regression tests for the bridge client's reply handling. They use a fake window host,
// so they run without the extension source. The message order matches what the extension
// bundle sends (verified in Chromium; see docs/TEST-REPORT.md): GEMINI_STATUS progress
// arrives before the REVIEW_PROMPT reply.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ExtensionBridge, BRIDGE_CHANNEL, BRIDGE_VERSION, type BridgeHost } from '../lib/extension-bridge';

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
    assert.equal(await pending, 'connected');
    bridge.dispose();
  });
});
