# Documentation audit

Discrepancies between the documentation and the implementation, as found on 2026-10-30. Status is "Fixed" when this work changed the code or docs, and "Open" when a decision or missing file is needed.

| # | Where | Claim or gap | Reality | Status |
| --- | --- | --- | --- | --- |
| 1 | Website home (`app/page.tsx`) | "Upload a PDF, DOCX, or TXT resume" | File import is not connected to the UI. Only library code exists. | Fixed (copy now says "in development") |
| 2 | Website home | "Talk through your background" as a working option | Voice input is simulated, with no microphone access. | Fixed |
| 3 | Website home | "Download your PDF" | "Download PDF (demo)" creates no file. | Fixed |
| 4 | Website home | "Built for applicant tracking systems" | No evidence. This is an unverified claim. | Fixed (removed) |
| 5 | Website home | "You can clear all data from the workspace" | No clear-data control exists. | Fixed (removed) |
| 6 | Website home | "Your draft stays in this browser session" | Drafts are in memory only and are lost on reload. | Fixed |
| 7 | `apps/web/README.md` | "npm ci, build, and lint not yet verified" | `npm ci`, build, and lint now run. `npm test` and `npm run typecheck` were added. | Open (the file still needs updating; the root README has the current status) |
| 8 | `apps/web/.env.example` | `NEXT_PUBLIC_SITE_ORIGIN` "not read by any code yet" | Now read by `lib/site.ts` for SEO output. It is **not** used by the extension allow-list. | Fixed (`.env.example` updated) |
| 9 | `docs/INTEGRATION-STATUS.md` (from the archive) | Extension source at `src/` with 102 unit tests and 37 browser tests | The source is not in this repository. The browser fixture test was rewritten and rerun (22 of 22). | Open (needs the source) |
| 10 | `apps/web/tests/extension-bridge.test.ts` | Expects the extension source at `/home/claude/resumemate-extension/src` | Path does not exist. Tests cannot run. | Open |
| 11 | `docs/INTEGRATION-STATUS.md` | Extension trusts only `https://prajwalkedari.tech` | Confirmed in the bundle. The intended origin is `https://resume.prajwalkedari.tech`. | Open (decision needed) |
| 12 | `apps/extension/manifest.json` | Host permissions for `prajwalkedari.tech` only | The intended website host is missing. | Open (follows from #11) |
| 13 | `docs/INTEGRATION-STATUS.md` | `npm ci`, build, and lint "BLOCKED" (no registry) | The registry is reachable now. All three run and pass. | Fixed (reported in `TEST-REPORT.md`) |
| 14 | Frontend archive `docs/TEST-REPORT.md` and `README.md` | "Next.js 14.2.15" with no mention of advisories | `npm audit` reports critical and high advisories. Upgraded to the patched 14.2.35 line, which still has advisories. | Partly fixed (open: framework upgrade decision) |
| 15 | Frontend `README.md` | "Lint: next lint" | Lint had no config and stopped at a prompt. | Fixed (`.eslintrc.json` added with ESLint 8.57.1 and eslint-config-next 14.2.35) |
| 16 | Root `README.md` (previous version) | "apps/extension is planned but not created" | Created. | Fixed (root README updated) |
| 17 | Root `README.md` (previous version) | "Localhost origins only in development builds" | The shipped bundle has no development origin. The development build path is in source that is not here. | Open (cannot verify without source) |
| 18 | Bridge client comment | "protocol documented in the extension's docs/WEBSITE-INTEGRATION.md" | That document is not in this repository. The protocol is now documented in `docs/WEBSITE-INTEGRATION.md` and checked against the bundle. | Fixed (reference updated) |
| 19 | Bridge client `prepare()` | Accepted the first reply | The extension sends progress before the final reply. Accepted requests were reported as failures. | Fixed (`bridge-progress.test.ts`) |
| 20 | Extension bundle | Cancel answered once | The cancel status is sent twice. | Open (behavior only; harmless to the client) |
| 21 | `docs/INSTALLATION.md` (archive) | `pdfjs-dist` is "not in package.json" | Still true. | Accurate; no change |
| 22 | Root `README.md` (previous version) | Testing table with counts from an earlier session | Those counts could not be re-verified here. | Fixed (README now uses this run's results and labels older ones) |
