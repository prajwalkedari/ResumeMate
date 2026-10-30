// Verifies the bundled extension without rebuilding it:
// manifest shape, referenced files, permissions, exact host and content-script origins,
// the production origin in every bundle, and the absence of development origins.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PRODUCTION_ORIGIN = 'https://resumemate.prajwalkedari.tech';
const GEMINI_HOST = 'https://gemini.google.com/*';
const failures = [];
const fail = (m) => failures.push(m);

const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
if (manifest.manifest_version !== 3) fail('manifest_version must be 3');
if (manifest.version !== '0.1.0') fail(`manifest version is ${manifest.version}, expected 0.1.0`);
for (const p of manifest.permissions ?? []) if (p !== 'storage') fail(`unexpected permission: ${p}`);

// Referenced files must exist.
const referenced = [
  ...Object.values(manifest.icons ?? {}),
  manifest.action?.default_popup,
  ...Object.values(manifest.action?.default_icon ?? {}),
  manifest.background?.service_worker,
  ...(manifest.content_scripts ?? []).flatMap((cs) => cs.js),
].filter(Boolean);
for (const path of referenced) if (!existsSync(join(root, path))) fail(`missing referenced file: ${path}`);

// Host permissions: exact production origin and Gemini only. No wildcards, no root or other subdomains.
const hosts = manifest.host_permissions ?? [];
const expectedHosts = [`${PRODUCTION_ORIGIN}/*`, GEMINI_HOST];
for (const h of hosts) if (!expectedHosts.includes(h)) fail(`unexpected host permission: ${h}`);
for (const h of expectedHosts) if (!hosts.includes(h)) fail(`missing host permission: ${h}`);

// Content scripts: the website script must match only the production origin.
const websiteScript = (manifest.content_scripts ?? []).find((cs) => cs.js.includes('content/resumemate.js'));
if (!websiteScript) fail('no content script for content/resumemate.js');
else if (JSON.stringify(websiteScript.matches) !== JSON.stringify([`${PRODUCTION_ORIGIN}/*`])) {
  fail(`website content script matches must be exactly ["${PRODUCTION_ORIGIN}/*"], found ${JSON.stringify(websiteScript.matches)}`);
}
const geminiScript = (manifest.content_scripts ?? []).find((cs) => cs.js.includes('content/gemini.js'));
if (!geminiScript || JSON.stringify(geminiScript.matches) !== JSON.stringify(['https://gemini.google.com/app*'])) {
  fail('Gemini content script matches must be exactly ["https://gemini.google.com/app*"]');
}

// Every bundle must carry the exact production origin, and no development origin.
const bundles = ['background/service-worker.js', 'content/resumemate.js', 'content/gemini.js', 'popup/main.js'];
for (const file of bundles) {
  const text = readFileSync(join(root, file), 'utf8');
  const m = text.match(/var PRODUCTION_WEBSITE_ORIGIN = "([^"]+)";/);
  if (!m) fail(`${file}: PRODUCTION_WEBSITE_ORIGIN not found`);
  else if (m[1] !== PRODUCTION_ORIGIN) fail(`${file}: production origin is ${m[1]}, expected ${PRODUCTION_ORIGIN}`);
  if (/localhost|127\.0\.0\.1/.test(text)) fail(`${file}: contains a development origin`);
  if (/prajwalkedari\.tech/.test(text.replace(/resumemate\.prajwalkedari\.tech/g, ''))) fail(`${file}: contains a stale prajwalkedari.tech origin`);
}

console.log(`manifest.json: ${manifest.name} ${manifest.version} (MV${manifest.manifest_version})`);
console.log(`referenced files checked: ${referenced.length}; bundles checked: ${bundles.length}`);
console.log(`production origin: ${PRODUCTION_ORIGIN}`);
for (const f of failures) console.log(`FAIL: ${f}`);
console.log(failures.length === 0 ? 'manifest verification: PASS' : 'manifest verification: FAIL');
process.exit(failures.length === 0 ? 0 : 1);
