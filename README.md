<div align="center">

<h1>ResumeMate</h1>

<p><strong>Your AI-Powered Resume & Career Companion</strong></p>

<p>
  A resume workspace for the website, and a Chrome extension that works with Google Gemini.<br/>
  You review every request before anything is shared, and you review output before it comes back.
</p>

<p>
  <img alt="Version 0.1.0" src="https://img.shields.io/badge/version-0.1.0-7C3AED?style=for-the-badge"/>
  <img alt="Next.js 14.2" src="https://img.shields.io/badge/Next.js-14.2.35-0F172A?style=for-the-badge&logo=nextdotjs&logoColor=white"/>
  <img alt="React 18.3" src="https://img.shields.io/badge/React-18.3.1-2563EB?style=for-the-badge&logo=react&logoColor=white"/>
  <img alt="TypeScript 5.6" src="https://img.shields.io/badge/TypeScript-5.6.2-3178C6?style=for-the-badge&logo=typescript&logoColor=white"/>
  <img alt="Tailwind CSS 3.4" src="https://img.shields.io/badge/Tailwind_CSS-3.4.11-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white"/>
  <img alt="Node.js 22 LTS" src="https://img.shields.io/badge/Node.js-22_LTS-339933?style=for-the-badge&logo=nodedotjs&logoColor=white"/>
  <br/>
  <img alt="Chrome Extension" src="https://img.shields.io/badge/Chrome_Extension-Manifest_V3-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white"/>
  <img alt="Google Gemini integration in progress" src="https://img.shields.io/badge/Google_Gemini-integration_in_progress-8E75B2?style=for-the-badge&logo=googlegemini&logoColor=white"/>
</p>

</div>

---

## Overview

ResumeMate has two parts in this repository:

- **The website** (`apps/web`) is a Next.js application. You enter your details, choose a template, and preview the result. It works with no extension installed.
- **The ResumeMate Assistant** (`apps/extension`) is a Chrome extension. It prepares a request for Gemini, shows it to you for review, and uses your own signed-in Gemini tab only after you approve. Output returns to the website only after you review it.

Nothing is sent to Gemini automatically.

> **Status: prototype.** The website and the messaging protocol work and are tested. The live connection between the website and the extension, and the live Gemini step, are not yet verified. See the status table.

---

## Status

| Area | Status | Notes |
| --- | --- | --- |
| Resume entry, templates, preview | Working | Fictional sample data only. Drafts are held in memory and are lost on reload. |
| Website build, lint, typecheck, and tests | Passing | 43 of 43 tests. See [`docs/TEST-REPORT.md`](docs/TEST-REPORT.md). |
| Extension manifest, packaging, and protocol | Passing (fixture) | 22 of 22 browser checks against the shipped bundle. |
| Website connected to the extension | Not yet | The `/extension` page shows "Not Installed" in production. No live handshake runs from the page. |
| Live website-to-extension handshake | Not verified | The production domain did not resolve from the build environment. |
| Gemini generation | Not yet | `/generate` simulates progress. No request is sent. |
| PDF output | Not yet | "Download PDF (demo)" creates no file. |
| PDF and LaTeX import | Library only | Code and tests exist. Not connected to the upload UI. OCR is not run. |
| LaTeX compilation | Not deployed | The wrapper is not a sandbox. |
| Extension TypeScript source | Not in repository | The extension is included as a built bundle. |

---

## Features

**Available now**

- Manual resume entry: personal details, summary, education, experience, skills, projects, certifications, and achievements.
- Four templates (classic, modern, minimal, technical), with a rendered preview.
- A website-to-extension bridge that turns a resume into plain text, enforces size limits, and rejects incomplete requests before anything is sent.
- Search-friendly pages, with a sitemap and robots.txt when the public origin is configured. Working pages are marked `noindex`.

**Designed, not yet connected**

- Gemini-assisted improvement, tailoring, and generation through the extension.
- Import of text-based PDFs and `.tex` files into the website.
- PDF output from LaTeX, in an isolated compile service.

---

## Architecture

<p align="center">
  <img src="docs/assets/architecture.svg" alt="Diagram: the ResumeMate website sends versioned messages through a bridge client and window.postMessage to the ResumeMate Assistant extension. The extension reviews each request with the user. The Gemini web app is a separate tab, reached only after the user approves." width="100%"/>
</p>

Full details are in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`docs/WEBSITE-INTEGRATION.md`](docs/WEBSITE-INTEGRATION.md).

### Messages

All messages use one envelope: `{ channel: "resumemate-web", v: 1, direction, message }`.

| Message | Direction | Purpose |
| --- | --- | --- |
| `HELLO` | Website to extension | Checks the connection. No resume data. |
| `CONNECTION_STATUS` | Extension to website | Reports connected, version, and protocol. |
| `PREPARE_PROMPT` | Website to extension | Queues a request for your review. |
| `GEMINI_STATUS` | Extension to website | Progress, including "awaiting approval" and "cancelled". |
| `REVIEW_PROMPT` | Extension to website | The request is waiting for your review. |
| `CANCEL_REQUEST` | Website to extension | Cancels a request that the same page started. |
| `GEMINI_RESPONSE`, `RETURN_OUTPUT` | Extension to website | Output, sent only after review. Not yet exercised live. |
| `ERROR` | Extension to website | Explains a refusal, with a code. |

---

## Repository structure

```text
resumemate/
├── apps/
│   ├── web/                      # Next.js 14 website (own package.json and lockfile)
│   │   ├── app/                  # Routes: /, /create, /generate, /preview, /extension
│   │   ├── components/
│   │   ├── lib/
│   │   │   ├── extension-bridge.ts   # Website side of the protocol
│   │   │   ├── site.ts               # Public origin for SEO output
│   │   │   ├── resume.ts
│   │   │   ├── pdf-import.ts         # Library only
│   │   │   └── latex-import.ts       # Library only
│   │   ├── services/latex-compile/   # Compile wrapper (not deployed)
│   │   ├── tests/
│   │   └── docs/                     # Installation, security, troubleshooting, test notes
│   └── extension/                # ResumeMate Assistant, built bundle (Manifest V3)
│       ├── manifest.json
│       ├── background/, content/, popup/, icons/
│       ├── scripts/                  # verify-manifest, package
│       └── tests/                    # Browser protocol test and fixtures
├── docs/
│   ├── ARCHITECTURE.md
│   ├── WEBSITE-INTEGRATION.md
│   ├── DEPLOYMENT.md
│   ├── SECURITY.md
│   ├── SEO.md
│   ├── TEST-REPORT.md
│   ├── DOCUMENTATION-AUDIT.md
│   └── assets/architecture.svg
├── .github/workflows/ci.yml      # Not yet run on GitHub
├── package.json                  # Root scripts that call each app
└── README.md
```

Each app keeps its own package manager and lockfile. The apps are not npm workspaces.

---

## Prerequisites

- **Node.js 22 LTS** and **npm 10 or later**.
- For the LaTeX checks only: TeX Live (`pdflatex`), poppler-utils, qpdf, and Python 3 with Pillow.
- For the extension browser test only: a Chromium install (see `apps/extension/README.md`).

---

## Website

```bash
cd apps/web
npm ci                  # install from package-lock.json
npm run dev             # http://localhost:3000
npm run lint
npm run typecheck
npm test                # 43 tests (no live services)
npm run build
npm run start           # serve the production build
```

The same commands are available from the root, for example `npm run web:build`.

Set `NEXT_PUBLIC_SITE_ORIGIN` to the confirmed production origin at build time. Without it, the build leaves out canonical URLs and the sitemap.

---

## Extension

The extension is a built bundle, and its source is not in this repository yet.

```bash
cd apps/extension
npm install
npm run verify:manifest     # manifest, files, permissions, no development origins
npm run package             # dist/resumemate-assistant-0.1.0.zip
npm run test:e2e           # loads the bundle in Chromium (fixture-based)
```

To try it locally, open `chrome://extensions`, turn on Developer mode, choose **Load unpacked**, and select `apps/extension`. Its production origin is currently `https://prajwalkedari.tech`, so the handshake works only there.

---

## Gemini workflow and privacy

1. You prepare a request on the website. Nothing is sent.
2. The extension shows the request for review.
3. You approve it. The extension then places the prompt in your own signed-in Gemini tab.
4. You confirm submission separately.
5. You review the output in the extension before it is returned to the website.

Resume data is not sent during the connection check. ResumeMate does not use private Gemini APIs, cookies, passwords, or hidden state. Gemini can make mistakes, so check every generated line against your own experience.

The approval steps are in the bundle. The steps before Gemini (prepare and cancel) have been checked in Chromium. Steps 3 and 4 against a live Gemini page have not.

---

## Environment variables

Copy `apps/web/.env.example` to `apps/web/.env.local`. Never commit `.env.local`.

| Variable | Scope | Used by |
| --- | --- | --- |
| `NEXT_PUBLIC_SITE_ORIGIN` | Public, build time | Canonical URL, sitemap, and robots.txt. Used by the website only. |
| `GEMINI_API_KEY` | Server only | Reserved for a future Gemini route. Not read by any code yet. |

Never put a secret in a variable with the `NEXT_PUBLIC_` prefix.

---

## Testing

Full results and blockers: [`docs/TEST-REPORT.md`](docs/TEST-REPORT.md).

| Check | Scope | Result |
| --- | --- | --- |
| Website lint, typecheck, build | Code and build | Pass |
| Website tests | Bridge regression (5) and PDF/LaTeX import and compile (38) | 43 of 43 |
| Extension manifest and packaging | Bundle | Pass |
| Extension browser protocol test | Chromium, stubbed website and Gemini | 22 of 22 |
| Cross-repo bridge tests | Needs the extension source | **Blocked**, not run |

These are **fixture tests**. They do not contact the live website or Gemini. The live tests still to do are listed in `docs/TEST-REPORT.md`.

---

## Deployment

No hosting provider is configured yet. The website needs a Node runtime (`npm run start`), because the Gemini route and compile service will not work on static-only hosting. The extension is distributed as a packaged zip. See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

Before release:

1. Confirm the production origin. The website and the extension must use the same one.
2. Add the extension source, then rebuild with that origin.
3. Decide on the Next.js upgrade (see Security).

---

## SEO

Public pages have unique titles and descriptions, Open Graph and Twitter tags, and canonical URLs when the origin is set. The working pages (`/create`, `/generate`, `/preview`) are `noindex`. Details and remaining work are in [`docs/SEO.md`](docs/SEO.md).

---

## Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| `/extension` says "Not Installed" | Expected in production. The live connection is not yet connected to the page. |
| Extension ignores the website | The website origin is not on the extension allow-list. Check the origin in the bundle. |
| "This file is not a PDF" | Export the resume again as a PDF. |
| "encrypted or password-protected" | Remove the password, then upload again. |
| "no extractable text ... OCR has NOT been run" | The PDF is a scanned image. Enter the content by hand. |
| "The LaTeX compiler is not installed on this server." | Install TeX Live on the server. |

More detail: [`apps/web/docs/TROUBLESHOOTING.md`](apps/web/docs/TROUBLESHOOTING.md).

---

## Security

Please report security issues privately to the maintainer. Do not open a public issue for an exploit. Details: [`docs/SECURITY.md`](docs/SECURITY.md).

**Open security item:** the website uses Next.js 14.2.35. `npm audit` still reports critical and high advisories, and their fixes are in Next.js 15.5 or 16. Upgrading is a framework migration, so it has not been done.

---

## Contributing

The contribution process has not been defined yet. Please open an issue to discuss a change before opening a pull request.

---

## License

No license has been chosen yet. Until one is added, all rights are reserved by the owner.

---

## Author and maintainer

ResumeMate is maintained by **Prajwal Kedari** ([@Prajwalkedari](https://github.com/Prajwalkedari)).

---

## Links

- Repository: https://github.com/Prajwalkedari/resumemate
- Google Gemini: https://gemini.google.com/app. ResumeMate is not affiliated with or endorsed by Google.

---

<div align="center">

<sub>ResumeMate is an independent project. Gemini is a product of Google LLC.</sub>

</div>
