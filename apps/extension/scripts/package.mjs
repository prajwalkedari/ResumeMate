// Creates dist/resumemate-assistant-<version>.zip from the bundle. It excludes scripts, tests and dependencies.
import { mkdirSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
const dist = join(root, 'dist');
const out = join(dist, `resumemate-assistant-${version}.zip`);
mkdirSync(dist, { recursive: true });
rmSync(out, { force: true });
execFileSync('zip', ['-r', '-X', out, 'manifest.json', 'background', 'content', 'popup', 'icons'], { cwd: root, stdio: 'inherit' });
if (!existsSync(out)) throw new Error('packaging failed');
console.log(`packaged: ${out}`);
