# Test report: PDF import, LaTeX import, compile wrapper

Environment: Node 22.22.2; tsx 4.21.0 (global); pdfTeX from TeX Live 2023 (Debian); qpdf; poppler-utils (pdftotext, pdfinfo); Python 3 with Pillow; tesseract is installed but NOT integrated.

## Executed

| Check | Command | Result |
| --- | --- | --- |
| Import, LaTeX, compile tests | `node --import tsx --test tests/pdf-latex-import.test.ts` (run from the extension directory) | 38 of 38 pass, 0 skipped |
| Cross-repo bridge tests (from the previous step) | `tests/extension-bridge.test.ts` | 20 of 20 pass |
| TypeScript, strict, on the four frontend `lib/` modules | `tsc -p` with `lib/extension-bridge.ts`, `lib/resume.ts`, `lib/pdf-import.ts`, `lib/latex-import.ts` (TypeScript 6.0.3) | Pass, exit 0 |

## Failures found and fixed

1. **Real bug: email domain treated as a website.** `alex@example.com` produced `example.com` as the portfolio. Fixed by removing emails before the URL search. A test now covers it.
2. Test mistake: `importFile` was called on the wrong module. Corrected.
3. Test mistake: qpdf rejected 40-bit encryption. Corrected to 256-bit.
4. Test mistake: an unclosed-environment test input also triggered a mismatch error. Split into two precise tests.
5. **Weak test, now strengthened.** The first version of the `\input` test passed because TeX appended `.tex` and the file did not exist, so it proved nothing about the restriction. Replaced with a real `.tex` file outside the build directory, and a control run confirmed that the same file is read without the restriction.

## What the tests do NOT cover

- Browser PDF extraction. The engine in the tests is `pdftotext`, a test-only engine. pdfjs-dist is not installed.
- OCR. Not run. The scanned-PDF test checks only that the app reports OCR as required.
- The React upload UI, the editable preview, the Import button, and the Remove File flow. These are NOT TESTED, because the frontend cannot be built here.
- Gemini attachments and `Resume.tex` previews. NOT TESTED. No live Gemini session, and no example file was supplied.
- Compile isolation. The wrapper is not a container. Network isolation, memory limits, and file-size limits at OS level are NOT TESTED.
- `npm ci`, `next build`, and `next lint` for the frontend: BLOCKED (no npm registry access).

## Manual checks still required

Upload a real multi-page resume in the browser; confirm page order, bullet points, and dates appear in the editable preview. Upload a scanned resume and confirm the OCR warning appears. Import a `.tex` file from Gemini after downloading it manually. Confirm the PDF preview appears only after compilation succeeds.
