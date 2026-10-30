'use client';

import { useEffect, useState } from 'react';
import { Check, Circle, Loader2 } from 'lucide-react';
import { Header, LinkButton, Notice } from '@/components/ui';
import { useApp } from '@/components/providers';

const STEPS = ['Preparing resume content', 'Connecting to Gemini', 'Reviewing generated content', 'Preparing resume preview'];

export default function GeneratePage() {
  const { resume } = useApp();
  const [current, setCurrent] = useState(0);
  const done = current >= STEPS.length;

  useEffect(() => {
    if (done) return;
    const t = setTimeout(() => setCurrent((c) => c + 1), 1400);
    return () => clearTimeout(t);
  }, [current, done]);

  if (!resume.personal.name) {
    return (
      <>
        <Header />
        <main className="mx-auto max-w-xl px-5 py-20 text-center">
          <h1 className="font-serif text-3xl text-navy">No details to review</h1>
          <p className="mt-3 text-muted">Add your details in the workspace first.</p>
          <div className="mt-8"><LinkButton href="/create">Go to the workspace</LinkButton></div>
        </main>
      </>
    );
  }

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
        <section>
          <h1 className="font-serif text-3xl text-navy">{done ? 'Simulated progress complete' : 'Simulating generation'}</h1>
          <div className="mt-6">
            <Notice>Prototype: this screen simulates progress. No request is sent to Gemini, and no resume has been generated.</Notice>
          </div>
          <ol className="mt-8">
            {STEPS.map((s, i) => (
              <li key={s} className="flex items-center gap-3 border-b border-line py-4" aria-current={i === current && !done ? 'step' : undefined}>
                {i < current ? <Check size={18} className="text-navy" aria-label="Complete" />
                  : i === current && !done ? <Loader2 size={18} className="animate-spin text-navy" aria-label="In progress" />
                  : <Circle size={18} className="text-line" aria-label="Pending" />}
                <span className={i > current ? 'text-muted' : 'text-ink'}>{s}</span>
              </li>
            ))}
          </ol>
          <div className="mt-8">
            {done ? <LinkButton href="/preview">Open preview</LinkButton> : <LinkButton href="/create" variant="secondary">Back to editing</LinkButton>}
          </div>
        </section>

        <aside>
          <h2 className="text-sm font-medium text-muted">Reviewed details</h2>
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
