'use client';

import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useApp } from '@/components/providers';

export type Variant = 'primary' | 'secondary' | 'ghost';

const base =
  'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-navy disabled:cursor-not-allowed disabled:opacity-50';
const variants: Record<Variant, string> = {
  primary: 'bg-navy text-white hover:bg-navy/90',
  secondary: 'border border-line bg-white text-ink hover:border-ink/30',
  ghost: 'text-navy hover:bg-navy/5',
};

export const buttonClass = (variant: Variant = 'primary', extra = '') => `${base} ${variants[variant]} ${extra}`;

export function Button({ variant = 'primary', className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button type="button" className={buttonClass(variant, className)} {...rest} />;
}

export function LinkButton({ href, variant = 'primary', children, className = '' }: { href: string; variant?: Variant; children: ReactNode; className?: string }) {
  return <Link href={href} className={`${buttonClass(variant)} ${className}`.trim()}>{children}</Link>;
}

export function Header() {
  const { notify } = useApp();
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
        <Link href="/" className="font-serif text-xl text-navy">ResumeMate</Link>
        <nav aria-label="Primary" className="hidden items-center gap-7 text-sm text-ink/80 md:flex">
          <Link href="/#features" className="hover:text-ink">Features</Link>
          <Link href="/#templates" className="hover:text-ink">Templates</Link>
          <Link href="/#how-it-works" className="hover:text-ink">How it works</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => notify('Accounts are not available in this prototype.')}>Sign In</Button>
          <LinkButton href="/create">Create resume</LinkButton>
        </div>
      </div>
    </header>
  );
}

export function Notice({ tone = 'info', title, children }: { tone?: 'info' | 'warn' | 'error'; title?: string; children?: ReactNode }) {
  const tones = {
    info: 'border-line bg-white',
    warn: 'border-amber-300 bg-amber-50',
    error: 'border-red-300 bg-red-50',
  };
  return (
    <div role={tone === 'error' ? 'alert' : undefined} className={`rounded-md border p-4 text-sm ${tones[tone]}`}>
      {title && <p className="font-medium text-ink">{title}</p>}
      {children && <div className="mt-1 text-ink/80">{children}</div>}
    </div>
  );
}
