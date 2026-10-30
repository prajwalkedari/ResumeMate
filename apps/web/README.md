# ResumeMate frontend

Status: frontend prototype. Sample data is fictional. The following are NOT yet implemented and must not be presented as working:
- LaTeX compilation and PDF output
- Resume file extraction (PDF, DOCX, TXT). Uploads only check type and size.
- Gemini text improvement and Gemini Live voice
- The Chrome extension and the website-extension handshake
- Drafts are held in memory only and are lost on reload

## Requirements

- Node.js 22 LTS (tested target: 22.x). Next.js 14.2 also supports Node 18.18+.
- npm 10+ (ships with Node 22).

## Commands

    npm ci            # install exactly from package-lock.json
    npm run dev       # development server on http://localhost:3000
    npm run build     # production build
    npm run start     # serve the production build
    npm run lint      # next lint

Use `npm ci`, not `npm install`, so the lockfile is not rewritten.

## Environment

Copy `.env.example` to `.env.local`. `NEXT_PUBLIC_SITE_ORIGIN` is read at build time for the canonical URL, sitemap, and robots.txt. Never add secrets with the `NEXT_PUBLIC_` prefix.

## Deployment

The app is currently a static-compatible Next.js App Router site. Build output is `.next/` and it needs a Node runtime (`npm run start`) or a platform that supports Next.js 14. Planned server features (Gemini routes and the LaTeX compile service) will require a Node server or a separate isolated compile service, so static-only hosting will not support them.

## Verification status

Last verified in the development sandbox:
- Fictional sample data passes a strict TypeScript check and contains no personal identifiers.
- `package-lock.json` matches `package.json` exactly.

Not yet verified: `npm ci`, `npm run build`, and lint. The sandbox could not reach the npm registry, so run these locally before deploying.

## Integration status

See `docs/INTEGRATION-STATUS.md` for the verified status of the frontend, the Chrome extension, and their protocol. In short: the bridge client and payload serializer exist in `lib/extension-bridge.ts`, and they are tested against the extension's validator. The React UI is not yet connected to them. LaTeX compilation, file import, and deployment are not implemented or deployed.

## Author and maintainer

| Field | Value |
| --- | --- |
| Project | ResumeMate |
| Purpose | Helps job seekers prepare a resume, review generated content before anything is sent to Gemini, and produce a PDF. |
| Author / maintainer name | **Pending.** Not stated in any project file. Add it here once it is confirmed. |
| Website | https://resumemate.prajwalkedari.tech (production origin). Not verified from the build environment. |
| Repository | Pending. No Git repository exists in the uploaded project. |
| Contact / support | Pending. Not published here. |
| License | **Pending.** No license has been chosen. Until one is added, all rights are reserved by the owner. |
| Contributions | Pending. No contribution process has been defined. |

Resume information entered in the app belongs to the person who enters it. It is never attributed to the software maintainer.

## Importing a PDF or LaTeX file

- **PDF upload**: text-based PDFs only. Up to 10 MB and 30 pages. Encrypted PDFs are rejected. Scanned, image-only PDFs are flagged, and OCR is **not** run.
- **LaTeX (.tex) import**: the file's exact contents are preserved. Validation checks environments, braces, and forbidden commands (`\write18`, `\input`, `\include`, `\openin`, `\openout`, `\read`). It does not compile anything.
- **Gemini attachments**: the app cannot read files from the Gemini page. If Gemini returns no plain text, download the file from Gemini yourself, then import it with the file picker.
- **Compilation**: `services/latex-compile/compile.mjs` runs pdflatex with shell escape disabled and restricted file access, inside a temporary folder. It must run inside an isolated environment in production. See `docs/SECURITY.md`.

See `docs/TEST-REPORT.md` for what was verified and `docs/SECURITY.md` for the limits.
