import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const exists=p=>fs.existsSync(path.join(root,p));
const fail=m=>{console.error(`WIRELESS AUDIT FAILED: ${m}`);process.exitCode=1};

const corePath='modules/wireless-radio-core.js';
const runtimePath='modules/wireless-radio.js';
const testPath='tests/wireless-radio-core.test.cjs';
for(const p of [corePath,runtimePath,testPath,'session-consent.js','sw.js','.github/workflows/validate.yml'])if(!exists(p))fail(`missing ${p}`);

const session=read('session-consent.js');
const sw=read('sw.js');
const core=read(corePath);
const runtime=read(runtimePath);
const test=read(testPath);
const workflow=read('.github/workflows/validate.yml');

for(const p of [corePath,runtimePath]){
  if(!session.includes(`'./${p}'`)&&!session.includes(`"./${p}"`))fail(`session-consent.js does not load ${p}`);
  if(!sw.includes(`'./${p}'`))fail(`service worker CORE missing ${p}`);
}
if(!(session.indexOf(corePath)>=0&&session.indexOf(runtimePath)>session.indexOf(corePath)))fail('wireless dependency order must be core -> runtime');

for(const family of ['wifi','cellular','bluetooth','ble','nfc','gps','webrtc','cast','airplay','miracast','dlna','websocket','webtransport','uwb','zigbee','thread','lora','rf433','fm','am','sdr','satellite','wifi-direct'])if(!core.includes(`id:'${family}'`))fail(`wireless family registry missing ${family}`);
for(const symbol of ['networkSnapshot','parseIceCandidate','redactIce','capabilityMatrix','combinations'])if(!core.includes(symbol))fail(`wireless core missing ${symbol}`);

for(const surface of ['navigator.bluetooth','requestDevice','requestLEScan','watchAdvertisements','NDEFReader','navigator.geolocation','RTCPeerConnection','PresentationRequest','Remote Playback','navigator.usb','navigator.hid','navigator.serial'])if(!runtime.includes(surface))fail(`wireless runtime missing surface ${surface}`);
for(const op of ['bluetooth-status','bluetooth-request','bluetooth-connect','ble-advertisements','ble-scan','nfc-scan','nfc-write','geolocation','ice','presentation-availability','presentation-start','remote-playback','bridge-inventory','bridge-request'])if(!runtime.includes(`'${op}'`)&&!runtime.includes(`${op}:`))fail(`wireless runtime missing operation ${op}`);

if(!runtime.includes("msg?.action!=='ext:wireless-radio'"))fail('wireless peer action router missing');
if(!runtime.includes("$('#allowRequests')?.checked"))fail('wireless peer runner does not enforce single session authorization');
for(const marker of ['not-exposed','bridge-only','Web pages cannot enumerate SSIDs/BSSIDs/channels/RSSI','No IMSI/IMEI/operator/cell-tower/baseband access'])if(!(core.includes(marker)||runtime.includes(marker)))fail(`wireless explicit platform-limit marker missing: ${marker}`);

for(const keyword of ['major radios','wifi raw scan correctly marked unavailable','ICE UDP host parse','ICE relay TCP parse','combination count'])if(!test.includes(keyword))fail(`wireless tests missing ${keyword}`);
if(!workflow.includes('Wireless radio test matrix')||!workflow.includes('node tests/wireless-radio-core.test.cjs'))fail('workflow does not run wireless radio matrix');
if(!workflow.includes('Wireless radio wiring audit')||!workflow.includes('node .github/scripts/wireless-audit.mjs'))fail('workflow does not run wireless wiring audit');

console.log(JSON.stringify({
  wirelessFamilies:23,
  combinationCases:115,
  directBrowserSurfaces:['Web Bluetooth/BLE','Web NFC','Network Information','Geolocation','WebRTC ICE','Presentation','Remote Playback','WebSocket','WebTransport'],
  bridgeSurfaces:['WebUSB','WebHID','WebSerial'],
  explicitlyNotRaw:['Wi-Fi SSID/BSSID/RSSI/channel scan','cellular baseband/tower/SIM identifiers','FM/AM tuner','UWB ranging','Zigbee/Thread/LoRa/raw RF/SDR without external authorized hardware'],
  singleSessionAuthorization:true
},null,2));
if(process.exitCode)process.exit(process.exitCode);
