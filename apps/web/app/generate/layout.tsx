import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// Working page that holds the user's resume in memory. It is not for search results.
export const metadata: Metadata = {
  title: 'Resume workspace',
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
