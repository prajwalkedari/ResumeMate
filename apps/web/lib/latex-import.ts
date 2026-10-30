// LaTeX import and validation. Source text is preserved exactly as received. Validation is
// advisory for the user. The compile sandbox (services/latex-compile) is the security boundary.
import { PDF_LIMITS, checkPdfFile, sniffPdf, type PdfCheck } from './pdf-import';

export const LATEX_LIMITS = { maxBytes: 200 * 1024 } as const;

// Commands that can read or write files, or run programs. Any of these in resume source is an error.
const FORBIDDEN = [
  { re: /\\write\s*18/, message: '\\write18 runs system commands. It is not allowed.' },
  { re: /\\(input|include|includeonly)\b/, message: '\\input and \\include read other files. They are not allowed in imported resume source.' },
  { re: /\\(openin|openout|read)\b/, message: 'File read and write commands are not allowed.' },
];

export type LatexKind = 'empty' | 'fenced' | 'document' | 'snippet';

export interface LatexClassification {
  kind: LatexKind;
  /** The text to edit. For a fence, the exact contents of the fence. Otherwise the input, unchanged. */
  source: string;
}

const FENCE = /```(?:latex|tex)[ \t]*\r?\n([\s\S]*?)\r?\n?```/i;

export function classifyLatex(text: string): LatexClassification {
  if (text.trim() === '') return { kind: 'empty', source: '' };
  const fence = FENCE.exec(text);
  if (fence) return { kind: 'fenced', source: fence[1] };
  if (/\\documentclass|\\begin\{document\}/.test(text)) return { kind: 'document', source: text };
  return { kind: 'snippet', source: text };
}

export interface LatexValidation {
  errors: string[];
  warnings: string[];
  compilable: boolean;
}

export function validateLatex(source: string): LatexValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (new TextEncoder().encode(source).byteLength > LATEX_LIMITS.maxBytes) {
    errors.push(`The LaTeX source is larger than ${LATEX_LIMITS.maxBytes / 1024} KB.`);
  }
  if (source.includes('\u0000')) errors.push('The source contains NUL characters and cannot be a text LaTeX file.');

  for (const rule of FORBIDDEN) {
    if (rule.re.test(stripComments(source))) errors.push(rule.message);
  }

  // Environments must open and close in matching pairs.
  const stack: { name: string; line: number }[] = [];
  const lines = stripComments(source).split('\n');
  lines.forEach((line, index) => {
    for (const m of line.matchAll(/\\(begin|end)\{([^}]+)\}/g)) {
      if (m[1] === 'begin') stack.push({ name: m[2], line: index + 1 });
      else {
        const open = stack.pop();
        if (!open || open.name !== m[2]) {
          errors.push(`\\end{${m[2]}} on line ${index + 1} does not match its \\begin.`);
          return;
        }
      }
    }
  });
  for (const open of stack) errors.push(`\\begin{${open.name}} on line ${open.line} is never closed.`);

  const code = stripComments(source).replace(/\\[{}]/g, '');
  const opens = (code.match(/\{/g) ?? []).length;
  const closes = (code.match(/\}/g) ?? []).length;
  if (opens !== closes) errors.push(`Unbalanced braces: ${opens} opening and ${closes} closing.`);

  const hasClass = /\\documentclass\b/.test(source);
  const hasDoc = /\\begin\{document\}/.test(source) && /\\end\{document\}/.test(source);
  if (!hasClass) warnings.push('No \\documentclass line. This is a fragment, not a complete document, so it cannot compile on its own.');
  else if (!hasDoc) warnings.push('The document has no complete \\begin{document} ... \\end{document}. It may be truncated.');

  return { errors, warnings, compilable: errors.length === 0 && hasClass && hasDoc };
}

/** Removes % comments, keeping escaped \% characters. */
export function stripComments(source: string): string {
  return source
    .split('\n')
    .map((line) => {
      let out = '';
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '%' && (i === 0 || line[i - 1] !== '\\')) break;
        out += ch;
      }
      return out;
    })
    .join('\n');
}

export type ImportedFile =
  | { kind: 'pdf'; check: PdfCheck; warnings: string[] }
  | { kind: 'latex'; source: string; validation: LatexValidation }
  | { kind: 'unsupported'; error: string };

/**
 * Decides what an uploaded file is from its content. The extension and the MIME type are
 * only used for warnings, never to decide the type.
 */
export function importFile(filename: string, bytes: Uint8Array): ImportedFile {
  if (bytes.byteLength > PDF_LIMITS.maxBytes) {
    return { kind: 'unsupported', error: 'The file is larger than 10 MB.' };
  }
  const nameLooksPdf = /\.pdf$/i.test(filename);
  if (sniffPdf(bytes)) {
    const check = checkPdfFile(bytes);
    const warnings = nameLooksPdf ? [] : ['The file contents are a PDF, but the filename does not end in .pdf.'];
    return { kind: 'pdf', check, warnings: check.ok ? [...warnings, ...check.warnings] : warnings };
  }
  if (nameLooksPdf) {
    return { kind: 'unsupported', error: 'The file is named .pdf but its contents are not a PDF.' };
  }

  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return { kind: 'unsupported', error: 'The file is not UTF-8 text, so it cannot be read as LaTeX.' };
  }
  const looksLatex = /\.tex$/i.test(filename) || /\\documentclass|\\begin\{/.test(text);
  if (!looksLatex) {
    return { kind: 'unsupported', error: 'Unsupported file. Upload a PDF or a LaTeX (.tex) source file.' };
  }
  return { kind: 'latex', source: text, validation: validateLatex(text) };
}

export type GeminiResponseKind = 'no-plain-text' | 'latex-fence' | 'latex-document' | 'text';

/** Classifies a visible Gemini response from its text alone. File attachments are not visible to this function. */
export function classifyGeminiResponse(text: string): { kind: GeminiResponseKind; guidance?: string } {
  if (text.trim() === '') {
    return {
      kind: 'no-plain-text',
      guidance: 'Gemini returned no plain text. If it created a file, such as Resume.tex or a PDF, download it from the Gemini tab and import it here.',
    };
  }
  const classified = classifyLatex(text);
  if (classified.kind === 'fenced') return { kind: 'latex-fence' };
  if (classified.kind === 'document') return { kind: 'latex-document' };
  return { kind: 'text' };
}
