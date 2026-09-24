(()=>{
'use strict';
const $=s=>document.querySelector(s), C=globalThis.SuperApiNetworkCore;
if(!C){console.error('SuperApiNetworkCore is required before network-signal.js');return;}
const state={events:[],observer:null,lastSummary:null};
const fmt=v=>{try{return typeof v==='string'?v:JSON.stringify(v,(_k,x)=>typeof x==='bigint'?String(x):x,2)}catch{return String(v)}};
const log=(...xs)=>{const e=$('#log');if(e)e.textContent=`[${new Date().toLocaleTimeString()}] ${xs.map(fmt).join(' ')}\n${e.textContent}`};
const send=(ch,p)=>{try{if(ch?.readyState==='open')ch.send(JSON.stringify(p));}catch{}};
const safe=v=>{try{return JSON.parse(JSON.stringify(v,(_k,x)=>typeof x==='bigint'?String(x):x))}catch{return String(v)}};
const connection=()=>navigator.connection||navigator.mozConnection||navigator.webkitConnection||null;
const peers=()=>[...(window.__superApiTrackedPeers||[])].filter(pc=>pc&&pc.connectionState!=='closed');
function pushEvent(type,detail={}){state.events.unshift({time:new Date().toISOString(),type,...detail});state.events=state.events.slice(0,50);renderEvents();}
function renderEvents(){const e=$('#networkEventLog');if(e)e.textContent=state.events.length?state.events.map(x=>`${x.time}  ${x.type}  ${fmt(Object.fromEntries(Object.entries(x).filter(([k])=>!['time','type'].includes(k))))}`).join('\n'):'No network events observed yet.';}
function capabilities(){
 const con=connection();
 return {
  secureContext:isSecureContext,online:navigator.onLine,
  networkInformation:!!con,networkInformationChange:!!con?.addEventListener,
  navigatorOnline:'onLine' in navigator,onlineOfflineEvents:'ononline' in window&&'onoffline' in window,
  fetch:typeof fetch==='function',Request:!!globalThis.Request,Response:!!globalThis.Response,Headers:!!globalThis.Headers,XMLHttpRequest:!!globalThis.XMLHttpRequest,sendBeacon:typeof navigator.sendBeacon==='function',
  WebSocket:!!globalThis.WebSocket,WebSocketStream:!!globalThis.WebSocketStream,EventSource:!!globalThis.EventSource,WebTransport:!!globalThis.WebTransport,
  RTCPeerConnection:!!globalThis.RTCPeerConnection,RTCDataChannel:!!globalThis.RTCDataChannel,RTCIceCandidate:!!globalThis.RTCIceCandidate,RTCIceTransport:!!globalThis.RTCIceTransport,RTCDtlsTransport:!!globalThis.RTCDtlsTransport,RTCSctpTransport:!!globalThis.RTCSctpTransport,
  PerformanceResourceTiming:!!globalThis.PerformanceResourceTiming,PerformanceNavigationTiming:!!globalThis.PerformanceNavigationTiming,PerformanceObserver:!!globalThis.PerformanceObserver,ReportingObserver:!!globalThis.ReportingObserver,
  serviceWorker:!!navigator.serviceWorker,BackgroundFetch:!!globalThis.BackgroundFetchManager,SyncManager:!!globalThis.SyncManager,PeriodicSyncManager:!!globalThis.PeriodicSyncManager,PushManager:!!globalThis.PushManager,
  permissions:!!navigator.permissions,AbortController:!!globalThis.AbortController,AbortSignal:!!globalThis.AbortSignal,fetchLater:typeof globalThis.fetchLater==='function',FetchLaterResult:!!globalThis.FetchLaterResult,
  trackedPeerConnections:peers().length,trackedDataChannels:[...(window.__superApiTrackedChannels||[])].length,
  resourceTimingBufferControl:typeof performance.setResourceTimingBufferSize==='function'&&typeof performance.clearResourceTimings==='function',
  localNetworkAccessPermissions:['local-network','loopback-network','local-network-access'],
  browserWithheldRadio:['raw Wi-Fi RSSI/dBm','SSID/BSSID from normal web pages','cellular RSRP/RSRQ/SINR/dBm','cell tower/cell ID','SIM/IMSI/IMEI','raw modem/baseband signal metrics']
 };
}
async function permissionStates(){
 const names=['local-network','loopback-network','local-network-access'];const out={};
 if(!navigator.permissions?.query)return Object.fromEntries(names.map(x=>[x,'Permissions API unavailable']));
 for(const name of names){try{const p=await navigator.permissions.query({name});out[name]=p.state;}catch(e){out[name]=`unsupported: ${e.name}`;}}
 return out;
}
function timing(){
 const nav=performance.getEntriesByType?.('navigation')||[],resources=performance.getEntriesByType?.('resource')||[];
 return {navigation:nav.map(C.timingMetrics),resources:C.resourceSummary(resources),buffer:{resourceCount:resources.length}};
}
async function rtc(){
 const list=[];let i=0;
 for(const pc of peers()){
  const base={index:i++,connectionState:pc.connectionState,iceConnectionState:pc.iceConnectionState,iceGatheringState:pc.iceGatheringState,signalingState:pc.signalingState,sctp:pc.sctp?{state:pc.sctp.state,maxChannels:pc.sctp.maxChannels,maxMessageSize:pc.sctp.maxMessageSize}:null};
  try{base.stats=C.summarizeRtcStats(await pc.getStats());}catch(e){base.statsError=`${e.name}: ${e.message}`;}
  try{base.transceivers=pc.getTransceivers?.().map(t=>({mid:t.mid,direction:t.direction,currentDirection:t.currentDirection,stopped:t.stopped,senderTrack:t.sender?.track?.kind||null,receiverTrack:t.receiver?.track?.kind||null}))||[];}catch{base.transceivers=[]}
  list.push(base);
 }
 return list;
}
async function quality(){
 const con=C.connectionSnapshot(connection());const rs=await rtc();const first=rs.find(x=>x.stats)?.stats;
 const q=C.deriveQuality({rttMs:first?.connection?.rttMs??con.rtt,downlinkMbps:con.downlink,lossPct:first?.media?.packetLossPct,jitterMs:first?.media?.jitterMs});
 return {quality:q,networkInformation:con,webrtc:first?{connection:first.connection,media:first.media,localCandidate:first.localCandidate,remoteCandidate:first.remoteCandidate}:null,note:'Quality is derived from browser-observable RTT/downlink/loss/jitter. It is not raw Wi-Fi/cellular radio signal strength.'};
}
async function summary(){
 const x={time:new Date().toISOString(),online:navigator.onLine,connection:C.connectionSnapshot(connection()),capabilities:capabilities(),permissions:await permissionStates(),timing:timing(),webrtc:await rtc(),quality:await quality(),events:state.events.slice(0,20)};
 state.lastSummary=x;return x;
}
async function publicProbe(url){
 const u=new URL(url);if(u.protocol!=='https:')throw new Error('Public probe requires HTTPS.');
 const kind=C.classifyAddress(u.hostname);if(['private','loopback','link-local','local-name','carrier-grade-nat','this-network','multicast','reserved'].includes(kind))throw new Error('Public probe does not target local/private addresses. Use browser Local Network Access tooling for an explicitly authorized local device.');
 const before=performance.now();const r=await fetch(u,{method:'GET',cache:'no-store',credentials:'omit',mode:'cors'});await r.arrayBuffer();const elapsed=performance.now()-before;
 const entries=performance.getEntriesByName?.(u.href)||[];const last=entries.at?.(-1)||entries[entries.length-1];
 return {ok:r.ok,status:r.status,url:r.url,elapsedMs:Number(elapsed.toFixed(2)),timing:last?C.timingMetrics(last):null,note:last?'Cross-origin DNS/TCP/TLS fields may be zero unless the server sends Timing-Allow-Origin.':'No Resource Timing entry was exposed.'};
}
function lnaSurface(){
 const tests={permissions:['local-network','loopback-network','local-network-access'],requestTargetAddressSpace:false,webSocketOptions:false};
 try{const r=new Request('https://example.com/',{targetAddressSpace:'local'});tests.requestTargetAddressSpace=('targetAddressSpace' in r)?r.targetAddressSpace:'constructor accepted';}catch(e){tests.requestTargetAddressSpace=`rejected: ${e.name}`;}
 try{const WS=globalThis.WebSocket;if(WS){const text=Function.prototype.toString.call(WS);tests.webSocketOptions=/native code|WebSocket/.test(text);}}catch{}
 return {...tests,note:'This is capability detection only. Super API does not silently scan localhost or private subnets. Chrome Local Network Access can require a native permission prompt.'};
}
function installEvents(){
 window.addEventListener('online',()=>pushEvent('online',{online:true}));window.addEventListener('offline',()=>pushEvent('offline',{online:false}));
 const con=connection();con?.addEventListener?.('change',()=>pushEvent('connection-change',{connection:C.connectionSnapshot(con)}));
 try{state.observer=new PerformanceObserver(list=>{for(const e of list.getEntries())if(['resource','navigation'].includes(e.entryType))pushEvent('performance-entry',{entryType:e.entryType,name:String(e.name).slice(0,160),protocol:e.nextHopProtocol||null,duration:Number(e.duration?.toFixed?.(2)||e.duration||0)});});for(const type of ['resource','navigation'])try{state.observer.observe({type,buffered:true})}catch{}}catch{}
}
function ui(){
 if($('#networkSignalPanel'))return;const p=document.createElement('section');p.id='networkSignalPanel';p.className='panel';
 p.innerHTML=`<h2>Network + signal diagnostics</h2><p class="mini">Browser-observable networking, transport quality and signal proxies. Raw Wi-Fi/cellular radio strength is not exposed to normal web pages; those unavailable values are reported explicitly rather than fabricated.</p><div class="row"><button id="networkSummary" class="primary">Full network summary</button><button id="networkRtc">WebRTC / ICE stats</button><button id="networkTiming">DNS/TCP/TLS timing</button><button id="networkPermissions">LNA permissions</button><button id="networkCapabilities">Capability matrix</button><button id="networkQuality">Derived link quality</button></div><div class="row" style="margin-top:10px"><input id="networkProbeUrl" class="grow" placeholder="https://public-api.example/path"><button id="networkProbe">Probe public HTTPS URL</button></div><details><summary>Local Network Access surface</summary><pre id="networkLna"></pre></details><pre id="networkOut">Ready.</pre><details><summary>Network event stream</summary><pre id="networkEventLog">No network events observed yet.</pre></details>`;
 const before=$('#latestPlatformPanel')||$('#worldApiPanel')||$('#localVideo')?.closest('section.panel');if(before)before.before(p);else document.querySelector('main')?.append(p);
 const show=async fn=>{try{const v=await fn();$('#networkOut').textContent=fmt(v);return v}catch(e){const x=`${e.name}: ${e.message}`;$('#networkOut').textContent=x;throw e}};
 $('#networkSummary').onclick=()=>show(summary).catch(e=>log('Network summary error:',e.message));
 $('#networkRtc').onclick=()=>show(rtc).catch(e=>log('WebRTC stats error:',e.message));
 $('#networkTiming').onclick=()=>show(async()=>timing()).catch(e=>log('Timing error:',e.message));
 $('#networkPermissions').onclick=()=>show(permissionStates).catch(e=>log('Permission query error:',e.message));
 $('#networkCapabilities').onclick=()=>show(async()=>capabilities()).catch(e=>log('Capability error:',e.message));
 $('#networkQuality').onclick=()=>show(quality).catch(e=>log('Quality error:',e.message));
 $('#networkProbe').onclick=()=>show(()=>publicProbe($('#networkProbeUrl').value.trim())).catch(e=>log('Public probe error:',e.message));
 $('#networkLna').textContent=fmt(lnaSurface());renderEvents();
}
const actions=new Map([
 ['ext:network-summary',summary],['ext:network-webrtc',rtc],['ext:network-timing',async()=>timing()],['ext:network-permissions',permissionStates],['ext:network-capabilities',async()=>capabilities()],['ext:network-quality',quality],['ext:network-lna-surface',async()=>lnaSurface()]
]);
const previous=window.SUPER_API_EXT_HANDLE;
window.SUPER_API_EXT_HANDLE=async(channel,msg)=>{
 if(!msg?.action?.startsWith('ext:network-'))return typeof previous==='function'?previous(channel,msg):undefined;
 if(!$('#hostBtn')?.classList.contains('primary')||$('#controllerBtn')?.classList.contains('primary'))return send(channel,{type:'error',action:msg.action,id:msg.id,error:'This peer is not in Controlled peer mode.'});
 if(!$('#allowRequests')?.checked)return send(channel,{type:'error',action:msg.action,id:msg.id,error:'Single session authorization is OFF on the controlled peer.'});
 const fn=actions.get(msg.action);if(!fn)return send(channel,{type:'error',action:msg.action,id:msg.id,error:'Unknown network diagnostic action.'});
 try{send(channel,{type:'result',action:msg.action,id:msg.id,result:safe(await fn())});}catch(e){send(channel,{type:'error',action:msg.action,id:msg.id,error:`${e.name}: ${e.message}`});}return true;
};
function remote(){const s=$('#remoteAction');if(!s)return;const existing=new Set([...s.options].map(o=>o.value));const labels={
 'ext:network-summary':'Network: full summary','ext:network-webrtc':'Network: WebRTC / ICE stats','ext:network-timing':'Network: DNS/TCP/TLS timing','ext:network-permissions':'Network: Local Network Access permissions','ext:network-capabilities':'Network: capability matrix','ext:network-quality':'Network: derived link quality','ext:network-lna-surface':'Network: Local Network Access surface'};
 for(const [id,label] of Object.entries(labels))if(!existing.has(id)){const o=document.createElement('option');o.value=id;o.textContent=`SESSION • ${label}`;s.appendChild(o);}}
ui();installEvents();remote();setTimeout(remote,500);
window.SuperApiNetworkDiagnostics={summary,rtc,timing,quality,permissionStates,capabilities,lnaSurface,publicProbe};
})();
