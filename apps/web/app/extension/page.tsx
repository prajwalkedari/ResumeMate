'use client';

import { useState } from 'react';
import { CircleCheck, Puzzle, TriangleAlert, Unplug, CircleHelp, ArrowRight } from 'lucide-react';
import { Header, Button, LinkButton } from '@/components/ui';
import { createBrowserBridge, BRIDGE_VERSION, type HelloResult } from '@/lib/extension-bridge';

// Installation and information page for the extension. It is an external link, not the messaging origin.
const EXTENSION_INFO_URL = 'https://extension.prajwalkedari.tech';

type UiState = 'idle' | 'checking' | 'connected' | 'busy' | 'not-installed' | 'incompatible' | 'error';

const COPY: Record<UiState, { label: string; title: string; body: string }> = {
  idle: {
    label: 'Not checked',
    title: 'Check the connection',
    body: 'Press Check connection to see whether the ResumeMate Assistant extension is installed, enabled, and reachable from this page.',
  },
  checking: {
    label: 'Checking',
    title: 'Checking ResumeMate Assistant...',
    body: 'Waiting for the extension to reply.',
  },
  connected: {
    label: 'Connected',
    title: 'ResumeMate Assistant is connected.',
    body: 'Your browser extension is ready. You can now create a resume using your existing Gemini account. You approve each request in the extension before anything is sent.',
  },
  busy: {
    label: 'Busy',
    title: 'The extension is currently processing another request.',
    body: 'It is connected. Finish or cancel the request in the extension, then check again.',
  },
  'not-installed': {
    label: 'Not detected',
    title: 'ResumeMate Assistant was not detected. Install the extension to continue.',
    body: 'No reply arrived. The extension may not be installed, may be turned off, or may not be allowed on this website.',
  },
  incompatible: {
    label: 'Incompatible',
    title: 'Your extension version is incompatible. Please update it.',
    body: 'The extension replied, but it uses a different protocol version from this website.',
  },
  error: {
    label: 'Error',
    title: 'Unable to connect. Please try again.',
    body: 'The extension replied with an error or an unexpected message.',
  },
};

const ICON: Record<UiState, typeof Puzzle> = {
  idle: CircleHelp,
  checking: Puzzle,
  connected: CircleCheck,
  busy: TriangleAlert,
  'not-installed': Puzzle,
  incompatible: TriangleAlert,
  error: Unplug,
};

const ERROR_HINTS: Record<string, string> = {
  TIMEOUT: 'No reply within 3 seconds.',
  PROTOCOL_MISMATCH: 'Protocol version mismatch.',
  MALFORMED_REPLY: 'The reply did not have the expected fields.',
  INTERNAL_ERROR: 'The extension reported an internal error. Reload this page, then try again.',
  UNEXPECTED_REPLY: 'The extension sent an unexpected message type.',
};

export default function ExtensionPage() {
  const [state, setState] = useState<UiState>('idle');
  const [result, setResult] = useState<HelloResult | null>(null);
  const copy = COPY[state];
  const Icon = ICON[state];
  const verified = result !== null && (state === 'connected' || state === 'busy' || state === 'incompatible') && result.protocolVersion !== null;

  const check = async () => {
    if (state === 'checking') return; // one handshake at a time
    setState('checking');
    const bridge = createBrowserBridge();
    try {
      const outcome = await bridge.hello(3000);
      setResult(outcome);
      setState(outcome.state);
    } catch {
      setResult({ state: 'error', extensionVersion: null, protocolVersion: null, code: 'INTERNAL_ERROR' });
      setState('error');
    } finally {
      bridge.dispose();
    }
  };

  const canRetry = state === 'not-installed' || state === 'error' || state === 'incompatible';
  const hint = result?.code ? ERROR_HINTS[result.code] : undefined;

  return (
    <>
      <Header />
      <main className="mx-auto max-w-2xl px-5 py-12">
        <h1 className="font-serif text-3xl text-navy">Connect the extension</h1>
        <p className="mt-2 text-muted">
          ResumeMate works with your own signed-in Gemini account through a Chrome extension. Nothing is sent until you approve it.
        </p>

        <section aria-labelledby="ext-status" className="mt-8 rounded-lg border border-line bg-white p-6">
          <div className="flex items-start gap-4">
            <Icon size={24} className="mt-0.5 shrink-0 text-navy" aria-hidden="true" />
            <div className="flex-1">
              <p className="text-sm text-muted">Status: {copy.label}</p>
              <h2 id="ext-status" className="mt-1 text-lg font-semibold text-ink" aria-live="polite">{copy.title}</h2>
              <p className="mt-1 leading-relaxed text-ink/80">{copy.body}</p>
              {hint && <p className="mt-2 text-sm text-muted">{hint}</p>}

              {verified && result && (
                <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                  <dt className="text-muted">Extension version</dt>
                  <dd className="text-ink">{result.extensionVersion ?? 'Not reported'}</dd>
                  <dt className="text-muted">Protocol</dt>
                  <dd className="text-ink">
                    v{result.protocolVersion}{' '}
                    {result.state === 'incompatible'
                      ? `(this website uses v${BRIDGE_VERSION})`
                      : '(compatible)'}
                  </dd>
                </dl>
              )}

              {state === 'connected' && (
                <div className="mt-6">
                  <LinkButton href="/create" className="w-full justify-center py-3 text-base sm:w-auto">
                    Continue to Create Resume <ArrowRight size={18} aria-hidden="true" />
                  </LinkButton>
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-3">
                <Button variant="secondary" onClick={check} disabled={state === 'checking'} aria-busy={state === 'checking'}>
                  {state === 'checking' ? 'Checking...' : canRetry ? 'Retry' : state === 'idle' ? 'Check connection' : 'Check again'}
                </Button>
                {state === 'not-installed' && (
                  <LinkButton href={EXTENSION_INFO_URL} variant="secondary">Installation instructions</LinkButton>
                )}
                <LinkButton href="/create" variant="ghost">Back to Workspace</LinkButton>
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="ext-help" className="mt-8">
          <h2 id="ext-help" className="text-base font-semibold text-ink">Troubleshooting</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-ink/80">
            <li>Open <code>chrome://extensions</code> and make sure ResumeMate Assistant is turned on.</li>
            <li>Open ResumeMate in a regular browser tab at <code>https://resumemate.prajwalkedari.tech</code>. The extension does not run on other addresses.</li>
            <li>After installing or enabling the extension, reload this page, then check again.</li>
            <li>
              Installation details are on the{' '}
              <a className="text-navy underline" href={EXTENSION_INFO_URL}>extension information page</a>.
            </li>
          </ul>
        </section>

        <p className="mt-8 text-sm text-muted">
          Resume information goes to Gemini only after you approve the request.
        </p>
      </main>
    </>
  );
}
