(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.SuperApiUCOSRuntimeCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const text=v=>String(v??'').trim();
const arr=v=>Array.isArray(v)?v:(v==null?[]:[v]);
const uniq=v=>[...new Set(arr(v).map(text).filter(Boolean))];
const clone=v=>{try{return structuredClone(v)}catch{try{return JSON.parse(JSON.stringify(v,(_k,x)=>typeof x==='bigint'?String(x):x))}catch{return String(v)}}};
let seq=0;
function id(prefix='id'){try{if(globalThis.crypto?.randomUUID)return `${prefix}-${globalThis.crypto.randomUUID()}`}catch{}return `${prefix}-${Date.now().toString(36)}-${(++seq).toString(36)}-${Math.random().toString(36).slice(2,8)}`}
function normalizeManifest(input={}){
  const appId=text(input.id||input.appId);
  if(!/^[a-z0-9][a-z0-9._-]{1,79}$/i.test(appId))throw new Error('invalid-app-id');
  const runtime=['system','sandbox'].includes(input.runtime)?input.runtime:'sandbox';
  const capabilities=uniq(input.capabilities);
  const lifecycle={suspendable:input.lifecycle?.suspendable!==false,restore:input.lifecycle?.restore!==false,autoRestart:Boolean(input.lifecycle?.autoRestart)};
  return Object.freeze({schemaVersion:2,id:appId,name:text(input.name||appId),version:text(input.version||'0.0.0'),description:text(input.description),runtime,entry:text(input.entry),icon:text(input.icon),singleton:input.singleton!==false,capabilities,fileTypes:uniq(input.fileTypes),protocols:uniq(input.protocols),keywords:uniq(input.keywords),system:Boolean(input.system),lifecycle:Object.freeze(lifecycle),metadata:clone(input.metadata||{})});
}
function validateManifest(input){try{const manifest=normalizeManifest(input),errors=[];if(manifest.runtime==='sandbox'&&!manifest.entry)errors.push('sandbox-entry-required');if(!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(manifest.version))errors.push('invalid-semver');return{valid:errors.length===0,errors,manifest}}catch(e){return{valid:false,errors:[e.message],manifest:null}}}
function createManifestRegistry(seed=[]){const map=new Map();const register=m=>{const n=normalizeManifest(m);map.set(n.id,n);return n};for(const x of seed)register(x);return Object.freeze({register,remove:id=>map.delete(id),get:id=>map.get(id)||null,has:id=>map.has(id),list:()=>[...map.values()],export:()=>[...map.values()].map(clone),size:()=>map.size})}
function createGrantStore(adapter=null){
  const memory=new Map(),key=(app,cap)=>`${app}::${cap}`;
  async function read(k){if(adapter?.get)return adapter.get(k);return memory.get(k)||null}
  async function write(k,v){if(adapter?.set)return adapter.set(k,v);memory.set(k,v);return true}
  async function del(k){if(adapter?.delete)return adapter.delete(k);return memory.delete(k)}
  async function entries(){if(adapter?.entries)return adapter.entries();return[...memory.entries()]}
  return Object.freeze({
    async get(appId,capabilityId){return clone(await read(key(appId,capabilityId)))},
    async set(appId,capabilityId,{state='granted',scope='session',expiresAt=null,reason=''}={}){if(!['granted','denied','prompt'].includes(state))throw new Error('invalid-grant-state');if(!['once','session','persistent'].includes(scope))throw new Error('invalid-grant-scope');const row={appId:text(appId),capabilityId:text(capabilityId),state,scope,expiresAt:expiresAt==null?null:Number(expiresAt),reason:text(reason),updatedAt:Date.now()};await write(key(row.appId,row.capabilityId),row);return clone(row)},
    async revoke(appId,capabilityId){return del(key(appId,capabilityId))},
    async revokeApp(appId){let n=0;for(const[k,v]of await entries())if(v?.appId===appId){await del(k);n++}return n},
    async check(appId,capabilityId){const g=await read(key(appId,capabilityId));if(!g)return{state:'prompt',scope:'session'};if(g.expiresAt&&Date.now()>g.expiresAt){await del(key(appId,capabilityId));return{state:'prompt',scope:'session'}}return clone(g)},
    async list(appId=''){return(await entries()).map(([,v])=>clone(v)).filter(v=>!appId||v?.appId===appId)},
    async clearSession(){for(const[k,v]of await entries())if(v?.scope==='session'||v?.scope==='once')await del(k);return true}
  })
}
function createResourceManager(){
  const byOwner=new Map();
  function own(owner,resource,{type='resource',cleanup=null,metadata={}}={}){const rid=id('res'),row={id:rid,owner:text(owner),type:text(type),resource,cleanup:typeof cleanup==='function'?cleanup:null,metadata:clone(metadata),createdAt:Date.now(),updatedAt:Date.now()};if(!byOwner.has(row.owner))byOwner.set(row.owner,new Map());byOwner.get(row.owner).set(rid,row);return rid}
  function touch(owner,rid,metadata=null){const row=byOwner.get(text(owner))?.get(rid);if(!row)return false;row.updatedAt=Date.now();if(metadata)row.metadata={...row.metadata,...clone(metadata)};return true}
  async function release(owner,rid){const bucket=byOwner.get(text(owner)),row=bucket?.get(rid);if(!row)return false;bucket.delete(rid);try{await row.cleanup?.(row.resource)}catch{}if(!bucket.size)byOwner.delete(text(owner));return true}
  async function releaseOwner(owner){const bucket=byOwner.get(text(owner));if(!bucket)return 0;const ids=[...bucket.keys()];for(const rid of ids)await release(owner,rid);return ids.length}
  return Object.freeze({own,touch,release,releaseOwner,list:owner=>[...(byOwner.get(text(owner))?.values()||[])].map(x=>({id:x.id,owner:x.owner,type:x.type,metadata:clone(x.metadata),createdAt:x.createdAt,updatedAt:x.updatedAt})),summary:()=>{let total=0;const owners={};for(const[k,v]of byOwner){owners[k]=v.size;total+=v.size}return{total,owners}}})
}
function createProcessManager(resources){
  const map=new Map(),history=[];const MAX_HISTORY=200;
  const TRANSITIONS=Object.freeze({starting:new Set(['starting','running','suspended','crashed']),running:new Set(['running','suspended','crashed']),suspended:new Set(['suspended','running','crashed']),crashed:new Set(['crashed'])});
  function snapshot(row){return clone(row||null)}
  function archive(row,reason){history.unshift({...clone(row),endedAt:Date.now(),endReason:text(reason)});if(history.length>MAX_HISTORY)history.length=MAX_HISTORY}
  function spawn(appId,{runtime='system',metadata={},state='running'}={}){const initial=['starting','running','suspended'].includes(state)?state:'running',now=Date.now(),pid=id('proc'),row={pid,appId:text(appId),runtime:text(runtime),state:initial,startedAt:now,updatedAt:now,heartbeatAt:now,suspendedAt:initial==='suspended'?now:null,restartCount:0,metadata:clone(metadata),error:null};map.set(pid,row);return snapshot(row)}
  function setState(pid,state,error=null){const row=map.get(pid),next=text(state);if(!row||!TRANSITIONS[row.state]?.has(next))return null;row.state=next;row.updatedAt=Date.now();row.error=error?text(error):null;if(next==='suspended')row.suspendedAt=Date.now();if(next==='running'||next==='starting')row.suspendedAt=null;return snapshot(row)}
  function heartbeat(pid,metadata=null){const row=map.get(pid);if(!row)return null;row.heartbeatAt=Date.now();row.updatedAt=row.heartbeatAt;if(metadata)row.metadata={...row.metadata,...clone(metadata)};return snapshot(row)}
  function suspend(pid,reason='suspended'){const row=map.get(pid);if(!row||!['running','starting'].includes(row.state))return null;return setState(pid,'suspended',reason)}
  function resume(pid){const row=map.get(pid);if(!row||row.state!=='suspended')return null;return setState(pid,'running',null)}
  function crash(pid,error='app-crash'){const row=map.get(pid);if(!row||row.state==='terminated')return null;return setState(pid,'crashed',error)}
  async function terminate(pid,reason='terminated'){const row=map.get(pid);if(!row)return false;await resources?.releaseOwner?.(pid);row.state='terminated';row.updatedAt=Date.now();row.error=reason;archive(row,reason);map.delete(pid);return true}
  function stale({olderThanMs=60000,states=['running','starting']}={}){const cutoff=Date.now()-Math.max(1000,Number(olderThanMs)||60000);return[...map.values()].filter(p=>states.includes(p.state)&&p.heartbeatAt<cutoff).map(snapshot)}
  return Object.freeze({spawn,setState,heartbeat,suspend,resume,crash,terminate,get:pid=>snapshot(map.get(pid)),findByApp:appId=>[...map.values()].filter(p=>p.appId===appId).map(snapshot),list:()=>[...map.values()].map(snapshot),history:()=>history.map(clone),stale,size:()=>map.size})
}
function createCapabilityBroker({manifests,grants,execute,prompt,authorize=null,finalize=null,audit=null}={}){
  if(!manifests||!grants||typeof execute!=='function')throw new Error('broker-dependencies-required');
  const log=(type,data,severity)=>{try{audit?.(type,data,severity)}catch{}};
  async function request({appId,capabilityId,operation='execute',args={},mode='auto',targetNodeId='',meta={}}={}){
    const manifest=manifests.get(appId);if(!manifest)throw new Error(`unknown-app:${appId}`);
    if(!manifest.capabilities.includes(capabilityId)&&!manifest.capabilities.includes('*')){log('capability-not-declared',{appId,capabilityId,operation},'warn');throw new Error(`capability-not-declared:${capabilityId}`)}
    let grant=await grants.check(appId,capabilityId);
    if(grant.state==='denied'){log('capability-denied',{appId,capabilityId,operation,reason:grant.reason},'warn');throw new Error(`capability-denied:${capabilityId}`)}
    if(grant.state!=='granted'){
      if(manifest.system){grant=await grants.set(appId,capabilityId,{state:'granted',scope:'session',reason:'system-app-declaration'})}
      else if(typeof prompt==='function'){
        const decision=await prompt({appId,manifest,capabilityId,operation,mode,targetNodeId,meta:clone(meta)});
        if(!decision||decision.state!=='granted'){await grants.set(appId,capabilityId,{state:'denied',scope:decision?.scope||'session',reason:decision?.reason||'user-denied'});log('capability-denied',{appId,capabilityId,operation,reason:decision?.reason||'user-denied'},'warn');throw new Error(`capability-denied:${capabilityId}`)}
        grant=await grants.set(appId,capabilityId,decision)
      } else throw new Error(`capability-grant-required:${capabilityId}`)
    }
    const auth=typeof authorize==='function'?await authorize({appId,capabilityId,operation,mode,targetNodeId,manifest,grant,meta:clone(meta)}):null;
    const command={capabilityId,operation,args,mode,targetNodeId,meta:{...meta,appId,...(auth?.id?{capabilityLeaseId:auth.id}:{})}};
    const started=Date.now();let result,error=null;
    try{result=await execute(command);log('capability-executed',{appId,capabilityId,operation,mode,targetNodeId,durationMs:Date.now()-started});return result}
    catch(e){error=e;log('capability-error',{appId,capabilityId,operation,mode,targetNodeId,error:e?.message||String(e),durationMs:Date.now()-started},'warn');throw e}
    finally{try{await finalize?.({auth,appId,capabilityId,operation,mode,targetNodeId,result,error,meta:clone(meta)})}catch{}if(grant.scope==='once')await grants.revoke(appId,capabilityId)}
  }
  return Object.freeze({request})
}
function createEventBus(){const target=new EventTarget();return Object.freeze({on(type,fn){target.addEventListener(type,fn);return()=>target.removeEventListener(type,fn)},emit(type,detail){target.dispatchEvent(new CustomEvent(type,{detail:clone(detail)}))}})}
return{clone,id,normalizeManifest,validateManifest,createManifestRegistry,createGrantStore,createResourceManager,createProcessManager,createCapabilityBroker,createEventBus};
});