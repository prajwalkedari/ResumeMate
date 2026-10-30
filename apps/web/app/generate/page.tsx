'use client';

import { useCallback } from 'react';
import { CircleCheck, Loader2, Puzzle, TriangleAlert, Unplug, Check, Copy } from 'lucide-react';
import { Header, Button, LinkButton, Notice } from '@/components/ui';
import { useApp } from '@/components/providers';
import { useGeneration } from '@/components/use-generation';
import { isActive, type Phase } from '@/lib/generation';

const PHASE_LABEL: Record<Phase, string> = {
  idle: 'Ready',
  checking: 'Checking connection',
  preparing: 'Preparing prompt',
  'awaiting-approval': 'Waiting for your approval',
  processing: 'Processing in Gemini',
  'waiting-response': 'Waiting for generated response',
  reviewing: 'Reviewing generated output',
  completed: 'Generation completed',
  failed: 'Generation failed',
  cancelled: 'Cancelled',
};

export default function GeneratePage() {
  const { resume, setAiDraft } = useApp();
  const onAccept = useCallback((output: { text: string; isLatex: boolean }) => {
    setAiDraft({ text: output.text, isLatex: output.isLatex, savedAt: Date.now() });
  }, [setAiDraft]);
  const { state, check, start, cancel, accept, discard } = useGeneration(resume, onAccept);

  if (!resume.personal.name) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-xl px-5 py-20 text-center">
          <h1 className="font-serif text-3xl text-navy">No details to review</h1>
          <p className="mt-3 text-muted">Add your details first. Generation uses the details you enter.</p>
          <div className="mt-8"><LinkButton href="/create">Go to the workspace</LinkButton></div>
        </main>
      </>
    );
  }

  const conn = state.connection;
  const active = isActive(state.phase);
  const connected = conn?.state === 'connected';
  const canStart = connected && !active && state.phase !== 'checking';

  const counts: [string, number][] = [
    ['Education entries', resume.education.length],
    ['Experience entries', resume.experience.length],
    ['Projects', resume.projects.length],
    ['Certifications', resume.certifications.length],
  ];

  return (
    <>
      <Header />
      <main className="mx-auto grid max-w-4xl gap-10 px-5 py-12 md:grid-cols-[1fr_260px]">
        <section className="min-w-0">
          <h1 className="font-serif text-3xl text-navy">Generate your resume content</h1>
          <p className="mt-3 text-muted">
            ResumeMate prepares your details for review. The ResumeMate Assistant extension sends them to Gemini only after you approve each step in its popup.
          </p>

          {/* Connection */}
          <div className="mt-8 rounded-lg border border-line bg-white p-5" aria-live="polite">
            {state.phase === 'checking' || conn === null ? (
              <p className="flex items-center gap-3 text-ink"><Loader2 size={18} className="animate-spin text-navy" aria-hidden="true" />Checking ResumeMate Assistant...</p>
            ) : connected ? (
              <p className="flex items-center gap-3 text-ink"><CircleCheck size={18} className="text-navy" aria-hidden="true" />ResumeMate Assistant is connected. Extension version {conn.extensionVersion}, protocol v{conn.protocolVersion}.</p>
            ) : conn.state === 'busy' ? (
              <p className="flex items-center gap-3 text-ink"><TriangleAlert size={18} className="text-navy" aria-hidden="true" />The extension is currently processing another request.</p>
            ) : conn.state === 'incompatible' ? (
              <p className="flex items-center gap-3 text-ink"><TriangleAlert size={18} className="text-navy" aria-hidden="true" />Your extension version is incompatible. Please update it.</p>
            ) : conn.state === 'error' ? (
              <p className="flex items-center gap-3 text-ink"><Unplug size={18} className="text-navy" aria-hidden="true" />Unable to connect. Please try again.</p>
            ) : (
              <div>
                <p className="flex items-center gap-3 text-ink"><Puzzle size={18} className="text-navy" aria-hidden="true" />ResumeMate Assistant was not detected. Install the extension to continue.</p>
                <p className="mt-2 text-sm text-muted">Your entered details are kept. Install or enable the extension, then check again.</p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <LinkButton href="/extension" variant="secondary">Install or connect the extension</LinkButton>
                </div>
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-3">
              <Button variant="secondary" onClick={check} disabled={active || state.phase === 'checking'}>Check Again</Button>
              <LinkButton href="/create" variant="ghost">Edit details</LinkButton>
            </div>
          </div>

          {/* Request */}
          <div className="mt-6 rounded-lg border border-line bg-white p-5">
            <p className="text-sm text-muted">Status: <span className="text-ink">{PHASE_LABEL[state.phase]}</span></p>
            {state.message && <p className="mt-2 leading-relaxed text-ink/85">{state.message}</p>}
            {state.phase === 'failed' && state.error && (
              <div className="mt-3"><Notice tone="error" title="Generation failed">{state.error.message}</Notice></div>
            )}
            {state.phase === 'cancelled' && (
              <div className="mt-3"><Notice>Nothing has been added to your resume.</Notice></div>
            )}

            <div className="mt-5 flex flex-wrap gap-3">
              {state.phase === 'failed' || state.phase === 'cancelled' ? (
                <Button onClick={start} disabled={!canStart}>Try again</Button>
              ) : state.phase === 'idle' || state.phase === 'completed' ? (
                <Button onClick={start} disabled={!canStart}>Generate with AI</Button>
              ) : null}
              {active && state.phase !== 'reviewing' && (
                <Button variant="secondary" onClick={cancel}>Cancel request</Button>
              )}
              {!connected && conn !== null && state.phase === 'idle' && (
                <p className="text-sm text-muted">Connect the extension to generate content.</p>
              )}
            </div>
            {state.phase === 'awaiting-approval' || state.phase === 'processing' || state.phase === 'waiting-response' ? (
              <p className="mt-4 flex items-center gap-2 text-sm text-muted"><Loader2 size={16} className="animate-spin" aria-hidden="true" />Waiting for the extension. This may take a while.</p>
            ) : null}
          </div>

          {/* Output review */}
          {state.phase === 'reviewing' && !state.output && (
            <div className="mt-6">
              <Notice title="Response ready">
                {state.responseCharacters !== null ? `Gemini returned ${state.responseCharacters} characters. ` : ''}
                In the ResumeMate Assistant popup, review the response and send it to ResumeMate. The text will appear here.
              </Notice>
            </div>
          )}

          {state.phase === 'reviewing' && state.output && (
            <section aria-labelledby="output-title" className="mt-6 rounded-lg border border-line bg-white p-5">
              <h2 id="output-title" className="text-lg font-semibold text-ink">Generated output</h2>
              <p className="mt-1 text-sm text-muted">Review and edit before you use it. Nothing is added to your resume unless you save it.</p>
              {state.output.isLatex && (
                <div className="mt-3"><Notice tone="warn">This is LaTeX source. It is shown as text and is not compiled into a PDF.</Notice></div>
              )}
              {state.output.warnings.length > 0 && (
                <ul className="mt-3 list-disc pl-5 text-sm text-amber-900">
                  {state.output.warnings.map((w) => <li key={w}>{w}</li>)}
                </ul>
              )}
              <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap rounded-md border border-line bg-paper p-4 text-sm leading-relaxed text-ink" tabIndex={0} aria-label="Generated output">{state.output.text}</pre>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button onClick={accept}><Check size={16} aria-hidden="true" />Save as AI draft</Button>
                <Button variant="secondary" onClick={() => navigator.clipboard?.writeText(state.output!.text).catch(() => undefined)}><Copy size={16} aria-hidden="true" />Copy</Button>
                <Button variant="ghost" onClick={discard}>Discard and start over</Button>
              </div>
            </section>
          )}

          {state.phase === 'completed' && (
            <div className="mt-6 space-y-4">
              <Notice title="Saved as an AI draft">Your resume details were not changed. Review the draft in the preview.</Notice>
              <LinkButton href="/preview">View preview</LinkButton>
            </div>
          )}
        </section>

        <aside>
          <h2 className="text-sm font-medium text-muted">Details sent for review</h2>
          <dl className="mt-4 space-y-4 text-sm">
            <div><dt className="text-muted">Name</dt><dd className="font-medium text-ink">{resume.personal.name}</dd></div>
            <div><dt className="text-muted">Target job</dt><dd className="font-medium text-ink">{resume.target.jobTitle || 'Not set'}</dd></div>
            {counts.map(([label, n]) => (
              <div key={label}><dt className="text-muted">{label}</dt><dd className="text-ink">{n}</dd></div>
            ))}
          </dl>
        </aside>
      </main>
    </>
  );
}
