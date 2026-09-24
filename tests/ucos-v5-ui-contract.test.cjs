'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const integration=fs.readFileSync('modules/ucos-v5-integration.js','utf8');
const frame=fs.readFileSync('runtime/app-frame.html','utf8');
const sw=fs.readFileSync('sw.js','utf8');

for(const token of ['data-ucos-v5-files','UCOS Virtual File System','New folder','New text','Mount folder','Empty Trash','requestPersistence'])assert(integration.includes(token),`Files v5 integration missing ${token}`);
for(const token of ['data-ucos-v5-devices','Trusted UCOS Devices','signed channel connected','trustPeer','revokePeer'])assert(integration.includes(token),`Devices v5 integration missing ${token}`);
for(const token of ['data-ucos-v5-settings','Security, Recovery & Updates','Cryptographic identity','Application grants','Secrets vault','Check update'])assert(integration.includes(token),`Settings v5 integration missing ${token}`);
for(const token of ['saveSession','restoreSession','window-minimized','suspendProcess','resumeProcess'])assert(integration.includes(token),`Session/process integration missing ${token}`);
for(const token of ["default-src 'none'","require-trusted-types-for 'script'",'trusted-types ucos-app'])assert(frame.includes(token),`Sandbox policy missing ${token}`);
assert(sw.includes("const CACHE='super-api-ucos-v23'"));assert(sw.includes("type==='ucos:activate-update'"));
console.log('UCOS v5 Files/Devices/Settings integration passed');
console.log('UCOS v5 sandbox security surface passed');
console.log('UCOS v5 session and update integration passed');
console.log(JSON.stringify({status:'UCOS_V5_UI_CONTRACT_PASS'},null,2));
