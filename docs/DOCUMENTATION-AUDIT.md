# Documentation audit

Discrepancies between the documentation and the implementation. This version was updated during the domain and connection-check work. Status is **Fixed** when this work changed the code or docs, **Open** when a decision, a missing file, or the extension source is needed, and **Accepted** when the item is known and left as it is.

## Website home and copy (from the earlier audit)

| # | Where | Claim or gap | Reality | Status |
| --- | --- | --- | --- | --- |
| 1 | Website home (`app/page.tsx`) | "Upload a PDF, DOCX, or TXT resume" | File import is not connected to the UI. Only library code exists. | Fixed (copy says "in development") |
| 2 | Website home | "Talk through your background" as a working option | Voice input is simulated, with no microphone access. | Fixed |
| 3 | Website home | "Download your PDF" | "Download PDF (demo)" creates no file. | Fixed |
| 4 | Website home | "Built for applicant tracking systems" | No evidence. | Fixed (removed) |
| 5 | Website home | "You can clear all data from the workspace" | No clear-data control exists. | Fixed (removed) |
| 6 | Website home | "Your draft stays in this browser session" | Drafts are in memory only and are lost on reload. | Fixed |

## Origin and connection (this work)

| # | Where | Claim or gap | Reality | Status |
| --- | --- | --- | --- | --- |
| 7 | Extension bundles, manifest | Trusted only `https://prajwalkedari.tech` | Changed to `https://resumemate.prajwalkedari.tech` in four bundles and the manifest. | Fixed |
| 8 | `verify-manifest.mjs` | Warned about the origin mismatch and passed | Fails on any origin other than the exact expected one. | Fixed |
| 9 | `/extension` page | "No verified extension handshake yet" and a notification-only check; production showed "Not Installed" regardless | Runs a real handshake. Connected only after a verified reply. | Fixed |
| 10 | `/extension` page | Simulation switch with "Simulated" badge | Removed. It could show a fake state. | Fixed |
| 11 | Bridge client | Protocol version and extension version discarded from HELLO reply | `checkConnection()` returns and validates both. | Fixed |
| 12 | Bridge client | A newer-protocol extension would appear as "not installed" | Envelope version mismatch is reported as incompatible. | Fixed |
| 13 | `apps/web/tests/extension-bridge.test.ts` | Expects the extension source at `/home/claude/resumemate-extension/src` | Path does not exist. Cross-repo section cannot run. The client section passes. | Open (needs source) |
| 14 | `apps/extension/package.json` | "TypeScript source is not included" | Accurate. The bundles are the only shipped code. | Open (needs source) |
| 15 | `apps/extension/tests/bundle-protocol.e2e.js` | Stubbed the old origin, and set `channel: 'chromium'` only | Uses the new origin, adds negative cases, and accepts `RM_CHROMIUM_PATH`. | Fixed |

## Build and environment

| # | Where | Claim or gap | Reality | Status |
| --- | --- | --- | --- | --- |
| 16 | `apps/web/.env.example` | Listed `GEMINI_API_KEY` and `NEXT_PUBLIC_SITE_ORIGIN`; the README referred to the file | The file was not in the ZIP. Created with `NEXT_PUBLIC_SITE_ORIGIN` only, because that is the only variable the code reads. | Fixed |
| 17 | `apps/web/README.md`, root README | "No variable is read by the code yet" | `NEXT_PUBLIC_SITE_ORIGIN` is read by `lib/site.ts`. | Fixed |
| 18 | Web lint | `npm run lint` stopped at an interactive prompt | `.eslintrc.json` added (`next/core-web-vitals`). | Fixed |
| 19 | Web tests | `npm test` did not run `extension-bridge.test.ts` | `extension-connection.test.ts` added to `npm test`. The cross-repo file still cannot run here. | Fixed (partly; see 13) |
| 20 | `GEMINI_API_KEY` | Documented as reserved | Not read by any code. | Accepted (documented as reserved) |
| 21 | `apps/web` dependencies | `npm audit` findings | 2 advisories (1 critical, 1 high) in PostCSS bundled with Next 14. The fix is Next 16. | Open (framework upgrade decision) |
| 22 | `apps/extension` dependencies | None | `npm audit`: 0 vulnerabilities. | Fixed (none present) |

## Generate flow

| # | Where | Claim or gap | Reality | Status |
| --- | --- | --- | --- | --- |
| 23 | `/generate` page | "Simulating generation" with "Prototype: no request is sent" | Accurate, but the page is reachable from a connected `/extension` page through "Generate resume." | Open (product decision) |
| 24 | `ExtensionBridge.prepare()` and `subscribe()` | Tested by unit tests | No page calls them. The generate flow is not implemented. | Open (feature not built) |

## Other

| # | Where | Claim or gap | Reality | Status |
| --- | --- | --- | --- | --- |
| 25 | Extension version | `0.1.0` in manifest and bundle | Unchanged. Bump before distributing a changed bundle. | Open (release decision) |
| 26 | Root `docs/TEST-REPORT.md` | Previous results (43 tests, 22 browser checks) | Replaced with results from this session. | Fixed |
| 27 | `docs/DEPLOYMENT.md` | Candidate origins (`resume.` or root domain) | One origin: `https://resumemate.prajwalkedari.tech`. | Fixed |
| 28 | Extension origin in the bundle | "Changing it requires the extension source" | Changed in the bundles, verified by the verifier. Source still needed for future work. | Fixed (source still open, see 14) |
| 29 | Handshake identity | Docs implied the handshake confirms the extension | It confirms protocol, origin, and request ID, not identity. | Fixed (documented in `SECURITY.md`); Open (needs extension ID) |
