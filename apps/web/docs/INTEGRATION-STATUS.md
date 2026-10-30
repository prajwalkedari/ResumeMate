# Integration status: ResumeMate website and ResumeMate Assistant extension

This page describes what is implemented and what is verified. The full results are in `docs/TEST-REPORT.md` at the repository root.

## Production origin

`https://resumemate.prajwalkedari.tech` is the only production origin. It appears in the extension manifest (host permission and content-script match), in the extension's bundled allow-list, in `EXTENSION_SUPPORTED_ORIGIN` in `lib/extension-bridge.ts`, and in the website's SEO output through `NEXT_PUBLIC_SITE_ORIGIN`. A unit test checks that these agree with the extension files.

## What is implemented

- **Connection check on `/extension`.** The page runs a real HELLO handshake through `ExtensionBridge.checkConnection()`. It shows connected, busy, not installed, incompatible, or error, and it lets the user try again. Connected is shown only after a valid reply.
- **Protocol validation.** The reply's protocol version must equal the bridge version. A reply in an envelope with a different version is reported as incompatible.
- **Request correlation.** Replies are delivered only for request IDs the page created, from its own origin, through its own window.
- **Resume payload builder and serializer** (`buildRequestPayload`, `serializeResume`). Tested against the extension's validation rules in the cross-repo test, which needs the extension source.

## What is not implemented

- **The generate flow.** `/generate` is a timer-based simulation. It does not call the bridge. `ExtensionBridge.prepare()` and `subscribe()` exist and are tested, but no page calls them. The website therefore does not send a resume to the extension or receive generated output.
- **Import UI.** PDF and LaTeX import are library code with tests. They are not connected to the upload interface.

## Verified

| Area | Result |
| --- | --- |
| Website typecheck, lint, unit tests (72), production build | PASS |
| Connection check against the unpacked bundle, production build, Chromium fixture | PASS (24 of 24) |
| Bundle protocol, Chromium fixture | PASS (26 of 26) |
| Origin consistency between website and extension files | PASS (unit test) |

## Not verified

- Live production site and a live handshake with an installed extension. The sandbox could not reach the production hosts.
- Gemini submission and response capture. The sandbox could not reach `gemini.google.com`.
- The extension's TypeScript source. It is not in this repository, so the cross-repo bridge tests (10 of 20) cannot run.

## Blockers before deployment

1. Confirm `resumemate.prajwalkedari.tech` in Vercel and DNS, and set `NEXT_PUBLIC_SITE_ORIGIN` for production.
2. Run the live handshake from a normal network with the extension installed.
3. Implement the generate flow, or keep the simulation clearly labelled and remove the handshake-to-generate path from the UI.
4. Recover the extension source, so origin and protocol changes are made at source level.
5. Decide on the Next.js upgrade. `npm audit` reports 2 advisories in the PostCSS copy bundled with Next 14.
