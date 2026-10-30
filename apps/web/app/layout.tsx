import './globals.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Providers } from '@/components/providers';
import { siteOrigin } from '@/lib/site';

const origin = siteOrigin();

export const metadata: Metadata = {
  ...(origin ? { metadataBase: new URL(origin) } : {}),
  applicationName: 'ResumeMate',
  title: { default: 'ResumeMate: AI Resume Builder & Career Companion', template: '%s | ResumeMate' },
  description: 'Write, organize, and preview your resume with ResumeMate. Its companion Chrome extension is designed for a Gemini workflow where you review and approve each step.',
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans text-ink antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
