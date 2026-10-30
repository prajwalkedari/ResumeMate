import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { siteOrigin } from '@/lib/site';

export const metadata: Metadata = {
  title: 'ResumeMate Assistant Chrome extension',
  description: 'Install and check the ResumeMate Assistant Chrome extension. It supports a review-first Gemini workflow. The page checks whether the extension is installed and reachable.',
  ...(siteOrigin() ? { alternates: { canonical: '/extension' } } : {}),
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
