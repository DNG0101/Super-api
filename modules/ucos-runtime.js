(()=>{
'use strict';
if(globalThis.SuperApiUCOSRuntime)return;
const moduleBase=new URL('../',document.currentScript?.src||location.href);
const Core=globalThis.SuperApiUCOSRuntimeCore,UCOS=globalThis.SuperApiUCOS,Storage=globalThis.SuperApiUCOSStorage;
if(!Core||!UCOS){console.error('UCOS runtime requires runtime core and fabric');return}
const manifests=Core.createManifestRegistry(),resources=Core.createResourceManager(),processes=Core.createProcessManager(resources),events=Core.createEventBus();
const grantAdapter={async get(k){return Storage?.get?.('runtime-grants',k,{preferred:['indexeddb','local','memory']})??null},async set(k,v){return Storage?.set?.('runtime-grants',k,v,{preferred:['indexeddb','local','memory']})},async delete(k){return Storage?.delete?.('runtime-grants',k,{preferred:['indexeddb','local','memory']})},async entries(){const keys=await Storage?.list?.('runtime-grants',{preferred:['indexeddb','local','memory']})||[];return Promise.all(keys.map(async k=>[k,await this.get(k)]))}};
const grants=Core.createGrantStore(grantAdapter),pendingPrompts=new Map();
async function promptGrant(req){const id=Core.id('grant');events.emit('permission-request',{id,...req});return new Promise(resolve=>{const timer=setTimeout(()=>{pendingPrompts.delete(id);resolve({state:'denied',scope:'session',reason:'prompt-timeout'})},30000);pendingPrompts.set(id,{resolve:v=>{clearTimeout(timer);resolve(v)}})})}
function resolvePermission(id,decision){const p=pendingPrompts.get(id);if(!p)return false;pendingPrompts.delete(id);p.resolve(decision);return true}
const broker=Core.createCapabilityBroker({manifests,grants,execute:cmd=>UCOS.execute(cmd),prompt:promptGrant});
const installedKey='installed-manifests';
async function persistInstalled(){if(Storage)await Storage.set('runtime',installedKey,manifests.export().filter(m=>!m.system),{preferred:['indexeddb','local','memory']})}
async function restoreInstalled(){try{const rows=await Storage?.get?.('runtime',installedKey,{preferred:['indexeddb','local','memory']})||[];for(const m of rows){try{manifests.register(m)}catch{}}}catch{}}
function registerSystemApp(input){return manifests.register({...input,system:true,runtime:input.runtime||'system'})}
async function installManifest(input){const v=Core.validateManifest(input);if(!v.valid)throw new Error(v.errors.join(','));if(v.manifest.system)throw new Error('cannot-install-system-manifest');manifests.register(v.manifest);await persistInstalled();events.emit('apps-changed',manifests.export());return v.manifest}
async function uninstall(appId){const m=manifests.get(appId);if(!m||m.system)return false;manifests.remove(appId);await persistInstalled();events.emit('apps-changed',manifests.export());return true}
function startSystemProcess(appId,metadata={}){const m=manifests.get(appId);if(!m)throw new Error(`unknown-app:${appId}`);const p=processes.spawn(appId,{runtime:'system',metadata});events.emit('process-start',p);return p}
async function stopProcess(pid,reason='closed'){const p=processes.get(pid);const ok=await processes.terminate(pid,reason);if(ok)events.emit('process-stop',{...p,reason});return ok}
function sandboxUrl(appId){const m=manifests.get(appId);if(!m||m.runtime!=='sandbox')throw new Error(`sandbox-app-required:${appId}`);return new URL(`runtime/app-frame.html#${encodeURIComponent(appId)}`,moduleBase).href}
function hasService(manifest,id){return manifest.capabilities.includes('*')||manifest.capabilities.includes(id)}
function appVfsPath(appId,path='.'){const V=globalThis.SuperApiUCOSVFS;if(!V)throw new Error('vfs-unavailable');const root=`/apps/data/${appId}`;const normalized=V.normalize(String(path||'.'));return normalized==='/'?root:V.normalize(`${root}/${normalized.slice(1)}`)}
function mapVfsArgs(appId,method,args){if(['stat','list','mkdir','readText','writeText','remove'].includes(method)){const out=[...args];out[0]=appVfsPath(appId,out[0]);return out}if(['copy','move'].includes(method))return[appVfsPath(appId,args[0]),appVfsPath(appId,args[1])];return args}
async function runAppWorkflow(appId,flow,input){const W=globalThis.SuperApiUCOSWorkflowCore;if(!W)throw new Error('workflow-core-unavailable');const engine=W.createEngine({executeCapability:req=>{const{signal,...cmd}=req;if(signal?.aborted)throw signal.reason||new DOMException('Aborted','AbortError');return broker.request({appId,...cmd})}});return engine.run(flow,{input})}
function attachSandbox(appId,container,{onReady,onCrash}={}){
 const manifest=manifests.get(appId);if(!manifest)throw new Error(`unknown-app:${appId}`);if(manifest.runtime!=='sandbox')throw new Error('app-is-not-sandboxed');
 const proc=processes.spawn(appId,{runtime:'sandbox'}),iframe=document.createElement('iframe');iframe.className='ucos-sandbox-app';iframe.setAttribute('sandbox','allow-scripts allow-forms allow-downloads');iframe.setAttribute('referrerpolicy','no-referrer');iframe.src=sandboxUrl(appId);iframe.title=manifest.name;container.appendChild(iframe);
 const channel=new MessageChannel();let ready=false;resources.own(proc.pid,channel.port1,{type:'ipc-port',cleanup:p=>p.close()});resources.own(proc.pid,iframe,{type:'iframe',cleanup:f=>f.remove()});
 channel.port1.onmessage=async e=>{const msg=e.data||{};if(msg.type==='ready'){ready=true;processes.setState(proc.pid,'running');onReady?.(proc);return}if(msg.type==='crash'){processes.setState(proc.pid,'crashed',msg.error||'app-crash');onCrash?.(msg);return}if(msg.type!=='request'||!msg.id)return;const reply={type:'response',id:msg.id};try{
   if(msg.service==='capability')reply.result=await broker.request({appId,capabilityId:msg.capabilityId,operation:msg.operation,args:msg.args,mode:msg.mode,targetNodeId:msg.targetNodeId});
   else if(msg.service==='vfs'){if(!hasService(manifest,'system.vfs'))throw new Error('vfs-service-not-declared');const V=globalThis.SuperApiUCOSVFS;if(!V)throw new Error('vfs-unavailable');const method=String(msg.method||'');if(!['stat','list','mkdir','readText','writeText','remove','copy','move','health'].includes(method))throw new Error('vfs-method-denied');if(method==='health')reply.result=V.health();else{await V.mkdir(`/apps/data/${appId}`,{recursive:true});reply.result=await V[method](...mapVfsArgs(appId,method,Array.isArray(msg.args)?msg.args:[]))}}
   else if(msg.service==='workflow'){if(!hasService(manifest,'system.workflow'))throw new Error('workflow-service-not-declared');if(msg.method!=='run')throw new Error('workflow-method-denied');reply.result=await runAppWorkflow(appId,msg.args?.[0],msg.args?.[1]||{})}
   else throw new Error('unknown-service');reply.ok=true
  }catch(err){reply.ok=false;reply.error=err?.message||String(err)}channel.port1.postMessage(reply)};
 const resolvedManifest={...manifest,entry:new URL(manifest.entry,moduleBase).href};iframe.addEventListener('load',()=>{iframe.contentWindow?.postMessage({type:'ucos:init',manifest:resolvedManifest},'*',[channel.port2]);setTimeout(()=>{if(!ready)processes.setState(proc.pid,'starting')},500)},{once:true});iframe.addEventListener('error',()=>{processes.setState(proc.pid,'crashed','iframe-load-error');onCrash?.({error:'iframe-load-error'})});events.emit('process-start',proc);return{...proc,iframe,close:()=>stopProcess(proc.pid,'closed')}
}
async function requestCapability(appId,capabilityId,options={}){return broker.request({appId,capabilityId,...options})}
const ready=(async()=>{await grants.clearSession();await restoreInstalled();try{await globalThis.SuperApiUCOSVFS?.init?.()}catch{}events.emit('ready',{apps:manifests.size()});return true})();
const api=Object.freeze({core:Core,manifests,grants,resources,processes,events,broker,ready,registerSystemApp,installManifest,uninstall,startSystemProcess,stopProcess,attachSandbox,requestCapability,resolvePermission,listProcesses:()=>processes.list(),health:()=>({apps:manifests.size(),processes:processes.size(),resources:resources.summary(),pendingPermissions:pendingPrompts.size})});globalThis.SuperApiUCOSRuntime=api;
})();
