# Deployment

The website is hosted on **Vercel**. This repository contains no Vercel-specific file. Vercel detects Next.js from `apps/web/package.json`.

Nothing in this repository has been deployed, and DNS has not been changed. The production site was **not reachable** from the build sandbox, so deployment status is unverified.

## Website on Vercel

### Project settings

| Setting | Value |
| --- | --- |
| Framework preset | Next.js (detected) |
| Root directory | `apps/web` |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Output | Next.js default (`.next`). Do not set a custom output directory. |
| Node.js version | 22.x |
| Production domain | `resumemate.prajwalkedari.tech` |

### Environment variables

| Name | Environment | Value | Used by |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SITE_ORIGIN` | Production | `https://resumemate.prajwalkedari.tech` | `apps/web/lib/site.ts`: canonical URLs, Open Graph URL, sitemap, robots.txt |

`NEXT_PUBLIC_*` values are read at build time. After you add or change this variable, **redeploy** so the new build includes it. Do not add `NEXT_PUBLIC_SITE_URL`. The app does not read it.

Never add a secret with the `NEXT_PUBLIC_` prefix. `GEMINI_API_KEY` is reserved for a future server route and is not read yet.

### Steps

1. In Vercel, import the repository `Prajwalkedari/resumemate` (the repository link is not verified from here). Set the root directory to `apps/web`.
2. Add `NEXT_PUBLIC_SITE_ORIGIN` for the Production environment.
3. Add `resumemate.prajwalkedari.tech` under the project's domains, and follow Vercel's DNS instructions. This is your action. The repository does not change DNS.
4. Deploy. Then check the live site:
   - `https://resumemate.prajwalkedari.tech/robots.txt` lists `Sitemap: https://resumemate.prajwalkedari.tech/sitemap.xml`.
   - `https://resumemate.prajwalkedari.tech/extension` shows the idle connection state.
   - `/create`, `/generate`, and `/preview` send `noindex`.
5. Test the handshake with the extension installed. See the checklist below.

### Rollback

Use Vercel's deployment list and promote the previous production deployment. Do not force-push the repository as part of a rollback.

## Extension

The extension is `apps/extension` version 0.1.0 (Manifest V3). Its TypeScript source is **not in this repository**. The bundle can be changed only by editing the built files, and those edits must be reproduced in the source when it is recovered.

### Build and package

```bash
cd apps/extension
npm install
npm run verify:manifest     # must print PASS and the production origin
npm run package             # writes dist/resumemate-assistant-0.1.0.zip
```

### Install or update in Chrome

- **Unpacked (development or testing):** open `chrome://extensions`, turn on Developer mode, choose **Load unpacked**, and select `apps/extension`. To update, click the reload icon on the card after changing files.
- **Store (not set up yet):** upload the new zip to the Chrome Web Store developer dashboard. Chrome asks users to approve new permissions when an update adds host access.

Because the host permissions changed to `https://resumemate.prajwalkedari.tech/*`, **every user must update or reinstall the extension** before the new website can connect. Until they do, the old bundle only trusts `https://prajwalkedari.tech`, and the new site will show "not detected".

### Versioning

Keep `manifest.json` `version` and `package.json` `version` in step. Increase both for every release.

### Rollback

Keep the previous zip. To roll back, reinstall it, or reload the previous unpacked folder.

## Checklist after deploying

1. Website: open `https://resumemate.prajwalkedari.tech/extension` in a normal browser.
2. Extension installed and enabled, updated to 0.1.0 with the new origin: click **Check connection**. Expected: "ResumeMate Assistant is connected." with version 0.1.0 and protocol v1.
3. Extension not installed: click **Check connection**. Expected: "was not detected", with the installation link.
4. Record the date and result in `docs/TEST-REPORT.md`. Do not record a live pass until it was done against the deployed site.
