// Checks that a listener subscribed before prepare() receives every reply, including the progress
// messages that arrive before the final REVIEW_PROMPT. The generation hook relies on this ordering.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ExtensionBridge, BRIDGE_CHANNEL, BRIDGE_VERSION, type BridgeHost, type BridgeReply } from '../lib/extension-bridge';

type Listener = (event: { source: unknown; origin: string; data: unknown }) => void;
const WIN = { name: 'window' };
const ORIGIN = 'https://resumemate.prajwalkedari.tech';

function makeHost() {
  const listeners: Listener[] = [];
  const sent: any[] = [];
  const host: BridgeHost = {
    origin: ORIGIN,
    postMessage: (m) => { sent.push(m); },
    addEventListener: (_t, l) => { listeners.push(l); },
    removeEventListener: (_t, l) => { listeners.splice(listeners.indexOf(l), 1); },
    isOwnWindow: (s) => s === WIN,
  };
  const deliver = (message: Record<string, unknown>) => {
    for (const l of [...listeners]) l({ source: WIN, origin: ORIGIN, data: { channel: BRIDGE_CHANNEL, v: BRIDGE_VERSION, direction: 'to-page', message } });
  };
  return { host, sent, deliver };
}

const payload = {
  task: 'generate' as const, template: 'none' as const, outputFormat: 'markdown' as const,
  resumeText: 'Name: Alex Morgan\nEmail: alex.morgan@example.com\nSkills:\n- TypeScript', jobDescription: '', customInstructions: '',
};

describe('subscribe before prepare', () => {
  it('a subscriber sees GEMINI_STATUS and REVIEW_PROMPT in order, and prepare still resolves', async () => {
    const { host, sent, deliver } = makeHost();
    const bridge = new ExtensionBridge(host);
    const seen: BridgeReply[] = [];
    const unsub = bridge.subscribe((r) => seen.push(r));
    const pending = bridge.prepare(payload, 2000);
    const requestId = sent[0].message.requestId;
    deliver({ type: 'GEMINI_STATUS', requestId, status: 'awaiting-send-approval', message: 'Review.' });
    deliver({ type: 'REVIEW_PROMPT', requestId, status: 'awaiting-user-review' });
    assert.deepEqual(await pending, { ok: true, requestId });
    assert.deepEqual(seen.map((r) => r.type), ['GEMINI_STATUS', 'REVIEW_PROMPT']);
    unsub();
    bridge.dispose();
  });

  it('an unsubscribed listener stops receiving replies', () => {
    const { host, sent, deliver } = makeHost();
    const bridge = new ExtensionBridge(host);
    const seen: BridgeReply[] = [];
    const unsub = bridge.subscribe((r) => seen.push(r));
    bridge.prepare(payload, 2000).catch(() => undefined);
    const requestId = sent[0].message.requestId;
    unsub();
    deliver({ type: 'GEMINI_STATUS', requestId, status: 'awaiting-send-approval' });
    assert.equal(seen.length, 0);
    bridge.dispose();
  });
});
