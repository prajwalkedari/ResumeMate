// Verifies the bundled extension without rebuilding it: manifest shape, referenced files,
// permissions, host and content-script matches, and the absence of development origins.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const warnings = [];
const fail = (m) => failures.push(m);
const warn = (m) => warnings.push(m);

const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
if (manifest.manifest_version !== 3) fail('manifest_version must be 3');
if (manifest.version !== '0.1.0') fail(`manifest version is ${manifest.version}, expected 0.1.0`);
if (manifest.minimum_chrome_version !== '116') warn(`minimum_chrome_version is ${manifest.minimum_chrome_version}`);

const allowedPermissions = ['storage'];
for (const p of manifest.permissions ?? []) if (!allowedPermissions.includes(p)) fail(`unexpected permission: ${p}`);

const referenced = [];
for (const size of Object.values(manifest.icons ?? {})) referenced.push(size);
if (manifest.action?.default_popup) referenced.push(manifest.action.default_popup);
for (const size of Object.values(manifest.action?.default_icon ?? {})) referenced.push(size);
if (manifest.background?.service_worker) referenced.push(manifest.background.service_worker);
for (const cs of manifest.content_scripts ?? []) referenced.push(...cs.js);
for (const path of referenced) if (!existsSync(join(root, path))) fail(`missing referenced file: ${path}`);

const hosts = manifest.host_permissions ?? [];
const expectedHosts = ['https://gemini.google.com/*', 'https://prajwalkedari.tech/*'];
for (const h of hosts) if (!expectedHosts.includes(h)) fail(`unexpected host permission: ${h}`);
for (const h of expectedHosts) if (!hosts.includes(h)) fail(`missing host permission: ${h}`);
if (hosts.some((h) => h.includes('localhost') || h === '<all_urls>' || h.includes('*://'))) fail('overly broad host permission');
if (!hosts.some((h) => h.startsWith('https://resume.prajwalkedari.tech'))) {
  warn('host_permissions and content scripts do not include https://resume.prajwalkedari.tech. The application origin is not yet confirmed as live, so this is a known blocker.');
}

// The production allow-list is compiled into the bundle, so check the built code, not the source.
const bundle = readFileSync(join(root, 'background/service-worker.js'), 'utf8');
const contentBundle = readFileSync(join(root, 'content/resumemate.js'), 'utf8');
for (const [name, text] of [['service-worker.js', bundle], ['content/resumemate.js', contentBundle]]) {
  if (/localhost|127\.0\.0\.1/.test(text)) fail(`${name} contains a development origin`);
}
const origin = contentBundle.match(/PRODUCTION_WEBSITE_ORIGIN = "([^"]+)"/);
if (!origin) fail('production website origin not found in content script');
else if (origin[1] !== 'https://prajwalkedari.tech') warn(`production origin in bundle: ${origin[1]}`);
else warn('production origin in bundle is https://prajwalkedari.tech. It is not https://resume.prajwalkedari.tech, which is the intended application origin. Changing it requires the extension source, which is not in this repository.');

for (const dir of ['background', 'content', 'popup', 'icons']) {
  if (!existsSync(join(root, dir))) fail(`missing directory: ${dir}`);
}

console.log(`manifest.json: ${manifest.name} ${manifest.version} (MV${manifest.manifest_version})`);
console.log(`referenced files checked: ${referenced.length}`);
for (const w of warnings) console.log(`WARNING: ${w}`);
for (const f of failures) console.log(`FAIL: ${f}`);
console.log(failures.length === 0 ? 'manifest verification: PASS' : 'manifest verification: FAIL');
process.exit(failures.length === 0 ? 0 : 1);
