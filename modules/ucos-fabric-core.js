(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.SuperApiUCOSFabricCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';

const text=v=>String(v??'').trim();
const arr=v=>Array.isArray(v)?v:(v==null?[]:[v]);
const unique=v=>[...new Set(arr(v).filter(Boolean))];
const clone=value=>{
  const seen=new WeakSet();
  const walk=v=>{
    if(v==null||['string','number','boolean'].includes(typeof v))return v;
    if(typeof v==='bigint')return String(v);
    if(typeof v==='function')return `[Function ${v.name||'anonymous'}]`;
    if(typeof v!=='object')return String(v);
    if(seen.has(v))return '[Circular]';
    seen.add(v);
    if(Array.isArray(v))return v.map(walk);
    const out={};for(const [k,x] of Object.entries(v))out[k]=walk(x);return out;
  };
  return walk(value);
};
let sequence=0;
function id(prefix='id'){
  try{if(globalThis.crypto?.randomUUID)return `${prefix}-${globalThis.crypto.randomUUID()}`;}catch{}
  sequence=(sequence+1)%Number.MAX_SAFE_INTEGER;
  return `${prefix}-${Date.now().toString(36)}-${sequence.toString(36)}-${Math.random().toString(36).slice(2,9)}`;
}
function normalizeCapability(input={}){
  const capabilityId=text(input.id||input.capabilityId||input.name||'unknown');
  return Object.freeze({
    id:capabilityId,
    name:text(input.name||input.label||capabilityId),
    label:text(input.label||input.name||capabilityId),
    domain:text(input.domain||'web'),
    realm:text(input.realm||'Window'),
    operations:unique(input.operations),
    dependencies:unique(input.dependencies),
    tags:unique(input.tags),
    sensitive:Boolean(input.sensitive),
    secureContext:input.secureContext!==false,
    remoteAllowed:input.remoteAllowed!==false,
    nativePermission:Boolean(input.nativePermission),
    externalRequirement:text(input.externalRequirement),
    source:text(input.source||'fabric'),
    status:text(input.status||'unknown'),
    metadata:clone(input.metadata||{})
  });
}
function mergeCapability(a,b){
  if(!a)return normalizeCapability(b);
  if(!b)return normalizeCapability(a);
  const x=normalizeCapability(a),y=normalizeCapability(b);
  return normalizeCapability({
    ...x,...y,id:x.id||y.id,
    operations:unique([...x.operations,...y.operations]),
    dependencies:unique([...x.dependencies,...y.dependencies]),
    tags:unique([...x.tags,...y.tags]),
    metadata:{...x.metadata,...y.metadata},
    source:unique([x.source,y.source]).join('+'),
    status:y.status!=='unknown'?y.status:x.status
  });
}
function createCapabilityRegistry(seed=[]){
  const map=new Map();
  const register=input=>{const c=normalizeCapability(input);map.set(c.id,map.has(c.id)?mergeCapability(map.get(c.id),c):c);return map.get(c.id);};
  for(const item of seed)register(item);
  return Object.freeze({
    register,
    registerMany:items=>arr(items).map(register),
    get:key=>map.get(key)||null,
    has:key=>map.has(key),
    remove:key=>map.delete(key),
    list:filter=>{
      const f=filter||{};const q=text(f.query).toLowerCase();
      return [...map.values()].filter(c=>(!f.domain||c.domain===f.domain)&&(!f.operation||c.operations.includes(f.operation))&&(!q||`${c.id} ${c.label} ${c.domain} ${c.tags.join(' ')}`.toLowerCase().includes(q)));
    },
    size:()=>map.size,
    export:()=>[...map.values()].map(clone),
    summary:()=>{
      const byDomain={},byStatus={};
      for(const c of map.values()){byDomain[c.domain]=(byDomain[c.domain]||0)+1;byStatus[c.status]=(byStatus[c.status]||0)+1;}
      return{total:map.size,byDomain,byStatus};
    }
  });
}
function normalizeProvider(input={}){
  if(!text(input.id))throw new Error('provider-id-required');
  if(typeof input.execute!=='function')throw new Error(`provider-execute-required:${input.id}`);
  return Object.freeze({
    id:text(input.id),
    label:text(input.label||input.id),
    priority:Number.isFinite(Number(input.priority))?Number(input.priority):100,
    local:input.local!==false,
    remote:Boolean(input.remote),
    domains:unique(input.domains),
    capabilities:unique(input.capabilities),
    supports:typeof input.supports==='function'?input.supports:null,
    execute:input.execute,
    health:typeof input.health==='function'?input.health:null,
    metadata:clone(input.metadata||{})
  });
}
function createProviderRegistry(){
  const map=new Map();
  const register=p=>{const n=normalizeProvider(p);map.set(n.id,n);return n;};
  const list=()=>[...map.values()].sort((a,b)=>a.priority-b.priority||a.id.localeCompare(b.id));
  const supports=(provider,capability,operation,context={})=>{
    if(provider.capabilities.length&&!provider.capabilities.includes(capability.id))return false;
    if(provider.domains.length&&!provider.domains.includes(capability.domain))return false;
    if(provider.supports)return provider.supports(capability,operation,context)!==false;
    return !capability.operations.length||capability.operations.includes(operation);
  };
  return Object.freeze({register,remove:key=>map.delete(key),get:key=>map.get(key)||null,list,resolve:(capability,operation,context={})=>list().filter(p=>supports(p,capability,operation,context)),size:()=>map.size});
}
function normalizeTransport(input={}){
  if(!text(input.id))throw new Error('transport-id-required');
  if(typeof input.request!=='function')throw new Error(`transport-request-required:${input.id}`);
  return Object.freeze({
    id:text(input.id),label:text(input.label||input.id),priority:Number.isFinite(Number(input.priority))?Number(input.priority):100,
    kind:text(input.kind||'generic'),request:input.request,notify:typeof input.notify==='function'?input.notify:null,
    available:typeof input.available==='function'?input.available:()=>true,metadata:clone(input.metadata||{})
  });
}
function createTransportRegistry(){
  const map=new Map();
  const register=t=>{const n=normalizeTransport(t);map.set(n.id,n);return n;};
  const list=()=>[...map.values()].sort((a,b)=>a.priority-b.priority||a.id.localeCompare(b.id));
  return Object.freeze({register,remove:key=>map.delete(key),get:key=>map.get(key)||null,list,resolve:context=>list().filter(t=>{try{return t.available(context)!==false}catch{return false}}),size:()=>map.size});
}
function normalizeNode(input={}){
  const nodeId=text(input.id||input.nodeId)||id('node');
  return Object.freeze({
    id:nodeId,label:text(input.label||nodeId),kind:text(input.kind||'browser'),local:Boolean(input.local),online:input.online!==false,
    lastSeen:Number(input.lastSeen)||Date.now(),transportId:text(input.transportId),capabilities:unique(input.capabilities),
    capabilityDetails:arr(input.capabilityDetails).map(normalizeCapability),metadata:clone(input.metadata||{})
  });
}
function createNodeRegistry(localNode){
  const map=new Map();
  const upsert=n=>{const x=normalizeNode(n);map.set(x.id,x);return x;};
  if(localNode)upsert({...localNode,local:true});
  return Object.freeze({upsert,get:key=>map.get(key)||null,remove:key=>map.delete(key),list:()=>[...map.values()],export:()=>[...map.values()].map(clone),size:()=>map.size,prune:maxAge=>{const now=Date.now();for(const [key,n] of map)if(!n.local&&now-n.lastSeen>maxAge)map.delete(key);}});
}
function advertisement(node,capabilities=[]){
  const n=normalizeNode(node);const list=arr(capabilities).map(normalizeCapability);
  return{version:2,type:'ucos:advertise',node:{...n,capabilities:list.map(c=>c.id),capabilityDetails:list,lastSeen:Date.now()},capabilities:list};
}
function routeCandidates({capability,nodes=[],preferLocal=true,targetNodeId=null}={}){
  const c=normalizeCapability(capability);
  const out=[];
  for(const raw of nodes){
    const n=normalizeNode(raw);
    if(targetNodeId&&n.id!==targetNodeId)continue;
    const supports=n.capabilities.includes(c.id)||n.capabilityDetails.some(x=>x.id===c.id);
    if(!supports)continue;
    out.push({node:n,local:n.local,score:(n.local&&preferLocal?1000:0)+(n.online?100:0)+(n.transportId?10:0)});
  }
  return out.sort((a,b)=>b.score-a.score||a.node.id.localeCompare(b.node.id));
}
function executionEnvelope({requestId,capabilityId,operation,status='available',providerId='',transportId='',nodeId='',result=null,error=null,durationMs=null}={}){
  return{version:2,time:new Date().toISOString(),requestId:text(requestId),capabilityId:text(capabilityId),operation:text(operation),status:text(status),ok:status==='available'&&!error,providerId:text(providerId),transportId:text(transportId),nodeId:text(nodeId),durationMs:Number.isFinite(Number(durationMs))?Number(durationMs):null,result:result==null?null:clone(result),error:error?text(error):null};
}
function validateRequest(input={}){
  const errors=[];const capabilityId=text(input.capabilityId);const operation=text(input.operation||'execute');
  if(!capabilityId)errors.push('capabilityId-required');
  if(!operation)errors.push('operation-required');
  return{valid:!errors.length,errors,request:{id:text(input.id)||id('req'),capabilityId,operation,args:input.args??{},targetNodeId:text(input.targetNodeId),mode:text(input.mode||'auto'),meta:clone(input.meta||{})}};
}
return{clone,id,normalizeCapability,mergeCapability,createCapabilityRegistry,normalizeProvider,createProviderRegistry,normalizeTransport,createTransportRegistry,normalizeNode,createNodeRegistry,advertisement,routeCandidates,executionEnvelope,validateRequest};
});
