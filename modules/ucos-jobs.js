(()=>{
'use strict';
if(globalThis.SuperApiUCOSJobs)return;
async function worker(){if(!('serviceWorker'in navigator))throw new Error('service-worker-unavailable');const reg=await navigator.serviceWorker.ready;const target=navigator.serviceWorker.controller||reg.active||reg.waiting;if(!target)throw new Error('service-worker-not-active');return{reg,target}}
async function call(message,timeout=5000){const{reg,target}=await worker();const channel=new MessageChannel();const result=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('service-worker-job-timeout')),timeout);channel.port1.onmessage=e=>{clearTimeout(timer);e.data?.ok?resolve(e.data):reject(new Error(e.data?.error||'service-worker-job-failed'))}});target.postMessage(message,[channel.port2]);return{reg,result}}
async function queue(job){const id=String(job?.id||`job-${Date.now()}-${Math.random().toString(36).slice(2)}`);const{reg,result}=await call({type:'ucos:queue-job',job:{...job,id}});try{await reg.sync?.register?.('ucos-jobs')}catch{}await result;return{id,queued:true}}
async function drain(){const{result}=await call({type:'ucos:drain-jobs'});return result}
async function health(){try{const{reg}=await worker();return{available:true,controlled:Boolean(navigator.serviceWorker.controller),backgroundSync:Boolean(reg.sync)}}catch(e){return{available:false,error:e.message}}}
globalThis.SuperApiUCOSJobs=Object.freeze({queue,drain,health});
})();