'use client';

import { useState } from 'react';
import { Download, Eye, Pencil, Trash2 } from 'lucide-react';
import { Header, Button, LinkButton } from '@/components/ui';
import { ResumeDocument } from '@/components/resume-document';
import { useApp } from '@/components/providers';
import { TEMPLATES } from '@/lib/resume';

export default function PreviewPage() {
  const { resume, template, setTemplate, notify, aiDraft, setAiDraft } = useApp();
  const [actual, setActual] = useState(false);

  if (!resume.personal.name) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-xl px-5 py-20 text-center">
          <h1 className="font-serif text-3xl text-navy">Nothing to preview yet</h1>
          <p className="mt-3 text-muted">Add your details first. The preview appears here once your resume has a name.</p>
          <div className="mt-8"><LinkButton href="/create">Start a resume</LinkButton></div>
        </main>
      </>
    );
  }

  const current = TEMPLATES.find((t) => t.id === template)!;

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-5 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
          <div>
            <h1 className="font-serif text-3xl text-navy">Resume preview</h1>
            <p className="mt-2 text-muted">{current.name} template. {current.note}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <LinkButton href="/create" variant="secondary"><Pencil size={16} />Edit details</LinkButton>
            <Button variant="secondary" onClick={() => document.getElementById('template-picker')?.focus()}>Change template</Button>
            <Button
              variant="secondary"
              aria-pressed={actual}
              onClick={() => { setActual((a) => !a); notify(actual ? 'Showing fit to width.' : 'Showing actual size.'); }}
            >
              <Eye size={16} />Preview: {actual ? 'Actual size' : 'Fit to width'}
            </Button>
            <Button onClick={() => notify('Demo only. PDF generation is not built yet, so no file was created.')}>
              <Download size={16} />Download PDF (demo)
            </Button>
          </div>
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[240px_1fr]">
          <fieldset id="template-picker" tabIndex={-1} className="space-y-2 focus:outline-none">
            <legend className="mb-3 text-sm font-medium text-ink">Template</legend>
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={template === t.id}
                onClick={() => setTemplate(t.id)}
                className={`block w-full rounded-md border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-navy ${template === t.id ? 'border-navy bg-white' : 'border-line bg-white/60 hover:border-ink/30'}`}
              >
                <span className="block font-medium text-ink">{t.name}</span>
                <span className="mt-1 block text-sm text-muted">{t.note}</span>
              </button>
            ))}
          </fieldset>

          <div className="overflow-auto rounded-md border border-line bg-line/40 p-6">
            <div style={{ zoom: actual ? 1 : 0.6 }}>
              <ResumeDocument resume={resume} template={template} />
            </div>
          </div>
        </div>

        {aiDraft && (
          <section aria-labelledby="ai-draft-title" className="mt-12 rounded-lg border border-line bg-white p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 id="ai-draft-title" className="text-lg font-semibold text-ink">AI draft (not part of your resume fields)</h2>
                <p className="mt-1 text-sm text-muted">
                  Saved {new Date(aiDraft.savedAt).toLocaleString()}. Your resume details were not changed. Copy any text you want into your details yourself.
                </p>
              </div>
              <Button variant="ghost" onClick={() => { setAiDraft(null); notify('AI draft discarded.'); }}>
                <Trash2 size={16} aria-hidden="true" />Discard draft
              </Button>
            </div>
            {aiDraft.isLatex && (
              <p className="mt-3 text-sm text-amber-900">This draft is LaTeX source and is shown as text only.</p>
            )}
            <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap rounded-md border border-line bg-paper p-4 text-sm leading-relaxed text-ink" tabIndex={0} aria-label="AI draft text">{aiDraft.text}</pre>
          </section>
        )}
      </main>
    </>
  );
}
