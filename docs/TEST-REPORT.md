# Test report

Run: 2026-10-31, build sandbox. Node v22.23.4, npm 10.9.9, Playwright 1.63.0 with the preinstalled Chromium, TeX Live `pdflatex`, poppler-utils, qpdf, Python 3 with Pillow.

Every result below comes from a command run in this pass. Older results are marked as carried over.

## Summary

| Area | Type | Result |
| --- | --- | --- |
| Website lint | Static | PASS, 0 warnings |
| Website typecheck | Static | PASS |
| Website unit tests (bridge state logic, ordering, malformed replies, generation state machine, bridge subscription, and PDF/LaTeX import) | Unit | PASS, 79 of 79 |
| Website lint after the generation work | Static | PASS, 0 warnings |
| Website typecheck after the generation work | Static | PASS |
| Website production build with production origin, after the generation work | Build | PASS |
| Extension manifest verification and packaging after the generation work | Static, build | PASS (14 files) |
| Extension protocol test (bundle) after the generation work | Chromium fixture | PASS, 25 of 25 |
| `/extension` handshake page after the generation work | Chromium, local build | PASS, 10 of 10 |
| Generation workflow end to end (website, unpacked extension, popup, **fixture Gemini**) | Chromium, local build | PASS, 24 of 24 |
| Website production build, default (no origin) | Build | PASS |
| Website production build with `NEXT_PUBLIC_SITE_ORIGIN=https://resumemate.prajwalkedari.tech` | Build | PASS |
| Website cross-repo bridge tests (`tests/extension-bridge.test.ts`) | Unit, needs extension source | **BLOCKED**, 0 of 20 run |
| Extension manifest verification | Static | PASS (exact origin, no wildcard, four bundles checked) |
| Extension verifier rejects the old origin | Negative test | PASS (4 failures reported for an old-origin copy) |
| Extension packaging | Build | PASS, 14 files |
| Extension protocol test against the unpacked bundle, stubbed origins | Chromium fixture | PASS, 25 of 25 |
| `/extension` page with the unpacked bundle, site served locally under the production hostname | Chromium, local build | PASS, 10 of 10 |
| Deployed site `https://resumemate.prajwalkedari.tech` | Live | **NOT TESTED**. No response from the build sandbox. |
| Live Gemini | Live | **NOT TESTED**. The generation flow was tested only against a fixture page built to the same selectors as `content/gemini.js`. |

## Commands

### Website (`apps/web`)

| Command | Result |
| --- | --- |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | PASS, 51 of 51 (`bridge-progress` 13, `pdf-latex-import` 38) |
| `NEXT_PUBLIC_SITE_ORIGIN=https://resumemate.prajwalkedari.tech npm run build` | PASS |
| `npm run build` (no origin) | PASS. No canonical link is emitted. |
| `npx tsx --test tests/extension-bridge.test.ts` | **BLOCKED**. It imports the extension's `src/shared/*.ts`, which is not in the archive. |

Audit (unchanged this pass): `npm audit` still reports 1 critical and 4 high advisories for Next.js 14.2.35, whose fixes are in 15.5 or 16. A framework migration is needed.

### Extension (`apps/extension`)

| Command | Result |
| --- | --- |
| `npm run verify:manifest` | PASS. Production origin `https://resumemate.prajwalkedari.tech`. Host permissions: that origin with `/*` and Gemini. Website content script matches only that origin. All four bundles carry the same origin. No development origin. |
| `npm run verify:manifest` against a copy with the old origin | FAIL, as expected (4 failures). |
| `npm run package` | PASS. `dist/resumemate-assistant-0.1.0.zip`, 14 files, 88,631 bytes uncompressed. |
| `npm run test:e2e` | PASS, 25 of 25 |
| `npm run test:site` (needs the website running on port 3100) | PASS, 10 of 10 |

## Protocol test against the unpacked bundle (25 checks)

Fixture-based: `resumemate.prajwalkedari.tech`, the old root domain, an unrelated subdomain, and Gemini are stubbed. Payloads come from the website's bridge code.

- Service worker starts from the bundle.
- `HELLO` returns `CONNECTION_STATUS` with `connected`, version 0.1.0, protocol 1.
- `PREPARE_PROMPT` for five tasks returns `GEMINI_STATUS` then `REVIEW_PROMPT`. Each is then cancelled.
- Invalid payload, oversized resume, unknown cancel ID, wrong version, wrong channel, unknown type, and malformed request ID are all refused or ignored, as documented.
- A non-allow-listed origin, the old root domain, and an unrelated subdomain each get **no** reply from the extension.
- `HELLO` while a request awaits review returns `busy: true`.
- No request reached `gemini.google.com`.

## `/extension` page against the unpacked bundle (10 checks)

**Setup:** `apps/web` built with `NEXT_PUBLIC_SITE_ORIGIN` set, served by `next start` on port 3100. Playwright routes `resumemate.prajwalkedari.tech`, `prajwalkedari.tech`, and `unrelated.prajwalkedari.tech` to that server. The extension is loaded unpacked. **This is a local build, not the deployed site.**

| Check | Result |
| --- | --- |
| Page starts in the idle state, with no "connected" before a check | PASS |
| Production origin with extension: "ResumeMate Assistant is connected." | PASS |
| Connected view shows version 0.1.0 and protocol v1 | PASS |
| No simulation or mock controls | PASS |
| Refresh, then check again: connected | PASS |
| Old root domain `/extension`: "was not detected" (no false connection) | PASS |
| Unrelated subdomain `/extension`: "was not detected" | PASS |
| No extension installed: "was not detected", with installation link | PASS |
| Not-detected view offers Retry | PASS |
| Page still renders without the extension | PASS |

## Bugs and gaps found in this pass

- **The page never checked anything.** The check button only showed a notice. It now runs a real handshake through the bridge and reports states from the reply.
- **The bridge discarded the extension's version and protocol.** `hello()` now returns a verified result object. A reply with a missing protocol version is "error", not "incompatible".
- **Dev simulation was visible in the UI.** The mock switch is removed.
- **Old domains in the bundle.** The manifest and four bundle constants moved to `https://resumemate.prajwalkedari.tech`. Bundle changes were made by editing the built files, because no source is available.

## Not tested, and why

| Item | Reason |
| --- | --- |
| Deployed site and any live handshake with it | The host did not respond from the build sandbox. DNS and Vercel are not set up here. |
| Extension disabled, or the site loaded while the extension is turned off | Not automated in this pass. Covered only by the not-detected path (no extension). |
| Busy state through the page UI | Covered at protocol level (`busy: true`). Not reached through the page. |
| Incompatible protocol version | Covered by unit tests only. The real bundle always replies with protocol 1. |
| Live Gemini | Not run. The popup approval, submission, and return steps are tested against a fixture page (`apps/extension/tests/generate-flow.e2e.js`). Gemini's real page may use other markup. |
| Invalid or incompatible RETURN_OUTPUT in the browser | Covered by unit tests of the reducer (`tests/generation.test.ts`). Not produced by the bundle in the browser test. |
| Extension disconnected in the middle of a request | Covered by unit tests of the watchdog (`tests/generation.test.ts`). Not produced in the browser test. |
| Cross-repo bridge tests | Extension source missing. |
| Extension TypeScript typecheck, lint, and unit tests | Extension source missing. The bundle has no tests of its own besides the browser tests above. |
| Chrome Web Store | Not set up. |

## Remaining blockers

1. **Deploy and verify.** Deploy the website to Vercel with `NEXT_PUBLIC_SITE_ORIGIN` set, attach the domain, then run the checklist in `DEPLOYMENT.md`.
2. **Extension source.** Add the TypeScript source so the origin, the handshake, and the bundle can be changed and rebuilt at source level. Until then, the bundle is edited directly.
3. **Next.js upgrade.** The 14.2 line keeps its advisories. A migration to 15.5 or 16 is needed to clear them.
4. **Users update the extension.** Old installs only trust the old root domain. Every user must reload or reinstall the extension.

## Generation workflow (round 5)

Scope: the `/extension` Continue button, the `/create` → `/generate` → `/preview` workflow, and the extension approval gates.

| Test | File | Type | Result |
| --- | --- | --- | --- |
| Generation reducer: happy path, approval gates, invalid output, stale replies, extension errors, watchdog, retry, discard, duplicate guard | `apps/web/tests/generation.test.ts` | Unit | 26 of 26 |
| Bridge subscribe before prepare (progress and final reply order) | `apps/web/tests/bridge-subscribe.test.ts` | Unit | 2 of 2 |
| Bridge reply handling (round 4 tests, still passing) | `apps/web/tests/bridge-progress.test.ts` | Unit | 13 of 13 |
| Generation workflow in Chromium with the unpacked extension and a **fixture** Gemini | `apps/extension/tests/generate-flow.e2e.js` | Browser, local build | 24 of 24 |

Checks in the browser test: the Continue CTA links to `/create` and navigates there; Review on `/create` goes to `/generate`; no Gemini tab opens before approval; rejection in the popup ends as cancelled with no Gemini tab; the resume stays intact after cancel; retry, approval, and submission confirmation work; the prompt is placed in the composer; the website shows the Gemini character count only and not the text before the popup sends it; send-to-website is disabled until confirmed; the output appears for review and is not saved automatically; saving shows it in the preview under a labelled AI draft section, with the resume document unchanged; discard removes it; without the extension, the page shows installation guidance, disables Generate, and keeps the details.

What this does not prove: the fixture page is not Gemini. It was built to the selectors in `content/gemini.js`. Live Gemini markup, sign-in state, and rate limits were not tested.

Bugs found and fixed in this round:
- The output panel's "Try again" called `start` while the phase was still `reviewing`, so it did nothing. Removed. "Discard and start over" returns to idle first.
- `accepted` kept the returned text in state after it was saved. It now clears it.
- A test-proxy bug: the browser test did not forward request headers, so Next fell back to a full reload on client navigation and dropped the in-memory resume. Fixed in the test harness, not in the app.
