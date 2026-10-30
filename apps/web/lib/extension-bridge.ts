// Framework-agnostic client for the ResumeMate Assistant extension.
// It speaks the protocol documented in the extension's docs/WEBSITE-INTEGRATION.md:
// a window.postMessage envelope that the extension's content script relays.
// Nothing here sends resume data unless prepare() is called by the user's action.
import { validateResume, type Fields, type Resume } from './resume';

export const BRIDGE_CHANNEL = 'resumemate-web' as const;
export const BRIDGE_VERSION = 1 as const;

// The only origin the extension is built to talk to in production. The extension's manifest and
// bundled allow-list must use the same value; a web test checks that against apps/extension.
export const EXTENSION_SUPPORTED_ORIGIN = 'https://resumemate.prajwalkedari.tech' as const;
// Installation and information page for the extension.
export const EXTENSION_INFO_URL = 'https://extension.prajwalkedari.tech' as const;

// Must match the extension's LIMITS (src/shared/constants.ts). The cross-repo test checks this.
export const BRIDGE_LIMITS = {
  minResumeChars: 40,
  maxResumeChars: 20000,
  maxJobChars: 10000,
  maxInstructionChars: 1000,
} as const;

export type ExtensionTask = 'improve' | 'tailor' | 'generate' | 'latex' | 'review' | 'extract';
export type ExtensionOutputFormat = 'markdown' | 'plain-text' | 'latex';
export type ExtensionTemplate = 'none' | 'chronological' | 'functional' | 'one-page';

export interface ExtensionRequestPayload {
  task: ExtensionTask;
  template: ExtensionTemplate;
  outputFormat: ExtensionOutputFormat;
  resumeText: string;
  jobDescription: string;
  customInstructions: string;
}

export type PayloadResult = { ok: true; payload: ExtensionRequestPayload } | { ok: false; errors: string[] };


function nonEmpty(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function fieldLine(label: string, value: string | undefined): string[] {
  return nonEmpty(value) ? [`${label}: ${value.trim()}`] : [];
}

function entryLine(entry: Fields, labels: Record<string, string>): string | null {
  const parts = Object.keys(labels)
    .filter((key) => nonEmpty(entry[key]))
    .map((key) => `${labels[key]}: ${entry[key].trim()}`);
  return parts.length > 0 ? parts.join(' | ') : null;
}

/**
 * Flattens the structured resume into plain text. Empty fields are skipped, so the
 * extension only receives what the user entered. Multi-line details keep their line breaks.
 */
export function serializeResume(resume: Resume): string {
  const out: string[] = [];
  const p = resume.personal;
  out.push(...fieldLine('Name', p.name), ...fieldLine('Email', p.email), ...fieldLine('Phone', p.phone));
  out.push(...fieldLine('City', p.city), ...fieldLine('LinkedIn', p.linkedin));
  out.push(...fieldLine('GitHub', p.github), ...fieldLine('Portfolio', p.portfolio));

  if (nonEmpty(resume.summary)) out.push('', 'Professional summary:', resume.summary.trim());

  const section = (title: string, lines: (string | null)[]) => {
    const kept = lines.filter((line): line is string => line !== null);
    if (kept.length > 0) out.push('', `${title}:`, ...kept.map((line) => `- ${line}`));
  };

  section(
    'Education',
    resume.education.map((e) =>
      entryLine(e, { degree: 'Degree', institution: 'Institution', year: 'Year', grade: 'Grade', coursework: 'Coursework' }),
    ),
  );
  section(
    'Experience',
    resume.experience.map((e) =>
      entryLine(e, { role: 'Role', company: 'Company', dates: 'Dates', details: 'Details' }),
    ),
  );

  const s = resume.skills;
  const skillLines = [
    ...fieldLine('Languages', s.languages),
    ...fieldLine('Frameworks', s.frameworks),
    ...fieldLine('Databases', s.databases),
    ...fieldLine('Tools', s.tools),
  ];
  if (skillLines.length > 0) out.push('', 'Skills:', ...skillLines.map((line) => `- ${line}`));

  section(
    'Projects',
    resume.projects.map((e) => entryLine(e, { title: 'Title', tech: 'Technologies', link: 'Link', details: 'Details' })),
  );
  section(
    'Certifications',
    resume.certifications.map((e) => entryLine(e, { name: 'Name', issuer: 'Issuer', year: 'Year' })),
  );
  section(
    'Achievements',
    resume.achievements.map((e) => entryLine(e, { title: 'Title', details: 'Details' })),
  );

  return out.join('\n').trim();
}

/**
 * Builds the extension payload from the frontend's structured resume.
 * It returns errors instead of sending anything when the data would be rejected.
 */
export function buildRequestPayload(
  resume: Resume,
  options: { task: ExtensionTask },
): PayloadResult {
  const errors = validateResume(resume);
  const resumeText = serializeResume(resume);
  if (resumeText.length < BRIDGE_LIMITS.minResumeChars) {
    errors.push(`Resume details must be at least ${BRIDGE_LIMITS.minResumeChars} characters before they can be sent.`);
  }
  if (resumeText.length > BRIDGE_LIMITS.maxResumeChars) {
    errors.push(`Resume details must be ${BRIDGE_LIMITS.maxResumeChars.toLocaleString()} characters or fewer.`);
  }

  const jobTitle = resume.target.jobTitle?.trim() ?? '';
  const jobDescription = [jobTitle && `Target job title: ${jobTitle}`, resume.target.jobDescription?.trim()]
    .filter(Boolean)
    .join('\n');
  if (jobDescription.length > BRIDGE_LIMITS.maxJobChars) {
    errors.push(`The job description must be ${BRIDGE_LIMITS.maxJobChars.toLocaleString()} characters or fewer.`);
  }
  if (options.task === 'tailor' && !resume.target.jobDescription?.trim()) {
    errors.push('Add a job description before tailoring the resume to it.');
  }

  if (errors.length > 0) return { ok: false, errors };

  // The visual template is applied by ResumeMate when it renders the PDF, so the
  // extension's content-layout template is always "none" here. See docs/WEBSITE-INTEGRATION.md.
  return {
    ok: true,
    payload: {
      task: options.task,
      template: 'none',
      outputFormat: options.task === 'latex' ? 'latex' : 'markdown',
      resumeText,
      jobDescription,
      customInstructions: '',
    },
  };
}

export function createRequestId(): string {
  return `rm-${crypto.randomUUID()}`;
}

export function buildEnvelope(message: Record<string, unknown>) {
  return { channel: BRIDGE_CHANNEL, v: BRIDGE_VERSION, direction: 'to-extension' as const, message };
}

const REPLY_TYPES = ['CONNECTION_STATUS', 'REVIEW_PROMPT', 'GEMINI_STATUS', 'GEMINI_RESPONSE', 'RETURN_OUTPUT', 'ERROR'];

export interface BridgeReply {
  type: string;
  requestId: string | null;
  [key: string]: unknown;
}

/** Accepts only well-formed envelopes from the extension. Anything else returns null. */
export function parseBridgeEnvelope(data: unknown): BridgeReply | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  if (d.channel !== BRIDGE_CHANNEL || d.v !== BRIDGE_VERSION || d.direction !== 'to-page') return null;
  if (typeof d.message !== 'object' || d.message === null) return null;
  const msg = d.message as Record<string, unknown>;
  if (typeof msg.type !== 'string' || !REPLY_TYPES.includes(msg.type)) return null;
  if (msg.requestId !== null && typeof msg.requestId !== 'string') return null;
  return msg as BridgeReply;
}

/** The subset of window that the client uses. Injected so the client can be tested without a browser. */
export interface BridgeHost {
  origin: string;
  postMessage(message: unknown, targetOrigin: string): void;
  addEventListener(type: 'message', listener: (event: { source: unknown; origin: string; data: unknown }) => void): void;
  removeEventListener(type: 'message', listener: (event: { source: unknown; origin: string; data: unknown }) => void): void;
  isOwnWindow(source: unknown): boolean;
}

/** Outcome of a connection check. Only "connected" and "busy" mean a verified extension answered. */
export type ConnectionOutcome =
  | { state: 'connected'; extensionVersion: string; protocolVersion: number }
  | { state: 'busy'; extensionVersion: string; protocolVersion: number }
  | { state: 'incompatible'; extensionVersion: string | null; protocolVersion: number | null; message: string }
  | { state: 'not-detected' }
  | { state: 'error'; code: string; message: string };

export type HelloResult = ConnectionOutcome['state'];

export const INCOMPATIBLE_MESSAGE = 'Your extension version is incompatible. Please update it.';

// Internal, never sent by the extension: a reply whose envelope version differs from ours.
// It is delivered only to the waiter for the matching request ID, so a newer extension is reported
// as incompatible instead of looking like a missing extension.
const PROTOCOL_MISMATCH = 'PROTOCOL_MISMATCH' as const;
const VERSION_PATTERN = /^[0-9A-Za-z.+-]{1,32}$/;

export interface VersionMismatch {
  type: typeof PROTOCOL_MISMATCH;
  requestId: string;
  envelopeVersion: unknown;
}

/** Recognises a CONNECTION_STATUS reply that carries a different envelope version. Returns null otherwise. */
export function parseVersionMismatch(data: unknown): VersionMismatch | null {
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;
  if (d.channel !== BRIDGE_CHANNEL || d.v === BRIDGE_VERSION || d.direction !== 'to-page') return null;
  if (typeof d.message !== 'object' || d.message === null) return null;
  const msg = d.message as Record<string, unknown>;
  if (msg.type !== 'CONNECTION_STATUS' || typeof msg.requestId !== 'string') return null;
  return { type: PROTOCOL_MISMATCH, requestId: msg.requestId, envelopeVersion: d.v };
}

/** Turns the extension's reply to HELLO into a verified outcome. Anything unexpected is not "connected". */
const isVersionMismatch = (reply: BridgeReply | VersionMismatch): reply is VersionMismatch => reply.type === PROTOCOL_MISMATCH;

export function interpretHelloReply(reply: BridgeReply | VersionMismatch | null): ConnectionOutcome {
  if (reply === null) return { state: 'not-detected' };
  if (isVersionMismatch(reply)) {
    return { state: 'incompatible', extensionVersion: null, protocolVersion: null, message: INCOMPATIBLE_MESSAGE };
  }
  if (reply.type === 'ERROR') {
    return {
      state: 'error',
      code: typeof reply.code === 'string' ? reply.code : 'INTERNAL_ERROR',
      message: 'Unable to connect. Please try again.',
    };
  }
  if (reply.type !== 'CONNECTION_STATUS') {
    return { state: 'error', code: 'UNEXPECTED_REPLY', message: 'Unable to connect. Please try again.' };
  }
  const extensionVersion = typeof reply.extensionVersion === 'string' && VERSION_PATTERN.test(reply.extensionVersion)
    ? reply.extensionVersion
    : null;
  const protocolVersion = typeof reply.protocolVersion === 'number' ? reply.protocolVersion : null;
  if (protocolVersion !== BRIDGE_VERSION) {
    return { state: 'incompatible', extensionVersion, protocolVersion, message: INCOMPATIBLE_MESSAGE };
  }
  if (reply.connected !== true || extensionVersion === null) {
    return { state: 'error', code: 'BAD_STATUS', message: 'Unable to connect. Please try again.' };
  }
  if (reply.busy === true) return { state: 'busy', extensionVersion, protocolVersion };
  return { state: 'connected', extensionVersion, protocolVersion };
}
export type PrepareResult =
  | { ok: true; requestId: string }
  | { ok: false; code: string; message: string };

type Listener = (reply: BridgeReply) => void;
type Waiter = (reply: BridgeReply | VersionMismatch) => boolean;

/**
 * Client for the extension. Only replies for request IDs this client created are delivered,
 * so late or foreign messages are ignored (stale-response protection).
 */
export class ExtensionBridge {
  private readonly sent = new Set<string>();
  private readonly waiters = new Map<string, Waiter>();
  private readonly listeners = new Set<Listener>();

  private readonly onMessage = (event: { source: unknown; origin: string; data: unknown }) => {
    if (!this.host.isOwnWindow(event.source) || event.origin !== this.host.origin) return;
    const mismatch = parseVersionMismatch(event.data);
    if (mismatch) {
      if (this.sent.has(mismatch.requestId)) {
        const waiter = this.waiters.get(mismatch.requestId);
        if (waiter && waiter(mismatch)) this.waiters.delete(mismatch.requestId);
      }
      return;
    }
    const reply = parseBridgeEnvelope(event.data);
    if (!reply) return;
    if (reply.requestId === null || !this.sent.has(reply.requestId)) return;

    // The extension sends progress (GEMINI_STATUS) before the final reply, so a waiter
    // stays registered until it accepts the reply it is waiting for.
    const waiter = this.waiters.get(reply.requestId);
    if (waiter && waiter(reply)) {
      this.waiters.delete(reply.requestId);
    }
    this.listeners.forEach((listener) => listener(reply));
    if (reply.type === 'RETURN_OUTPUT' || (reply.type === 'GEMINI_STATUS' && reply.status === 'cancelled')) {
      this.sent.delete(reply.requestId);
    }
  };

  constructor(private readonly host: BridgeHost) {
    host.addEventListener('message', this.onMessage);
  }

  private send(message: Record<string, unknown>): void {
    this.host.postMessage(buildEnvelope(message), this.host.origin);
  }

  private awaitReply(
    requestId: string,
    timeoutMs: number,
    accept: (reply: BridgeReply | VersionMismatch) => boolean,
  ): Promise<BridgeReply | VersionMismatch | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.waiters.delete(requestId);
        resolve(null);
      }, timeoutMs);
      // Returns true once the reply is accepted, so the caller can drop this waiter.
      this.waiters.set(requestId, (reply) => {
        if (!accept(reply)) return false;
        clearTimeout(timer);
        resolve(reply);
        return true;
      });
    });
  }

  /**
   * Checks the connection with a HELLO message. Sends no resume data. Reports "connected" or "busy"
   * only after a CONNECTION_STATUS reply with a matching protocol version arrives for this request.
   */
  async checkConnection(timeoutMs = 3000): Promise<ConnectionOutcome> {
    const requestId = createRequestId();
    this.sent.add(requestId);
    this.send({ type: 'HELLO', requestId });
    const reply = await this.awaitReply(
      requestId,
      timeoutMs,
      (r) => r.type === 'CONNECTION_STATUS' || r.type === 'ERROR' || r.type === PROTOCOL_MISMATCH,
    );
    this.sent.delete(requestId);
    return interpretHelloReply(reply as BridgeReply | VersionMismatch | null);
  }

  /** Same check as checkConnection, reduced to a state name. */
  async hello(timeoutMs = 3000): Promise<HelloResult> {
    return (await this.checkConnection(timeoutMs)).state;
  }

  /** Queues a request for the user to review inside the extension. Nothing reaches Gemini here. */
  async prepare(payload: ExtensionRequestPayload, timeoutMs = 5000): Promise<PrepareResult> {
    const requestId = createRequestId();
    this.sent.add(requestId);
    this.send({ type: 'PREPARE_PROMPT', requestId, payload });
    // GEMINI_STATUS "awaiting-send-approval" arrives before REVIEW_PROMPT; it is progress, not the answer.
    const reply = await this.awaitReply(requestId, timeoutMs, (r) => r.type === 'REVIEW_PROMPT' || r.type === 'ERROR');
    if (!reply) {
      this.sent.delete(requestId);
      return { ok: false, code: 'TIMEOUT', message: 'The extension did not respond. Check that it is installed and enabled.' };
    }
    if (isVersionMismatch(reply)) {
      this.sent.delete(requestId);
      return { ok: false, code: 'INCOMPATIBLE', message: INCOMPATIBLE_MESSAGE };
    }
    if (reply.type === 'REVIEW_PROMPT') return { ok: true, requestId };
    this.sent.delete(requestId);
    return {
      ok: false,
      code: typeof reply.code === 'string' ? reply.code : 'INTERNAL_ERROR',
      message: typeof reply.message === 'string' ? reply.message : 'The extension refused the request.',
    };
  }

  cancel(requestId: string): void {
    if (!this.sent.has(requestId)) return;
    this.send({ type: 'CANCEL_REQUEST', requestId });
  }

  /** Receives progress and results for requests this client created. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    this.host.removeEventListener('message', this.onMessage);
    this.listeners.clear();
    this.waiters.clear();
    this.sent.clear();
  }
}

/** Creates a client bound to the real window. Call only in the browser. */
export function createBrowserBridge(): ExtensionBridge {
  const host: BridgeHost = {
    origin: window.location.origin,
    postMessage: (message, targetOrigin) => window.postMessage(message, targetOrigin),
    // A MessageEvent carries source, origin, and data, which is all the client reads.
    addEventListener: (type, listener) => window.addEventListener(type, listener as unknown as EventListener),
    removeEventListener: (type, listener) => window.removeEventListener(type, listener as unknown as EventListener),
    isOwnWindow: (source) => source === window,
  };
  return new ExtensionBridge(host);
}
