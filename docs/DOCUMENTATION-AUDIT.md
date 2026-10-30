# Documentation audit

Discrepancies between documentation and implementation, as found on 2026-10-31. "Fixed" means this pass changed the code or docs. "Open" means a decision or source file is still needed. The archived `apps/web/docs/` files record findings from earlier sessions. Their statements about then-current state are historical, but their origin references now match the current configuration.

| # | Where | Claim or gap | Reality | Status |
| --- | --- | --- | --- | --- |
| 1 | Extension manifest | Host access to the old root domain `prajwalkedari.tech` | Now `https://resumemate.prajwalkedari.tech/*` only | Fixed |
| 2 | Extension bundles | Production origin the old root domain | All four bundles use `https://resumemate.prajwalkedari.tech` | Fixed (edited in the bundle, source missing) |
| 3 | `/extension` page | "Check" only showed a notice; "Detection is not connected" | Runs a real `HELLO` handshake and shows verified states | Fixed |
| 4 | Bridge `hello()` | Returned only `connected`, `busy`, or `not-detected`, and dropped the version | Returns a verified result with state, extension version, protocol, and code | Fixed |
| 5 | `/extension` page | Simulated status switch and "Simulated, development only" badge | Removed | Fixed |
| 6 | `/extension` page | "Install Extension" button only showed a notice | Links to the extension information page (`https://extension.prajwalkedari.tech`, not verified from here) | Fixed |
| 7 | `/extension` page | "Generate resume" shown when connected, leading to a simulated screen | Removed | Fixed |
| 8 | Extension `manifest.json` `content_scripts` | Matched the old root domain | Matches the exact production origin | Fixed |
| 9 | Extension verifier | Warned that the production origin was not the intended one | Fails on a wrong origin; passes now | Fixed |
| 10 | Documentation (all) | Mixed `prajwalkedari.tech`, `resume.prajwalkedari.tech`, and `resumemate.prajwalkedari.tech` | Standardised on `resumemate.prajwalkedari.tech`. The landing page `extension.prajwalkedari.tech` is kept as an external link. | Fixed |
| 11 | `apps/web/tests/extension-bridge.test.ts` | Expected origin `prajwalkedari.tech` | Now `resumemate.prajwalkedari.tech`. The test still cannot run without the source. | Partly fixed (open: source missing) |
| 12 | `docs/DEPLOYMENT.md` | Hosting unknown, no provider configured | Vercel, with root directory `apps/web`. Vercel settings are not configured yet, and no deployment has been verified. | Fixed (docs). Open: deployment itself. |
| 13 | `docs/DEPLOYMENT.md` | Mentioned `NEXT_PUBLIC_SITE_URL` | The app reads `NEXT_PUBLIC_SITE_ORIGIN`. No new variable was added. | Fixed |
| 14 | `apps/web/docs/INTEGRATION-STATUS.md` (archive) | Says the extension trusts only `prajwalkedari.tech` and the decision is open | Now the exact resumemate origin. The archived statements about the earlier state are kept as the findings at the time. | Partly fixed (historical record) |
| 15 | Extension README | "Host access: the old root domain. The website origin is not yet resume.*" | Updated to the exact origin | Fixed |
| 16 | `docs/TEST-REPORT.md` (previous version) | Stated the live handshake was untested with a real unpacked extension | Real unpacked bundle now tested in Chromium, both protocol-level (25) and page-level (10). Deployed site still untested. | Fixed (with the deployed-site caveat) |
| 17 | Extension source | Absent | Absent. The four bundles are edited directly. | Open |
| 18 | Deployed production site | Not reachable from the build sandbox | Unchanged | Open |
| 19 | Users' installed extension | Old installs trust only the old root domain | Each user must reload or reinstall the extension | Open (user action) |
| 20 | Next.js 14.2.35 | Advisories with fixes only in 15.5 or 16 | Unchanged | Open (framework decision) |
| 21 | Extension `README.md` and `docs/ARCHITECTURE.md` | "Localhost origins only in development builds" | The shipped bundles contain no development origin. The development build path is in source not present here. | Open (cannot verify without source) |
| 22 | Website `NEXT_PUBLIC_SITE_ORIGIN` | "Not read by any code yet" (earlier `.env.example`) | Read by `lib/site.ts` (SEO only). It is not used by the extension, which has its origin compiled in. | Fixed |
| 23 | `/generate` page | Simulated timed progress and "Simulated progress complete" | Replaced with the real workflow through the verified bridge, with extension-aware states. No simulated progress. | Fixed |
| 24 | `/extension` connected state | No next action after a verified connection | "Continue to Create Resume" primary button links to `/create`. Version and protocol come from the handshake. | Fixed |
| 25 | Manual form Review | Went to `/extension` | Goes to `/generate`, which checks the connection itself | Fixed (behaviour change) |
| 26 | Generated output | No place to show it | Shown for review on `/generate`. After acceptance it appears in a labelled "AI draft" section on `/preview`. It is not merged into resume fields. | Fixed (design deviation: not merged into resume fields; see docs/TEST-REPORT.md, remaining blockers) |
| 27 | Output "Try again" | Did nothing while output was pending | Removed. Discard first, then start again. | Fixed |
| 28 | Accepted output | Kept in state after saving | Cleared on accept | Fixed |
| 29 | Generation browser test | None | `apps/extension/tests/generate-flow.e2e.js`, 24 checks with a fixture Gemini page | Added (fixture only) |
| 30 | Live Gemini generation | Never tested | Still not tested. The fixture test is not evidence about the real Gemini page. | Open (blocker) |
| 31 | `/generate` and `/preview` in the SEO doc | "Simulated progress screen" | Updated | Fixed |
