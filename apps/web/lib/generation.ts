// Pure state machine for one AI-assisted generation request.
// The React hook feeds it bridge replies. It never touches the network or the DOM, so it can be unit-tested.
// Every transition comes from a real extension message. Nothing here is simulated.
import type { BridgeReply, HelloResult } from './extension-bridge';

/** Output limit enforced by the extension (LIMITS.maxOutputChars). */
export const MAX_OUTPUT_CHARS = 60_000;
/** How long the page waits without any update while the extension is processing. Not applied while the user is reviewing. */
export const PROCESSING_SILENCE_MS = 120_000;
export const RESPONSE_SILENCE_MS = 360_000;

export type Phase =
  | 'idle'
  | 'checking'
  | 'preparing'
  | 'awaiting-approval'
  | 'processing'
  | 'waiting-response'
  | 'reviewing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface GeneratedOutput {
  text: string;
  isLatex: boolean;
  warnings: string[];
}

export interface GenerationState {
  phase: Phase;
  connection: HelloResult | null;
  requestId: string | null;
  message: string;
  output: GeneratedOutput | null;
  error: { code: string; message: string } | null;
  lastUpdate: number;
  /** Set when the extension reports a response is ready but has not yet sent its text. */
  responseCharacters: number | null;
}

export const initialGeneration: GenerationState = {
  phase: 'idle',
  connection: null,
  requestId: null,
  message: '',
  output: null,
  error: null,
  lastUpdate: 0,
  responseCharacters: null,
};

export type GenerationAction =
  | { type: 'check-start' }
  | { type: 'check-result'; result: HelloResult }
  | { type: 'prepare-start'; requestId: string; now: number }
  | { type: 'prepare-ok'; requestId: string; now: number }
  | { type: 'prepare-failed'; code: string; message: string }
  | { type: 'reply'; reply: BridgeReply; now: number }
  | { type: 'stop-waiting' }
  | { type: 'watchdog'; now: number }
  | { type: 'discard' }
  | { type: 'accepted' }
  | { type: 'reset' };

const FAILED = (code: string, message: string) => ({ phase: 'failed' as const, error: { code, message } });

/** Maps an ERROR code from the extension to a message the user can act on. */
export function describeExtensionError(code: string, fallback?: string): string {
  switch (code) {
    case 'BUSY':
      return 'The extension is already handling another request. Finish or cancel it in the extension popup, then try again.';
    case 'INVALID_PAYLOAD':
      return fallback ?? 'The extension rejected the prepared details. Check the resume details and try again.';
    case 'STALE_REQUEST':
      return 'The extension no longer has this request. Start again.';
    case 'UNAUTHORIZED_REQUEST':
      return 'Only the page that started this request can change it.';
    default:
      return fallback ?? 'The extension could not complete the request. Try again.';
  }
}

/** Checks a RETURN_OUTPUT message. Returns null when it is not a valid output. */
export function validateReturnedOutput(reply: BridgeReply): GeneratedOutput | null {
  if (typeof reply.output !== 'string') return null;
  if (reply.output.length === 0 || reply.output.length > MAX_OUTPUT_CHARS) return null;
  if (typeof reply.isLatex !== 'boolean') return null;
  return { text: reply.output, isLatex: reply.isLatex, warnings: [] };
}

function applyReply(state: GenerationState, reply: BridgeReply, now: number): GenerationState {
  if (reply.requestId !== state.requestId) return state; // stale or foreign reply: ignore

  switch (reply.type) {
    case 'GEMINI_STATUS': {
      const status = typeof reply.status === 'string' ? reply.status : '';
      const base = { ...state, lastUpdate: now };
      switch (status) {
        case 'awaiting-send-approval':
          return { ...base, phase: 'awaiting-approval', message: 'Approve the prompt in the ResumeMate Assistant popup. Nothing is sent to Gemini until you do.' };
        case 'inserting':
          return { ...base, phase: 'processing', message: 'Placing the approved prompt in your Gemini tab.' };
        case 'awaiting-submit-confirmation':
          return { ...base, phase: 'awaiting-approval', message: 'Check the prompt in your Gemini tab, then confirm submission in the extension popup.' };
        case 'submitting':
          return { ...base, phase: 'processing', message: 'Submitting in Gemini.' };
        case 'waiting-for-gemini':
          return { ...base, phase: 'waiting-response', message: 'Waiting for Gemini to respond.' };
        case 'gemini-responding':
          return { ...base, phase: 'waiting-response', message: 'Gemini is responding.' };
        case 'cancelled':
          return { ...base, phase: 'cancelled', message: typeof reply.message === 'string' ? reply.message : 'Cancelled.' };
        case 'timed-out':
          return { ...state, lastUpdate: now, ...FAILED('RESPONSE_TIMEOUT', 'Gemini did not respond in time. You can try again.') };
        case 'extraction-failed':
          return { ...state, lastUpdate: now, ...FAILED('EXTRACTION_FAILED', 'The extension could not read Gemini’s reply. Check the Gemini tab, then try again.') };
        case 'gemini-unavailable':
          return { ...state, lastUpdate: now, ...FAILED('GEMINI_UNAVAILABLE', 'Gemini is not available. Sign in to Gemini in Chrome, keep the tab open, then try again.') };
        case 'error':
          return { ...state, lastUpdate: now, ...FAILED('EXTENSION_ERROR', typeof reply.message === 'string' ? reply.message : 'The extension reported an error. Try again.') };
        default:
          return { ...state, lastUpdate: now, ...FAILED('INVALID_RESPONSE', 'The extension sent an unexpected status. Try again.') };
      }
    }
    case 'GEMINI_RESPONSE': {
      if (reply.status !== 'ready') return { ...state, lastUpdate: now, ...FAILED('INVALID_RESPONSE', 'The extension sent an unexpected response. Try again.') };
      return {
        ...state,
        lastUpdate: now,
        phase: 'reviewing',
        responseCharacters: typeof reply.characters === 'number' ? reply.characters : null,
        message: 'Gemini has responded. In the extension popup, review the response and send it to ResumeMate.',
      };
    }
    case 'RETURN_OUTPUT': {
      const output = validateReturnedOutput(reply);
      if (!output) return { ...state, lastUpdate: now, ...FAILED('INVALID_RESPONSE', 'The returned output was not valid. Discard it and try again.') };
      const warnings = Array.isArray(reply.warnings) ? reply.warnings.filter((w): w is string => typeof w === 'string') : [];
      return {
        ...state,
        lastUpdate: now,
        phase: 'reviewing',
        output: { ...output, warnings },
        message: 'Generated output received. Review it before you use it. Nothing has been added to your resume.',
      };
    }
    case 'ERROR':
      return {
        ...state,
        lastUpdate: now,
        phase: 'failed',
        error: { code: typeof reply.code === 'string' ? reply.code : 'EXTENSION_ERROR', message: describeExtensionError(String(reply.code), typeof reply.message === 'string' ? reply.message : undefined) },
      };
    default:
      return state;
  }
}

export function generationReducer(state: GenerationState, action: GenerationAction): GenerationState {
  switch (action.type) {
    case 'check-start':
      // A connection check must not replace a request that is in progress.
      if (isActive(state.phase)) return state;
      return { ...state, phase: 'checking', message: 'Checking ResumeMate Assistant...' };
    case 'check-result': {
      const { result } = action;
      if (result.state === 'connected') return { ...state, phase: state.phase === 'checking' ? 'idle' : state.phase, connection: result };
      if (result.state === 'busy') return { ...state, phase: state.phase === 'checking' ? 'idle' : state.phase, connection: result, message: 'The extension is busy with another request.' };
      return { ...state, phase: state.phase === 'checking' ? 'idle' : state.phase, connection: result };
    }
    case 'prepare-start':
      return { ...initialGeneration, connection: state.connection, phase: 'preparing', requestId: action.requestId, lastUpdate: action.now, message: 'Preparing the request for your review...' };
    case 'prepare-ok':
      // Only move forward from "preparing". The extension may already have reported a later status.
      if (action.requestId !== state.requestId || state.phase !== 'preparing') return state;
      return { ...state, phase: 'awaiting-approval', message: 'Approve the prompt in the ResumeMate Assistant popup. Nothing is sent to Gemini until you do.', lastUpdate: action.now };
    case 'prepare-failed':
      return { ...state, phase: 'failed', requestId: null, error: { code: action.code, message: action.message } };
    case 'reply':
      return applyReply(state, action.reply, action.now);
    case 'stop-waiting':
      return { ...state, phase: 'cancelled', requestId: null, message: 'Stopped waiting here. If the extension still has this request, cancel it in the extension popup. Nothing has been added to your resume.' };
    case 'watchdog': {
      if (state.phase === 'processing' && action.now - state.lastUpdate > PROCESSING_SILENCE_MS) {
        return { ...state, ...FAILED('NO_UPDATE', 'No update from the extension for two minutes. Check that the extension is enabled and this tab is open, then try again.') };
      }
      if (state.phase === 'waiting-response' && action.now - state.lastUpdate > RESPONSE_SILENCE_MS) {
        return { ...state, ...FAILED('NO_UPDATE', 'No update from the extension for six minutes. Check that the Gemini tab is open, then try again.') };
      }
      return state;
    }
    case 'discard':
      return { ...state, phase: 'idle', output: null, requestId: null, responseCharacters: null, message: 'Output discarded. Nothing was added to your resume.' };
    case 'accepted':
      return { ...state, phase: 'completed', requestId: null, output: null, responseCharacters: null, message: 'Saved as an AI draft. Your resume details were not changed.' };
    case 'reset':
      return { ...initialGeneration, connection: state.connection };
    default:
      return state;
  }
}

/** True while the request is in flight and a user action is needed or expected. */
export const isActive = (phase: Phase) => ['preparing', 'awaiting-approval', 'processing', 'waiting-response', 'reviewing'].includes(phase);
// 'reviewing' counts as active so that a connection check never replaces output the user has not dealt with yet.
