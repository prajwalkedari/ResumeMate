'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { emptyResume, type Resume, type TemplateId } from '@/lib/resume';

type AppState = {
  resume: Resume;
  setResume: (r: Resume) => void;
  template: TemplateId;
  setTemplate: (t: TemplateId) => void;
  notify: (message: string) => void;
  reset: () => void;
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
    notify('Data cleared. Your draft is empty.');
  }, [notify]);

  const value = useMemo(
    () => ({ resume, setResume, template, setTemplate, notify, reset }),
    [resume, template, notify, reset],
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
