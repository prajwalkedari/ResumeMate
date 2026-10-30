# Security: uploaded and generated content

## Trust boundaries

- **Uploaded PDFs and .tex files** are untrusted. Their type is decided from content (the PDF header, or UTF-8 text), never from the filename or MIME type.
- **Extracted text** is untrusted. It is displayed as text and is never executed or evaluated.
- **Gemini responses and attachments** are untrusted. LaTeX from Gemini is copied and validated, never run. Commands inside it are rejected by the validator and must also be blocked by the compile sandbox.
- **The compile service** is the only component that runs an external program (pdflatex). It is a boundary, not a full sandbox.

## Controls implemented and tested

| Risk | Control | Evidence |
| --- | --- | --- |
| Non-PDF content named `.pdf` | Content sniffing (`%PDF-` header) | `pdf-latex-import.test.ts` |
| Oversized files | 10 MB limit checked before parsing | Test: 10 MB + 1 byte rejected |
| Too many pages | 30-page limit | Test: boundary checked |
| Encrypted PDFs | `/Encrypt` detection, with a clear message | Test with real qpdf-encrypted file |
| Truncated PDFs | End-of-file marker check, with a warning | Test with truncated real PDF |
| Scanned PDFs | Text-layer assessment reports OCR required and OCR not run | Test with real image-only PDF |
| Binary data named `.tex` | Strict UTF-8 decoding rejects it | Test |
| `\write18` in LaTeX | Rejected by validation, and shell escape disabled at compile | Validation test. Compile test: marker file not created |
| `\input`, `\include`, `\openin`, `\openout`, `\read` | Rejected by validation. Restricted by `openin_any=p` and `openout_any=p` at compile | Compile test: control run reads the outside file, restricted run refuses it |
| Runaway documents | Hard time limit, process killed | Test: `\def\a{\a}\a` stopped at 3 s |
| Server paths in errors | Build directory replaced with `<build>` and output truncated | Test: no temp path in errors |
| Temporary files left behind | Build directory always removed | Test |
| Overwriting the user's data | Import fills only empty fields and reports conflicts | Tests |
| Invented resume data | Unmatched sections are returned for the user to map. Nothing is guessed. | Tests |
| Email domain mistaken for a website | Emails removed before the URL search. Found and fixed during testing. | Test |

## Limits of these controls

- The compile wrapper is **not** a container. Production must run it inside an isolated environment with no network, read-only system files, and CPU, memory, and file-size limits. Those limits are not enforced by the wrapper.
- `pdflatex` runs with the full TeX installation. A TeX bug could still be exploited. Keep TeX Live updated.
- Shell escape was verified off with a harmless probe on the local TeX Live 2023 build only.
- The `/Encrypt` check is a heuristic. A PDF with an unusual structure might be missed. Parser errors would then surface as extraction failures.
- Validation of LaTeX is advisory. The compile sandbox is the security boundary.
- PDF parsing in the browser (pdfjs-dist) is not yet installed. Its security posture must be reviewed when it is added.
- No Gemini attachment is read automatically, so no Gemini-provided file enters the app without a user's manual download and import.
