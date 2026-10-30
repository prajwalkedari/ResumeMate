// Cross-repo integration tests. They import the frontend's bridge module and the
// extension's own validator. Set RM_EXTENSION_SRC to the extension's src/ directory.
// Sample data is fictional. Run: node --import tsx --test tests/extension-bridge.test.ts
import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sampleResume, emptyResume, type Resume } from '../lib/resume';
import * as bridge from '../lib/extension-bridge';

const EXT = process.env.RM_EXTENSION_SRC ?? '/home/claude/resumemate-extension/src';
const load = (rel: string) => import(pathToFileURL(join(EXT, rel)).href);

let validation: any;
let protocol: any;
let constants: any;

before(async () => {
  validation = await load('shared/validation.ts');
  protocol = await load('shared/protocol.ts');
  constants = await load('shared/constants.ts');
});

const ORIGIN = 'https://resumemate.prajwalkedari.tech';

describe('limits stay identical across the two repositories', () => {
  it('frontend BRIDGE_LIMITS match the extension LIMITS', () => {
    assert.equal(bridge.BRIDGE_LIMITS.minResumeChars, constants.LIMITS.minResumeChars);
    assert.equal(bridge.BRIDGE_LIMITS.maxResumeChars, constants.LIMITS.maxResumeChars);
    assert.equal(bridge.BRIDGE_LIMITS.maxJobChars, constants.LIMITS.maxJobChars);
    assert.equal(bridge.BRIDGE_LIMITS.maxInstructionChars, constants.LIMITS.maxInstructionChars);
  });
  it('channel and version match the extension protocol', () => {
    assert.equal(bridge.BRIDGE_CHANNEL, 'resumemate-web');
    assert.equal(bridge.BRIDGE_VERSION, constants.PROTOCOL_VERSION);
  });
});

describe('serialization of the fictional sample resume', () => {
  it('produces text the extension validator accepts for every task', () => {
    for (const task of ['improve', 'generate', 'review', 'extract', 'latex'] as const) {
      const result = bridge.buildRequestPayload(sampleResume, { task });
      assert.equal(result.ok, true, `task ${task}: ${result.ok ? '' : result.errors.join(' ')}`);
      if (!result.ok) continue;
      const verdict = validation.validateResumeRequest(result.payload);
      assert.equal(verdict.ok, true, `extension rejected ${task}: ${verdict.ok ? '' : verdict.errors.join(' ')}`);
    }
  });

  it('wrapped in a bridge envelope, the extension parser accepts a PREPARE_PROMPT', () => {
    const result = bridge.buildRequestPayload(sampleResume, { task: 'improve' });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const envelope = bridge.buildEnvelope({ type: 'PREPARE_PROMPT', requestId: bridge.createRequestId(), payload: result.payload });
    const parsed = protocol.parseWebInbound(envelope.message);
    assert.equal(parsed.ok, true, parsed.ok ? '' : parsed.message);
    assert.equal(parsed.value.type, 'PREPARE_PROMPT');
    assert.equal(protocol.isBridgeEnvelope(envelope, 'to-extension'), true);
  });

  it('keeps every entered fact and skips empty fields', () => {
    const text = bridge.serializeResume(sampleResume);
    assert.match(text, /Name: Alex Morgan/);
    assert.match(text, /Email: alex\.morgan@example\.com/);
    assert.match(text, /Example State University/);
    assert.match(text, /Completed a six-month analytics internship/);
    assert.doesNotMatch(text, /Phone:/, 'empty phone must not be emitted');
    assert.doesNotMatch(text, /undefined|null/);
  });

  it('keeps multi-line responsibilities as separate lines', () => {
    const text = bridge.serializeResume(sampleResume);
    assert.match(text, /Analysed sales data with Pandas/);
    assert.match(text, /Wrote SQL queries/);
  });
});

describe('frontend rejects input the extension would reject', () => {
  it('empty resume is refused before anything is sent', () => {
    const result = bridge.buildRequestPayload(emptyResume, { task: 'improve' });
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.errors.length > 0);
  });

  it('tailoring without a job description is refused, and the extension agrees', () => {
    const resume: Resume = { ...sampleResume, target: { jobTitle: 'Engineer', jobDescription: '' } };
    const result = bridge.buildRequestPayload(resume, { task: 'tailor' });
    assert.equal(result.ok, false);
    const extVerdict = validation.validateResumeRequest({
      task: 'tailor', template: 'none', outputFormat: 'markdown', resumeText: bridge.serializeResume(resume), jobDescription: '',
    });
    assert.equal(extVerdict.ok, false);
  });

  it('an oversized resume is refused by both sides', () => {
    const huge: Resume = {
      ...sampleResume,
      summary: 'x'.repeat(bridge.BRIDGE_LIMITS.maxResumeChars + 10),
    };
    const result = bridge.buildRequestPayload(huge, { task: 'improve' });
    assert.equal(result.ok, false);
    const extVerdict = validation.validateResumeRequest({
      task: 'improve', template: 'none', outputFormat: 'markdown', resumeText: bridge.serializeResume(huge),
    });
    assert.equal(extVerdict.ok, false);
  });

  it('LaTeX task always requests LaTeX output, which the extension also requires', () => {
    const result = bridge.buildRequestPayload(sampleResume, { task: 'latex' });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.payload.outputFormat, 'latex');
  });
});

// ---- Bridge client, driven by an injected fake window ----------------------------

type Listener = (event: { source: unknown; origin: string; data: unknown }) => void;

function fakeHost(origin = ORIGIN) {
  const posted: { message: any; target: string }[] = [];
  const listeners = new Set<Listener>();
  const host: bridge.BridgeHost = {
    origin,
    postMessage: (message, target) => posted.push({ message, target }),
    addEventListener: (_t, l) => listeners.add(l),
    removeEventListener: (_t, l) => listeners.delete(l),
    isOwnWindow: (source) => source === 'own-window',
  };
  const deliver = (data: unknown, o = origin, source: unknown = 'own-window') =>
    [...listeners].forEach((l) => l({ source, origin: o, data }));
  return { host, posted, deliver };
}

const replyEnvelope = (message: Record<string, unknown>) => ({ channel: 'resumemate-web', v: 1, direction: 'to-page', message });
const lastRequestId = (posted: { message: any }[]) => posted[posted.length - 1].message.message.requestId as string;

describe('bridge client', () => {
  it('hello sends no resume data and reports connected on CONNECTION_STATUS', async () => {
    const { host, posted, deliver } = fakeHost();
    const client = new bridge.ExtensionBridge(host);
    const pending = client.hello(1000);
    const requestId = lastRequestId(posted);
    assert.equal(posted[0].message.message.type, 'HELLO');
    assert.equal(posted[0].message.message.payload, undefined);
    assert.equal(posted[0].target, ORIGIN, 'messages are targeted at the page origin only');
    deliver(replyEnvelope({ type: 'CONNECTION_STATUS', requestId, connected: true, busy: false, extensionVersion: '0.1.0', protocolVersion: 1 }));
    assert.equal(await pending, 'connected');
    client.dispose();
  });

  it('hello reports not-detected when the extension does not answer', async () => {
    const { host } = fakeHost();
    const client = new bridge.ExtensionBridge(host);
    assert.equal(await client.hello(20), 'not-detected');
    client.dispose();
  });

  it('replies from another origin are ignored', async () => {
    const { host, posted, deliver } = fakeHost();
    const client = new bridge.ExtensionBridge(host);
    const pending = client.hello(50);
    const requestId = lastRequestId(posted);
    deliver(replyEnvelope({ type: 'CONNECTION_STATUS', requestId, connected: true, busy: false }), 'https://evil.example');
    assert.equal(await pending, 'not-detected');
    client.dispose();
  });

  it('replies from a foreign window source are ignored', async () => {
    const { host, posted, deliver } = fakeHost();
    const client = new bridge.ExtensionBridge(host);
    const pending = client.hello(50);
    const requestId = lastRequestId(posted);
    deliver(replyEnvelope({ type: 'CONNECTION_STATUS', requestId, connected: true, busy: false }), ORIGIN, 'iframe');
    assert.equal(await pending, 'not-detected');
    client.dispose();
  });

  it('replies for unknown or stale request IDs are dropped', async () => {
    const { host, deliver } = fakeHost();
    const client = new bridge.ExtensionBridge(host);
    const seen: unknown[] = [];
    client.subscribe((r) => seen.push(r));
    deliver(replyEnvelope({ type: 'GEMINI_STATUS', requestId: 'rm-stale-00001', status: 'waiting-for-gemini', message: 'old' }));
    assert.equal(seen.length, 0, 'a reply for an ID this client never sent must not be delivered');
    client.dispose();
  });

  it('malformed envelopes are rejected', () => {
    assert.equal(bridge.parseBridgeEnvelope(null), null);
    assert.equal(bridge.parseBridgeEnvelope({ channel: 'other', v: 1, direction: 'to-page', message: { type: 'ERROR', requestId: null } }), null);
    assert.equal(bridge.parseBridgeEnvelope({ channel: 'resumemate-web', v: 2, direction: 'to-page', message: { type: 'ERROR', requestId: null } }), null);
    assert.equal(bridge.parseBridgeEnvelope({ channel: 'resumemate-web', v: 1, direction: 'to-extension', message: { type: 'ERROR', requestId: null } }), null);
    assert.equal(bridge.parseBridgeEnvelope({ channel: 'resumemate-web', v: 1, direction: 'to-page', message: { type: 'SEND_TO_GEMINI', requestId: null } }), null);
  });

  it('prepare returns the request ID on REVIEW_PROMPT and carries the payload', async () => {
    const { host, posted, deliver } = fakeHost();
    const client = new bridge.ExtensionBridge(host);
    const built = bridge.buildRequestPayload(sampleResume, { task: 'improve' });
    assert.equal(built.ok, true);
    if (!built.ok) return;
    const pending = client.prepare(built.payload, 1000);
    const requestId = lastRequestId(posted);
    assert.equal(posted[0].message.message.type, 'PREPARE_PROMPT');
    deliver(replyEnvelope({ type: 'REVIEW_PROMPT', requestId, status: 'awaiting-user-review' }));
    assert.deepEqual(await pending, { ok: true, requestId });
    client.dispose();
  });

  it('prepare surfaces an extension ERROR with its code', async () => {
    const { host, posted, deliver } = fakeHost();
    const client = new bridge.ExtensionBridge(host);
    const built = bridge.buildRequestPayload(sampleResume, { task: 'improve' });
    if (!built.ok) throw new Error('fixture should be valid');
    const pending = client.prepare(built.payload, 1000);
    deliver(replyEnvelope({ type: 'ERROR', requestId: lastRequestId(posted), code: 'BUSY', message: 'Another request is in progress.' }));
    assert.deepEqual(await pending, { ok: false, code: 'BUSY', message: 'Another request is in progress.' });
    client.dispose();
  });

  it('prepare times out honestly when the extension is absent', async () => {
    const { host } = fakeHost();
    const client = new bridge.ExtensionBridge(host);
    const built = bridge.buildRequestPayload(sampleResume, { task: 'improve' });
    if (!built.ok) throw new Error('fixture should be valid');
    const result = await client.prepare(built.payload, 20);
    assert.equal(result.ok, false);
    client.dispose();
  });

  it('cancel is only sent for requests this client created', () => {
    const { host, posted } = fakeHost();
    const client = new bridge.ExtensionBridge(host);
    client.cancel('rm-never-sent-01');
    assert.equal(posted.length, 0);
    client.dispose();
  });
});
