# Deployment

**No hosting provider is configured in this repository.** The archive contains no `vercel.json`, `netlify.toml`, `wrangler.toml`, `Dockerfile`, or CI deploy step. Nothing has been deployed, and nothing has been published.

## Website (`apps/web`)

Requirements: Node.js 22 LTS. The site is Next.js 14.2.35 with the App Router. It needs a Node runtime (`next start`) or a platform that runs Next.js 14. Static-only hosting is not enough once the Gemini route and compile service exist.

```bash
cd apps/web
npm ci
NEXT_PUBLIC_SITE_ORIGIN=https://<confirmed-origin> npm run build
npm run start            # serves on port 3000 by default
```

| Setting | Value |
| --- | --- |
| Install | `npm ci` (uses `package-lock.json`) |
| Build | `npm run build` |
| Output | `.next/` (Node server, not `out/`) |
| Start | `npm run start` |
| Public origin | `NEXT_PUBLIC_SITE_ORIGIN`, read at build time. Set it to the confirmed production origin. If unset, canonical URLs, the sitemap, and the robots sitemap line are omitted. |
| SPA fallback | Not applicable. Routing is handled by Next.js. |

Before going live:

1. Confirm the production origin. Candidates in the project notes are `https://resume.prajwalkedari.tech` and `https://prajwalkedari.tech`. Use one value everywhere: the website build, the extension allow-list, and DNS.
2. Rebuild the extension with that origin (see below). A website on any other origin will not connect.
3. Decide on the Next.js upgrade. `npm audit` reports advisories that only have fixes in Next.js 15.5 or 16. See `TEST-REPORT.md`.

## Extension (`apps/extension`)

The extension is distributed as an unpacked or packed bundle. The Chrome Web Store is not configured.

```bash
cd apps/extension
npm run verify:manifest
npm run package          # dist/resumemate-assistant-0.1.0.zip
```

Installing from the zip: upload to the Chrome Web Store developer dashboard, or load the unpacked folder in `chrome://extensions` (Developer mode). The `extension.prajwalkedari.tech` landing page explains installation. It does not install the extension.

Changing the production origin requires the extension source, which is not in this repository. Until it is added, the origin in the bundle cannot be changed safely.

Versioning: `manifest.json` version `0.1.0` must match `package.json`. Increase both for each release.

## Rollback

- **Website:** redeploy the previous build from git (`git checkout <tag>`, then `npm ci && npm run build`). Provider-specific rollback is not documented, because no provider is chosen.
- **Extension:** keep the previous `.zip` in releases. Re-submit it to the store or re-load it unpacked.

## Domains

- `resume.prajwalkedari.tech`, `extension.prajwalkedari.tech`, and `prajwalkedari.tech` did not resolve or respond from the build sandbox. This does not prove they are down. Check them from a normal network before relying on them.

## Secrets

- Never use the `NEXT_PUBLIC_` prefix for a secret.
- `GEMINI_API_KEY` is reserved for a future server route. It is server-only.
