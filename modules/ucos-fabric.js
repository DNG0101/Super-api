(()=>{
'use strict';
const Core=globalThis.SuperApiUCOSFabricCore;
const CapOS=globalThis.SuperApiCapabilityOS;
if(!Core||!CapOS){console.error('UCOS Fabric requires capability-os-core/runtime and ucos-fabric-core');return;}
if(globalThis.SuperApiUCOS)return;
const capabilities=Core.createCapabilityRegistry();
const providers=Core.createProviderRegistry();
const transports=Core.createTransportRegistry();
const pending=new Map();
const events=new EventTarget();
const started=performance.now();
const telemetry=[];
const MAX_TELEMETRY=400;
let channelSetInstalled=false;
let observedSet=null;

function sessionNodeId(){
  const k='super-api-ucos-node-id';
  try{let v=sessionStorage.getItem(k);if(!v){v=Core.id('node');sessionStorage.setItem(k,v)}return v}catch{return Core.id('node')}
}
const localNodeId=sessionNodeId();
const nodes=Core.createNodeRegistry({id:localNodeId,label:`This device • ${navigator.platform||'Browser'}`,kind:'browser',local:true,online:true,metadata:{userAgent:navigator.userAgent,language:navigator.language}});
const clone=Core.clone;
function emit(type,detail){events.dispatchEvent(new CustomEvent(type,{detail:clone(detail)}));}
function record(row){telemetry.unshift({...clone(row),time:new Date().toISOString()});if(telemetry.length>MAX_TELEMETRY)telemetry.length=MAX_TELEMETRY;emit('telemetry',row);}
function secure(){return globalThis.isSecureContext===true;}
function isHost(){const h=document.querySelector('#hostBtn'),c=document.querySelector('#controllerBtn');return !!h?.classList.contains('primary')&&!c?.classList.contains('primary');}
function authorized(){return Boolean(document.querySelector('#allowRequests')?.checked);}
function openChannels(){return[...(globalThis.__superApiTrackedChannels||[])].filter(ch=>ch?.readyState==='open');}
function currentChannel(){const list=openChannels();return list[list.length-1]||null;}
function actionName(capability){return capability?.metadata?.action||String(capability?.id||'').replace(/^action:/,'');}
function syncCapabilities(){
  CapOS.discoverActions?.();
  for(const c of CapOS.catalog?.()||[])capabilities.register({...c,status:'implemented',metadata:{...(c.metadata||{}),compatibilitySource:'SuperApiCapabilityOS'}});
  const list=capabilities.export();
  nodes.upsert({...(nodes.get(localNodeId)||{}),id:localNodeId,local:true,online:navigator.onLine,capabilities:list.map(c=>c.id),capabilityDetails:list,lastSeen:Date.now()});
  emit('capabilities',capabilities.summary());
  return list;
}

const nativeBasic=new Map([
 ['environment-info',async()=>({secureContext:secure(),online:navigator.onLine,language:navigator.language,languages:navigator.languages,platform:navigator.platform,hardwareConcurrency:navigator.hardwareConcurrency,maxTouchPoints:navigator.maxTouchPoints,visibility:document.visibilityState,url:location.href})],
 ['storage-estimate',async()=>{if(!navigator.storage?.estimate)throw new Error('StorageManager.estimate unavailable');const x=await navigator.storage.estimate();return{usage:x.usage,quota:x.quota,usageDetails:x.usageDetails,persisted:await navigator.storage.persisted?.()}}],
 ['permissions',async()=>{if(!navigator.permissions)throw new Error('Permissions API unavailable');const out={};for(const name of ['geolocation','camera','microphone','notifications','clipboard-read','clipboard-write']){try{out[name]=(await navigator.permissions.query({name})).state}catch{out[name]='query unsupported'}}return out}],
 ['network',async()=>{const c=navigator.connection||navigator.mozConnection||navigator.webkitConnection;return c?{online:navigator.onLine,type:c.type,effectiveType:c.effectiveType,downlink:c.downlink,rtt:c.rtt,saveData:c.saveData}:{online:navigator.onLine,connectionAPI:false}}],
 ['battery',async()=>{if(!navigator.getBattery)throw new Error('Battery Status API unavailable');const b=await navigator.getBattery();return{charging:b.charging,level:b.level,chargingTime:b.chargingTime,dischargingTime:b.dischargingTime}}],
 ['crypto',async()=>{const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('super-api-ucos'));return{sha256:[...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join(''),random:[...crypto.getRandomValues(new Uint32Array(4))]}}],
 ['geolocation',async()=>new Promise((resolve,reject)=>navigator.geolocation?.getCurrentPosition(p=>resolve({latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy,timestamp:p.timestamp}),reject,{enableHighAccuracy:true,timeout:12000})||reject(new Error('Geolocation unavailable')))],
 ['clipboard-read',async()=>({text:await navigator.clipboard.readText()})],
 ['clipboard-write',async args=>{await navigator.clipboard.writeText(String(args?.text??`Super API UCOS ${new Date().toISOString()}`));return{written:true}}],
 ['camera',async()=>{const stream=await navigator.mediaDevices.getUserMedia({video:true,audio:false});return{mediaStream:true,tracks:stream.getTracks().map(t=>({kind:t.kind,label:t.label,readyState:t.readyState})),note:'Stream remains browser-owned; use the original Lab media panel for preview/peer attachment.'}}],
 ['microphone',async()=>{const stream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});return{mediaStream:true,tracks:stream.getTracks().map(t=>({kind:t.kind,label:t.label,readyState:t.readyState})),note:'Stream remains browser-owned; use the original Lab media panel for peer attachment.'}}],
 ['file-open',async()=>{if(globalThis.showOpenFilePicker){const[h]=await showOpenFilePicker();const f=await h.getFile();return{name:f.name,size:f.size,type:f.type,lastModified:f.lastModified}}const input=document.createElement('input');input.type='file';return new Promise((resolve,reject)=>{input.onchange=()=>{const f=input.files?.[0];f?resolve({name:f.name,size:f.size,type:f.type,lastModified:f.lastModified}):reject(new Error('No file selected'))};input.click()})}],
 ['directory',async()=>{if(!globalThis.showDirectoryPicker)throw new Error('Directory picker unavailable');const h=await showDirectoryPicker();return{name:h.name,kind:h.kind}}],
 ['notifications',async()=>({permission:await Notification.requestPermission()})],
 ['share',async args=>{if(!navigator.share)throw new Error('Web Share unavailable');await navigator.share({title:args?.title||'Super API UCOS',text:args?.text||'Universal Capability Fabric',url:args?.url||location.href});return{shared:true}}],
 ['vibration',async args=>({accepted:Boolean(navigator.vibrate?.(args?.pattern||100))})]
]);

providers.register({
 id:'browser-native-basic',label:'Browser Native Provider',priority:20,local:true,
 supports(capability){return nativeBasic.has(actionName(capability));},
 async execute(capability,command){const fn=nativeBasic.get(actionName(capability));if(!fn)throw new Error('Native basic adapter unavailable');return fn(command.args||{})},
 health:()=>({available:true,actions:[...nativeBasic.keys()]})
});
providers.register({
 id:'legacy-extension-local',label:'Existing extension action bus',priority:50,local:true,
 supports(capability){return actionName(capability).startsWith('ext:')&&typeof globalThis.SUPER_API_EXT_HANDLE==='function';},
 execute:async(capability,command)=>{const env=await CapOS.execute({capabilityId:capability.id,operation:'execute',args:command.args||{},mode:'local',meta:command.meta||{}});return env.result},
 health:()=>({available:typeof globalThis.SUPER_API_EXT_HANDLE==='function'})
});

transports.register({
 id:'webrtc-compat',label:'Existing Super API WebRTC DataChannel',kind:'webrtc',priority:10,
 available:()=>Boolean(currentChannel()),
 async request(command){const capability=capabilities.get(command.capabilityId);if(!capability)throw new Error(`Unknown capability ${command.capabilityId}`);const env=await CapOS.execute({capabilityId:capability.id,operation:'execute',args:command.args||{},mode:'peer',meta:command.meta||{}});return env.result},
 notify(message){const ch=currentChannel();if(!ch)throw new Error('No open paired-peer data channel');ch.send(JSON.stringify(message));return true;}
});
transports.register({id:'loopback',label:'Local loopback',kind:'local',priority:1,available:()=>true,request:command=>executeLocal(command)});

async function executeLocal(request){
  syncCapabilities();
  const validation=Core.validateRequest(request);if(!validation.valid)throw new Error(validation.errors.join(', '));
  const command=validation.request,capability=capabilities.get(command.capabilityId);if(!capability)throw new Error(`Unknown capability ${command.capabilityId}`);
  const candidates=providers.resolve(capability,command.operation,{local:true});
  if(!candidates.length)throw new Error(`No local provider for ${capability.id}; the original Super API Lab remains available for this action.`);
  let lastError=null;
  for(const provider of candidates){
    const t=performance.now();
    try{const result=await provider.execute(capability,command,{node:nodes.get(localNodeId)});const env=Core.executionEnvelope({requestId:command.id,capabilityId:capability.id,operation:command.operation,status:'available',providerId:provider.id,nodeId:localNodeId,result,durationMs:performance.now()-t});record(env);return env}catch(e){lastError=e;record(Core.executionEnvelope({requestId:command.id,capabilityId:capability.id,operation:command.operation,status:'error',providerId:provider.id,nodeId:localNodeId,error:e?.message||String(e),durationMs:performance.now()-t}))}
  }
  throw lastError||new Error('Local execution failed');
}
async function executeRemote(request){
  syncCapabilities();
  const validation=Core.validateRequest(request);if(!validation.valid)throw new Error(validation.errors.join(', '));
  const command=validation.request,capability=capabilities.get(command.capabilityId);if(!capability)throw new Error(`Unknown capability ${command.capabilityId}`);
  if(capability.remoteAllowed===false)throw new Error(`Capability ${capability.id} does not allow remote execution`);
  const available=transports.resolve({remote:true}).filter(t=>t.kind==='webrtc');if(!available.length)throw new Error('No remote peer transport is currently available');
  const transport=available[0],t=performance.now();
  try{const result=await transport.request(command);const target=command.targetNodeId||[...nodes.list()].find(n=>!n.local&&n.online)?.id||'paired-peer';const env=Core.executionEnvelope({requestId:command.id,capabilityId:capability.id,operation:command.operation,status:'available',transportId:transport.id,nodeId:target,result,durationMs:performance.now()-t});record(env);return env}catch(e){const env=Core.executionEnvelope({requestId:command.id,capabilityId:capability.id,operation:command.operation,status:'error',transportId:transport.id,nodeId:command.targetNodeId||'paired-peer',error:e?.message||String(e),durationMs:performance.now()-t});record(env);throw Object.assign(new Error(env.error),{envelope:env})}
}
async function execute(input={}){
  const request=Core.validateRequest(input);if(!request.valid)throw new Error(request.errors.join(', '));
  const command=request.request;
  if(command.mode==='local')return executeLocal(command);
  if(command.mode==='peer'||command.mode==='remote')return executeRemote(command);
  if(command.targetNodeId&&command.targetNodeId!==localNodeId)return executeRemote(command);
  try{return await executeLocal(command)}catch(localError){if(currentChannel())return executeRemote(command);throw localError}
}

function advertisementMessage(){syncCapabilities();return Core.advertisement(nodes.get(localNodeId),capabilities.export())}
function sendAdvertisement(channel=currentChannel()){
  if(!channel||channel.readyState!=='open')return false;
  try{channel.send(JSON.stringify(advertisementMessage()));return true}catch{return false}
}
function bindChannel(channel){
  if(!channel||channel.__superApiUCOSBound)return channel;
  try{Object.defineProperty(channel,'__superApiUCOSBound',{value:true,configurable:true})}catch{return channel}
  const receive=event=>{
    let msg;try{msg=JSON.parse(event.data)}catch{return}
    if(msg?.type==='ucos:advertise'&&msg.node){nodes.upsert({...msg.node,local:false,online:true,transportId:'webrtc-compat',lastSeen:Date.now()});emit('nodes',nodes.export());return;}
    if(msg?.type==='ucos:hello'&&msg.node){nodes.upsert({...msg.node,local:false,online:true,transportId:'webrtc-compat',lastSeen:Date.now()});sendAdvertisement(channel);emit('nodes',nodes.export());return;}
    if(msg?.type==='ucos:ping'){try{channel.send(JSON.stringify({type:'ucos:pong',id:msg.id,nodeId:localNodeId,time:Date.now()}))}catch{}return;}
    if(msg?.type==='ucos:pong'&&pending.has(msg.id)){pending.get(msg.id)?.resolve?.(msg);pending.delete(msg.id);}
  };
  channel.addEventListener?.('message',receive);
  const hello=()=>{try{channel.send(JSON.stringify({type:'ucos:hello',node:{id:localNodeId,label:nodes.get(localNodeId)?.label,kind:'browser',online:true,lastSeen:Date.now()}}));sendAdvertisement(channel)}catch{}};
  channel.addEventListener?.('open',hello,{once:true});
  channel.addEventListener?.('close',()=>{for(const n of nodes.list())if(!n.local&&n.transportId==='webrtc-compat')nodes.upsert({...n,online:false,lastSeen:Date.now()});emit('nodes',nodes.export())},{once:true});
  if(channel.readyState==='open')queueMicrotask(hello);
  return channel;
}
function installChannelObserver(){
  const current=globalThis.__superApiTrackedChannels;
  if(channelSetInstalled&&current===observedSet)return;
  const Existing=current instanceof Set?current:new Set();
  class ObservableChannelSet extends Set{add(value){super.add(value);bindChannel(value);return this}}
  const next=new ObservableChannelSet(Existing);observedSet=next;globalThis.__superApiTrackedChannels=next;channelSetInstalled=true;
  for(const ch of next)bindChannel(ch);
}
async function ping(timeout=2500){
  installChannelObserver();const ch=currentChannel();if(!ch)throw new Error('No open peer channel');const id=Core.id('ping');
  const promise=new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(new Error('Peer ping timed out'))},timeout);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v)},reject})});
  ch.send(JSON.stringify({type:'ucos:ping',id,nodeId:localNodeId,time:Date.now()}));return promise;
}
function route(capabilityId,{preferLocal=true,targetNodeId=null}={}){syncCapabilities();const capability=capabilities.get(capabilityId);if(!capability)return[];return Core.routeCandidates({capability,nodes:nodes.list(),preferLocal,targetNodeId});}
function health(){syncCapabilities();installChannelObserver();return{version:'2.0',architecture:'Universal Capability Fabric',uptimeMs:Math.round(performance.now()-started),localNodeId,capabilities:capabilities.summary(),providers:providers.list().map(p=>({id:p.id,label:p.label,priority:p.priority})),transports:transports.list().map(t=>({id:t.id,label:t.label,kind:t.kind,available:Boolean(t.available?.())})),nodes:nodes.export(),peerConnected:Boolean(currentChannel()),sessionAuthorized:authorized(),controlledPeer:isHost(),secureContext:secure(),storage:globalThis.SuperApiUCOSStorage?.health?.()||null,telemetry:telemetry.length,legacyLabPreserved:true};}
function refresh(){syncCapabilities();installChannelObserver();sendAdvertisement();emit('refresh',health());return health();}

installChannelObserver();syncCapabilities();
for(const id of ['hostBtn','controllerBtn','allowRequests'])document.querySelector(`#${id}`)?.addEventListener(id==='allowRequests'?'change':'click',()=>queueMicrotask(refresh));
window.addEventListener('online',refresh);window.addEventListener('offline',refresh);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
const api=Object.freeze({core:Core,capabilities,providers,transports,nodes,events,telemetry,execute,executeLocal,executeRemote,route,health,refresh,ping,sendAdvertisement,registerProvider:p=>providers.register(p),registerTransport:t=>transports.register(t),localNodeId});
globalThis.SuperApiUCOS=api;
queueMicrotask(()=>emit('ready',health()));
})();
