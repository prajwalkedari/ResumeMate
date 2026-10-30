import type { Metadata } from 'next';
import { PenLine, Mic, FileUp } from 'lucide-react';
import { Header, LinkButton } from '@/components/ui';
import { ScaledResume } from '@/components/resume-document';
import { DEMO_LABEL, sampleResume, TEMPLATES } from '@/lib/resume';
import { siteOrigin } from '@/lib/site';

// Canonical and Open Graph URLs are added only when the public origin is configured, so they are always absolute.
const absolute = siteOrigin() ? { alternates: { canonical: '/' }, openGraph: { url: '/' } } : {};

export const metadata: Metadata = {
  title: 'ResumeMate: AI Resume Builder & Career Companion',
  description:
    'Write, organize, and preview your resume with ResumeMate. Its companion Chrome extension is designed for a Gemini workflow where you review and approve each step.',
  openGraph: {
    title: 'ResumeMate: AI Resume Builder & Career Companion',
    description: 'Write, organize, and preview your resume. Nothing is shared with Gemini without your approval.',
    siteName: 'ResumeMate',
    type: 'website',
    ...absolute.openGraph,
  },
  ...absolute,
  twitter: {
    card: 'summary',
    title: 'ResumeMate: AI Resume Builder & Career Companion',
    description: 'Write, organize, and preview your resume. Nothing is shared with Gemini without your approval.',
  },
};

const WAYS = [
  { icon: PenLine, title: 'Write manually', body: 'Work through guided sections for education, experience, projects, and skills. Add or reorder entries as you go.' },
  { icon: Mic, title: 'Speak your details (in development)', body: 'Voice input is not connected yet. Microphone access is not available in this version.' },
  { icon: FileUp, title: 'Start from a file (in development)', body: 'PDF, DOCX, and TXT import are not connected yet. For now, enter your details manually.' },
];

const STEPS = [
  ['Add your details', 'Enter your details in the guided form. Your draft stays in memory on this page and is lost when you reload.'],
  ['Review what will be sent', 'You see the structured request before anything leaves ResumeMate.'],
  ['Generate with your Gemini account (in development)', 'The planned extension will work with your own signed-in Gemini session. Nothing is sent without your approval, and this connection is not live yet.'],
  ['Preview your resume', 'Pick a template and check the layout. PDF download is not built yet.'],
];

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 md:grid-cols-[1.1fr_1fr] md:py-24">
          <div>
            <h1 className="font-serif text-4xl leading-tight text-navy md:text-5xl">A better resume starts with your story.</h1>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-ink/75">
              Write out your details and ResumeMate arranges them into a clean resume layout. Choose a template and preview it before anything else happens.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <LinkButton href="/create">Create My Resume</LinkButton>
              <LinkButton href="/#templates" variant="secondary">Explore Templates</LinkButton>
            </div>
          </div>
          <div className="hidden flex-col items-center gap-3 md:flex">
            <ScaledResume resume={sampleResume} template="classic" scale={0.56} />
            <p className="text-sm text-muted">{DEMO_LABEL}</p>
          </div>
        </section>

        <section id="features" className="border-t border-line bg-white/60">
          <div className="mx-auto max-w-6xl px-5 py-20">
            <h2 className="font-serif text-3xl text-navy">Ways to start</h2>
            <p className="mt-3 max-w-xl text-muted">Manual entry works today. Voice and file import are in development.</p>
            <div className="mt-12 grid gap-10 md:grid-cols-3">
              {WAYS.map((w) => (
                <div key={w.title}>
                  <w.icon className="text-navy" size={24} aria-hidden="true" />
                  <h3 className="mt-4 font-semibold text-ink">{w.title}</h3>
                  <p className="mt-2 leading-relaxed text-ink/75">{w.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="how-it-works" className="mx-auto max-w-6xl px-5 py-20">
          <h2 className="font-serif text-3xl text-navy">How it works</h2>
          <ol className="mt-10 grid gap-8 md:grid-cols-2">
            {STEPS.map(([title, body], i) => (
              <li key={title} className="flex gap-5 border-t border-line pt-5">
                <span className="font-serif text-2xl text-navy">{i + 1}</span>
                <div>
                  <h3 className="font-semibold text-ink">{title}</h3>
                  <p className="mt-1 leading-relaxed text-ink/75">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section id="privacy" className="mx-auto max-w-6xl px-5 py-16">
          <div className="grid gap-6 md:grid-cols-[1fr_2fr] md:gap-12">
            <h2 className="font-serif text-2xl text-navy">Your details, your decision</h2>
            <p className="leading-relaxed text-ink/75">Nothing is sent to Gemini until you review the request and approve it. This prototype has no server-side storage, and drafts exist only in memory on this page. Information sent to Gemini is subject to Google’s policies and your account settings.</p>
          </div>
        </section>

        <section id="templates" className="border-t border-line bg-white/60">
          <div className="mx-auto max-w-6xl px-5 py-20">
            <h2 className="font-serif text-3xl text-navy">Templates</h2>
            <p className="mt-3 max-w-xl text-muted">Four layouts for clearly organized resumes.</p>
            <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {TEMPLATES.map((t) => (
                <figure key={t.id}>
                  <ScaledResume resume={sampleResume} template={t.id} scale={0.28} />
                  <figcaption className="mt-4">
                    <p className="font-medium text-ink">{t.name}</p>
                    <p className="mt-1 text-sm text-muted">{t.note}</p>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-sm text-muted">
          <p className="font-serif text-base text-navy">ResumeMate</p>
          <p>Frontend prototype. Resume generation and PDF export are not connected yet.</p>
        </div>
      </footer>
    </>
  );
}
