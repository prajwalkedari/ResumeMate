'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { emptyResume, type Resume, type TemplateId } from '@/lib/resume';

/** Output the user accepted from the extension. Kept apart from the resume, which is never overwritten automatically. */
export interface AiDraft {
  text: string;
  isLatex: boolean;
  savedAt: number;
}

type AppState = {
  resume: Resume;
  setResume: (r: Resume) => void;
  template: TemplateId;
  setTemplate: (t: TemplateId) => void;
  notify: (message: string) => void;
  reset: () => void;
  aiDraft: AiDraft | null;
  setAiDraft: (d: AiDraft | null) => void;
};

const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside Providers');
  return ctx;
}

export function Providers({ children }: { children: ReactNode }) {
  const [resume, setResume] = useState<Resume>(emptyResume);
  const [template, setTemplate] = useState<TemplateId>('classic');
  const [aiDraft, setAiDraft] = useState<AiDraft | null>(null);
  const [message, setMessage] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const notify = useCallback((m: string) => {
    setMessage(m);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(''), 4000);
  }, []);

  const reset = useCallback(() => {
    setResume(emptyResume);
    setTemplate('classic');
    setAiDraft(null);
    notify('Data cleared. Your draft is empty.');
  }, [notify]);

  const value = useMemo(
    () => ({ resume, setResume, template, setTemplate, notify, reset, aiDraft, setAiDraft }),
    [resume, template, notify, reset, aiDraft],
  );

  return (
    <AppContext.Provider value={value}>
      {children}
      <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
        {message && (
          <div className="rounded-md border border-line bg-white px-4 py-2.5 text-sm text-ink shadow-sm">{message}</div>
        )}
      </div>
    </AppContext.Provider>
  );
}
