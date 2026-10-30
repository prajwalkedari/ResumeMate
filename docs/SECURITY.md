# Security

This is the monorepo summary. The detailed website controls are in `apps/web/docs/SECURITY.md`.

## Reporting a vulnerability

Please report security issues privately to the maintainer. A public contact has not been published yet, so use the repository's private vulnerability reporting once it is enabled. Do not open a public issue for an exploit.

## Controls implemented

| Area | Control | Verified by |
| --- | --- | --- |
| Messaging | Channel, version, and direction checks on both sides | Browser test (22 of 22) and website bridge tests |
| Origin | Extension accepts only the production origin (and dev origins only in dev builds) | Browser test (foreign origin gets no reply) and manifest verification |
| Sender | Website accepts replies only from its own window and origin | `bridge-progress.test.ts` |
| Payload | Size limits and required fields on both sides | Browser test (oversized and invalid payloads) |
| Request IDs | Format check; cancellation only by the originating tab | Browser test (stale and malformed IDs) |
| Approval | Preparing a prompt sends nothing to Gemini | Browser test (zero requests to `gemini.google.com`) |
| Resume data | Not sent in `HELLO` | Browser test and `bridge-progress.test.ts` |
| Uploads | Type decided from content; 10 MB and 30-page limits; encrypted and scanned files reported | `pdf-latex-import.test.ts` |
| LaTeX | `\write18`, `\input`, `\include`, and file I/O commands rejected; shell escape off | Validation tests and compile test |

## Permissions

The extension requests only `storage`, plus two host permissions: `https://gemini.google.com/*` and `https://resumemate.prajwalkedari.tech/*`.

## Known risks and limits

- **Next.js 14.2.35 has open advisories** that only have fixes in Next.js 15.5 or 16 (see `TEST-REPORT.md`). Upgrading needs a migration decision.
- The compile wrapper is **not a sandbox**. Production needs an isolated environment with no network access and enforced CPU, memory, and file-size limits.
- `pdflatex` runs with the full TeX installation. Keep TeX Live updated.
- Shell escape was verified off only with a probe on TeX Live 2023 (Debian).
- The extension source is not in this repository, so its code cannot be reviewed here. The shipped bundle was reviewed as built.
- The bundle has no development origin. `scripts/verify-manifest.mjs` checks this.

## Data handling

- The website keeps drafts in memory only. It has no server-side storage.
- Resume data leaves the browser only after the user approves a prompt in the extension.
- No private Gemini APIs, cookies, passwords, or hidden state are accessed.
