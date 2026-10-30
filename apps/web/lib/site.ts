// The public origin of the website, used for canonical URLs, sitemap, and robots.txt.
// Set NEXT_PUBLIC_SITE_ORIGIN at build time (for example https://resume.example.com).
// If it is missing or invalid, these outputs are left out instead of guessing a domain.
export function siteOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_SITE_ORIGIN?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (url.protocol !== 'https:' && !(isLocal && url.protocol === 'http:')) return null;
    if (url.pathname !== '/' || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}
