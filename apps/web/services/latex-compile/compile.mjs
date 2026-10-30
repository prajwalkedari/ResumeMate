// Compiles a LaTeX source string to PDF with pdflatex in a temporary directory.
// SECURITY: this wrapper is a boundary, not a full sandbox. Run it only inside an isolated
// environment (a container or VM with no network, read-only system files, and CPU, memory, and
// time limits). The wrapper itself enforces: shell escape off, restricted file access
// (openin_any/openout_any = p), a hard timeout, output caps, and no paths in user-facing errors.
import { spawn, execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const COMPILE_LIMITS = {
  maxSourceBytes: 200 * 1024,
  maxPdfBytes: 10 * 1024 * 1024,
  timeoutMs: 20000,
  maxLogBytes: 64 * 1024,
};

function sanitize(message, dir) {
  return message.split(dir).join('<build>').slice(0, 500);
}

function runPdflatex(dir, timeoutMs) {
  return new Promise((resolve) => {
    const env = {
      PATH: process.env.PATH ?? '/usr/bin:/bin',
      HOME: dir,
      LANG: 'C.UTF-8',
      // Restrict what TeX may read or write. "p" allows only safe, relative paths.
      openin_any: 'p',
      openout_any: 'p',
    };
    const child = spawn(
      'pdflatex',
      ['-no-shell-escape', '-interaction=nonstopmode', '-halt-on-error', '-no-file-line-error', '-output-directory', dir, 'main.tex'],
      { cwd: dir, env, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let output = '';
    const collect = (chunk) => {
      if (output.length < COMPILE_LIMITS.maxLogBytes) output += chunk.toString('utf8');
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, output, timedOut: signal === 'SIGKILL' });
    });
    child.on('error', () => {
      clearTimeout(timer);
      resolve({ code: -1, signal: null, output: '', timedOut: false, missing: true });
    });
  });
}

function firstErrors(log) {
  const lines = log.split('\n').filter((l) => l.startsWith('! ')).slice(0, 5);
  return lines.length > 0 ? lines : ['LaTeX reported an error. Check the source around the error line.'];
}

/**
 * @returns {Promise<{ok: true, pdf: Buffer, bytes: number} | {ok: false, errors: string[]}>}
 */
export async function compileLatex(source, options = {}) {
  const limits = { ...COMPILE_LIMITS, ...options };
  if (typeof source !== 'string' || source.trim() === '') return { ok: false, errors: ['The LaTeX source is empty.'] };
  if (Buffer.byteLength(source, 'utf8') > limits.maxSourceBytes) {
    return { ok: false, errors: [`The LaTeX source is larger than ${limits.maxSourceBytes / 1024} KB.`] };
  }

  const dir = await mkdtemp(join(tmpdir(), 'rm-latex-'));
  try {
    await writeFile(join(dir, 'main.tex'), source, 'utf8');
    const run = await runPdflatex(dir, limits.timeoutMs);
    if (run.missing) return { ok: false, errors: ['The LaTeX compiler is not installed on this server.'] };
    if (run.timedOut) return { ok: false, errors: [`Compilation took longer than ${limits.timeoutMs / 1000} seconds and was stopped.`] };
    if (run.code !== 0) return { ok: false, errors: firstErrors(run.output).map((e) => sanitize(e, dir)) };

    const pdfPath = join(dir, 'main.pdf');
    let info;
    try {
      info = await stat(pdfPath);
    } catch {
      return { ok: false, errors: ['The compiler finished without producing a PDF.'] };
    }
    if (info.size > limits.maxPdfBytes) return { ok: false, errors: ['The generated PDF is larger than the allowed size.'] };
    const pdf = await readFile(pdfPath);
    // A real PDF starts with a header and contains an end-of-file marker.
    if (!pdf.subarray(0, 5).toString('latin1').startsWith('%PDF-') || !pdf.toString('latin1').includes('%%EOF')) {
      return { ok: false, errors: ['The generated file is not a valid PDF.'] };
    }
    const readable = await pdfinfoPages(pdfPath, dir);
    if (readable === 0) return { ok: false, errors: ['The generated PDF could not be read back.'] };
    return { ok: true, pdf, bytes: pdf.length, pages: readable };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Returns the page count reported by pdfinfo, or 0 if the file cannot be read. */
function pdfinfoPages(path) {
  return new Promise((resolve) => {
    execFile('pdfinfo', [path], { timeout: 10000 }, (error, stdout) => {
      if (error) return resolve(0);
      const match = /^Pages:\s+(\d+)/m.exec(stdout);
      resolve(match ? Number(match[1]) : 0);
    });
  });
}
