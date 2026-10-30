// Verifies the bundled extension without rebuilding it: manifest shape, referenced files,
// permissions, exact host and content-script matches, and the absence of development origins.
// The production origin is an exact value. Wildcard subdomains and the old root domain are rejected.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const EXPECTED_ORIGIN = 'https://resumemate.prajwalkedari.tech';
const EXPECTED_HOST_PATTERN = `${EXPECTED_ORIGIN}/*`;
const EXPECTED_HOSTS = ['https://gemini.google.com/*', EXPECTED_HOST_PATTERN];
const FORBIDDEN_ORIGINS = ['https://prajwalkedari.tech'];

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const fail = (m) => failures.push(m);

const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
if (manifest.manifest_version !== 3) fail('manifest_version must be 3');
if (manifest.version !== '0.1.0') fail(`manifest version is ${manifest.version}, expected 0.1.0`);
if (manifest.minimum_chrome_version !== '116') fail(`minimum_chrome_version is ${manifest.minimum_chrome_version}, expected 116`);

const allowedPermissions = ['storage'];
for (const p of manifest.permissions ?? []) if (!allowedPermissions.includes(p)) fail(`unexpected permission: ${p}`);

const referenced = [];
for (const path of Object.values(manifest.icons ?? {})) referenced.push(path);
if (manifest.action?.default_popup) referenced.push(manifest.action.default_popup);
for (const path of Object.values(manifest.action?.default_icon ?? {})) referenced.push(path);
if (manifest.background?.service_worker) referenced.push(manifest.background.service_worker);
for (const cs of manifest.content_scripts ?? []) referenced.push(...cs.js);
for (const path of referenced) if (!existsSync(join(root, path))) fail(`missing referenced file: ${path}`);

// Host permissions must be exactly the expected set: no more, no fewer, no wildcards.
const hosts = manifest.host_permissions ?? [];
for (const h of hosts) if (!EXPECTED_HOSTS.includes(h)) fail(`unexpected host permission: ${h}`);
for (const h of EXPECTED_HOSTS) if (!hosts.includes(h)) fail(`missing host permission: ${h}`);
if (hosts.some((h) => h.includes('localhost') || h === '<all_urls>' || h.includes('*://') || h.includes('*.'))) {
  fail('overly broad host permission');
}

// Content scripts: the Gemini script matches the Gemini app; the ResumeMate script matches only the exact origin.
const contentMatches = (manifest.content_scripts ?? []).flatMap((cs) => cs.matches ?? []);
for (const m of contentMatches) {
  if (!['https://gemini.google.com/app*', EXPECTED_HOST_PATTERN].includes(m)) fail(`unexpected content script match: ${m}`);
}
if (!contentMatches.includes(EXPECTED_HOST_PATTERN)) fail(`missing content script match: ${EXPECTED_HOST_PATTERN}`);
if (contentMatches.some((m) => m.includes('*.') || m.includes('localhost') || m.includes('<all_urls>'))) {
  fail('content script match is broader than the exact production origin');
}

// The production allow-list is compiled into the bundle, so check the built code, not the source.
const bundles = [
  'background/service-worker.js',
  'content/resumemate.js',
  'content/gemini.js',
  'popup/main.js',
];
for (const rel of bundles) {
  const path = join(root, rel);
  if (!existsSync(path)) {
    fail(`missing bundle: ${rel}`);
    continue;
  }
  const text = readFileSync(path, 'utf8');
  if (/localhost|127\.0\.0\.1/.test(text)) fail(`${rel} contains a development origin`);
  for (const old of FORBIDDEN_ORIGINS) {
    if (text.includes(`"${old}"`)) fail(`${rel} still contains the stale origin ${old}`);
  }
  const m = text.match(/var PRODUCTION_WEBSITE_ORIGIN = "([^"]+)"/);
  if (!m) fail(`${rel}: production website origin not found`);
  else if (m[1] !== EXPECTED_ORIGIN) fail(`${rel}: production origin is ${m[1]}, expected ${EXPECTED_ORIGIN}`);
  // Production builds must not inject development origins.
  if (!/var define_DEV_WEBSITE_ORIGINS_default = \[\];/.test(text)) fail(`${rel}: development origin list is not empty`);
}

for (const dir of ['background', 'content', 'popup', 'icons']) {
  if (!existsSync(join(root, dir))) fail(`missing directory: ${dir}`);
}

console.log(`${manifest.name} ${manifest.version} (MV${manifest.manifest_version})`);
console.log(`referenced files checked: ${referenced.length}`);
console.log(`production origin: ${EXPECTED_ORIGIN}`);
for (const f of failures) console.log(`FAIL: ${f}`);
console.log(failures.length === 0 ? 'manifest verification: PASS' : 'manifest verification: FAIL');
process.exit(failures.length === 0 ? 0 : 1);
