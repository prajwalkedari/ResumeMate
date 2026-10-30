# Test report

This report covers the domain update and the connection-check work. Every result here comes from a command run in the build sandbox. Nothing is copied from an earlier session, and nothing is claimed that was not run.

Status values: **PASS**, **FAIL**, **BLOCKED** (could not run here, reason given), **NOT RUN** (possible here, not done), **NOT IMPLEMENTED** (the feature is not in the app yet).

## Test environment

| Item | Value |
| --- | --- |
| Operating system | Linux (sandbox) |
| Node.js | v22.22.2 |
| npm | 10.9.7 |
| Chromium | 141.0.7390.37, from `/opt/pw-browsers/chromium-1194`, passed to Playwright with `RM_CHROMIUM_PATH` |
| Playwright | 1.63.0 (extension devDependency). Its own browser download was blocked, so the installed Chromium was used. |
| Network | npm registry reachable. `resumemate.prajwalkedari.tech`, `extension.prajwalkedari.tech`, `prajwalkedari.tech`, and `gemini.google.com` did not respond. |
| Source | Unpacked ZIP `ResumeMate-0d9a205…`. No `.git` directory. Extension TypeScript source not included. |

## Test tiers

- **Unit tests:** run with `tsx --test` against the bridge module, with a fake window host. No browser.
- **Build tests:** `next build`, and manifest and bundle checks against the shipped files.
- **Chromium fixture, bundle:** the unpacked extension loaded into Chromium, with the website origin stubbed by Playwright routes.
- **Chromium fixture, website:** the production build of `/extension` served through Playwright routes, driving the real page with the real unpacked extension.
- **Live production:** not run. Blocked, see below.
- **Live Gemini:** not run. Blocked, see below.

## Commands and results

### Website (`apps/web`)

| Command | Result |
| --- | --- |
| `npm ci` | PASS |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS. Failed before this change because no ESLint config existed. `.eslintrc.json` (`next/core-web-vitals`) was added. |
| `npm test` | PASS, 72 of 72. Breakdown: `bridge-progress` 5, `pdf-latex-import` 38, `extension-connection` 29 (new). |
| `NEXT_PUBLIC_SITE_ORIGIN=https://resumemate.prajwalkedari.tech npm run build` | PASS |
| `npm run build` without the origin | PASS (baseline) |
| `npm audit --omit=dev` | FAIL, 2 advisories (1 critical, 1 high) in PostCSS bundled inside Next 14.2.35. The only fix is `next@16`, a breaking upgrade. Not changed here. Open. |

### Extension (`apps/extension`)

| Command | Result |
| --- | --- |
| `npm ci` | PASS |
| `npm run verify:manifest` | PASS. The verifier now enforces the exact origin. Against the original ZIP it fails with 12 findings (exit 1). |
| `npm run test:e2e` | PASS, 26 of 26. Chromium fixture, unpacked bundle. Baseline was 22 of 22. |
| `npm run test:page` | PASS, 24 of 24. Chromium fixture, production `/extension` page with the unpacked bundle. |
| `npm run package` | PASS. `dist/resumemate-assistant-0.1.0.zip` contains only the manifest, background, content, popup, and icons. |
| `npm audit` | PASS, 0 vulnerabilities |

### Integration and origin consistency

| Check | Result |
| --- | --- |
| Website origin constant equals the manifest host and content-script match | PASS (unit test, reads `apps/extension/manifest.json`) |
| Website origin equals `PRODUCTION_WEBSITE_ORIGIN` in the service worker and content script | PASS (unit test, reads the bundles) |
| Protocol version in the bundle equals the website bridge version | PASS (unit test) |
| No `"https://prajwalkedari.tech"` origin string in any bundle | PASS (verifier and unit test) |
| Production build: sitemap, robots, canonical use the new origin | PASS (checked in `.next/server/app`) |

## Handshake tests

### Chromium fixture, website and unpacked extension (`npm run test:page`)

The production `/extension` page was served through Playwright routes. The extension was the unpacked bundle. No DNS or live site was used.

| Scenario | Result |
| --- | --- |
| Page starts as "Not checked" with no connected state | PASS |
| Real handshake on the production origin shows "ResumeMate Assistant is connected." | PASS |
| Version 0.1.0 and protocol 1 are shown, from the extension's reply | PASS |
| Busy: a request queued from the page makes the next check show "processing another request" | PASS |
| Cancelling the request, then checking again, returns to connected | PASS |
| Page refresh returns to "Not checked", then a new check reconnects | PASS |
| `https://prajwalkedari.tech/extension` (old root domain) never shows connected | PASS |
| `https://other.prajwalkedari.tech/extension` (unrelated subdomain) never shows connected | PASS |
| No extension installed: shows "was not detected", installation link present, page renders | PASS |
| "Try again" re-runs the check | PASS |
| Mobile 390px: check completes, no horizontal overflow | PASS |
| No uncaught page errors | PASS |
| No requests to `gemini.google.com` | PASS |

Screenshots were captured for the connected, busy, not-installed, and mobile states. The connected and not-installed states were reviewed visually.

### Chromium fixture, bundle protocol (`npm run test:e2e`)

| Scenario | Result |
| --- | --- |
| Service worker starts from the bundle | PASS |
| HELLO returns CONNECTION_STATUS with protocol 1 and version 0.1.0 | PASS |
| HELLO reply contains no resume or user content | PASS |
| Valid PREPARE_PROMPT for each of five tasks goes to review, then is cancelled | PASS (5 of 5) |
| Invalid payload returns ERROR INVALID_PAYLOAD with the same request ID | PASS |
| Oversized resume refused | PASS |
| Cancel for an unknown request ID returns STALE_REQUEST | PASS |
| Wrong protocol version gets no reply | PASS |
| Wrong channel gets no reply | PASS |
| Unknown message type returns ERROR | PASS |
| Malformed request ID returns ERROR or no reply | PASS |
| Non-allow-listed origin (`evil.example`) gets no reply | PASS |
| Old root domain `https://prajwalkedari.tech` gets no reply (no content script) | PASS |
| Unrelated subdomain `https://other.prajwalkedari.tech` gets no reply | PASS |
| Plain HTTP on the app host gets no reply | PASS |
| No request reached `gemini.google.com` | PASS |

### Unit and mock tests (`apps/web/tests/extension-connection.test.ts`, 29 tests)

These use a fake window host, so they test the logic, not the browser. Mocks are labelled as such.

- Connected, busy, not-detected (timeout), error (ERROR reply), incompatible (protocol 2, missing protocol, envelope version 2 with a matching request ID), error (connected false, implausible version string). All PASS.
- Ignored replies: other origin, old root domain, foreign window source, wrong channel or direction, unissued request ID, replay after completion, version-mismatch envelope from another origin, mismatch with unknown request ID. All PASS.
- Each check uses a fresh request ID, so an old reply cannot satisfy a new check. PASS.
- HELLO contains only `type` and `requestId`. PASS.
- Domain consistency against the extension files, as listed above. PASS.

**Mutation check.** Two deliberate bugs were introduced into the bridge: accepting protocol-mismatch replies as connected, and accepting replies from any origin. The suite failed in both cases (2 and 3 failures). The original code was restored, and all 29 pass again.

### Existing bridge tests

| Suite | Result |
| --- | --- |
| `bridge-progress.test.ts` (5) | PASS |
| `extension-bridge.test.ts`, client section (10) | PASS when run from a temporary copy without the cross-repo section. That copy was deleted. The file is not part of `npm test`. |
| `extension-bridge.test.ts`, cross-repo section (10) | BLOCKED. It imports `shared/validation.ts`, `shared/protocol.ts`, and `shared/constants.ts` from the extension's TypeScript source, which is not in this repository. |

## Gemini and resume workflow

| Item | Status | Reason |
| --- | --- | --- |
| Live Gemini login, submission, response capture | BLOCKED | The sandbox cannot reach `gemini.google.com`. The workflow also needs a signed-in account, which the user must provide. |
| Website generate flow (prepare, approve, return output, save) | NOT IMPLEMENTED | `/generate` is a timer-based simulation. It says "No request is sent to Gemini." Nothing in the UI calls `prepare()` or `subscribe()` on the bridge. Phases 5 and 6 of the QA brief cannot run until this is built. |
| Output return to the website, markdown, LaTeX, cancellation | NOT IMPLEMENTED | Depends on the generate flow. The extension side exists in the bundle and is not yet verified end to end. |

## Security checks

| Check | Status | Evidence |
| --- | --- | --- |
| Unauthorized origins cannot get a reply | PASS | e2e: evil.example, old root domain, unrelated subdomain, HTTP |
| Forged or wrong-channel messages rejected | PASS | e2e: wrong channel, wrong version, unknown type |
| Invalid request IDs rejected | PASS | e2e: malformed ID |
| Oversized payloads rejected | PASS | e2e: 20,001-character resume |
| Replay after completion ignored | PASS | unit test |
| Version-mismatch spoof from another origin ignored | PASS | unit test |
| Handshake transfers no resume data | PASS | e2e and unit test |
| Cancel from a different tab is refused | NOT RUN | The ownership check exists in the service worker. It was not tested with two tabs. |
| Imported or untrusted content, prompt injection | NOT RUN | Import is not connected to the workflow yet. |
| Content sent to Gemini only after approval | NOT RUN | Needs the live Gemini flow. Preparing and cancelling were confirmed not to contact Gemini. |

**Limit of the handshake.** The reply is accepted when it has the right channel, version, origin, and request ID. Any script running in the same page can post a matching message. The website therefore verifies protocol and correlation, not the identity of the responder. Strong identity needs a published extension ID and `externally_connectable`, which is not possible until the ID exists.

## Website routes and browser checks

| Route | Build | Browser test |
| --- | --- | --- |
| `/` | PASS (prerendered) | NOT RUN |
| `/create` | PASS (prerendered) | NOT RUN |
| `/generate` | PASS (prerendered) | NOT RUN |
| `/preview` | PASS (prerendered) | NOT RUN |
| `/extension` | PASS (prerendered) | PASS (page test, 24 of 24) |
| `/robots.txt`, `/sitemap.xml` | PASS | Content checked in build output |

## Live production tests

| Item | Status | Reason |
| --- | --- | --- |
| Website at `https://resumemate.prajwalkedari.tech` | BLOCKED | No response from the sandbox. DNS or the network allowlist, not the site, is the likely cause. |
| Extension information page `https://extension.prajwalkedari.tech` | BLOCKED | Same reason. |
| Live handshake between the deployed site and an installed extension | BLOCKED | Requires the deployed site and a normal Chrome profile with the extension. |

These should be run from a normal network before any release.

## Fixed during this work

1. **Stale production origin.** The extension and its tests trusted `https://prajwalkedari.tech` only. Changed to `https://resumemate.prajwalkedari.tech` in four bundles, the manifest, the verifier, the browser tests, and the website's `EXTENSION_SUPPORTED_ORIGIN` constant.
2. **Verifier passed with the wrong origin.** It had warned about the origin instead of failing. It now fails on any origin other than the exact expected one.
3. **Missing ESLint configuration.** `npm run lint` started an interactive prompt. Added `.eslintrc.json`.
4. **Misreported incompatible extension.** A future protocol version would have timed out as "not installed." Replies with a different envelope version are now reported as incompatible.
5. **Unused `hello()` result.** `hello()` discarded the version and protocol from the reply. `checkConnection()` now returns them and validates them.
6. **Placeholder check on `/extension`.** The check only showed a notification, and the production page showed "Not Installed" regardless. The page now performs the real handshake.

## Known issues not fixed

- `npm audit` advisories in Next 14 (see above). The fix is a major upgrade.
- The cross-repo bridge tests cannot run without the extension source.
- `/generate` is a simulation, and the "Generate resume" button on a connected `/extension` page leads to it. This is a product decision and is not a connection state.
- The extension version is still `0.1.0`. Bump it before distributing a changed bundle.

## Remaining release blockers

1. Live production test from a normal network: website, extension page, and a real handshake with the extension installed.
2. Implementation and testing of the website generate flow, then the live Gemini test with a user-provided signed-in account.
3. Recovery of the extension's TypeScript source, so future changes are made at source level.
4. Decision on the Next.js upgrade for the audit advisories.
5. Extension identity: publish the extension and use `externally_connectable`, or accept the limit described above.
