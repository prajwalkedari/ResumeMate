# ResumeMate Assistant (Chrome extension, version 0.1.0)

Manifest V3 extension that prepares reviewed ResumeMate prompts and, with your confirmation, uses the official Gemini website in your own signed-in browser tab.

## What this directory contains

This is the **built bundle** of the extension, not its source. The archive supplied for this repository has `manifest.json`, `background/service-worker.js`, `content/*.js`, `popup/*`, and `icons/*`. It has no TypeScript source, `tsconfig`, or build script. The source is referenced by the website's cross-repo tests (`apps/web/tests/extension-bridge.test.ts`) and by `docs/INTEGRATION-STATUS.md`, but it is not in this repository. Until it is added, do not edit the bundle by hand. Changes should be made in the source and rebuilt.

## Commands

```bash
npm install          # Playwright is used only by the browser test
npm run verify:manifest   # manifest, referenced files, permissions, and no dev origins in the bundle
npm run package           # writes dist/resumemate-assistant-0.1.0.zip
npm run test:e2e          # loads the unpacked bundle in Chromium and checks the protocol (fixture-based)
```

`test:e2e` uses the Chromium that is installed in the environment (`channel: 'chromium'`). If it is missing, install a browser with `npx playwright install chromium` and adjust the channel.

## Installing for development

1. Open `chrome://extensions`, turn on Developer mode, and choose **Load unpacked**.
2. Select this directory (`apps/extension`).

Chrome Web Store distribution is not set up. See `docs/DEPLOYMENT.md`.

## Permissions

- `storage`: stores the active request and a draft.
- Host access: `https://gemini.google.com/*` and `https://prajwalkedari.tech/*`. The website origin is not yet `https://resume.prajwalkedari.tech`. See `docs/DOCUMENTATION-AUDIT.md`.
