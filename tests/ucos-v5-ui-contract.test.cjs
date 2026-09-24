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
assert(sw.includes("const CACHE='super-api-ucos-v27'"),'audited current cache generation missing');
assert(sw.includes("const PREVIOUS='super-api-ucos-v26'"),'previous audited cache generation was not retained');
for(const token of ["type==='ucos:activate-update'","type==='ucos:rollback-assets'","type==='ucos:use-current-assets'","type==='ucos:ack-job'"])assert(sw.includes(token),`staged recovery/job contract missing ${token}`);
console.log('UCOS v5 Files/Devices/Settings integration passed');
console.log('UCOS v5 sandbox security surface passed');
console.log('UCOS staged-update compatibility passed');
console.log(JSON.stringify({status:'UCOS_V5_UI_CONTRACT_PASS'},null,2));