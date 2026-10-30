import type { MetadataRoute } from 'next';
import { siteOrigin } from '@/lib/site';

// Lists only indexable public pages. Returns nothing until the public origin is configured.
export default function sitemap(): MetadataRoute.Sitemap {
  const origin = siteOrigin();
  if (!origin) return [];
  return [
    { url: `${origin}/`, changeFrequency: 'monthly', priority: 1 },
    { url: `${origin}/extension`, changeFrequency: 'monthly', priority: 0.7 },
  ];
}
