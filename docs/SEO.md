# SEO

## Framework and rendering

- Next.js 14.2.35, App Router, statically prerendered pages (`○ Static`). Metadata uses the Next.js Metadata API.
- The site is not a client-only SPA for public pages. The homepage and `/extension` are server components. `/create`, `/generate`, and `/preview` are client components, and their metadata comes from route layouts.

## Pages

| Route | Indexable | Title | Notes |
| --- | --- | --- | --- |
| `/` | Yes | ResumeMate: AI Resume Builder & Career Companion | Canonical, Open Graph, and Twitter card when the origin is set. |
| `/extension` | Yes | ResumeMate Assistant Chrome extension \| ResumeMate | Canonical when the origin is set. Describes that the live connection is in development. |
| `/create` | **No** (`noindex, nofollow`) | Resume workspace \| ResumeMate | Working page with the user's draft in memory. |
| `/generate` | **No** (`noindex, nofollow`) | Resume workspace \| ResumeMate | Simulated progress screen. |
| `/preview` | **No** (`noindex, nofollow`) | Resume workspace \| ResumeMate | Preview of the user's draft. |
| Unknown routes | Not found | Next.js 404 | Returns HTTP 404. |

## Metadata

- Root layout: `title.template` `%s | ResumeMate`, description, `applicationName`, `robots: index, follow`.
- Canonical and Open Graph URLs are **absolute and only added when `NEXT_PUBLIC_SITE_ORIGIN` is set**. Relative canonical URLs are never emitted.
- Twitter card: `summary`.

## Robots and sitemap

- `app/robots.ts` allows all crawling and adds `Sitemap:` only when the origin is set.
- `app/sitemap.ts` lists `/` and `/extension` when the origin is set, and returns an empty sitemap otherwise.
- Private tool pages are **not** blocked in `robots.txt`. They must be crawled to see their `noindex` tag.

## Content

The homepage describes what works today, and labels voice input, file import, and the Gemini connection as in development. Claims about ATS scores, interviews, employment, or specific features that do not exist are not made.

## Verified

Checked by running `next start` with `NEXT_PUBLIC_SITE_ORIGIN=https://resumemate.prajwalkedari.tech`:

- `/robots.txt` contains `Sitemap: https://resumemate.prajwalkedari.tech/sitemap.xml`.
- `/sitemap.xml` lists the two indexable URLs with the correct origin.
- `/create` returns `<meta name="robots" content="noindex, nofollow">`.
- `/extension` returns an absolute canonical link.
- An unknown route returns 404.

Without the origin, the build emits no canonical, Open Graph URL, or sitemap entries.

## Not done

- **Open Graph image and favicon.** No brand image or web icon exists in the supplied assets. The extension icons are not used for the website. Add `app/opengraph-image` and `app/icon` once a logo is approved.
- **Structured data.** Not added. Nothing on the site qualifies for a rich result without a real product or organization page to describe.
- **Image alt text.** The site has no content images. The architecture diagram appears only in the README.
- **Search Console.** Not set up. The domain has not been verified in Search Console, and no verification token is in the repository. Steps once the domain is live: add the property, verify by DNS or HTML tag, then submit `/sitemap.xml`.
- **Lighthouse or Core Web Vitals.** Not measured. The build reports First Load JS of about 88 kB shared, and about 97 to 105 kB per page.
