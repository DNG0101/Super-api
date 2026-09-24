import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const exists = p => fs.existsSync(path.join(root, p));
const fail = msg => { console.error(`AUDIT FAILED: ${msg}`); process.exitCode = 1; };

const html = read('index.html');
const scripts = [...html.matchAll(/<script\s+src="\.\/(.*?)"/g)].map(m => m[1]);
const duplicates = scripts.filter((x, i) => scripts.indexOf(x) !== i);
if (duplicates.length) fail(`duplicate script refs: ${[...new Set(duplicates)].join(', ')}`);
for (const s of scripts) if (!exists(s)) fail(`missing script: ${s}`);

const sw = read('sw.js');
for (const s of scripts) if (!sw.includes(`'./${s}'`)) fail(`service worker CORE missing ${s}`);

if ((html.match(/id="allowRequests"/g) || []).length !== 1) fail('expected exactly one app-level session authorization checkbox');
if (!scripts.includes('session-consent.js')) fail('session-consent.js not loaded');
if (scripts.indexOf('session-consent.js') < scripts.indexOf('app.js')) fail('session-consent.js must load after app.js');
if (!scripts.includes('interface-harness.js')) fail('interface-harness.js not loaded');

const rootJs = fs.readdirSync(root).filter(x => x.endsWith('.js') && x !== 'sw.js').sort();
for (const f of rootJs) if (!scripts.includes(f)) fail(`root JS is not loaded by index.html: ${f}`);

const sessionConsent = read('session-consent.js');
const peerHook = read('peer-hook.js');
const realmRpcPath = 'modules/realm-rpc.js';
const realmWorkerPath = 'workers/realm-rpc-sw.js';
const universalCorePath = 'modules/universal-core.js';
const universalPath = 'modules/universal-api.js';
const universalV2Path = 'modules/universal-api-v2.js';
const networkCorePath = 'modules/network-signal-core.js';
const networkPath = 'modules/network-signal.js';

for (const p of [realmRpcPath, realmWorkerPath, universalCorePath, universalPath, universalV2Path, networkCorePath, networkPath]) if (!exists(p)) fail(`missing required module: ${p}`);

if (!sessionConsent.includes(`'./${realmRpcPath}'`) && !sessionConsent.includes(`"./${realmRpcPath}"`)) fail(`session-consent.js does not load ${realmRpcPath}`);
const realmRpc = exists(realmRpcPath) ? read(realmRpcPath) : '';
if (!realmRpc.includes(`'./${realmWorkerPath}'`) && !realmRpc.includes(`"./${realmWorkerPath}"`)) fail(`realm RPC module does not reference ${realmWorkerPath}`);
if (!realmRpc.includes("action: 'ext:realm-rpc'")) fail('realm RPC peer action is not wired');
if (!realmRpc.includes("$('#allowRequests')?.checked")) fail('realm RPC does not enforce the single session authorization');

for (const p of [universalCorePath, universalPath, universalV2Path]) {
  if (!sessionConsent.includes(`'./${p}'`) && !sessionConsent.includes(`"./${p}"`)) fail(`session-consent.js does not load ${p}`);
  if (!sw.includes(`'./${p}'`)) fail(`service worker CORE missing ${p}`);
}
const corePos = sessionConsent.indexOf(universalCorePath), v1Pos = sessionConsent.indexOf(universalPath), v2Pos = sessionConsent.indexOf(universalV2Path);
if (!(corePos >= 0 && v1Pos > corePos && v2Pos > v1Pos)) fail('universal API dependency load order must be core -> v1 -> v2');

const universalCore = exists(universalCorePath) ? read(universalCorePath) : '';
for (const symbol of ['parseOpenApi','parsePostman','parseHar','parseAsyncApi','parseOpenRpc','grpcWebFrame','parseGrpcWebFrames','mqttConnect','mqttPublish','mqttSubscribe','stompFrame','parseSse','cartesian']) if (!universalCore.includes(symbol)) fail(`universal core missing ${symbol}`);

const universal = exists(universalPath) ? read(universalPath) : '';
if (!universal.includes("msg?.action!=='ext:universal-api'") && !universal.includes("msg?.action !== 'ext:universal-api'")) fail('universal API peer action is not wired');
if (!universal.includes("$('#allowRequests')?.checked")) fail('universal API peer runner does not enforce single session authorization');
for (const protocol of ['graphql','json-rpc','soap','websocket','sse','webtransport','grpc-web']) if (!universal.includes(protocol)) fail(`universal API module missing protocol: ${protocol}`);
for (const source of ['api.apis.guru','graphql-apis']) if (!universal.includes(source)) fail(`universal API module missing discovery source: ${source}`);

const universalV2 = exists(universalV2Path) ? read(universalV2Path) : '';
if (!universalV2.includes("msg?.action!=='ext:universal-v2'") && !universalV2.includes("msg?.action !== 'ext:universal-v2'")) fail('universal v2 peer action is not wired');
if (!universalV2.includes("$('#allowRequests')?.checked")) fail('universal v2 peer runner does not enforce single session authorization');
for (const protocol of ['webdav','sparql','odata','graphql-ws','grpc-web','sse-fetch','websocket','stomp','mqtt','webtransport']) if (!universalV2.includes(protocol)) fail(`universal v2 missing protocol: ${protocol}`);
for (const format of ['Postman','HAR','AsyncAPI','OpenRPC','WSDL','OData']) if (!universalV2.includes(format)) fail(`universal v2 missing import/metadata format: ${format}`);

// Network + signal architecture is mandatory.
for (const p of [networkCorePath, networkPath]) {
  if (!sessionConsent.includes(`'./${p}'`) && !sessionConsent.includes(`"./${p}"`)) fail(`session-consent.js does not load ${p}`);
  if (!sw.includes(`'./${p}'`)) fail(`service worker CORE missing ${p}`);
}
const networkCorePos=sessionConsent.indexOf(networkCorePath), networkPos=sessionConsent.indexOf(networkPath);
if (!(networkCorePos >= 0 && networkPos > networkCorePos)) fail('network diagnostics dependency load order must be network-signal-core -> network-signal');
if (!peerHook.includes('__superApiTrackedPeers')) fail('peer-hook.js does not track RTCPeerConnection objects');
if (!peerHook.includes('__superApiTrackPeer')) fail('peer-hook.js does not expose peer tracking helper');

const networkCore = read(networkCorePath);
for (const symbol of ['classifyAddress','connectionSnapshot','timingMetrics','resourceSummary','summarizeRtcStats','deriveQuality','deltaRate','NETWORK_SURFACES']) if (!networkCore.includes(symbol)) fail(`network core missing ${symbol}`);
for (const surface of ['navigator.connection','PerformanceResourceTiming','WebTransport','RTCStatsReport','Local Network Access permission/query']) if (!networkCore.includes(surface)) fail(`network surface registry missing ${surface}`);

const network = read(networkPath);
if (!network.includes("msg?.action?.startsWith('ext:network-')")) fail('network peer action router is not wired');
if (!network.includes("$('#allowRequests')?.checked")) fail('network peer diagnostics do not enforce single session authorization');
for (const surface of ['navigator.connection','getStats','PerformanceObserver','local-network','loopback-network','WebTransport','WebSocket','EventSource','RTCIceTransport','RTCDtlsTransport','RTCSctpTransport','browserWithheldRadio']) if (!network.includes(surface)) fail(`network runtime missing surface: ${surface}`);
for (const action of ['ext:network-summary','ext:network-webrtc','ext:network-timing','ext:network-permissions','ext:network-capabilities','ext:network-quality','ext:network-lna-surface']) if (!network.includes(action)) fail(`network runtime missing peer action: ${action}`);

const universalTestPath='tests/universal-core.test.cjs';
if (!exists(universalTestPath)) fail(`missing ${universalTestPath}`);
const universalTestText = exists(universalTestPath) ? read(universalTestPath) : '';
for (const keyword of ['gRPC-Web','MQTT','STOMP','SSE','cartesian']) if (!universalTestText.includes(keyword)) fail(`universal protocol tests missing ${keyword}`);

const networkTestPath='tests/network-signal-core.test.cjs';
if (!exists(networkTestPath)) fail(`missing ${networkTestPath}`);
const networkTestText = exists(networkTestPath) ? read(networkTestPath) : '';
for (const keyword of ['address classification matrix','resource timing calculations','rtc candidate pair/media summary','quality matrix','network surface registry breadth']) if (!networkTestText.includes(keyword)) fail(`network tests missing ${keyword}`);

const workflow = read('.github/workflows/validate.yml');
if (!workflow.includes('Universal protocol test matrix')) fail('CI workflow does not run universal protocol tests');
if (!workflow.includes('node tests/universal-core.test.cjs')) fail('CI workflow missing universal-core test command');
if (!workflow.includes('Network and signal test matrix')) fail('CI workflow does not run network/signal tests');
if (!workflow.includes('node tests/network-signal-core.test.cjs')) fail('CI workflow missing network/signal test command');

console.log(JSON.stringify({
  scripts:scripts.length,
  rootJs:rootJs.length,
  sessionConsentCount:1,
  interfaceHarness:true,
  realmRpc:true,
  realmWorkerBroker:true,
  universalApi:true,
  universalCore:true,
  universalV2:true,
  networkSignal:true,
  rtcPeerTracking:true,
  networkSignalPeerActions:7,
  browserWithheldRadioExplicit:true,
  importFamilies:['OpenAPI','Postman','HAR','AsyncAPI','OpenRPC','WSDL','OData','GraphQL introspection'],
  protocolFamilies:['HTTP/REST','GraphQL','JSON-RPC','SOAP','WebSocket','SSE','WebTransport','gRPC-Web','WebDAV','SPARQL','OData','GraphQL-WS','STOMP','MQTT'],
  networkFamilies:['Network Information','online/offline','Resource/Navigation Timing','DNS/TCP/TLS timing','WebRTC Stats/ICE/DTLS/SCTP','DataChannel','Local Network Access','WebSocket/SSE/WebTransport','Service Worker/background networking'],
  ciProtocolMatrix:true,
  ciNetworkMatrix:true
},null,2));
if (process.exitCode) process.exit(process.exitCode);
