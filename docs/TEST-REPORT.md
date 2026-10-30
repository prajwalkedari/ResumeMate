# Test report

Run date: 2026-10-30, in the build sandbox. Environment: Node v22.23.4, npm 10.9.9, Playwright 1.63.0 with the preinstalled Chromium, TeX Live (Debian `pdflatex`), poppler-utils, qpdf, Python 3 with Pillow.

Each result below comes from a command actually run during this work. Nothing was re-used from earlier reports unless it is marked "carried over".

## Summary

| Area | Result |
| --- | --- |
| Website lint | PASS (0 warnings, after adding a pinned ESLint config) |
| Website typecheck | PASS |
| Website unit and import tests | PASS, 43 of 43 |
| Website production build | PASS (Next.js 14.2.35) |
| Website cross-repo bridge tests | **BLOCKED**, 0 of 20 run (extension source missing) |
| Extension manifest verification | PASS, with 2 warnings |
| Extension packaging | PASS |
| Extension browser protocol test (fixture) | PASS, 22 of 22 |
| Protocol regression test (old bridge) | FAIL on old code (2 of 5), PASS on fixed code (5 of 5) |
| SEO output checks | PASS |
| Dependency audit | **Open**: 1 critical and 4 high advisories remain |
| Live site, live handshake, live Gemini | **NOT TESTED** |

## Commands and results

### Website (`apps/web`)

| Command | Result |
| --- | --- |
| `npm ci` | PASS. Installed from the supplied lockfile (Next.js 14.2.15). Later upgraded, see below. |
| `npm run lint` | PASS after configuration. Before, it stopped at an interactive ESLint prompt (FAIL). The project had no ESLint config and no ESLint dependency. |
| `npm run typecheck` (`tsc --noEmit`) | PASS |
| `npm test` (`tsx --test tests/bridge-progress.test.ts tests/pdf-latex-import.test.ts`) | PASS, 43 of 43. `bridge-progress`: 5. `pdf-latex-import`: 38 (0 skipped). |
| `npx tsx --test tests/extension-bridge.test.ts` | **BLOCKED**. It imports the extension's `src/shared/*.ts`, which is not in the supplied bundle. It fails at import with "Cannot find module". 0 of 20 ran. |
| `npm run build` | PASS, Next.js 14.2.35, with and without `NEXT_PUBLIC_SITE_ORIGIN` |

Route sizes from the final default build (First Load JS, shared by all routes 87.1 kB). `/extension`, `/generate`, and `/preview` are not listed here:

| Route | Size | First Load JS |
| --- | --- | --- |
| `/` | 3.38 kB | 99.4 kB |
| `/create` | 9.98 kB | 106 kB |

### Extension (`apps/extension`)

| Command | Result |
| --- | --- |
| `npm run verify:manifest` | PASS. Manifest V3, version 0.1.0, 9 referenced files present, permissions limited to `storage`, host permissions limited to the Gemini and `prajwalkedari.tech` patterns, no `localhost` or `127.0.0.1` in the bundle. |
| `npm run package` | PASS. `dist/resumemate-assistant-0.1.0.zip`, 14 entries, 88,565 bytes uncompressed. |
| `npm run test:e2e` | PASS, 22 of 22 (see below) |

Warnings from `verify:manifest` (not failures):

1. Host permissions and content scripts do not include `https://resume.prajwalkedari.tech`.
2. The production origin compiled into the bundle is `https://prajwalkedari.tech`.

### Dependency audit (`npm audit`, website)

| State | Advisories |
| --- | --- |
| Next.js 14.2.15 (supplied) | 1 critical (next), 1 high (postcss, through next), 1 high (glob, dev), and others |
| Next.js 14.2.35 (current) | 6 total: 1 critical and 4 high in `next`, `postcss`, `glob`, `eslint-config-next`, `@next/eslint-plugin-next`, and 1 low in `esbuild` |

npm reports the fix for these advisories as **Next.js 16.4.3**, a major-version change. Several advisories give 15.5.x as the fixed line. Upgrading to 14.2.35 was applied because it is a patch release within the existing minor, and it builds and passes the tests. It does **not** clear the advisories. This needs a migration decision.

## Protocol browser test (fixture-based)

`apps/extension/tests/bundle-protocol.e2e.js` loads the unpacked bundle into Chromium with a stubbed `https://prajwalkedari.tech` and `https://gemini.google.com`. Payloads come from `apps/web/lib/extension-bridge.ts` (`tests/fixtures/sample-payloads.json`). Sample data is fictional.

| Check | Result |
| --- | --- |
| Service worker starts from the bundle | PASS |
| `HELLO` returns `CONNECTION_STATUS` (connected, v1, 0.1.0) | PASS, 2 checks |
| `PREPARE_PROMPT` for improve, generate, latex, review, extract returns `GEMINI_STATUS` then `REVIEW_PROMPT` | PASS, 5 checks |
| `CANCEL_REQUEST` for each returns `cancelled` | PASS, 5 checks |
| Invalid payload (tailor without job description) returns `ERROR INVALID_PAYLOAD` with the same request ID | PASS |
| Oversized resume (20,001 characters) returns `ERROR` | PASS |
| `CANCEL_REQUEST` with an unknown ID returns `ERROR STALE_REQUEST` | PASS |
| Wrong protocol version gets no reply | PASS |
| Wrong channel gets no reply | PASS |
| Unknown message type returns `ERROR INVALID_MESSAGE` | PASS |
| Malformed request ID returns `ERROR` or no reply | PASS |
| Page on a non-allow-listed origin gets no reply from the extension | PASS |
| Zero requests reached `gemini.google.com` during these tests | PASS |

Observed behavior, not a failure: the extension sends the `cancelled` status twice for one cancel request. The client handles this.

What this test does **not** cover: the real `prajwalkedari.tech` site, a real Gemini page, the popup approval and submit steps, and the `GEMINI_RESPONSE` and `RETURN_OUTPUT` messages.

## Bug found and fixed: prepare() reported accepted requests as failed

- **Found by:** the browser test. The extension sends `GEMINI_STATUS` (`awaiting-send-approval`) before `REVIEW_PROMPT`. The website bridge's `prepare()` accepted the first reply with a matching request ID.
- **Effect:** every accepted request was reported to the user as a failure (`INTERNAL_ERROR`). The late `REVIEW_PROMPT` was then dropped.
- **Fix:** `apps/web/lib/extension-bridge.ts` now keeps a waiter registered until it accepts the reply it needs. `prepare()` waits for `REVIEW_PROMPT` or `ERROR`. `hello()` waits for `CONNECTION_STATUS` or `ERROR`.
- **Regression test:** `apps/web/tests/bridge-progress.test.ts`. Run against the old bridge: 2 of 5 fail. Run against the fixed bridge: 5 of 5 pass.

## SEO checks

Run with `NEXT_PUBLIC_SITE_ORIGIN=https://resume.prajwalkedari.tech`, served by `next start`:

| Check | Result |
| --- | --- |
| `/robots.txt` allows all, lists `Sitemap: https://resume.prajwalkedari.tech/sitemap.xml` | PASS |
| `/sitemap.xml` lists `/` and `/extension` with the origin | PASS |
| `/create` has `<meta name="robots" content="noindex, nofollow">` | PASS |
| `/create` title is `Resume workspace \| ResumeMate` | PASS |
| `/extension` has an absolute canonical link | PASS |
| Unknown route returns HTTP 404 | PASS |
| `/` has title, description, Open Graph, and Twitter tags | PASS |

Run without the origin: `/` has no canonical link and no `og:url`, and the sitemap is empty. PASS.

Not run: Lighthouse, Core Web Vitals, and any validator for Open Graph or structured data.

## Links and image paths

The relative links and image paths in `README.md`, `docs/`, and `apps/*/README.md` all resolve. The README image is `docs/assets/architecture.svg`, which is well-formed XML.

## Not executed, and why

| Item | Reason |
| --- | --- |
| Cross-repo bridge tests (`apps/web/tests/extension-bridge.test.ts`, 20 tests) | The extension's `src/` is not in the supplied bundle. |
| Extension unit tests (102) and security lint from `docs/INTEGRATION-STATUS.md` | Carried over from an earlier session that had the source. Not re-run. |
| Extension TypeScript typecheck and build | Source not present. |
| Live handshake with the deployed website | Domains did not resolve from the sandbox. |
| Live Gemini (submit, response capture) | No signed-in Google session. |
| Popup approval and submit flow | Requires a live Gemini page or a fixture of it. Not built. |
| Upload UI (import of PDF and `.tex`) | Import is not connected to the UI. |
| Compile isolation (network, memory, file-size limits) | No isolated host. |
| GitHub Actions workflow (`.github/workflows/ci.yml`) | Not run on GitHub. |
| Search Console and sitemap submission | Domain not confirmed live. |

## Known failures

- **Website `npm audit`**: 1 critical and 4 high advisories remain (see above). Not fixed. Fixes need Next.js 15.5 or 16.
- **Cross-repo bridge tests**: blocked, not failing. They would need the extension source.

## Remaining release blockers

1. **Production origin.** Decide between `https://resume.prajwalkedari.tech` and `https://prajwalkedari.tech`. The bundle allows only `https://prajwalkedari.tech`. Changing it needs the extension source and a rebuild.
2. **Extension source.** Add the TypeScript source, tests, and build script to `apps/extension` so the cross-repo tests run and the bundle can be rebuilt.
3. **Next.js security upgrade.** Decide whether to move to Next.js 15.5 or 16. This is a framework change.
4. **Hosting provider.** None is configured.
5. **Domain check.** Confirm the chosen domain resolves to the deployed site.
6. **Live Gemini test.** Run the approval flow with a signed-in account and record the result as a dated entry.
7. **Compile service.** Deploy only in an isolated environment, or leave LaTeX compilation off.
