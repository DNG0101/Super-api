(()=>{
'use strict';
const Core=globalThis.SuperApiCapabilityCore;
if(!Core){console.error('SuperApiCapabilityCore is required before capability-os.js');return;}
const $=s=>document.querySelector(s);
const registry=Core.createRegistry();
const adapters=new Map();
const telemetry=[];
const pending=new Map();
const started=performance.now();
const MAX_TELEMETRY=300;
let refreshInterval=null;
let observedActionSelect=null;
let refreshQueued=false;
let runtimeStarted=false;

const clone=v=>{try{return Core.safeClone?Core.safeClone(v):JSON.parse(JSON.stringify(v,(_k,x)=>typeof x==='bigint'?String(x):x))}catch{return String(v)}};
const inferDomain=action=>{
  const s=String(action||'').toLowerCase();
  if(s.includes('wireless')||s.includes('bluetooth')||s.includes('nfc'))return'wireless';
  if(s.includes('network')||s.includes('webrtc')||s.includes('ice'))return'network';
  if(s.includes('universal')||s.includes('world'))return'external';
  if(s.includes('realm')||s.includes('worker')||s.includes('worklet'))return'realm';
  if(s.includes('gpu')||s.includes('webgl')||s.includes('canvas'))return'graphics';
  if(s.includes('file')||s.includes('storage')||s.includes('indexeddb')||s.includes('cache'))return'storage';
  if(s.includes('camera')||s.includes('microphone')||s.includes('media')||s.includes('screen'))return'media';
  if(s.includes('usb')||s.includes('hid')||s.includes('serial')||s.includes('sensor'))return'device';
  return'web';
};
const sensitiveAction=action=>/(camera|microphone|screen|location|geolocation|bluetooth|nfc|usb|hid|serial|file|directory|contact|credential|auth|payment)/i.test(action||'');
const timeoutMs=value=>Math.min(120000,Math.max(100,Number(value)||30000));

function record(row){
  telemetry.unshift({...row,time:new Date().toISOString()});
  if(telemetry.length>MAX_TELEMETRY)telemetry.length=MAX_TELEMETRY;
  renderStatus();
}

function registerAdapter(adapter){
  if(!adapter?.id||typeof adapter.execute!=='function')throw new Error('Adapter requires id and execute()');
  adapters.set(adapter.id,Object.freeze({...adapter}));return adapter;
}

function registerAction(action,label){
  if(!action)return null;const id=`action:${action}`;
  if(registry.has(id))return registry.get(id);
  return registry.register({id,domain:inferDomain(action),name:action,label:label||action,operations:['execute','test'],source:'Super API extension bus',realm:'Window',sensitive:sensitiveAction(action),nativePermission:sensitiveAction(action),metadata:{action}});
}

function discoverActions(){
  const select=$('#remoteAction');
  const values=new Set();
  if(select)for(const option of select.options){
    if(!option.value)continue;
    values.add(option.value);
    registerAction(option.value,String(option.textContent||option.value).replace(/^SESSION\s*•\s*/i,''));
  }
  const known=['ext:realm-rpc','ext:universal-api','ext:universal-v2','ext:network-summary','ext:network-webrtc','ext:network-timing','ext:network-permissions','ext:network-capabilities','ext:network-quality','ext:network-lna-surface','ext:wireless-radio'];
  for(const action of known)if(values.has(action))registerAction(action,action.replace(/^ext:/,''));
  return registry.summary();
}

function openPeerChannel(){return[...(window.__superApiTrackedChannels||[])].find(ch=>ch?.readyState==='open')||null;}

function awaitPeer(channel,id,timeout=30000){
  if(pending.has(id))return Promise.reject(new Error(`Duplicate pending command id: ${id}`));
  return new Promise((resolve,reject)=>{
    let settled=false;
    const cleanup=()=>{
      clearTimeout(timer);
      channel.removeEventListener?.('message',handler);
      channel.removeEventListener?.('close',onClose);
      channel.removeEventListener?.('error',onError);
      pending.delete(id);
    };
    const finish=(error,value)=>{
      if(settled)return;
      settled=true;cleanup();
      if(error)reject(error);else resolve(value);
    };
    const handler=ev=>{
      let msg;try{msg=JSON.parse(ev.data)}catch{return}
      if(msg?.id!==id)return;
      if(msg.type==='error')finish(new Error(msg.error||'Peer command failed'));
      else finish(null,msg.result??msg);
    };
    const onClose=()=>finish(new Error('Peer channel closed before response'));
    const onError=()=>finish(new Error('Peer channel error before response'));
    const timer=setTimeout(()=>finish(new Error('Peer command timed out')),timeoutMs(timeout));
    channel.addEventListener?.('message',handler);
    channel.addEventListener?.('close',onClose,{once:true});
    channel.addEventListener?.('error',onError,{once:true});
    pending.set(id,{cancel:reason=>finish(reason instanceof Error?reason:new Error(reason||'Peer command cancelled'))});
  });
}

async function executePeer(capability,command){
  const channel=openPeerChannel();if(!channel)throw new Error('No open paired-peer data channel');
  const action=capability.metadata?.action;if(!action)throw new Error('Capability has no peer action');
  const id=command.id;
  const wait=awaitPeer(channel,id,command.meta?.timeout);
  try{channel.send(JSON.stringify({type:'request',action,id,params:command.args??{}}));}
  catch(e){pending.get(id)?.cancel(e);}
  return wait;
}

async function executeLocalExtension(capability,command){
  if(typeof window.SUPER_API_EXT_HANDLE!=='function')throw new Error('Extension action bus is unavailable');
  const action=capability.metadata?.action;if(!action)throw new Error('Capability has no local extension action');
  return new Promise((resolve,reject)=>{
    let settled=false;
    const timer=setTimeout(()=>{if(!settled){settled=true;reject(new Error('Local extension action timed out'));}},timeoutMs(command.meta?.timeout));
    const channel={readyState:'open',send(payload){
      if(settled)return;
      let msg;try{msg=typeof payload==='string'?JSON.parse(payload):payload}catch{msg=payload}
      if(msg?.id!==command.id&&msg?.id!=null)return;
      settled=true;clearTimeout(timer);
      if(msg?.type==='error')reject(new Error(msg.error||'Local extension failed'));else resolve(msg?.result??msg);
    }};
    Promise.resolve()
      .then(()=>window.SUPER_API_EXT_HANDLE(channel,{type:'request',action,id:command.id,params:command.args??{}}))
      .catch(e=>{if(!settled){settled=true;clearTimeout(timer);reject(e)}});
  });
}

registerAdapter({id:'extension-local',domains:Core.DOMAINS,execute:executeLocalExtension});
registerAdapter({id:'peer',domains:Core.DOMAINS,execute:executePeer});

function resolveAdapter(mode,capability){
  const id=mode==='peer'?'peer':'extension-local';
  const adapter=adapters.get(id);
  if(!adapter)throw new Error(`Adapter unavailable: ${id}`);
  if(Array.isArray(adapter.domains)&&!adapter.domains.includes(capability.domain))throw new Error(`Adapter ${id} does not support domain ${capability.domain}`);
  return adapter;
}

async function execute(input={}){
  discoverActions();
  const validation=Core.validateCommand(input);if(!validation.valid)throw new Error(validation.errors.join(', '));
  const command=validation.command;const capability=registry.get(command.capabilityId);if(!capability)throw new Error(`Unknown capability ${command.capabilityId}`);
  const mode=input.mode||command.meta?.mode||'peer';
  const context={
    remote:mode==='peer',
    sessionAuthorized:mode==='peer'?true:Boolean($('#allowRequests')?.checked),
    secureContext:isSecureContext,
    nativePermissionGranted:Boolean(input.nativePermissionGranted),
    externalAvailable:input.externalAvailable!==false
  };
  const plan=Core.buildExecutionPlan(capability,command,context);
  if(!plan.ok)throw new Error(plan.reasons.join(', '));
  const adapter=resolveAdapter(mode,capability);
  const t=performance.now();
  try{
    const result=await adapter.execute(capability,command);
    const env=Core.resultEnvelope({commandId:command.id,capabilityId:capability.id,operation:command.operation,status:'available',result,durationMs:performance.now()-t,adapter:adapter.id,realm:capability.realm});record(env);return env;
  }catch(e){
    const env=Core.resultEnvelope({commandId:command.id,capabilityId:capability.id,operation:command.operation,status:'error',error:`${e.name||'Error'}: ${e.message||e}`,durationMs:performance.now()-t,adapter:adapter.id,realm:capability.realm});record(env);throw Object.assign(new Error(env.error),{envelope:env});
  }
}

function health(){
  discoverActions();const s=registry.summary();return{version:'1.1',uptimeMs:Math.round(performance.now()-started),registry:s,adapters:[...adapters.keys()],peerConnected:Boolean(openPeerChannel()),sessionAuthorized:Boolean($('#allowRequests')?.checked),secureContext:isSecureContext,extensionBus:typeof window.SUPER_API_EXT_HANDLE==='function',trackedPeers:[...(window.__superApiTrackedPeers||[])].length,trackedChannels:[...(window.__superApiTrackedChannels||[])].length,pending:pending.size,telemetry:telemetry.length};
}
function catalog(filter={}){discoverActions();return registry.list(filter).map(clone);}
function exportState(){return{health:health(),capabilities:registry.export(),telemetry:clone(telemetry)}};

function renderStatus(){
  const el=$('#capabilityOsStatus');if(!el)return;const h=health();
  const next=`${h.registry.total} capabilities • ${h.adapters.length} adapters • peer ${h.peerConnected?'connected':'offline'} • session ${h.sessionAuthorized?'ON':'OFF'} • ${h.pending} pending • ${h.telemetry} executions`;
  if(el.textContent!==next)el.textContent=next;
}
function renderCatalog(){
  const q=$('#capabilityOsSearch')?.value||'';const rows=catalog({query:q});const sel=$('#capabilityOsCapability');if(!sel)return;
  const previous=sel.value;sel.innerHTML='';
  for(const c of rows.slice(0,1000)){const o=document.createElement('option');o.value=c.id;o.textContent=`${c.domain.toUpperCase()} • ${c.label}`;sel.appendChild(o)}
  if(previous&&[...sel.options].some(o=>o.value===previous))sel.value=previous;
  const count=$('#capabilityOsCount');if(count)count.textContent=`${rows.length} matching capabilities`;
}
function ui(){
  if($('#capabilityOsPanel'))return;
  const p=document.createElement('section');p.id='capabilityOsPanel';p.className='panel';p.innerHTML=`<h2>Universal Capability OS</h2><p class="mini">One registry and execution kernel over browser, device, realm, network, wireless and Internet API adapters. Super API uses one app-level session authorization for controlled-peer execution; browser/OS/provider security remains authoritative.</p><div id="capabilityOsStatus" class="badge">starting…</div><div class="row" style="margin-top:10px"><input id="capabilityOsSearch" class="grow" placeholder="Search unified capabilities"><button id="capabilityOsRefresh">Rediscover</button><button id="capabilityOsExport">Export state</button></div><div id="capabilityOsCount" class="mini"></div><div class="row"><select id="capabilityOsCapability" class="grow"></select><select id="capabilityOsMode"><option value="peer">Run on paired peer</option><option value="local">Run on controlled device</option></select></div><textarea id="capabilityOsArgs" placeholder='Action parameters as JSON, e.g. {}'>{}</textarea><div class="row"><button id="capabilityOsRun" class="primary">Execute through Capability OS</button><button id="capabilityOsHealth">Health</button></div><pre id="capabilityOsOut">Ready.</pre>`;
  const before=$('#networkSignalPanel')||$('#worldApiPanel')||document.querySelector('main section');if(before)before.before(p);else document.querySelector('main')?.append(p);
  $('#capabilityOsSearch').oninput=renderCatalog;
  $('#capabilityOsRefresh').onclick=()=>{discoverActions();renderCatalog();renderStatus()};
  $('#capabilityOsHealth').onclick=()=>{$('#capabilityOsOut').textContent=JSON.stringify(health(),null,2)};
  $('#capabilityOsExport').onclick=()=>{$('#capabilityOsOut').textContent=JSON.stringify(exportState(),null,2)};
  $('#capabilityOsRun').onclick=async()=>{const out=$('#capabilityOsOut');try{const raw=$('#capabilityOsArgs').value.trim();const args=raw?JSON.parse(raw):{};const env=await execute({capabilityId:$('#capabilityOsCapability').value,operation:'execute',args,mode:$('#capabilityOsMode').value});out.textContent=JSON.stringify(env,null,2)}catch(e){out.textContent=e.envelope?JSON.stringify(e.envelope,null,2):`${e.name}: ${e.message}`}};
  discoverActions();renderCatalog();renderStatus();
}

function scheduledRefresh(){
  if(refreshQueued)return;
  refreshQueued=true;
  queueMicrotask(()=>{
    refreshQueued=false;
    discoverActions();renderCatalog();renderStatus();
  });
}
const observer=new MutationObserver(scheduledRefresh);

function attachActionObserver(){
  const select=$('#remoteAction');
  if(select===observedActionSelect)return;
  observer.disconnect();observedActionSelect=select||null;
  if(select)observer.observe(select,{childList:true});
}

function startRuntime(){
  if(runtimeStarted)return;
  runtimeStarted=true;
  ui();attachActionObserver();
  refreshInterval=setInterval(()=>{discoverActions();renderStatus();attachActionObserver()},3000);
}
function stopRuntime(reason='Capability OS page lifecycle ended'){
  observer.disconnect();observedActionSelect=null;
  if(refreshInterval){clearInterval(refreshInterval);refreshInterval=null;}
  for(const entry of [...pending.values()])entry.cancel?.(reason);
  runtimeStarted=false;
}

window.addEventListener('DOMContentLoaded',startRuntime,{once:true});
if(document.readyState!=='loading')queueMicrotask(startRuntime);
window.addEventListener('pagehide',()=>stopRuntime('Page hidden or unloaded'));
window.addEventListener('pageshow',()=>{if(document.readyState!=='loading')startRuntime()});

window.SuperApiCapabilityOS=Object.freeze({registry,adapters,discoverActions,registerAction,registerAdapter,execute,health,catalog,exportState,telemetry,startRuntime,stopRuntime});
})();
