import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const fail = msg => { console.error(`AUDIT FAILED: ${msg}`); process.exitCode = 1; };

const html = read('index.html');
const scripts = [...html.matchAll(/<script\s+src="\.\/(.*?)"/g)].map(m => m[1]);
const duplicates = scripts.filter((x, i) => scripts.indexOf(x) !== i);
if (duplicates.length) fail(`duplicate script refs: ${[...new Set(duplicates)].join(', ')}`);
for (const s of scripts) if (!fs.existsSync(path.join(root, s))) fail(`missing script: ${s}`);

const sw = read('sw.js');
for (const s of scripts) if (!sw.includes(`'./${s}'`)) fail(`service worker CORE missing ${s}`);

if ((html.match(/id="allowRequests"/g) || []).length !== 1) fail('expected exactly one app-level session authorization checkbox');
if (!scripts.includes('session-consent.js')) fail('session-consent.js not loaded');
if (scripts.indexOf('session-consent.js') < scripts.indexOf('app.js')) fail('session-consent.js must load after app.js');
if (!scripts.includes('interface-harness.js')) fail('interface-harness.js not loaded');

const rootJs = fs.readdirSync(root).filter(x => x.endsWith('.js') && x !== 'sw.js').sort();
for (const f of rootJs) if (!scripts.includes(f)) fail(`root JS is not loaded by index.html: ${f}`);

const sessionConsent = read('session-consent.js');
const realmRpcPath = 'modules/realm-rpc.js';
const realmWorkerPath = 'workers/realm-rpc-sw.js';
if (!sessionConsent.includes(`'./${realmRpcPath}'`) && !sessionConsent.includes(`"./${realmRpcPath}"`)) {
  fail(`session-consent.js does not load ${realmRpcPath}`);
}
if (!fs.existsSync(path.join(root, realmRpcPath))) fail(`missing dynamic realm RPC module: ${realmRpcPath}`);
const realmRpc = fs.existsSync(path.join(root, realmRpcPath)) ? read(realmRpcPath) : '';
if (!realmRpc.includes(`'./${realmWorkerPath}'`) && !realmRpc.includes(`"./${realmWorkerPath}"`)) {
  fail(`realm RPC module does not reference ${realmWorkerPath}`);
}
if (!fs.existsSync(path.join(root, realmWorkerPath))) fail(`missing realm service-worker broker: ${realmWorkerPath}`);
if (!realmRpc.includes("action: 'ext:realm-rpc'")) fail('realm RPC peer action is not wired');
if (!realmRpc.includes("$('#allowRequests')?.checked")) fail('realm RPC does not enforce the single session authorization');

console.log(JSON.stringify({
  scripts: scripts.length,
  rootJs: rootJs.length,
  sessionConsentCount: 1,
  interfaceHarness: true,
  realmRpc: true,
  realmWorkerBroker: true
}, null, 2));
if (process.exitCode) process.exit(process.exitCode);
