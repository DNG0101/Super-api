(()=>{
'use strict';
if(globalThis.SuperApiUCOSWorkflows)return;
const Core=globalThis.SuperApiUCOSWorkflowCore,UCOS=globalThis.SuperApiUCOS,Storage=globalThis.SuperApiUCOSStorage;
if(!Core||!UCOS){console.error('UCOS workflows require workflow core and fabric');return}
const running=new Map();
const engine=Core.createEngine({executeCapability:req=>{const {signal,...command}=req;if(signal?.aborted)throw signal.reason||new DOMException('Aborted','AbortError');return UCOS.execute(command)}});
async function save(flow){const v=Core.validate(flow);if(!v.valid)throw new Error(v.errors.join(','));await Storage?.set?.('workflows',flow.id,{...flow,updatedAt:Date.now()},{preferred:['indexeddb','opfs','local','memory']});return flow}
async function get(id){return Storage?.get?.('workflows',id,{preferred:['indexeddb','opfs','local','memory']})||null}
async function list(){const keys=await Storage?.list?.('workflows',{preferred:['indexeddb','opfs','local','memory']})||[];const rows=[];for(const k of keys){const f=await get(k);if(f)rows.push(f)}return rows.sort((a,b)=>String(a.name||a.id).localeCompare(String(b.name||b.id)))}
async function remove(id){return Storage?.delete?.('workflows',id,{preferred:['indexeddb','opfs','local','memory']})}
async function run(flowOrId,input={}){const flow=typeof flowOrId==='string'?await get(flowOrId):flowOrId;if(!flow)throw new Error('workflow-not-found');const runId=`run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`,controller=new AbortController();const row={runId,flowId:flow.id,state:'running',startedAt:Date.now(),controller};running.set(runId,row);try{const result=await engine.run(flow,{input,signal:controller.signal});row.state='success';row.finishedAt=Date.now();return{runId,flowId:flow.id,state:'success',result}}catch(e){row.state=controller.signal.aborted?'cancelled':'error';row.finishedAt=Date.now();row.error=e?.message||String(e);throw Object.assign(e,{runId})}finally{setTimeout(()=>running.delete(runId),60000)}}
function cancel(runId,reason='cancelled'){const r=running.get(runId);if(!r)return false;r.controller.abort(new DOMException(reason,'AbortError'));return true}
function health(){return{running:[...running.values()].map(({controller,...x})=>x)}}
const api=Object.freeze({core:Core,save,get,list,remove,run,cancel,health});globalThis.SuperApiUCOSWorkflows=api;
})();