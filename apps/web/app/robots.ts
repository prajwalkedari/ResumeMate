import type { MetadataRoute } from 'next';
import { siteOrigin } from '@/lib/site';

// Private tool pages (/create, /generate, /preview) are excluded with a noindex robots tag
// in their layouts. They are not blocked here, because a crawler must fetch a page to see noindex.
export default function robots(): MetadataRoute.Robots {
  const origin = siteOrigin();
  return {
    rules: { userAgent: '*', allow: '/' },
    ...(origin ? { sitemap: `${origin}/sitemap.xml` } : {}),
  };
}
