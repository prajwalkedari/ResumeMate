'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CircleCheck, Puzzle, TriangleAlert, Unplug } from 'lucide-react';
import { Header, Button, LinkButton, Notice } from '@/components/ui';
import { useApp } from '@/components/providers';

type Conn = 'not-installed' | 'connected' | 'disconnected' | 'needs-attention';

const COPY: Record<Conn, { label: string; title: string; body: string }> = {
  'not-installed': {
    label: 'Not Installed',
    title: 'ResumeMate Extension Required',
    body: 'Install the ResumeMate extension to use your own signed-in Gemini account. A resume request cannot be sent without it.',
  },
  connected: {
    label: 'Connected',
    title: 'Extension connected',
    body: 'The extension is connected. You still approve each request before anything is sent.',
  },
  disconnected: {
    label: 'Disconnected',
    title: 'Extension disconnected',
    body: 'ResumeMate cannot reach the extension right now. Reconnect to continue. Your draft is still here.',
  },
  'needs-attention': {
    label: 'Needs Attention',
    title: 'Gemini sign-in needed',
    body: 'The extension is installed, but no signed-in Gemini tab was found. Sign in to Gemini in Chrome, then check again.',
  },
};

const ICON: Record<Conn, typeof Puzzle> = {
  'not-installed': Puzzle,
  connected: CircleCheck,
  disconnected: Unplug,
  'needs-attention': TriangleAlert,
};

// Production builds never report a real connection: no handshake exists yet, so the state stays "Not Installed".
const isDev = process.env.NODE_ENV !== 'production';

export default function ExtensionPage() {
  const { notify } = useApp();
  const router = useRouter();
  const [conn, setConn] = useState<Conn>('not-installed');
  const Icon = ICON[conn];

  const check = () =>
    notify(
      conn === 'connected'
        ? 'Simulated connection only. Real detection is not connected in this build.'
        : 'No verified extension handshake yet. Detection is not connected in this build.',
    );

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
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
                <span>Status: {COPY[conn].label}</span>
                {isDev && (
                  <span className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs text-amber-900">
                    Simulated, development only
                  </span>
                )}
              </div>
              <h2 id="ext-status" className="mt-1 text-lg font-semibold text-ink">{COPY[conn].title}</h2>
              <p className="mt-1 leading-relaxed text-ink/80">{COPY[conn].body}</p>

              <div className="mt-6 flex flex-wrap gap-3">
                {conn === 'not-installed' && (
                  <Button onClick={() => notify('The install link is not configured in this prototype.')}>Install Extension</Button>
                )}
                {conn === 'connected' && <Button onClick={() => router.push('/generate')}>Generate resume</Button>}
                {(conn === 'disconnected' || conn === 'needs-attention') && (
                  <Button onClick={check}>{conn === 'disconnected' ? 'Reconnect' : 'Check Again'}</Button>
                )}
                <Button variant="secondary" onClick={check}>Check Again</Button>
                <Button variant="ghost" onClick={() => router.push('/create')}>Continue Editing</Button>
              </div>
            </div>
          </div>
        </section>

        {isDev && (
          <div className="mt-8">
            <Notice title="Development mock switch">
              <p>Simulated states for UI review. This control is removed from production builds and never reports a real connection.</p>
              <div role="group" aria-label="Simulated connection state" className="mt-3 flex flex-wrap gap-2">
                {(Object.keys(COPY) as Conn[]).map((c) => (
                  <Button
                    key={c}
                    variant="secondary"
                    aria-pressed={conn === c}
                    className={conn === c ? 'border-navy text-navy' : ''}
                    onClick={() => setConn(c)}
                  >
                    {COPY[c].label}
                  </Button>
                ))}
              </div>
            </Notice>
          </div>
        )}

        <p className="mt-8 text-sm text-muted">
          Resume information goes to Gemini only after you approve the request.
        </p>
        <div className="mt-6"><LinkButton href="/create" variant="ghost">Back to the workspace</LinkButton></div>
      </main>
    </>
  );
}
