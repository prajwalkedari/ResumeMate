// Tests for PDF import, LaTeX import, Gemini response classification, and the compile wrapper.
// Fixtures are real files built with local tools (pdflatex, qpdf, pdftotext, Pillow). The
// extraction engine used here is pdftotext, a TEST-ONLY engine. The browser extraction engine
// (pdfjs-dist) is not installed yet and is not covered by these tests.
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as pdf from '../lib/pdf-import';
import * as latex from '../lib/latex-import';
import { emptyResume, type Resume } from '../lib/resume';
// @ts-expect-error plain ESM service module without type declarations
import { compileLatex } from '../services/latex-compile/compile.mjs';

const has = (cmd: string) => spawnSync('which', [cmd]).status === 0;
const HAS_PDFLATEX = has('pdflatex');
const HAS_QPDF = has('qpdf');
const HAS_PDFTOTEXT = has('pdftotext');
const HAS_PIL = spawnSync('python3', ['-c', 'import PIL']).status === 0;

const work = mkdtempSync(join(tmpdir(), 'rm-fixtures-'));

/** Builds a real PDF from LaTeX with the local compiler. Test-only. */
function buildPdfFromTex(name: string, tex: string): Buffer {
  const dir = mkdtempSync(join(work, 'tex-'));
  writeFileSync(join(dir, 'main.tex'), tex);
  execFileSync('pdflatex', ['-no-shell-escape', '-interaction=nonstopmode', '-output-directory', dir, 'main.tex'], { stdio: 'ignore' });
  const out = readFileSync(join(dir, 'main.pdf'));
  writeFileSync(join(work, name), out);
  return out;
}

/** Test-only text extraction: returns one string per page, in order. */
function extractPagesWithPdftotext(bytes: Buffer): string[] {
  const path = join(work, `extract-${Math.random().toString(36).slice(2)}.pdf`);
  writeFileSync(path, bytes);
  const text = execFileSync('pdftotext', ['-layout', path, '-'], { encoding: 'utf8' });
  return text.split('\f').filter((_, i, all) => i < all.length - 1 || _.trim() !== '');
}

const MULTI_PAGE_TEX = `\\documentclass{article}
\\begin{document}
Jane Doe
jane.doe@example.com
Experience
Engineer at Example Corp, 2020--2024
\\newpage
Education
B.Sc. Computer Science, Example University
\\newpage
Projects
Built a CLI toolkit used by four teams
\\end{document}`;

const RESUME_TEXT = `Alex Morgan
alex.morgan@example.com | +1 (555) 010-2345
linkedin.com/in/alex-morgan-example | github.com/alex-morgan-example
alex-morgan.example.com

Professional summary
Software engineer with backend experience.

Experience
Data Analyst Intern, Sample Analytics Ltd., 2023 – 2024
• Analysed sales data
• Wrote SQL reports

Education
B.Sc. in Computer Science, Example State University, 2020 – 2024

Skills
Python, SQL, Docker`;

describe('PDF safety checks', () => {
  it('rejects an empty file', () => {
    const r = pdf.checkPdfFile(new Uint8Array(0));
    assert.equal(r.ok, false);
  });

  it('rejects bytes that are not a PDF, regardless of the filename', () => {
    const bytes = new TextEncoder().encode('Just plain text, named resume.pdf');
    const r = latex.importFile('resume.pdf', bytes);
    assert.equal(r.kind, 'unsupported');
    if (r.kind === 'unsupported') assert.match(r.error, /named \.pdf but its contents are not a PDF/);
  });

  it('rejects files larger than the limit without parsing them', () => {
    const r = pdf.checkPdfFile(new Uint8Array(pdf.PDF_LIMITS.maxBytes + 1));
    assert.equal(r.ok, false);
  });

  it('treats a PDF with a .tex name as a PDF, and warns about the mismatch', () => {
    if (!HAS_PDFLATEX) return;
    const bytes = buildPdfFromTex('one.pdf', '\\documentclass{article}\\begin{document}Hi\\end{document}');
    const r = latex.importFile('notes.tex', bytes);
    assert.equal(r.kind, 'pdf');
    if (r.kind === 'pdf') assert.ok(r.warnings.some((w) => /does not end in \.pdf/.test(w)));
  });

  it('detects an encrypted PDF and explains what to do', { skip: !HAS_PDFLATEX || !HAS_QPDF }, () => {
    const plain = buildPdfFromTex('plain.pdf', '\\documentclass{article}\\begin{document}Secret\\end{document}');
    const src = join(work, 'plain.pdf');
    const enc = join(work, 'encrypted.pdf');
    writeFileSync(src, plain);
    execFileSync('qpdf', ['--encrypt', 'userpw', 'ownerpw', '256', '--', src, enc]);
    const r = pdf.checkPdfFile(readFileSync(enc));
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.error, /encrypted or password-protected/);
  });

  it('warns about a truncated PDF without claiming it is valid', { skip: !HAS_PDFLATEX }, () => {
    const full = buildPdfFromTex('full.pdf', '\\documentclass{article}\\begin{document}Hi\\end{document}');
    const truncated = full.subarray(0, Math.floor(full.length / 2));
    const r = pdf.checkPdfFile(truncated);
    assert.equal(r.ok, true);
    if (r.ok) assert.ok(r.warnings.some((w) => /truncated/.test(w)));
  });

  it('enforces the page-count limit', () => {
    assert.equal(pdf.checkPageCount(0).ok, false);
    assert.equal(pdf.checkPageCount(pdf.PDF_LIMITS.maxPages).ok, true);
    assert.equal(pdf.checkPageCount(pdf.PDF_LIMITS.maxPages + 1).ok, false);
  });
});

describe('multi-page PDF extraction (pdftotext, test-only engine)', () => {
  it('returns every page in order', { skip: !HAS_PDFLATEX || !HAS_PDFTOTEXT }, () => {
    const bytes = buildPdfFromTex('multi.pdf', MULTI_PAGE_TEX);
    const pages = extractPagesWithPdftotext(bytes);
    assert.equal(pages.length, 3);
    assert.match(pages[0], /Jane Doe/);
    assert.match(pages[1], /Education/);
    assert.match(pages[2], /Built a CLI toolkit/);
    assert.equal(assessTextOk(pages), true);
  });

  it('detects an image-only (scanned) PDF and states that OCR was not run', { skip: !HAS_PIL || !HAS_PDFTOTEXT }, () => {
    const scanPath = join(work, 'scan.pdf');
    execFileSync('python3', ['-c', `from PIL import Image; Image.new('RGB',(612,792),'white').save('${scanPath}', 'PDF')`]);
    const pages = extractPagesWithPdftotext(readFileSync(scanPath));
    const assessment = pdf.assessTextLayer(pages);
    assert.equal(assessment.status, 'no-text');
    assert.ok(assessment.warnings.some((w) => /OCR has NOT been run/.test(w)));
  });
});

function assessTextOk(pages: string[]): boolean {
  return pdf.assessTextLayer(pages).status === 'text';
}

describe('text normalization', () => {
  it('keeps paragraphs, bullets, dates, and special characters', () => {
    const raw = 'C++ & Résumé —  2020–2024\r\n\r\n\r\n\r\n• Led   the team\u00A0now\u200B\n\u0007 end';
    const out = pdf.normalizePageText(raw);
    assert.equal(out, 'C++ & Résumé — 2020–2024\n\n- Led the team now\nend');
  });

  it('removes soft hyphens and bidirectional overrides', () => {
    assert.equal(pdf.normalizePageText('ex\u00ADample\u202E txt'), 'example txt');
  });

  it('flags a header repeated on most pages without deleting it', () => {
    const pages = ['Jane Doe — Confidential CV\nExperience', 'Jane Doe — Confidential CV\nEducation', 'Jane Doe — Confidential CV\nSkills'];
    assert.deepEqual(pdf.findRepeatedLines(pages), ['Jane Doe — Confidential CV']);
    assert.equal(pages[0].includes('Confidential'), true);
  });
});

describe('conservative field suggestions', () => {
  const s = pdf.suggestFields(RESUME_TEXT);

  it('identifies the name, contact fields, and links', () => {
    assert.equal(s.personal.name, 'Alex Morgan');
    assert.equal(s.personal.email, 'alex.morgan@example.com');
    assert.equal(s.personal.phone, '+1 (555) 010-2345');
    assert.equal(s.personal.linkedin, 'linkedin.com/in/alex-morgan-example');
    assert.equal(s.personal.github, 'github.com/alex-morgan-example');
  });

  it('does not mistake a date range for a phone number', () => {
    const onlyDates = pdf.suggestFields('Alex Morgan\nalex@example.com\nExperience\nIntern, 2019 – 2024');
    assert.equal(onlyDates.personal.phone, undefined);
  });

  it('returns sections unmapped rather than inventing entries', () => {
    assert.ok(s.unmapped.some((u) => u.section === 'experience' && /Data Analyst Intern/.test(u.text)));
    assert.equal(s.summary, 'Software engineer with backend experience.');
  });

  it('does not guess a name when the first line is not a name', () => {
    const r = pdf.suggestFields('CURRICULUM VITAE 2024\nalex@example.com\nExperience\nIntern');
    assert.equal(r.personal.name, undefined);
    assert.ok(r.warnings.some((w) => /Could not confidently identify your name/.test(w)));
  });

  it('warns when no email is present', () => {
    const r = pdf.suggestFields('Alex Morgan\nExperience\nIntern');
    assert.equal(r.personal.email, undefined);
    assert.ok(r.warnings.some((w) => /No email/.test(w)));
  });
});

describe('merging suggestions into the form', () => {
  const base: Resume = { ...emptyResume, personal: { ...emptyResume.personal, name: 'Existing Name' } };

  it('never overwrites a value the user already entered, and reports the conflict', () => {
    const r = pdf.applySuggestion(base, pdf.suggestFields(RESUME_TEXT));
    assert.equal(r.resume.personal.name, 'Existing Name');
    assert.ok(r.conflicts.includes('name'));
  });

  it('fills only empty personal fields and the empty summary', () => {
    const r = pdf.applySuggestion(base, pdf.suggestFields(RESUME_TEXT));
    assert.ok(r.filled.includes('email'));
    assert.ok(r.filled.includes('summary'));
    assert.deepEqual(r.resume.experience, []);
    assert.deepEqual(r.resume.education, []);
  });

  it('leaves omitted optional fields empty, with no placeholder strings', () => {
    const r = pdf.applySuggestion(emptyResume, pdf.suggestFields('Alex Morgan\nalex@example.com\nExperience\nIntern'));
    const values = Object.values(r.resume.personal);
    assert.ok(values.every((v) => v !== 'undefined' && v !== 'null'));
    assert.equal(r.resume.personal.portfolio, '');
  });
});

describe('LaTeX import and validation', () => {
  it('returns the exact contents of a fenced source block', () => {
    const response = 'Here it is:\n```latex\n\\documentclass{article}\n  \\begin{document}\n50\\% \\& \\_ \\{x\\}\n\\end{document}\n```\nDone.';
    const c = latex.classifyLatex(response);
    assert.equal(c.kind, 'fenced');
    assert.equal(c.source, '\\documentclass{article}\n  \\begin{document}\n50\\% \\& \\_ \\{x\\}\n\\end{document}');
  });

  it('keeps a complete imported document byte-for-byte', () => {
    const doc = '\\documentclass{article}\r\n\\begin{document}\n  Caf\u00e9 \\& 100\\%  \n\\end{document}\n';
    const bytes = new TextEncoder().encode(doc);
    const r = latex.importFile('Resume.tex', bytes);
    assert.equal(r.kind, 'latex');
    if (r.kind === 'latex') {
      assert.equal(r.source, doc);
      assert.equal(r.validation.compilable, true);
    }
  });

  it('treats a snippet without a document class as not compilable, but not as an error', () => {
    const v = latex.validateLatex('\\section{Experience}\nEngineer');
    assert.deepEqual(v.errors, []);
    assert.equal(v.compilable, false);
    assert.ok(v.warnings.some((w) => /documentclass/.test(w)));
  });

  it('reports an environment that is never closed, with its line number', () => {
    const v = latex.validateLatex('\\documentclass{article}\n\\begin{itemize}\nText only');
    assert.ok(v.errors.some((e) => /\\begin\{itemize\} on line 2 is never closed/.test(e)), JSON.stringify(v.errors));
    assert.equal(v.compilable, false);
  });

  it('reports an \\end that does not match the open environment', () => {
    const v = latex.validateLatex('\\documentclass{article}\n\\begin{document}\n\\begin{itemize}\n\\end{enumerate}');
    assert.ok(v.errors.some((e) => /\\end\{enumerate\} on line 4 does not match/.test(e)), JSON.stringify(v.errors));
  });

  it('flags unbalanced braces but ignores escaped and commented braces', () => {
    const escaped = latex.validateLatex('\\documentclass{article}\\begin{document}\\{ escaped \\} 50\\% % comment with {\n\\end{document}');
    assert.deepEqual(escaped.errors, []);
    const broken = latex.validateLatex('\\documentclass{article}\\begin{document}{ open\n\\end{document}');
    assert.ok(broken.errors.some((e) => /Unbalanced braces/.test(e)));
  });

  it('rejects commands that run programs or read and write files', () => {
    const v = latex.validateLatex('\\documentclass{article}\\begin{document}\\immediate\\write18{rm -rf x}\\input{/etc/passwd}\\end{document}');
    assert.ok(v.errors.some((e) => /write18/.test(e)));
    assert.ok(v.errors.some((e) => /\\input/.test(e)));
  });

  it('does not reject forbidden words that appear only in comments', () => {
    const v = latex.validateLatex('\\documentclass{article}\\begin{document}% \\write18 in a comment\nOK\\end{document}');
    assert.deepEqual(v.errors, []);
  });

  it('refuses binary data that is named .tex', () => {
    const r = latex.importFile('Resume.tex', new Uint8Array([0xff, 0xfe, 0x00, 0x01]));
    assert.equal(r.kind, 'unsupported');
  });
});

describe('Gemini response classification (text only)', () => {
  it('reports a response with no plain text and explains how to import a file', () => {
    const r = latex.classifyGeminiResponse('   ');
    assert.equal(r.kind, 'no-plain-text');
    assert.match(r.guidance ?? '', /download it from the Gemini tab/);
  });

  it('recognizes a LaTeX fence and a complete document', () => {
    assert.equal(latex.classifyGeminiResponse('```latex\n\\section{A}\n```').kind, 'latex-fence');
    assert.equal(latex.classifyGeminiResponse('\\documentclass{article}\n\\begin{document}\\end{document}').kind, 'latex-document');
    assert.equal(latex.classifyGeminiResponse('## Summary\n- Led a team').kind, 'text');
  });
});

describe('sandboxed compile wrapper (pdflatex, real execution)', { skip: !HAS_PDFLATEX }, () => {
  const countTemp = () => readdirSync(tmpdir()).filter((n) => n.startsWith('rm-latex-')).length;

  it('compiles a valid document to a readable PDF', async () => {
    const r = await compileLatex('\\documentclass{article}\\begin{document}Hello\\end{document}');
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.pdf.subarray(0, 5).toString('latin1'), '%PDF-');
    assert.equal(r.pages, 1);
  });

  it('does not run \\write18 (shell escape is disabled)', async () => {
    const marker = join(work, 'shell-escape-marker.txt');
    const r = await compileLatex(`\\documentclass{article}\\begin{document}\\immediate\\write18{touch ${marker}}\\end{document}`);
    assert.equal(spawnSync('test', ['-e', marker]).status, 1, 'the marker file must not be created');
    void r;
  });

  it('does not read a real .tex file outside the build directory (openin_any = p)', async () => {
    // A control run without the restriction reads this file (its path is printed in the log).
    // The wrapper must refuse, so the compile fails and the file's contents never reach a PDF.
    const secret = join(work, 'outside-secret.tex');
    writeFileSync(secret, 'SECRET-OUTSIDE-TEXT');
    const withoutExt = secret.replace(/\.tex$/, '');
    const r = await compileLatex(`\\documentclass{article}\\begin{document}\\input{${withoutExt}}\\end{document}`);
    assert.equal(r.ok, false, 'restricted read must fail the compile');
    assert.ok(r.errors.some((e: string) => /not found/.test(e)), JSON.stringify(r.errors));
    assert.ok(r.errors.every((e: string) => !e.includes('SECRET-OUTSIDE-TEXT')));
  });

  it('stops a runaway document at the time limit', async () => {
    const started = Date.now();
    const r = await compileLatex('\\documentclass{article}\\begin{document}\\def\\a{\\a}\\a\\end{document}', { timeoutMs: 3000 });
    assert.equal(r.ok, false);
    assert.ok(Date.now() - started < 15000, 'must not run past the time limit');
    assert.ok(r.errors[0].includes('longer than'), r.errors[0]);
  });

  it('reports a syntax error without exposing server paths', async () => {
    const r = await compileLatex('\\documentclass{article}\\begin{document}\\undefinedcommand\\end{document}');
    assert.equal(r.ok, false);
    assert.ok(r.errors.length > 0);
    assert.ok(r.errors.every((e: string) => !e.includes(tmpdir()) && !e.includes('rm-latex-')), JSON.stringify(r.errors));
  });

  it('rejects empty and oversized source without invoking the compiler', async () => {
    assert.equal((await compileLatex('   ')).ok, false);
    assert.equal((await compileLatex('x'.repeat(200 * 1024 + 1))).ok, false);
  });

  it('removes its temporary build directory', async () => {
    const before = countTemp();
    await compileLatex('\\documentclass{article}\\begin{document}Clean\\end{document}');
    assert.equal(countTemp(), before);
  });
});
