(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.SuperApiCapabilityCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';

const DOMAINS=Object.freeze([
  'web','realm','device','media','graphics','storage','network','wireless','external','protocol','auth','pwa','diagnostics'
]);
const STATUSES=Object.freeze(['available','unavailable','blocked','permission-required','external-required','error','unknown']);
const OPERATIONS=Object.freeze(['detect','inspect','read','write','call','construct','connect','stream','subscribe','publish','execute','test']);

const text=v=>String(v??'').trim();
const arr=v=>Array.isArray(v)?v:(v==null?[]:[v]);
const idPart=v=>text(v).toLowerCase().replace(/[^a-z0-9._:-]+/g,'-').replace(/^-+|-+$/g,'');
let commandSequence=0;

function safeClone(value,{maxDepth=10,maxEntries=1000}={}){
  const seen=new WeakSet();
  const walk=(v,depth)=>{
    if(depth>maxDepth)return '[MaxDepth]';
    if(v===null||typeof v==='string'||typeof v==='boolean')return v;
    if(typeof v==='number')return Number.isFinite(v)?v:String(v);
    if(typeof v==='bigint')return String(v);
    if(typeof v==='undefined')return null;
    if(typeof v==='symbol')return String(v);
    if(typeof v==='function')return `[Function ${v.name||'anonymous'}]`;
    if(typeof v!=='object')return String(v);
    if(seen.has(v))return '[Circular]';
    seen.add(v);
    if(v instanceof Date)return Number.isNaN(v.getTime())?'Invalid Date':v.toISOString();
    if(Array.isArray(v)){
      const out=v.slice(0,maxEntries).map(x=>walk(x,depth+1));
      if(v.length>maxEntries)out.push(`[Truncated ${v.length-maxEntries} items]`);
      return out;
    }
    const out={};let count=0;
    for(const key of Object.keys(v)){
      if(count++>=maxEntries){out.__truncated__=true;break;}
      try{out[key]=walk(v[key],depth+1)}catch(e){out[key]=`[Unserializable: ${e?.message||e}]`;}
    }
    return out;
  };
  return walk(value,0);
}
const clone=v=>safeClone(v);

function newCommandId(){
  try{
    if(globalThis.crypto?.randomUUID)return `cmd-${globalThis.crypto.randomUUID()}`;
  }catch{}
  commandSequence=(commandSequence+1)%Number.MAX_SAFE_INTEGER;
  return `cmd-${Date.now().toString(36)}-${commandSequence.toString(36)}-${Math.random().toString(36).slice(2,10)}`;
}
function capabilityId(domain,name){return `${idPart(domain)}:${idPart(name)}`;}

function normalizeCapability(input={}){
  const domain=DOMAINS.includes(input.domain)?input.domain:'web';
  const name=text(input.name||input.id||'unnamed');
  const id=text(input.id)||capabilityId(domain,name);
  const operations=[...new Set(arr(input.operations).map(idPart).filter(x=>OPERATIONS.includes(x)))];
  const dependencies=[...new Set(arr(input.dependencies).map(text).filter(Boolean))];
  const tags=[...new Set(arr(input.tags).map(idPart).filter(Boolean))];
  return Object.freeze({
    id,domain,name,label:text(input.label||name),description:text(input.description),operations,
    dependencies,tags,source:text(input.source||'runtime'),realm:text(input.realm||'Window'),
    secureContext:input.secureContext!==false,
    remoteAllowed:input.remoteAllowed!==false,
    sensitive:Boolean(input.sensitive),
    nativePermission:Boolean(input.nativePermission),
    externalRequirement:text(input.externalRequirement),
    metadata:clone(input.metadata||{})
  });
}

function createRegistry(seed=[]){
  const map=new Map();
  const register=x=>{const c=normalizeCapability(x);map.set(c.id,c);return c};
  const registerMany=xs=>arr(xs).map(register);
  registerMany(seed);
  return Object.freeze({
    register,registerMany,remove:id=>map.delete(id),get:id=>map.get(id)||null,has:id=>map.has(id),
    list:({domain,tag,realm,operation,query}={})=>[...map.values()].filter(c=>
      (!domain||c.domain===domain)&&(!tag||c.tags.includes(tag))&&(!realm||c.realm===realm)&&
      (!operation||c.operations.includes(operation))&&(!query||`${c.id} ${c.label} ${c.description} ${c.tags.join(' ')}`.toLowerCase().includes(String(query).toLowerCase()))
    ),
    size:()=>map.size,
    summary:()=>{const byDomain={},byRealm={},sensitive={yes:0,no:0};for(const c of map.values()){byDomain[c.domain]=(byDomain[c.domain]||0)+1;byRealm[c.realm]=(byRealm[c.realm]||0)+1;sensitive[c.sensitive?'yes':'no']++}return{total:map.size,byDomain,byRealm,sensitive}},
    export:()=>[...map.values()].map(clone)
  });
}

function evaluatePolicy(capability,context={}){
  const c=normalizeCapability(capability);
  const reasons=[];
  const remote=Boolean(context.remote);
  if(remote&&!context.sessionAuthorized)reasons.push('session-authorization-required');
  if(c.secureContext&&context.secureContext===false)reasons.push('secure-context-required');
  if(remote&&!c.remoteAllowed)reasons.push('remote-operation-not-allowed');
  if(c.externalRequirement&&!context.externalAvailable)reasons.push(`external-required:${c.externalRequirement}`);
  if(c.nativePermission&&!context.nativePermissionGranted)reasons.push('browser-or-os-permission-may-be-required');
  return {allowed:reasons.every(r=>r==='browser-or-os-permission-may-be-required'),reasons,advisory:reasons.filter(r=>r==='browser-or-os-permission-may-be-required')};
}

function validateCommand(command={}){
  const errors=[];
  if(!text(command.capabilityId))errors.push('capabilityId-required');
  if(!OPERATIONS.includes(text(command.operation)))errors.push('invalid-operation');
  if(command.args!=null&&!Array.isArray(command.args)&&typeof command.args!=='object')errors.push('args-must-be-array-or-object');
  return {valid:!errors.length,errors,command:{id:text(command.id)||newCommandId(),capabilityId:text(command.capabilityId),operation:text(command.operation),args:command.args??[],target:text(command.target),member:text(command.member),meta:clone(command.meta||{})}};
}

function buildExecutionPlan(capability,command,context={}){
  const c=normalizeCapability(capability);const v=validateCommand(command);const p=evaluatePolicy(c,context);
  const reasons=[...v.errors,...p.reasons.filter(x=>x!=='browser-or-os-permission-may-be-required')];
  if(v.valid&&c.operations.length&&!c.operations.includes(v.command.operation))reasons.push('operation-not-supported');
  return {ok:!reasons.length,capability:c,command:v.command,policy:p,reasons,steps:[
    'validate-command','resolve-capability','evaluate-session-policy',
    ...(c.dependencies.length?['resolve-dependencies']:[]),'resolve-adapter','execute','normalize-result','record-telemetry'
  ]};
}

function resultEnvelope({commandId,capabilityId,operation,status='available',result=null,error=null,durationMs=null,adapter=null,realm=null}={}){
  const s=STATUSES.includes(status)?status:(error?'error':'unknown');
  return {version:1,time:new Date().toISOString(),commandId:text(commandId),capabilityId:text(capabilityId),operation:text(operation),status:s,ok:s==='available'&&!error,result:result==null?null:clone(result),error:error?text(error):null,durationMs:Number.isFinite(Number(durationMs))?Number(durationMs):null,adapter:text(adapter),realm:text(realm)};
}

function dependencyOrder(items=[],{strict=false}={}){
  const nodes=new Map(arr(items).map(x=>[x.id,{...x,dependencies:arr(x.dependencies)}]));
  const temporary=new Set(),permanent=new Set(),out=[];
  function visit(id,trail=[]){
    if(permanent.has(id))return;
    if(temporary.has(id))throw new Error(`dependency-cycle:${[...trail,id].join('>')}`);
    const n=nodes.get(id);if(!n){if(strict)throw new Error(`dependency-missing:${id}`);return;}
    temporary.add(id);
    for(const d of n.dependencies){
      if(nodes.has(d))visit(d,[...trail,id]);
      else if(strict)throw new Error(`dependency-missing:${d}`);
    }
    temporary.delete(id);permanent.add(id);out.push(id);
  }
  for(const id of nodes.keys())visit(id);return out;
}

function compatibilityMatrix(capabilities=[],environments=[]){
  return arr(capabilities).flatMap(c=>arr(environments).map(e=>({
    capabilityId:c.id,environment:e.id||e.name||'environment',
    policy:evaluatePolicy(c,e),operations:c.operations||[]
  })));
}

function pairMatrix(valuesA=[],valuesB=[]){return arr(valuesA).flatMap(a=>arr(valuesB).map(b=>[a,b]));}

return {DOMAINS,STATUSES,OPERATIONS,capabilityId,normalizeCapability,createRegistry,evaluatePolicy,validateCommand,buildExecutionPlan,resultEnvelope,dependencyOrder,compatibilityMatrix,pairMatrix,safeClone,newCommandId};
});
