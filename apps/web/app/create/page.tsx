'use client';

import { useState } from 'react';
import { PenLine, Mic, FileUp } from 'lucide-react';
import { Header, Button } from '@/components/ui';
import { ManualForm, VoiceInput, FileUpload } from '@/components/inputs';
import { useApp } from '@/components/providers';
import { sampleResume } from '@/lib/resume';

const METHODS = [
  { id: 'manual', label: 'Write manually', desc: 'Fill in each section at your own pace.', icon: PenLine },
  { id: 'voice', label: 'Use voice', desc: 'Speak your details, then correct the transcript.', icon: Mic },
  { id: 'upload', label: 'Upload a file', desc: 'Start from an existing PDF, DOCX, or TXT.', icon: FileUp },
] as const;

type MethodId = (typeof METHODS)[number]['id'];
const PHASES = ['Choose a method', 'Add details', 'Review', 'Generate and preview'];

export default function CreatePage() {
  const { setResume, notify, reset } = useApp();
  const [method, setMethod] = useState<MethodId>('manual');

  return (
    <>
      <Header />
      <main className="mx-auto max-w-4xl px-5 py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-3xl text-navy md:text-4xl">Create your resume</h1>
            <p className="mt-2 max-w-xl text-muted">Choose how you want to start. You can switch methods at any time. Your details stay in this session.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => { setResume(sampleResume); notify('Fictional demonstration resume loaded. Edit any field.'); }}>Load demo resume</Button>
            <Button variant="ghost" onClick={reset}>Reset data</Button>
          </div>
        </div>

        <ol className="mt-8 grid grid-cols-4 gap-2 text-xs text-muted md:text-sm" aria-label="Progress">
          {PHASES.map((p, i) => (
            <li key={p} aria-current={i === 0 ? 'step' : undefined} className="space-y-2">
              <div className={`h-1 rounded-full ${i === 0 ? 'bg-navy' : 'bg-line'}`} />
              <span className={i === 0 ? 'font-medium text-navy' : ''}>{p}</span>
            </li>
          ))}
        </ol>

        <div className="mt-8 grid gap-3 md:grid-cols-3" role="group" aria-label="Input method">
          {METHODS.map((m) => {
            const Icon = m.icon;
            const active = method === m.id;
            return (
              <button
                key={m.id}
                type="button"
                aria-pressed={active}
                onClick={() => setMethod(m.id)}
                className={`rounded-md border p-5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-navy ${active ? 'border-navy bg-white' : 'border-line bg-white/50 hover:border-ink/30'}`}
              >
                <Icon size={20} className="text-navy" aria-hidden="true" />
                <span className="mt-3 block font-medium text-ink">{m.label}</span>
                <span className="mt-1 block text-sm text-muted">{m.desc}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-8 rounded-lg border border-line bg-white p-6 md:p-8">
          {method === 'manual' && <ManualForm />}
          {method === 'voice' && <VoiceInput />}
          {method === 'upload' && <FileUpload />}
        </div>
      </main>
    </>
  );
}
