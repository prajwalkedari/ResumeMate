# Website and extension integration

This document describes the protocol as it is implemented in the shipped extension bundle and the website bridge client. Each claim below was checked against the code or in a browser run. See `TEST-REPORT.md` for the exact results.

## Envelope

Every message is a `window.postMessage` object:

```json
{ "channel": "resumemate-web", "v": 1, "direction": "to-extension", "message": { "type": "HELLO", "requestId": "rm-..." } }
```

Replies use `"direction": "to-page"`. The protocol version is `1`. The channel name and version must both match. The extension's `isBridgeEnvelope` check enforces this.

## Messages

| Type | Sent by | Behavior (verified in Chromium) |
| --- | --- | --- |
| `HELLO` | Website | Replies `CONNECTION_STATUS` with `connected: true`, `busy`, `extensionVersion: "0.1.0"`, `protocolVersion: 1`. Carries no resume data. |
| `PREPARE_PROMPT` | Website | Validates the payload. On success it sends `GEMINI_STATUS` (`awaiting-send-approval`) and then `REVIEW_PROMPT` (`awaiting-user-review`). On failure it sends `ERROR` with `INVALID_PAYLOAD`. |
| `CANCEL_REQUEST` | Website | Cancels only a request started by the same tab, origin, and request ID. Replies `GEMINI_STATUS` (`cancelled`). For an unknown ID it replies `ERROR` `STALE_REQUEST`. |
| `GEMINI_STATUS` | Extension | Progress updates. Sent before the final reply. |
| `REVIEW_PROMPT` | Extension | The request is waiting for review. Nothing has been sent to Gemini. |
| `GEMINI_RESPONSE`, `RETURN_OUTPUT` | Extension | Output for the website. Sent only after review. Not exercised in the browser run, because the Gemini page was not available. |
| `ERROR` | Extension | Carries `code` and a message. Codes seen: `INVALID_PAYLOAD`, `STALE_REQUEST`, `INVALID_MESSAGE`. |

Unknown types return `ERROR` `INVALID_MESSAGE`. A wrong version or channel gets no reply.

## Ordering rule for clients

The extension sends `GEMINI_STATUS` before `REVIEW_PROMPT`. A client must wait for the reply it needs, not the first message with its request ID.

This rule was broken in the website bridge until the fix recorded in `TEST-REPORT.md` (section "Bug found and fixed"). The old `prepare()` accepted the first reply, so a request the extension had accepted was reported to the user as failed. `apps/web/tests/bridge-progress.test.ts` covers this.

## Payload limits

Enforced by both sides, and tested to match:

| Limit | Value |
| --- | --- |
| Resume text | 40 to 20,000 characters |
| Job description | up to 10,000 characters |
| Custom instructions | up to 1,000 characters |
| Prompt sent for review | up to 60,000 characters |
| Output | up to 60,000 characters |

The website serializes the structured resume into plain text. Empty fields are omitted. `tailor` requires a job description, and the website rejects an empty one before sending.

## Connection check

The `/extension` page runs this check when the user clicks **Check connection** or **Try again**. It sends one message:

`{ channel: 'resumemate-web', v: 1, direction: 'to-extension', message: { type: 'HELLO', requestId } }`

The message holds only a type and a request ID. The extension answers with `CONNECTION_STATUS` and its own version and protocol. The page reports a state based on that reply:

| State | Condition |
| --- | --- |
| Connected | A `CONNECTION_STATUS` reply for this request, protocol version 1, `connected: true`, and a plausible extension version. |
| Busy | The same reply with `busy: true`, meaning the extension has a request in progress. |
| Incompatible | The protocol version differs from 1, or the reply came in an envelope with a different version. |
| Not installed | No reply within 3 seconds. This also covers a disabled extension and a page opened before the extension was installed. |
| Error | An `ERROR` reply, or a `CONNECTION_STATUS` that is not usable. |

A reply counts only if it comes from this page's origin, is a message from this window, and carries a request ID this page created. A page that has not been checked shows **Not checked**, not a connected state.

## Origin and sender

- The extension accepts messages only from `PRODUCTION_WEBSITE_ORIGIN` (`https://resumemate.prajwalkedari.tech`) and from development origins injected at build time. The shipped bundle has no development origin.
- The extension's content script runs only on `https://resumemate.prajwalkedari.tech/*`, the manifest match. The root domain and other subdomains receive no content script and no reply.
- The website checks `event.origin` and `event.source === window` for every reply, and only accepts replies for request IDs it created.

## Approval gates

1. Preparing a prompt does not send anything to Gemini.
2. The user reviews the prompt in the popup and approves it. Only then does the extension place it in the Gemini tab.
3. Submission is a separate confirmation step (`POPUP_CONFIRM_SUBMIT`).
4. Output is returned to the website only after review.

Steps 2 and 3 are implemented in the bundle. Steps 2 and 3 were not run against live Gemini. The browser test confirmed that preparing and cancelling never contact `gemini.google.com`.

## What is verified and what is not

Verified in Chromium with the unpacked bundle and the production build of `/extension` (fixture routing, no live DNS): the connected, busy, not-installed, and wrong-origin states; the reconnect after refresh; the request-ID and origin checks; and the mobile layout. See `docs/TEST-REPORT.md`.

Not verified:

- A live handshake between the deployed website and an installed extension. The production site did not respond from the build sandbox.
- The identity of the responder. The website checks the protocol, origin, and request ID, not who sent the reply. See `docs/SECURITY.md`.
- The incompatible state against a real newer extension. It is covered by unit tests with simulated replies.
- Resume generation through Gemini. The `/generate` page is a simulation, and the bridge's `prepare()` is not connected to any page.
- Gemini submission and response capture against the live Gemini page.
