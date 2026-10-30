'use client';

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronUp, FileText, Mic, MicOff, Play, PhoneOff, Plus, Trash2, Upload, X } from 'lucide-react';
import { Button, Notice } from '@/components/ui';
import { useApp } from '@/components/providers';
import { SECTIONS, blankEntry, validateResume, type Fields, type FieldDef, type Resume, type Section, type SectionId } from '@/lib/resume';

const inputCls = 'mt-1.5 w-full rounded-md border border-line bg-white px-3 py-2.5 text-[15px] text-ink placeholder:text-muted/70 focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/20';

function Field({ id, label, value, onChange, multiline, hint }: { id: string; label: string; value: string; onChange: (v: string) => void; multiline?: boolean; hint?: string }) {
  const describe = hint ? `${id}-hint` : undefined;
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-ink">{label}</label>
      {hint && <p id={describe} className="mt-1 text-sm text-muted">{hint}</p>}
      {multiline
        ? <textarea id={id} rows={4} value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={describe} className={inputCls} />
        : <input id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={describe} className={inputCls} />}
    </div>
  );
}

function FieldGroup({ fields, value, onChange, prefix }: { fields: FieldDef[]; value: Fields; onChange: (v: Fields) => void; prefix: string }) {
  return (
    <div className="grid gap-5 md:grid-cols-2">
      {fields.map(([key, label, multi]) => (
        <div key={key} className={multi ? 'md:col-span-2' : undefined}>
          <Field id={`${prefix}-${key}`} label={label} multiline={multi} value={value[key] ?? ''} onChange={(v) => onChange({ ...value, [key]: v })} />
        </div>
      ))}
    </div>
  );
}

function SectionEditor({ sec, resume, set }: { sec: Section; resume: Resume; set: (id: SectionId, v: unknown) => void }) {
  if (sec.kind === 'text') {
    return <Field id="summary" label="Summary" multiline hint={sec.hint} value={resume.summary} onChange={(v) => set('summary', v)} />;
  }
  if (sec.kind === 'object') {
    return <FieldGroup prefix={sec.id} fields={sec.fields ?? []} value={resume[sec.id] as Fields} onChange={(v) => set(sec.id, v)} />;
  }

  const list = resume[sec.id] as Fields[];
  const update = (next: Fields[]) => set(sec.id, next);
  const move = (i: number, d: number) => {
    const n = [...list];
    [n[i], n[i + d]] = [n[i + d], n[i]];
    update(n);
  };

  return (
    <div className="space-y-5">
      {list.length === 0 && (
        <p className="rounded-md border border-dashed border-line p-6 text-sm text-muted">Nothing here yet. Add an entry to start this section.</p>
      )}
      {list.map((item, i) => (
        <fieldset key={i} className="rounded-md border border-line p-5">
          <legend className="px-1 text-sm text-muted">Entry {i + 1}</legend>
          <FieldGroup prefix={`${sec.id}-${i}`} fields={sec.fields ?? []} value={item} onChange={(v) => update(list.map((x, j) => (j === i ? v : x)))} />
          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="ghost" aria-label={`Move entry ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}><ChevronUp size={18} />Up</Button>
            <Button variant="ghost" aria-label={`Move entry ${i + 1} down`} disabled={i === list.length - 1} onClick={() => move(i, 1)}><ChevronDown size={18} />Down</Button>
            <Button variant="ghost" aria-label={`Remove entry ${i + 1}`} onClick={() => update(list.filter((_, j) => j !== i))}><Trash2 size={18} />Remove</Button>
          </div>
        </fieldset>
      ))}
      <Button variant="secondary" onClick={() => update([...list, blankEntry(sec.id)])}><Plus size={18} />Add entry</Button>
    </div>
  );
}

export function ManualForm() {
  const { resume, setResume, notify } = useApp();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const sec = SECTIONS[step];
  const set = (id: SectionId, value: unknown) => setResume({ ...resume, [id]: value } as Resume);

  const review = () => {
    const errs = validateResume(resume);
    setErrors(errs);
    if (errs.length) {
      setStep(0);
      return;
    }
    router.push('/generate');
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-4 text-sm text-muted">
        <span>Step {step + 1} of {SECTIONS.length}</span>
        <span>{sec.title}</span>
      </div>
      <div className="mt-3 h-1 rounded-full bg-line" aria-hidden="true">
        <div className="h-1 rounded-full bg-navy transition-[width] duration-300" style={{ width: `${((step + 1) / SECTIONS.length) * 100}%` }} />
      </div>

      {errors.length > 0 && (
        <div className="mt-6">
          <Notice tone="error" title="Fix these before reviewing">
            <ul className="list-disc pl-5">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
          </Notice>
        </div>
      )}

      <h2 className="mt-8 font-serif text-2xl text-navy">{sec.title}</h2>
      <div className="mt-6">
        <SectionEditor sec={sec} resume={resume} set={set} />
      </div>

      <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6">
        <Button variant="ghost" onClick={() => setStep((s) => s - 1)} disabled={step === 0}>Back</Button>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => notify('Draft kept for this session. Reloading the page clears it.')}>Save Draft</Button>
          {step < SECTIONS.length - 1 && <Button variant="secondary" onClick={() => setStep((s) => s + 1)}>Next</Button>}
          <Button onClick={review}>Review</Button>
        </div>
      </div>
    </div>
  );
}

const LANGUAGES = ['English', 'Hindi', 'Marathi', 'Tamil', 'Telugu', 'Bengali', 'Gujarati', 'Kannada'];
const SCRIPT = [
  { q: 'Tell me about your education. Where did you study, and when?', a: 'I completed a B.Sc. in Computer Science at Example State University, from 2020 to 2024.' },
  { q: 'What work experience or training should go on the resume?', a: 'I was a data analyst intern at Sample Analytics Ltd., doing exploratory analysis with Pandas and NumPy.' },
  { q: 'Which projects would you like to highlight?', a: 'a malware classifier prototype served through FastAPI, and an open-source command-line toolkit.' },
];
const FOLLOW_UPS = ['What dates should I use for that role?', 'Which tools did you use on that project?', 'Do you have any certifications or awards to add?'];

type Phase = 'idle' | 'thinking' | 'speaking' | 'listening' | 'ended' | 'error';
type Msg = { id: number; role: 'assistant' | 'user'; text: string; lang?: string };

const PHASE_TEXT: Record<Phase, string> = {
  idle: 'Not started. Nothing is captured until you start a conversation.',
  thinking: 'Thinking about your last answer.',
  speaking: 'Asking a follow-up question.',
  listening: 'Listening for your answer.',
  ended: 'Conversation ended. Review the details before confirming.',
  error: 'Microphone access is blocked, so this conversation cannot continue.',
};

export function VoiceInput() {
  const { notify } = useApp();
  const [phase, setPhase] = useState<Phase>('idle');
  const [muted, setMuted] = useState(false);
  const [lang, setLang] = useState('English');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [turn, setTurn] = useState(0);
  const [editId, setEditId] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const nextId = useRef(0);
  const langRef = useRef(lang);
  langRef.current = lang;

  const add = (role: Msg['role'], text: string, language?: string) => {
    nextId.current += 1;
    const id = nextId.current;
    setMsgs((m) => [...m, { id, role, text, lang: language }]);
  };

  // Simulated turn-taking only. No audio is captured or played.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    if (phase === 'thinking') {
      t = setTimeout(() => { add('assistant', SCRIPT[turn].q); setPhase('speaking'); }, 1200);
    } else if (phase === 'speaking') {
      t = setTimeout(() => setPhase('listening'), 1800);
    } else if (phase === 'listening' && !muted) {
      t = setTimeout(() => {
        add('user', SCRIPT[turn].a, langRef.current);
        if (turn + 1 >= SCRIPT.length) setPhase('ended');
        else { setTurn(turn + 1); setPhase('thinking'); }
      }, 2400);
    }
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, turn, muted]);

  const running = phase === 'thinking' || phase === 'speaking' || phase === 'listening';
  const userMsgs = msgs.filter((m) => m.role === 'user');

  const start = () => {
    setMsgs([]); setTurn(0); setReviewing(false); setConfirmed(false); setMuted(false); setPhase('thinking');
  };
  const saveEdit = () => {
    setMsgs((m) => m.map((x) => (x.id === editId ? { ...x, text: draft } : x)));
    setEditId(null);
    notify('Transcript line updated.');
  };

  return (
    <div className="space-y-8">
      <Notice title="Prototype conversation">
        This is a simulated conversation. It does not access your microphone, and nothing is sent to Gemini. Live voice arrives with the extension integration, which asks for microphone permission only after you start.
      </Notice>

      <div className="grid gap-8 md:grid-cols-[200px_1fr]">
        <div className="flex flex-col items-start gap-5">
          <div aria-hidden="true" className={`flex h-24 w-24 items-center justify-center rounded-full border-2 transition-colors duration-300 ${running ? 'border-navy bg-navy/5 text-navy' : 'border-line bg-white text-muted'} ${phase === 'listening' && !muted ? 'motion-safe:animate-pulse' : ''}`}>
            {muted ? <MicOff size={30} /> : <Mic size={30} />}
          </div>
          <div>
            <label htmlFor="lang" className="block text-sm font-medium text-ink">Conversation language</label>
            <select id="lang" value={lang} onChange={(e) => setLang(e.target.value)} className="mt-1.5 rounded-md border border-line bg-white px-3 py-2 text-sm">
              {LANGUAGES.map((l) => <option key={l}>{l}</option>)}
            </select>
          </div>
        </div>

        <div>
          <p className="text-sm text-muted">Current state</p>
          <p role="status" aria-live="polite" className="mt-1 font-medium text-ink">
            {PHASE_TEXT[phase]}{phase === 'listening' && muted ? ' Microphone muted.' : ''}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {!running && <Button onClick={start}><Play size={16} />{phase === 'idle' ? 'Start conversation' : 'Start again'}</Button>}
            <Button variant="secondary" aria-pressed={muted} disabled={!running} onClick={() => setMuted((m) => !m)}>
              {muted ? <Mic size={16} /> : <MicOff size={16} />}{muted ? 'Unmute' : 'Mute'}
            </Button>
            <Button variant="secondary" disabled={!running} onClick={() => setPhase('ended')}><PhoneOff size={16} />End conversation</Button>
            <Button variant="ghost" disabled={userMsgs.length === 0} onClick={() => setReviewing(true)}>Review details</Button>
          </div>
          {phase === 'error' ? (
            <div className="mt-6">
              <Notice tone="error" title="Microphone access is blocked">
                Allow microphone access for this site in your browser settings, then start again. You can also type your details in the manual form.
              </Notice>
            </div>
          ) : (
            <Button variant="ghost" className="mt-4" disabled={running} onClick={() => setPhase('error')}>Simulate blocked microphone</Button>
          )}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-medium text-ink">Conversation</h2>
        <ol aria-label="Conversation transcript" className="mt-3 max-h-96 space-y-4 overflow-y-auto rounded-md border border-line bg-white p-5">
          {msgs.length === 0 && (
            <li className="text-sm text-muted">Your conversation appears here. You can answer in any supported language. Replies are shown as prototype text.</li>
          )}
          {msgs.map((m) => (
            <li key={m.id} className={m.role === 'user' ? 'ml-8 text-right' : 'mr-8'}>
              <p className="text-xs text-muted">{m.role === 'assistant' ? 'ResumeMate (prototype)' : `You${m.lang ? `, ${m.lang}` : ''}`}</p>
              {editId === m.id ? (
                <div className="mt-1 text-left">
                  <label htmlFor={`edit-${m.id}`} className="sr-only">Edit this transcript line</label>
                  <textarea id={`edit-${m.id}`} rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} className={inputCls} />
                  <div className="mt-2 flex gap-2">
                    <Button onClick={saveEdit}>Save line</Button>
                    <Button variant="ghost" onClick={() => setEditId(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <>
                  <p className={`mt-1 rounded-md px-3 py-2 text-left leading-relaxed ${m.role === 'user' ? 'bg-navy/5 text-ink' : 'border border-line text-ink'}`}>{m.text}</p>
                  {m.role === 'user' && (
                    <Button variant="ghost" className="mt-1 px-2 py-1 text-xs" onClick={() => { setEditId(m.id); setDraft(m.text); }}>Edit</Button>
                  )}
                </>
              )}
            </li>
          ))}
        </ol>
      </div>

      <div>
        <h2 className="text-sm font-medium text-ink">Follow-up questions you may hear</h2>
        <ul className="mt-3 space-y-2 text-sm text-ink/80">
          {FOLLOW_UPS.map((f) => <li key={f} className="border-l-2 border-line pl-3">{f}</li>)}
        </ul>
      </div>

      {reviewing && !confirmed && (
        <div className="rounded-md border border-line bg-white p-5">
          <h2 className="font-medium text-ink">Confirm before using these details</h2>
          <p className="mt-1 text-sm text-muted">Only your answers are listed. Nothing is sent until you approve an extension request later.</p>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-sm">
            {userMsgs.map((m) => <li key={m.id}>{m.text}</li>)}
          </ul>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button onClick={() => { setConfirmed(true); notify('Prototype: confirmation recorded. Nothing was structured or sent.'); }}>Use these details</Button>
            <Button variant="ghost" onClick={() => setReviewing(false)}>Keep editing</Button>
          </div>
        </div>
      )}
      {confirmed && <Notice title="Confirmed in prototype">Mapping answers to resume fields and sending requests are not connected yet.</Notice>}
    </div>
  );
}

const ACCEPT = ['pdf', 'docx', 'txt'];
const MAX_BYTES = 5 * 1024 * 1024;
const EXTRACT = 'Placeholder text for layout review. Nothing was read from your file.';

export function FileUpload() {
  const { setResume, notify } = useApp();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [jd, setJd] = useState('');
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (progress === null) return;
    if (progress >= 100) {
      setText(EXTRACT);
      return;
    }
    const t = setTimeout(() => setProgress((p) => Math.min(100, (p ?? 0) + 20)), 350);
    return () => clearTimeout(t);
  }, [progress]);

  const pick = (f?: File) => {
    if (!f) return;
    const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
    if (!ACCEPT.includes(ext)) return setError(`"${f.name}" is not supported. Upload a PDF, DOCX, or TXT file.`);
    if (f.size === 0) return setError('This file is empty. Choose a different file.');
    if (f.size > MAX_BYTES) return setError('This file is over 5 MB. Choose a smaller file.');
    setError('');
    setFile(f);
    setText('');
    setProgress(0);
  };

  const reset = () => {
    setFile(null);
    setText('');
    setProgress(null);
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDrag(false);
    pick(e.dataTransfer.files[0]);
  };

  return (
    <div className="space-y-8">
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        className={`rounded-md border border-dashed p-8 text-center transition-colors ${drag ? 'border-navy bg-navy/5' : 'border-line bg-white'}`}
      >
        <Upload className="mx-auto text-navy" size={28} aria-hidden="true" />
        <p className="mt-3 text-ink">Drag a resume here</p>
        <p className="mt-1 text-sm text-muted">PDF, DOCX, or TXT, up to 5 MB</p>
        <Button variant="secondary" className="mt-5" onClick={() => inputRef.current?.click()}>Browse Files</Button>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.txt"
          className="sr-only"
          aria-label="Choose a resume file"
          onChange={(e: ChangeEvent<HTMLInputElement>) => pick(e.target.files?.[0])}
        />
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      {file && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-line bg-white p-4">
          <div className="flex items-center gap-3">
            <FileText className="text-navy" size={20} aria-hidden="true" />
            <div>
              <p className="font-medium text-ink">{file.name}</p>
              <p className="text-sm text-muted">{file.name.split('.').pop()?.toUpperCase()} | {(file.size / 1024).toFixed(0)} KB</p>
            </div>
          </div>
          <Button variant="ghost" onClick={reset}><X size={16} />Remove file</Button>
        </div>
      )}

      {progress !== null && progress < 100 && (
        <div role="status">
          <p className="text-sm text-muted">Extracting text: {progress}%</p>
          <div className="mt-2 h-1 rounded-full bg-line">
            <div className="h-1 rounded-full bg-navy transition-[width] duration-300" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {progress === 100 && (
        <div className="space-y-4">
          <Notice title="Check the extracted text">
            Prototype: this text is placeholder content, not read from your file. If a PDF is scanned, its text may be missing and OCR may be needed later.
          </Notice>
          <div>
            <label htmlFor="extracted" className="block text-sm font-medium text-ink">Extracted content</label>
            <textarea id="extracted" rows={8} value={text} onChange={(e) => setText(e.target.value)} className={inputCls} />
          </div>
          <Button onClick={() => notify('Confirmed in prototype. Nothing was read from your file or sent.')}>Confirm extracted details</Button>
        </div>
      )}

      <div>
        <label htmlFor="jd" className="block text-sm font-medium text-ink">Target job description (optional)</label>
        <p className="mt-1 text-sm text-muted">Paste the posting you are applying for.</p>
        <textarea id="jd" rows={4} value={jd} onChange={(e) => setJd(e.target.value)} className={inputCls} />
      </div>
    </div>
  );
}
