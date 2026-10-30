# Installation for the import and compile features

## Frontend (Node.js 22 LTS, npm 10+)

    npm ci              # install exactly from package-lock.json
    npm run build       # production build

Not yet done: the PDF text-extraction library (pdfjs-dist) is not in `package.json`. Adding it changes `package-lock.json` and needs a networked machine (`npm install pdfjs-dist@<version>`, then commit the lockfile). Until then, browser PDF extraction is not available.

## Compile service (server side only)

Requires a TeX Live installation that provides `pdflatex`, and `pdfinfo` (poppler-utils). On Debian or Ubuntu:

    sudo apt-get install texlive-latex-base texlive-latex-recommended texlive-fonts-recommended poppler-utils

The wrapper calls `pdflatex` with `-no-shell-escape` and refuses to run without it. Run it only inside an isolated environment (see `docs/SECURITY.md`).

## Test fixtures (optional, development only)

The PDF tests build real fixtures with `pdflatex`, `qpdf`, `pdftotext` (poppler-utils), and Python with Pillow (`pip install pillow`). Tests that need a missing tool are reported as skipped, not passed.
