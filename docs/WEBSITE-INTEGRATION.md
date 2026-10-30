# Website and extension integration

This describes the protocol as implemented in the shipped extension bundle (version 0.1.0) and the website bridge client (`apps/web/lib/extension-bridge.ts`). Each claim was checked in code or in Chromium. See `TEST-REPORT.md` for the exact runs.

## Production origin

The only website origin the extension trusts is **`https://resumemate.prajwalkedari.tech`**. It is set in:

| File | Setting |
| --- | --- |
| `apps/extension/manifest.json` | `host_permissions` and the website content script `matches`: `https://resumemate.prajwalkedari.tech/*` |
| `apps/extension/background/service-worker.js`, `content/resumemate.js`, `content/gemini.js`, `popup/main.js` | `PRODUCTION_WEBSITE_ORIGIN` (exact origin) |
| `apps/web` build | `NEXT_PUBLIC_SITE_ORIGIN` (canonical URLs, sitemap). Set it to the same value. |

No wildcard subdomains are trusted. The old root domain `https://prajwalkedari.tech` and any other subdomain get no reply. Development origins are not in production bundles. `npm run verify:manifest` checks all of this.

## Envelope

```json
{ "channel": "resumemate-web", "v": 1, "direction": "to-extension", "message": { "type": "HELLO", "requestId": "rm-..." } }
```

Replies use `"direction": "to-page"`. Protocol version is `1`. A wrong channel, version, or direction gets no reply.

## Connection check (`/extension` page)

The page runs a check only when the user clicks **Check connection**, **Check again**, or **Retry**. It sends `HELLO` with no resume data.

| Reply from the extension | Page state | Shown to the user |
| --- | --- | --- |
| `CONNECTION_STATUS`, `connected: true`, `busy: false`, valid `protocolVersion` = 1 | `connected` | "ResumeMate Assistant is connected." Extension version and protocol shown. |
| `CONNECTION_STATUS`, `connected: true`, `busy: true` | `busy` | "The extension is currently processing another request." |
| `CONNECTION_STATUS` with `protocolVersion` other than 1 | `incompatible` | "Your extension version is incompatible. Please update it." Protocol versions shown. |
| `CONNECTION_STATUS` missing a version field, or `connected` not true | `error` (code `MALFORMED_REPLY`) | "Unable to connect. Please try again." |
| `ERROR` (for example `INTERNAL_ERROR` when the extension cannot respond) | `error` | "Unable to connect. Please try again." with the code |
| No reply within 3 seconds | `not-installed` | "ResumeMate Assistant was not detected. Install the extension to continue." |

The page reports **connected** only after a valid `CONNECTION_STATUS` with a matching request ID. The mere presence of a content script or a sent message does not count.

Timeouts cannot tell "not installed", "disabled", and "not allowed on this origin" apart. The page therefore says "not detected" and points to the installation instructions and troubleshooting steps.

### Expected extension identity

The protocol has no extension ID. A web page cannot read the ID of an installed extension, and the project does not invent one. The identity check is therefore: the reply comes from this window and origin, has the expected channel and version, and has the expected `CONNECTION_STATUS` fields. Stronger identity would need a protocol change and an extension ID, which is not yet available.

## Other messages

| Type | Behavior (verified in Chromium) |
| --- | --- |
| `PREPARE_PROMPT` | Validates the payload. On success sends `GEMINI_STATUS` (`awaiting-send-approval`), then `REVIEW_PROMPT`. On failure sends `ERROR` `INVALID_PAYLOAD`. Sends nothing to Gemini. |
| `CANCEL_REQUEST` | Cancels only a request from the same tab and origin. Replies `GEMINI_STATUS` `cancelled`. An unknown ID gets `ERROR` `STALE_REQUEST`. |
| `GEMINI_STATUS`, `REVIEW_PROMPT` | Progress and review state. |
| `GEMINI_RESPONSE`, `RETURN_OUTPUT` | Output for the website, sent only after review. Not exercised live. |
| `ERROR` | Carries `code` and a message. Codes seen: `INVALID_PAYLOAD`, `STALE_REQUEST`, `INVALID_MESSAGE`, `INTERNAL_ERROR`. |

Clients must wait for the reply they need. The extension sends progress before the final reply. `prepare()` and `hello()` in the bridge handle this.

## Payload limits

| Limit | Value |
| --- | --- |
| Resume text | 40 to 20,000 characters |
| Job description | up to 10,000 characters |
| Custom instructions | up to 1,000 characters |
| Prompt for review | up to 60,000 characters |
| Output | up to 60,000 characters |

## Approval gates

1. The handshake and `PREPARE_PROMPT` send no user content to Gemini.
2. The user reviews the prompt in the extension popup and approves it.
3. Submission is a separate confirmation step.
4. Output is returned to the website only after review.

The steps through output review run in Chromium against a fixture Gemini page (`apps/extension/tests/generate-flow.e2e.js`, 24 of 24). They have not been run against a live Gemini page.

## Verification status

| Check | Status |
| --- | --- |
| Website bridge logic (state mapping, ordering, malformed replies) | Unit tests, passing |
| Protocol against the real unpacked bundle (25 checks, stubbed origins) | Chromium fixture test, passing |
| `/extension` page against the real unpacked bundle, served locally under the production hostname (10 checks) | Chromium test, passing. This is a **local** build, not the deployed site. |
| Deployed production site at `https://resumemate.prajwalkedari.tech` | **Not tested.** The host did not respond from the build sandbox. |
| Live Gemini | **Not tested.** |
