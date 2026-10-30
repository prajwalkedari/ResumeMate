'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CircleCheck, Clock, Loader2, Puzzle, TriangleAlert, Unplug } from 'lucide-react';
import { Header, Button, LinkButton } from '@/components/ui';
import {
  createBrowserBridge,
  EXTENSION_INFO_URL,
  EXTENSION_SUPPORTED_ORIGIN,
  type ConnectionOutcome,
  type ExtensionBridge,
} from '@/lib/extension-bridge';

// 'unchecked' is the state before the user runs the first check. It is not a result.
type UiState = 'unchecked' | 'checking' | 'connected' | 'busy' | 'not-installed' | 'incompatible' | 'error';

const COPY: Record<UiState, { label: string; headline: string; body: string }> = {
  unchecked: {
    label: 'Not checked',
    headline: 'Check the connection',
    body: 'Check whether ResumeMate Assistant is installed and can be reached from this page. The check sends no resume data.',
  },
  checking: {
    label: 'Checking',
    headline: 'Checking ResumeMate Assistant...',
    body: 'This usually takes a second or two.',
  },
  connected: {
    label: 'Connected',
    headline: 'ResumeMate Assistant is connected.',
    body: 'The extension answered this page. You still approve each request before anything is sent.',
  },
  busy: {
    label: 'Busy',
    headline: 'The extension is currently processing another request.',
    body: 'Finish or cancel the other request in the extension, then check again.',
  },
  'not-installed': {
    label: 'Not installed',
    headline: 'ResumeMate Assistant was not detected. Install the extension to continue.',
    body: 'If you have just installed or enabled it, reload this page and check again.',
  },
  incompatible: {
    label: 'Incompatible',
    headline: 'Your extension version is incompatible. Please update it.',
    body: 'The installed extension does not use the protocol this website needs. Update it, then reload this page.',
  },
  error: {
    label: 'Error',
    headline: 'Unable to connect. Please try again.',
    body: 'The extension did not return a valid response. Try again. If this keeps happening, reload this page.',
  },
};

const ICON: Record<UiState, typeof Puzzle> = {
  unchecked: Puzzle,
  checking: Loader2,
  connected: CircleCheck,
  busy: Clock,
  'not-installed': Puzzle,
  incompatible: TriangleAlert,
  error: TriangleAlert,
};

interface Verified {
  extensionVersion: string | null;
  protocolVersion: number | null;
}

/** Maps a verified outcome from the bridge to the state shown to the user. */
function toUi(outcome: ConnectionOutcome): { state: UiState; verified: Verified } {
  switch (outcome.state) {
    case 'connected':
      return { state: 'connected', verified: { extensionVersion: outcome.extensionVersion, protocolVersion: outcome.protocolVersion } };
    case 'busy':
      return { state: 'busy', verified: { extensionVersion: outcome.extensionVersion, protocolVersion: outcome.protocolVersion } };
    case 'incompatible':
      return { state: 'incompatible', verified: { extensionVersion: outcome.extensionVersion, protocolVersion: outcome.protocolVersion } };
    case 'not-detected':
      return { state: 'not-installed', verified: { extensionVersion: null, protocolVersion: null } };
    case 'error':
      return { state: 'error', verified: { extensionVersion: null, protocolVersion: null } };
  }
}

export default function ExtensionPage() {
  const router = useRouter();
  const [state, setState] = useState<UiState>('unchecked');
  const [verified, setVerified] = useState<Verified>({ extensionVersion: null, protocolVersion: null });
  const bridgeRef = useRef<ExtensionBridge | null>(null);
  const inFlight = useRef(false);
  const Icon = ICON[state];
  const copy = COPY[state];

  // Release the window listener when the page unmounts.
  useEffect(() => () => {
    bridgeRef.current?.dispose();
    bridgeRef.current = null;
  }, []);

  const check = async () => {
    // Ignore repeated clicks while a check is running.
    if (inFlight.current) return;
    inFlight.current = true;
    setState('checking');
    try {
      if (!bridgeRef.current) bridgeRef.current = createBrowserBridge();
      const outcome = await bridgeRef.current.checkConnection(3000);
      const result = toUi(outcome);
      setState(result.state);
      setVerified(result.verified);
    } catch {
      setState('error');
      setVerified({ extensionVersion: null, protocolVersion: null });
    } finally {
      inFlight.current = false;
    }
  };

  const checking = state === 'checking';
  const showVersion = verified.extensionVersion !== null || verified.protocolVersion !== null;

  return (
    <>
      <Header />
      <main className="mx-auto max-w-2xl px-5 py-12">
        <h1 className="font-serif text-3xl text-navy">Connect the extension</h1>
        <p className="mt-2 text-muted">
          ResumeMate works with your own signed-in Gemini account through a Chrome extension. Nothing is sent until you approve it.
        </p>

        <section
          aria-labelledby="ext-status"
          aria-busy={checking}
          className="mt-8 rounded-lg border border-line bg-white p-6"
        >
          <div className="flex items-start gap-4">
            <Icon
              size={24}
              className={`mt-0.5 shrink-0 text-navy ${checking ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <div className="flex-1">
              <div className="text-sm text-muted">
                <span>Status: {copy.label}</span>
              </div>
              <div role="status" aria-live="polite">
                <h2 id="ext-status" className="mt-1 text-lg font-semibold text-ink">{copy.headline}</h2>
              </div>
              <p className="mt-1 leading-relaxed text-ink/80">{copy.body}</p>

              {showVersion && (state === 'connected' || state === 'busy' || state === 'incompatible') && (
                <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                  <dt className="text-muted">Extension version</dt>
                  <dd className="text-ink">{verified.extensionVersion ?? 'Unknown'}</dd>
                  <dt className="text-muted">Protocol</dt>
                  <dd className="text-ink">
                    {verified.protocolVersion ?? 'Unknown'}
                    {state === 'incompatible' ? ' (not supported by this website)' : ' (compatible)'}
                  </dd>
                </dl>
              )}

              <div className="mt-6 flex flex-wrap gap-3">
                {state === 'unchecked' && <Button onClick={check}>Check connection</Button>}
                {checking && <Button disabled>Checking...</Button>}
                {(state === 'not-installed' || state === 'error' || state === 'incompatible') && (
                  <Button onClick={check}>Try again</Button>
                )}
                {(state === 'busy' || state === 'connected') && (
                  <Button variant="secondary" onClick={check}>Check again</Button>
                )}
                {state === 'connected' && <Button onClick={() => router.push('/generate')}>Generate resume</Button>}
                {(state === 'not-installed' || state === 'incompatible') && (
                  <LinkButton href={EXTENSION_INFO_URL} variant="secondary">
                    {state === 'incompatible' ? 'Get the update' : 'Installation instructions'}
                  </LinkButton>
                )}
                <Button variant="ghost" onClick={() => router.push('/create')}>Continue Editing</Button>
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="ext-help" className="mt-8">
          <h2 id="ext-help" className="text-base font-semibold text-ink">Troubleshooting</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-ink/80">
            <li>
              Install or enable ResumeMate Assistant in Chrome at <code>chrome://extensions</code>. Chrome 116 or newer is required.
            </li>
            <li>
              The extension works only on the ResumeMate address <code>{EXTENSION_SUPPORTED_ORIGIN}</code>. Open this page there.
            </li>
            <li>
              After you install, update, or enable the extension, reload this page before you check again.
            </li>
            <li>
              Installation instructions are at{' '}
              <a
                href={EXTENSION_INFO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-navy underline underline-offset-2 hover:text-navy/80"
              >
                extension.prajwalkedari.tech
              </a>.
            </li>
          </ul>
        </section>

        <p className="mt-8 text-sm text-muted">
          Resume information goes to Gemini only after you approve the request.
        </p>
        <div className="mt-6"><LinkButton href="/create" variant="ghost">Back to the workspace</LinkButton></div>
      </main>
    </>
  );
}
