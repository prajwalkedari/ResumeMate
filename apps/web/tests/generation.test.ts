// Unit tests for the generation state machine (lib/generation.ts). Every reply below uses the
// message names and fields the extension bundle sends (see apps/extension/background/service-worker.js).
// These are fixture tests of the page logic only. They do not prove live Gemini behaviour.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  generationReducer, initialGeneration, isActive, describeExtensionError, validateReturnedOutput,
  MAX_OUTPUT_CHARS, PROCESSING_SILENCE_MS, RESPONSE_SILENCE_MS, type GenerationState,
} from '../lib/generation';
import type { BridgeReply, HelloResult } from '../lib/extension-bridge';

const ID = 'rm-req-1';
const connected: HelloResult = { state: 'connected', extensionVersion: '0.1.0', protocolVersion: 1, code: null };
const status = (s: string, message?: string): BridgeReply => ({ type: 'GEMINI_STATUS', requestId: ID, status: s, ...(message ? { message } : {}) });

/** Runs a sequence of actions through the reducer. */
function run(actions: Parameters<typeof generationReducer>[1][], start: GenerationState = { ...initialGeneration, connection: connected }) {
  return actions.reduce((s, a) => generationReducer(s, a), start);
}
const begin = { type: 'prepare-start', requestId: ID, now: 0 } as const;

describe('happy path follows every extension step in order', () => {
  it('goes preparing → approval → processing → response → review → completed', () => {
    const phases: string[] = [];
    let s: GenerationState = { ...initialGeneration, connection: connected };
    const steps: Parameters<typeof generationReducer>[1][] = [
      begin,
      { type: 'prepare-ok', requestId: ID, now: 1 },
      { type: 'reply', reply: status('awaiting-send-approval'), now: 2 },
      { type: 'reply', reply: status('inserting'), now: 3 },
      { type: 'reply', reply: status('awaiting-submit-confirmation'), now: 4 },
      { type: 'reply', reply: status('submitting'), now: 5 },
      { type: 'reply', reply: status('waiting-for-gemini'), now: 6 },
      { type: 'reply', reply: status('gemini-responding'), now: 7 },
      { type: 'reply', reply: { type: 'GEMINI_RESPONSE', requestId: ID, status: 'ready', characters: 1200, warnings: [] }, now: 8 },
      { type: 'reply', reply: { type: 'RETURN_OUTPUT', requestId: ID, output: '# Alex\n- Built things', isLatex: false, warnings: [] }, now: 9 },
    ];
    for (const a of steps) { s = generationReducer(s, a); phases.push(s.phase); }
    assert.deepEqual(phases, ['preparing', 'awaiting-approval', 'awaiting-approval', 'processing', 'awaiting-approval', 'processing', 'waiting-response', 'waiting-response', 'reviewing', 'reviewing']);
    assert.equal(s.output?.text, '# Alex\n- Built things');
    assert.equal(s.responseCharacters, 1200, 'the length reported by GEMINI_RESPONSE is kept for display');
    s = generationReducer(s, { type: 'accepted' });
    assert.equal(s.phase, 'completed');
    assert.equal(s.output, null, 'output is handed to the page on accept and cleared from the flow');
  });

  it('GEMINI_RESPONSE reports the length only, never text', () => {
    const s = run([begin, { type: 'prepare-ok', requestId: ID, now: 1 }, { type: 'reply', reply: { type: 'GEMINI_RESPONSE', requestId: ID, status: 'ready', characters: 42, warnings: [] }, now: 2 }]);
    assert.equal(s.phase, 'reviewing');
    assert.equal(s.output, null);
    assert.equal(s.responseCharacters, 42);
  });
});

describe('approval gates', () => {
  it('prepare-ok does not move forward if the extension already reported a later status', () => {
    const s = run([begin, { type: 'reply', reply: status('awaiting-send-approval'), now: 1 }, { type: 'prepare-ok', requestId: ID, now: 2 }]);
    assert.equal(s.phase, 'awaiting-approval');
  });
  it('a rejected prepare shows the extension error and keeps the connection', () => {
    const s = run([begin, { type: 'prepare-failed', code: 'INVALID_PAYLOAD', message: 'Resume text too short.' }]);
    assert.equal(s.phase, 'failed');
    assert.deepEqual(s.error, { code: 'INVALID_PAYLOAD', message: 'Resume text too short.' });
    assert.equal(s.connection?.state, 'connected');
    assert.equal(s.requestId, null);
  });
  it('the extension cancel after the user refuses ends as cancelled, not failed', () => {
    const s = run([begin, { type: 'prepare-ok', requestId: ID, now: 1 }, { type: 'reply', reply: status('cancelled', 'Cancelled in the extension.'), now: 2 }]);
    assert.equal(s.phase, 'cancelled');
    assert.equal(s.error, null);
  });
});

describe('invalid or stale replies', () => {
  it('rejects RETURN_OUTPUT with a non-string output', () => {
    const s = run([begin, { type: 'reply', reply: { type: 'RETURN_OUTPUT', requestId: ID, output: 42 as unknown as string, isLatex: false }, now: 1 }]);
    assert.equal(s.phase, 'failed');
    assert.equal(s.error?.code, 'INVALID_RESPONSE');
    assert.equal(s.output, null);
  });
  it('rejects an empty output', () => {
    assert.equal(validateReturnedOutput({ type: 'RETURN_OUTPUT', requestId: ID, output: '', isLatex: false }), null);
  });
  it('rejects an output over the limit', () => {
    assert.equal(validateReturnedOutput({ type: 'RETURN_OUTPUT', requestId: ID, output: 'x'.repeat(MAX_OUTPUT_CHARS + 1), isLatex: false }), null);
    assert.ok(validateReturnedOutput({ type: 'RETURN_OUTPUT', requestId: ID, output: 'x'.repeat(MAX_OUTPUT_CHARS), isLatex: false }));
  });
  it('rejects a missing isLatex flag', () => {
    assert.equal(validateReturnedOutput({ type: 'RETURN_OUTPUT', requestId: ID, output: 'ok' } as BridgeReply), null);
  });
  it('an invalid RETURN_OUTPUT never reaches review', () => {
    const s = run([begin, { type: 'reply', reply: { type: 'RETURN_OUTPUT', requestId: ID, output: '', isLatex: false }, now: 1 }]);
    assert.notEqual(s.phase, 'reviewing');
  });
  it('ignores replies for a different request ID', () => {
    const before = run([begin, { type: 'prepare-ok', requestId: ID, now: 1 }]);
    const after = generationReducer(before, { type: 'reply', reply: { type: 'RETURN_OUTPUT', requestId: 'rm-other', output: 'stolen', isLatex: false }, now: 2 });
    assert.equal(after, before);
  });
  it('ignores a reply after the request was discarded', () => {
    const s = run([begin, { type: 'reply', reply: { type: 'RETURN_OUTPUT', requestId: ID, output: 'a', isLatex: false }, now: 1 }, { type: 'discard' }, { type: 'reply', reply: { type: 'RETURN_OUTPUT', requestId: ID, output: 'late', isLatex: false }, now: 2 }]);
    assert.equal(s.phase, 'idle');
    assert.equal(s.output, null);
  });
  it('an unknown GEMINI_STATUS value fails safely', () => {
    const s = run([begin, { type: 'prepare-ok', requestId: ID, now: 1 }, { type: 'reply', reply: status('mystery'), now: 2 }]);
    assert.equal(s.phase, 'failed');
    assert.equal(s.error?.code, 'INVALID_RESPONSE');
  });
});

describe('failures reported by the extension', () => {
  it('maps extension statuses to failed codes the user can act on', () => {
    const cases: [string, string][] = [['timed-out', 'RESPONSE_TIMEOUT'], ['extraction-failed', 'EXTRACTION_FAILED'], ['gemini-unavailable', 'GEMINI_UNAVAILABLE'], ['error', 'EXTENSION_ERROR']];
    for (const [st, code] of cases) {
      const s = run([begin, { type: 'prepare-ok', requestId: ID, now: 1 }, { type: 'reply', reply: status(st, 'x'), now: 2 }]);
      assert.equal(s.error?.code, code, st);
    }
  });
  it('ERROR BUSY tells the user to finish the other request', () => {
    const s = run([begin, { type: 'reply', reply: { type: 'ERROR', requestId: ID, code: 'BUSY', message: 'busy' }, now: 1 }]);
    assert.equal(s.phase, 'failed');
    assert.match(s.error!.message, /already handling another request/);
  });
  it('describeExtensionError gives a specific message for each known code', () => {
    assert.match(describeExtensionError('STALE_REQUEST'), /no longer has this request/);
    assert.match(describeExtensionError('UNAUTHORIZED_REQUEST'), /Only the page that started/);
    assert.equal(describeExtensionError('UNKNOWN', 'custom'), 'custom');
  });
});

describe('watchdog and disconnection', () => {
  it('fails while processing after the processing silence limit', () => {
    const s = run([begin, { type: 'prepare-ok', requestId: ID, now: 0 }, { type: 'reply', reply: status('submitting'), now: 0 }]);
    const late = generationReducer(s, { type: 'watchdog', now: PROCESSING_SILENCE_MS + 1 });
    assert.equal(late.phase, 'failed');
    assert.equal(late.error?.code, 'NO_UPDATE');
  });
  it('does not time out while the user is reviewing', () => {
    const s = run([begin, { type: 'reply', reply: { type: 'GEMINI_RESPONSE', requestId: ID, status: 'ready', characters: 5, warnings: [] }, now: 0 }]);
    assert.equal(generationReducer(s, { type: 'watchdog', now: RESPONSE_SILENCE_MS * 10 }), s);
  });
  it('waiting for the response uses the longer limit', () => {
    const s = run([begin, { type: 'reply', reply: status('waiting-for-gemini'), now: 0 }]);
    assert.equal(generationReducer(s, { type: 'watchdog', now: PROCESSING_SILENCE_MS + 1 }).phase, 'waiting-response');
    assert.equal(generationReducer(s, { type: 'watchdog', now: RESPONSE_SILENCE_MS + 1 }).error?.code, 'NO_UPDATE');
  });
  it('stop-waiting ends the page state without inventing a success', () => {
    const s = run([begin, { type: 'prepare-ok', requestId: ID, now: 1 }, { type: 'stop-waiting' }]);
    assert.equal(s.phase, 'cancelled');
    assert.equal(s.output, null);
    assert.equal(s.requestId, null);
  });
});

describe('retry, duplicates and preserved connection', () => {
  it('retry after failure starts clean and keeps the connection state', () => {
    const failed = run([begin, { type: 'prepare-failed', code: 'TIMEOUT', message: 'x' }]);
    const again = generationReducer(failed, { type: 'prepare-start', requestId: 'rm-req-2', now: 9 });
    assert.equal(again.phase, 'preparing');
    assert.equal(again.error, null);
    assert.equal(again.requestId, 'rm-req-2');
    assert.equal(again.connection?.state, 'connected');
  });
  it('isActive blocks a second start while a request is in flight', () => {
    for (const p of ['preparing', 'awaiting-approval', 'processing', 'waiting-response', 'reviewing'] as const) assert.equal(isActive(p), true, p);
    for (const p of ['idle', 'checking', 'completed', 'failed', 'cancelled'] as const) assert.equal(isActive(p), false, p);
  });
  it('a connection check does not replace an active request', () => {
    const active = run([begin, { type: 'prepare-ok', requestId: ID, now: 1 }]);
    assert.equal(generationReducer(active, { type: 'check-start' }), active);
  });
  it('discard clears output and returns to idle without touching the connection', () => {
    const s = run([begin, { type: 'reply', reply: { type: 'RETURN_OUTPUT', requestId: ID, output: 'a', isLatex: true }, now: 1 }, { type: 'discard' }]);
    assert.equal(s.phase, 'idle');
    assert.equal(s.output, null);
    assert.equal(s.connection?.state, 'connected');
  });
  it('a busy check keeps the user informed', () => {
    const s = generationReducer({ ...initialGeneration, phase: 'checking' }, { type: 'check-result', result: { state: 'busy', extensionVersion: '0.1.0', protocolVersion: 1, code: null } });
    assert.equal(s.phase, 'idle');
    assert.match(s.message, /busy/);
  });
  it('a not-installed check never reports connected', () => {
    const s = generationReducer({ ...initialGeneration, phase: 'checking' }, { type: 'check-result', result: { state: 'not-installed', extensionVersion: null, protocolVersion: null, code: 'TIMEOUT' } });
    assert.equal(s.connection?.state, 'not-installed');
    assert.equal(s.phase, 'idle');
  });
});
