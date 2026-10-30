// PDF import core: safety checks, text-layer assessment, text normalization, and
// conservative field suggestions. Everything here is pure, so it can be tested without a
// browser. Extracted text is untrusted input: it is never executed, and it is never sent
// anywhere by this module.
import type { Resume } from './resume';

export const PDF_LIMITS = { maxBytes: 10 * 1024 * 1024, maxPages: 30, minCharsPerPage: 80 } as const;

const latin1 = new TextDecoder('latin1');

export type PdfCheck = { ok: true; warnings: string[] } | { ok: false; error: string };

/** Decides whether bytes are a PDF from their content, never from the filename or MIME type. */
export function sniffPdf(bytes: Uint8Array): boolean {
  return latin1.decode(bytes.subarray(0, 1024)).includes('%PDF-');
}

/** Checks safety and integrity before any parser runs. */
export function checkPdfFile(bytes: Uint8Array): PdfCheck {
  if (bytes.byteLength === 0) return { ok: false, error: 'The file is empty.' };
  if (bytes.byteLength > PDF_LIMITS.maxBytes) {
    return { ok: false, error: `The file is larger than ${PDF_LIMITS.maxBytes / (1024 * 1024)} MB.` };
  }
  if (!sniffPdf(bytes)) {
    return { ok: false, error: 'This file is not a PDF. Its content does not start with a PDF header.' };
  }
  const whole = latin1.decode(bytes);
  // Heuristic: an /Encrypt entry in the document trailer indicates encryption.
  if (/\/Encrypt\b/.test(whole)) {
    return { ok: false, error: 'This PDF is encrypted or password-protected. Remove the password in your PDF viewer, then upload it again.' };
  }
  const warnings: string[] = [];
  if (!/%%EOF/.test(latin1.decode(bytes.subarray(Math.max(0, bytes.length - 2048))))) {
    warnings.push('The file has no end-of-file marker, so it may be truncated or corrupted. Extraction may be incomplete.');
  }
  return { ok: true, warnings };
}

export function checkPageCount(pages: number): { ok: true } | { ok: false; error: string } {
  if (pages === 0) return { ok: false, error: 'The PDF has no pages.' };
  if (pages > PDF_LIMITS.maxPages) return { ok: false, error: `The PDF has ${pages} pages. The limit is ${PDF_LIMITS.maxPages}.` };
  return { ok: true };
}

export interface TextLayerAssessment {
  status: 'text' | 'little-text' | 'no-text';
  totalChars: number;
  pagesWithText: number;
  warnings: string[];
}

/** Detects scanned or image-only PDFs. OCR is never claimed here: this only reports what the text layer contains. */
export function assessTextLayer(pages: string[]): TextLayerAssessment {
  const counts = pages.map((p) => p.trim().length);
  const totalChars = counts.reduce((a, b) => a + b, 0);
  const pagesWithText = counts.filter((c) => c > 0).length;
  if (totalChars < 20) {
    return {
      status: 'no-text',
      totalChars,
      pagesWithText,
      warnings: [
        'This PDF has no extractable text. It is probably a scanned or image-only document. OCR is required, and OCR has NOT been run on this file.',
      ],
    };
  }
  const sparse = pagesWithText < pages.length || counts.some((c) => c < PDF_LIMITS.minCharsPerPage);
  if (sparse) {
    return {
      status: 'little-text',
      totalChars,
      pagesWithText,
      warnings: [
        `Only ${pagesWithText} of ${pages.length} pages have a usable text layer. Some pages may be scanned images. Check them against the original.`,
      ],
    };
  }
  return { status: 'text', totalChars, pagesWithText, warnings: [] };
}

const BULLET = /^(\s*)[•●◦▪▫·∙‣⁃]\s*/;

/** Cleans one page of extracted text while keeping paragraphs, line breaks, and bullet markers. */
export function normalizePageText(raw: string): string {
  const cleaned = raw
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/\f/g, '\n')
    .replace(/\u00AD/g, '')
    .replace(/\u00A0/g, ' ')
    // Remove control characters except tab and newline. Bidi overrides are removed too.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B\u200E\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '');

  const lines = cleaned.split('\n').map((line) => {
    const bullet = BULLET.exec(line);
    const body = (bullet ? line.replace(BULLET, '') : line).replace(/[ \t]{2,}/g, ' ').trim();
    if (body === '') return '';
    return bullet ? `- ${body}` : body;
  });
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Lines that repeat across many pages are often headers or footers. They are reported, never removed automatically. */
export function findRepeatedLines(pages: string[]): string[] {
  if (pages.length < 2) return [];
  const seen = new Map<string, number>();
  for (const page of pages) {
    const unique = new Set(page.split('\n').map((l) => l.trim()).filter((l) => l.length > 3 && l.length <= 80));
    unique.forEach((line) => seen.set(line, (seen.get(line) ?? 0) + 1));
  }
  const threshold = pages.length >= 3 ? Math.ceil(pages.length * 0.6) : 2;
  return [...seen.entries()].filter(([, n]) => n >= threshold).map(([line]) => line);
}

const HEADINGS: [string, RegExp][] = [
  ['summary', /^(professional\s+)?(summary|profile|objective|about( me)?)$/i],
  ['experience', /^(work\s+|professional\s+)?(experience|employment|internships?)$/i],
  ['education', /^education$/i],
  ['skills', /^(technical\s+)?skills$/i],
  ['projects', /^projects?$/i],
  ['certifications', /^(certifications?|licen[cs]es?|courses?)$/i],
  ['achievements', /^(achievements?|awards|publications|honou?rs?)$/i],
];

export function matchHeading(line: string): string | null {
  const t = line.trim().replace(/:$/, '');
  if (t.length === 0 || t.length > 40) return null;
  const hit = HEADINGS.find(([, re]) => re.test(t));
  return hit ? hit[0] : null;
}

export interface UnmappedSection {
  section: string;
  text: string;
}

export interface ImportSuggestion {
  personal: { name?: string; email?: string; phone?: string; linkedin?: string; github?: string; portfolio?: string };
  summary?: string;
  unmapped: UnmappedSection[];
  warnings: string[];
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const URL_RE = /(?:https?:\/\/)?(?:www\.)?[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[a-z]{2,}(?:\/[^\s,;)]*)?/gi;

function findPhone(text: string): string | undefined {
  for (const match of text.matchAll(/\+?\d[\d\s().-]{6,}\d/g)) {
    const digits = match[0].replace(/\D/g, '');
    if (digits.length >= 10 && digits.length <= 15) return match[0].trim();
  }
  return undefined;
}

function looksLikeName(line: string): boolean {
  return line.length <= 50 && /^[A-Z][A-Za-z'.-]+(\s+[A-Z][A-Za-z'.-]+){1,3}$/.test(line) && matchHeading(line) === null;
}

/**
 * Suggests structured fields from extracted text. It fills only what is clearly present.
 * Anything uncertain goes into warnings, and sections are returned unmapped so the user
 * assigns them. Nothing is guessed or invented.
 */
export function suggestFields(text: string): ImportSuggestion {
  const suggestion: ImportSuggestion = { personal: {}, unmapped: [], warnings: [] };
  const lines = text.split('\n');

  // Split the document into sections using recognized headings.
  const sections = new Map<string, string[]>();
  let current = 'header';
  const headerLines: string[] = [];
  for (const line of lines) {
    const heading = matchHeading(line);
    if (heading) {
      current = heading;
      if (!sections.has(current)) sections.set(current, []);
      continue;
    }
    if (current === 'header') headerLines.push(line);
    else sections.get(current)!.push(line);
  }

  const headerText = headerLines.join('\n');
  const firstLine = headerLines.map((l) => l.trim()).find((l) => l.length > 0) ?? '';
  if (looksLikeName(firstLine)) suggestion.personal.name = firstLine;
  else suggestion.warnings.push('Could not confidently identify your name. Enter it in Personal information.');

  const email = EMAIL.exec(text);
  if (email) suggestion.personal.email = email[0];
  else suggestion.warnings.push('No email address found. Add it in Personal information.');

  const phone = findPhone(headerText) ?? findPhone(text);
  if (phone) suggestion.personal.phone = phone;

  const linkedin = /linkedin\.com\/in\/[A-Za-z0-9_-]+/i.exec(text);
  if (linkedin) suggestion.personal.linkedin = linkedin[0];
  const github = /github\.com\/[A-Za-z0-9_-]+/i.exec(text);
  if (github) suggestion.personal.github = github[0];
  // Remove email addresses first. Otherwise the domain of an address is mistaken for a website.
  const withoutEmails = text.replace(new RegExp(EMAIL.source, 'g'), ' ');
  const portfolio = [...withoutEmails.matchAll(URL_RE)]
    .map((m) => m[0])
    .find((u) => !/linkedin\.com|github\.com|@/.test(u) && /\.[a-z]{2,}/i.test(u));
  if (portfolio) suggestion.personal.portfolio = portfolio;

  const summary = sections.get('summary');
  if (summary && summary.join('\n').trim()) suggestion.summary = summary.join('\n').trim();

  for (const [section, body] of sections) {
    if (section === 'summary') continue;
    const content = body.join('\n').trim();
    if (content) suggestion.unmapped.push({ section, text: content });
  }
  if (!sections.has('experience') && !sections.has('education')) {
    suggestion.warnings.push('No Experience or Education heading was recognized. Check the text and add entries manually.');
  }
  return suggestion;
}

/**
 * Fills only EMPTY fields of the existing resume. Existing values are never overwritten,
 * and nothing is added to experience, education, or projects automatically.
 */
export function applySuggestion(resume: Resume, suggestion: ImportSuggestion): { resume: Resume; filled: string[]; conflicts: string[] } {
  const filled: string[] = [];
  const conflicts: string[] = [];
  const personal = { ...resume.personal };
  for (const key of ['name', 'email', 'phone', 'linkedin', 'github', 'portfolio'] as const) {
    const incoming = suggestion.personal[key];
    if (!incoming) continue;
    const existing = (personal[key] ?? '').trim();
    if (existing === '') {
      personal[key] = incoming;
      filled.push(key);
    } else if (existing !== incoming) {
      conflicts.push(key);
    }
  }
  let next: Resume = { ...resume, personal };
  if (suggestion.summary && resume.summary.trim() === '') {
    next = { ...next, summary: suggestion.summary };
    filled.push('summary');
  } else if (suggestion.summary && resume.summary.trim() !== suggestion.summary) {
    conflicts.push('summary');
  }
  return { resume: next, filled, conflicts };
}

