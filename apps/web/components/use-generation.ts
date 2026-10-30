'use client';

import { useCallback, useEffect, useReducer, useRef } from 'react';
import {
  buildRequestPayload,
  createBrowserBridge,
  createRequestId,
  type ExtensionBridge,
} from '@/lib/extension-bridge';
import { generationReducer, initialGeneration, isActive, type GeneratedOutput, type Phase } from '@/lib/generation';
import type { Resume } from '@/lib/resume';

const WATCHDOG_INTERVAL_MS = 5_000;
/** If the extension does not confirm a cancel within this time, stop waiting on this page. */
const CANCEL_CONFIRM_MS = 5_000;

/**
 * Drives one generation request through the verified extension bridge.
 * Nothing is sent to Gemini by this hook. The extension sends a prompt only after the user approves it
 * in the extension popup, and returns output only after the user sends it from there.
 */
export function useGeneration(resume: Resume, onAccept: (output: GeneratedOutput) => void) {
  const [state, dispatch] = useReducer(generationReducer, initialGeneration);
  const bridgeRef = useRef<ExtensionBridge | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);
  const phaseRef = useRef<Phase>('idle');
  const requestRef = useRef<string | null>(null);
  phaseRef.current = state.phase;
  requestRef.current = state.requestId;

  const endBridge = useCallback(() => {
    unsubRef.current?.();
    unsubRef.current = null;
    bridgeRef.current?.dispose();
    bridgeRef.current = null;
  }, []);

  // Release the listener when the page is left. The extension keeps its own request state.
  useEffect(() => endBridge, [endBridge]);

  const check = useCallback(async () => {
    if (isActive(phaseRef.current)) return;
    dispatch({ type: 'check-start' });
    const bridge = createBrowserBridge();
    try {
      dispatch({ type: 'check-result', result: await bridge.hello(3000) });
    } catch {
      dispatch({ type: 'check-result', result: { state: 'error', extensionVersion: null, protocolVersion: null, code: 'INTERNAL_ERROR' } });
    } finally {
      bridge.dispose();
    }
  }, []);

  // Check once when the page opens.
  useEffect(() => {
    void check();
  }, [check]);

  const start = useCallback(async () => {
    if (isActive(phaseRef.current)) return; // no duplicate submissions
    const built = buildRequestPayload(resume, { task: 'generate' });
    if (!built.ok) {
      dispatch({ type: 'prepare-failed', code: 'INVALID_DETAILS', message: built.errors.join(' ') });
      return;
    }
    endBridge();
    const requestId = createRequestId();
    const bridge = createBrowserBridge();
    bridgeRef.current = bridge;
    // Subscribe before sending, so no progress message is missed.
    unsubRef.current = bridge.subscribe((reply) => dispatch({ type: 'reply', reply, now: Date.now() }));
    dispatch({ type: 'prepare-start', requestId, now: Date.now() });
    const result = await bridge.prepare(built.payload, 5000, requestId);
    if (!result.ok) {
      endBridge();
      dispatch({ type: 'prepare-failed', code: result.code, message: result.message });
      return;
    }
    dispatch({ type: 'prepare-ok', requestId, now: Date.now() });
  }, [resume, endBridge]);

  const cancel = useCallback(() => {
    const id = requestRef.current;
    if (!id) return;
    bridgeRef.current?.cancel(id);
    // If the extension does not confirm, stop waiting here so the page is never stuck.
    setTimeout(() => {
      if (requestRef.current === id && isActive(phaseRef.current)) {
        dispatch({ type: 'stop-waiting' });
        endBridge();
      }
    }, CANCEL_CONFIRM_MS);
  }, [endBridge]);

  // Detect silence while the extension is working. Not applied while the user is reviewing.
  useEffect(() => {
    if (state.phase !== 'processing' && state.phase !== 'waiting-response') return;
    const t = setInterval(() => dispatch({ type: 'watchdog', now: Date.now() }), WATCHDOG_INTERVAL_MS);
    return () => clearInterval(t);
  }, [state.phase]);

  const accept = useCallback(() => {
    if (state.output) onAccept(state.output);
    endBridge();
    dispatch({ type: 'accepted' });
  }, [state.output, onAccept, endBridge]);

  const discard = useCallback(() => {
    endBridge();
    dispatch({ type: 'discard' });
  }, [endBridge]);

  return { state, check, start, cancel, accept, discard };
}
