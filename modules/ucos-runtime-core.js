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
  return Object.freeze({
    schemaVersion:1,id:appId,name:text(input.name||appId),version:text(input.version||'0.0.0'),description:text(input.description),
    runtime,entry:text(input.entry),icon:text(input.icon),singleton:input.singleton!==false,
    capabilities,fileTypes:uniq(input.fileTypes),protocols:uniq(input.protocols),keywords:uniq(input.keywords),
    system:Boolean(input.system),metadata:clone(input.metadata||{})
  });
}
function validateManifest(input){try{const manifest=normalizeManifest(input);const errors=[];if(manifest.runtime==='sandbox'&&!manifest.entry)errors.push('sandbox-entry-required');return{valid:errors.length===0,errors,manifest}}catch(e){return{valid:false,errors:[e.message],manifest:null}}}
function createManifestRegistry(seed=[]){const map=new Map();const register=m=>{const n=normalizeManifest(m);map.set(n.id,n);return n};for(const x of seed)register(x);return Object.freeze({register,remove:id=>map.delete(id),get:id=>map.get(id)||null,has:id=>map.has(id),list:()=>[...map.values()],export:()=>[...map.values()].map(clone),size:()=>map.size})}
function createGrantStore(adapter=null){
  const memory=new Map();
  const key=(app,cap)=>`${app}::${cap}`;
  async function read(k){if(adapter?.get)return adapter.get(k);return memory.get(k)||null}
  async function write(k,v){if(adapter?.set)return adapter.set(k,v);memory.set(k,v);return true}
  async function del(k){if(adapter?.delete)return adapter.delete(k);return memory.delete(k)}
  return Object.freeze({
    async get(appId,capabilityId){return clone(await read(key(appId,capabilityId)))},
    async set(appId,capabilityId,{state='granted',scope='session',expiresAt=null,reason=''}={}){if(!['granted','denied','prompt'].includes(state))throw new Error('invalid-grant-state');if(!['once','session','persistent'].includes(scope))throw new Error('invalid-grant-scope');const row={appId:text(appId),capabilityId:text(capabilityId),state,scope,expiresAt:expiresAt==null?null:Number(expiresAt),reason:text(reason),updatedAt:Date.now()};await write(key(row.appId,row.capabilityId),row);return clone(row)},
    async revoke(appId,capabilityId){return del(key(appId,capabilityId))},
    async check(appId,capabilityId){const g=await read(key(appId,capabilityId));if(!g)return{state:'prompt',scope:'session'};if(g.expiresAt&&Date.now()>g.expiresAt){await del(key(appId,capabilityId));return{state:'prompt',scope:'session'}}return clone(g)},
    async clearSession(){if(adapter?.entries){for(const [k,v] of await adapter.entries())if(v?.scope==='session'||v?.scope==='once')await del(k)}else{for(const [k,v] of memory)if(v?.scope==='session'||v?.scope==='once')memory.delete(k)}return true}
  })
}
function createResourceManager(){
  const byOwner=new Map();
  function own(owner,resource,{type='resource',cleanup=null,metadata={}}={}){const rid=id('res');const row={id:rid,owner:text(owner),type:text(type),resource,cleanup:typeof cleanup==='function'?cleanup:null,metadata:clone(metadata),createdAt:Date.now()};if(!byOwner.has(row.owner))byOwner.set(row.owner,new Map());byOwner.get(row.owner).set(rid,row);return rid}
  async function release(owner,rid){const bucket=byOwner.get(text(owner));const row=bucket?.get(rid);if(!row)return false;bucket.delete(rid);try{await row.cleanup?.(row.resource)}catch{}if(!bucket.size)byOwner.delete(text(owner));return true}
  async function releaseOwner(owner){const bucket=byOwner.get(text(owner));if(!bucket)return 0;const ids=[...bucket.keys()];for(const rid of ids)await release(owner,rid);return ids.length}
  return Object.freeze({own,release,releaseOwner,list:owner=>[...(byOwner.get(text(owner))?.values()||[])].map(x=>({id:x.id,owner:x.owner,type:x.type,metadata:clone(x.metadata),createdAt:x.createdAt})),summary:()=>{let total=0;const owners={};for(const [k,v] of byOwner){owners[k]=v.size;total+=v.size}return{total,owners}}})
}
function createProcessManager(resources){
  const map=new Map();
  function spawn(appId,{runtime='system',metadata={}}={}){const pid=id('proc');const row={pid,appId:text(appId),runtime:text(runtime),state:'running',startedAt:Date.now(),updatedAt:Date.now(),metadata:clone(metadata),error:null};map.set(pid,row);return clone(row)}
  function setState(pid,state,error=null){const row=map.get(pid);if(!row)return null;row.state=state;row.updatedAt=Date.now();row.error=error?text(error):null;return clone(row)}
  async function terminate(pid,reason='terminated'){const row=map.get(pid);if(!row)return false;await resources?.releaseOwner?.(pid);row.state='terminated';row.updatedAt=Date.now();row.error=reason;map.delete(pid);return true}
  return Object.freeze({spawn,setState,terminate,get:pid=>clone(map.get(pid)||null),list:()=>[...map.values()].map(clone),size:()=>map.size})
}
function createCapabilityBroker({manifests,grants,execute,prompt}={}){
  if(!manifests||!grants||typeof execute!=='function')throw new Error('broker-dependencies-required');
  async function request({appId,capabilityId,operation='execute',args={},mode='auto',targetNodeId='',meta={}}={}){
    const manifest=manifests.get(appId);if(!manifest)throw new Error(`unknown-app:${appId}`);
    if(!manifest.capabilities.includes(capabilityId)&&!manifest.capabilities.includes('*'))throw new Error(`capability-not-declared:${capabilityId}`);
    let grant=await grants.check(appId,capabilityId);
    if(grant.state==='denied')throw new Error(`capability-denied:${capabilityId}`);
    if(grant.state!=='granted'){
      if(manifest.system){grant=await grants.set(appId,capabilityId,{state:'granted',scope:'session',reason:'system-app-declaration'})}
      else if(typeof prompt==='function'){
        const decision=await prompt({appId,manifest,capabilityId,operation});
        if(!decision||decision.state!=='granted'){await grants.set(appId,capabilityId,{state:'denied',scope:decision?.scope||'session',reason:decision?.reason||'user-denied'});throw new Error(`capability-denied:${capabilityId}`)}
        grant=await grants.set(appId,capabilityId,decision);
      } else throw new Error(`capability-grant-required:${capabilityId}`)
    }
    const result=await execute({capabilityId,operation,args,mode,targetNodeId,meta:{...meta,appId}});
    if(grant.scope==='once')await grants.revoke(appId,capabilityId);
    return result
  }
  return Object.freeze({request})
}
function createEventBus(){const target=new EventTarget();return Object.freeze({on(type,fn){target.addEventListener(type,fn);return()=>target.removeEventListener(type,fn)},emit(type,detail){target.dispatchEvent(new CustomEvent(type,{detail:clone(detail)}))}})}
return{clone,id,normalizeManifest,validateManifest,createManifestRegistry,createGrantStore,createResourceManager,createProcessManager,createCapabilityBroker,createEventBus};
});
