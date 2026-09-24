(()=>{
'use strict';
if(globalThis.SuperApiUCOSJobs)return;
const SUPPORTED_JOB_TYPES=new Set(['notify-clients']);
async function worker(){if(!('serviceWorker'in navigator))throw new Error('service-worker-unavailable');const reg=await navigator.serviceWorker.ready;const target=navigator.serviceWorker.controller||reg.active||reg.waiting;if(!target)throw new Error('service-worker-not-active');return{reg,target}}
async function call(message,timeout=5000){const{reg,target}=await worker();const channel=new MessageChannel();const result=new Promise((resolve,reject)=>{let settled=false;const finish=(fn,value)=>{if(settled)return;settled=true;clearTimeout(timer);try{channel.port1.close()}catch{}fn(value)};const timer=setTimeout(()=>finish(reject,new Error('service-worker-job-timeout')),timeout);channel.port1.onmessage=e=>e.data?.ok?finish(resolve,e.data):finish(reject,new Error(e.data?.error||'service-worker-job-failed'))});target.postMessage(message,[channel.port2]);return{reg,result}}
async function queue(job){if(!job||typeof job!=='object'||!SUPPORTED_JOB_TYPES.has(String(job.type||'')))throw new Error('unsupported-job-type');const id=String(job?.id||`job-${Date.now()}-${Math.random().toString(36).slice(2)}`);const{reg,result}=await call({type:'ucos:queue-job',job:{...job,id}});try{await reg.sync?.register?.('ucos-jobs')}catch{}await result;return{id,queued:true}}
async function drain(){const{result}=await call({type:'ucos:drain-jobs'});return result}
async function health(){try{const{reg}=await worker();return{available:true,controlled:Boolean(navigator.serviceWorker.controller),backgroundSync:Boolean(reg.sync),supportedJobTypes:[...SUPPORTED_JOB_TYPES]}}catch(e){return{available:false,error:e.message,supportedJobTypes:[...SUPPORTED_JOB_TYPES]}}}
const api=Object.freeze({queue,drain,health});globalThis.SuperApiUCOSJobs=api;
queueMicrotask(()=>drain().catch(()=>{}));
})();