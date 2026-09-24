(()=>{
'use strict';
const Runtime=globalThis.SuperApiUCOSRuntime,VFS=globalThis.SuperApiUCOSVFS,Flows=globalThis.SuperApiUCOSWorkflows,UCOS=globalThis.SuperApiUCOS;
if(!Runtime||!UCOS||globalThis.SuperApiUCOSV4)return;
const builtins=[
 {id:'home',name:'Home',system:true,runtime:'system',capabilities:[]},
 {id:'files',name:'Files',system:true,runtime:'system',capabilities:['action:file-open','action:directory','*']},
 {id:'devices',name:'Devices',system:true,runtime:'system',capabilities:['*']},
 {id:'network',name:'Network Center',system:true,runtime:'system',capabilities:['action:network','*']},
 {id:'capabilities',name:'Capability Center',system:true,runtime:'system',capabilities:['*']},
 {id:'camera',name:'Camera',system:true,runtime:'system',capabilities:['action:camera']},
 {id:'terminal',name:'Terminal',system:true,runtime:'system',capabilities:['*']},
 {id:'flows',name:'Flows',system:true,runtime:'system',capabilities:['*']},
 {id:'settings',name:'Settings',system:true,runtime:'system',capabilities:['*']},
 {id:'devlab',name:'Developer Lab',system:true,runtime:'system',capabilities:['*']},
 {id:'about',name:'About UCOS',system:true,runtime:'system',capabilities:[]}
];
for(const m of builtins)try{Runtime.registerSystemApp({...m,version:'4.0.0'})}catch{}

const windowPids=new WeakMap();
function syncWindows(){
 const root=document.querySelector('#ucosOS');if(!root)return;
 for(const w of root.querySelectorAll('.ucos-window')){
  if(windowPids.has(w))continue;
  const appId=w.dataset.appId||'unknown';if(!Runtime.manifests.has(appId))continue;
  const p=Runtime.startSystemProcess(appId,{windowInstance:w.dataset.instanceId||appId});windowPids.set(w,p.pid);
  const obs=new MutationObserver(()=>{if(!w.isConnected){obs.disconnect();Runtime.stopProcess(p.pid,'window-closed')}});
  obs.observe(document.documentElement,{childList:true,subtree:true});
 }
}
const shellObserver=new MutationObserver(syncWindows);shellObserver.observe(document.documentElement,{childList:true,subtree:true});syncWindows();

function ensureStyle(){
 if(document.querySelector('#ucosV4Style'))return;
 const s=document.createElement('style');s.id='ucosV4Style';s.textContent=`#ucosRuntimeTray{height:32px;border:1px solid transparent;background:transparent;border-radius:9px;color:#c8d8e8;padding:0 9px;cursor:pointer}#ucosRuntimeTray:hover{background:#ffffff0d;border-color:#ffffff16}.ucos-v4-modal{position:fixed;inset:0;z-index:200000;background:#0009;display:grid;place-items:center;padding:18px}.ucos-v4-card{width:min(760px,96vw);max-height:85vh;overflow:auto;background:#0b1724;color:#eef6ff;border:1px solid #42617f;border-radius:18px;box-shadow:0 24px 80px #000b;padding:16px;font:13px Inter,system-ui,sans-serif}.ucos-v4-card h2{margin:0 0 10px}.ucos-v4-card pre{white-space:pre-wrap;background:#050d15;border:1px solid #263d55;border-radius:10px;padding:10px;max-height:360px;overflow:auto}.ucos-v4-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:12px;flex-wrap:wrap}.ucos-v4-actions button{border:1px solid #36516d;background:#12263b;color:#eef6ff;border-radius:9px;padding:8px 11px;cursor:pointer}.ucos-v4-actions .primary{background:#173c66}`;document.head.appendChild(s)
}
function modal(title,body,actions=[]){
 ensureStyle();const wrap=document.createElement('div');wrap.className='ucos-v4-modal';wrap.innerHTML=`<div class="ucos-v4-card"><h2></h2><div class="body"></div><div class="ucos-v4-actions"></div></div>`;
 wrap.querySelector('h2').textContent=title;const b=wrap.querySelector('.body');if(typeof body==='string')b.innerHTML=body;else b.append(body);
 const bar=wrap.querySelector('.ucos-v4-actions');for(const a of actions){const btn=document.createElement('button');btn.textContent=a.label;btn.className=a.primary?'primary':'';btn.onclick=async()=>{try{await a.run?.()}finally{if(a.close!==false)wrap.remove()}};bar.append(btn)}
 document.body.append(wrap);wrap.addEventListener('pointerdown',e=>{if(e.target===wrap)wrap.remove()});return wrap
}
Runtime.events.on('permission-request',e=>{
 const d=e.detail,app=Runtime.manifests.get(d.appId),body=document.createElement('div');
 body.innerHTML=`<p><b></b> requests the UCOS capability:</p><pre></pre><p>This UCOS grant is separate from, and never bypasses, browser or operating-system permission prompts.</p>`;
 body.querySelector('b').textContent=app?.name||d.appId;body.querySelector('pre').textContent=d.capabilityId;
 modal('Capability permission',body,[
  {label:'Deny',run:()=>Runtime.resolvePermission(d.id,{state:'denied',scope:'session',reason:'user-denied'})},
  {label:'Allow once',run:()=>Runtime.resolvePermission(d.id,{state:'granted',scope:'once'}),primary:true},
  {label:'Allow this session',run:()=>Runtime.resolvePermission(d.id,{state:'granted',scope:'session'}),primary:true}
 ])
});

async function loadJobs(){
 if(globalThis.SuperApiUCOSJobs)return globalThis.SuperApiUCOSJobs;
 return new Promise(resolve=>{const existing=document.querySelector('script[data-super-api-ucos-jobs]');if(existing){existing.addEventListener('load',()=>resolve(globalThis.SuperApiUCOSJobs||null),{once:true});if(existing.dataset.superApiReady==='true')resolve(globalThis.SuperApiUCOSJobs||null);return}const s=document.createElement('script');s.src=new URL('./ucos-jobs.js',document.currentScript?.src||location.href).href;s.async=false;s.setAttribute('data-super-api-ucos-jobs','true');s.addEventListener('load',()=>{s.dataset.superApiReady='true';resolve(globalThis.SuperApiUCOSJobs||null)},{once:true});s.addEventListener('error',()=>resolve(null),{once:true});document.head.appendChild(s)})
}
const jobsReady=loadJobs();

async function showRuntimeCenter(){
 const jobs=await jobsReady;const health={runtime:Runtime.health(),fabric:UCOS.health(),vfs:VFS?.health?.()||null,workflows:Flows?.health?.()||null,jobs:await jobs?.health?.()||null,processes:Runtime.listProcesses(),apps:Runtime.manifests.export().map(x=>({id:x.id,name:x.name,runtime:x.runtime,system:x.system,capabilities:x.capabilities})),launch:launchState};
 const pre=document.createElement('pre');pre.textContent=JSON.stringify(health,null,2);
 modal('UCOS Runtime Center',pre,[{label:'Initialize VFS',run:()=>VFS?.init?.(),close:false},{label:'Drain jobs',run:()=>jobs?.drain?.(),close:false},{label:'Close'}])
}
function addTray(){const tray=document.querySelector('#ucosOS .ucos-tray');if(!tray||tray.querySelector('#ucosRuntimeTray'))return;const b=document.createElement('button');b.id='ucosRuntimeTray';b.title='UCOS Runtime Center';b.textContent='Runtime';b.onclick=showRuntimeCenter;tray.prepend(b)}
const trayObserver=new MutationObserver(addTray);trayObserver.observe(document.documentElement,{childList:true,subtree:true});addTray();

const launchState={shortcutApp:'',share:null,protocol:null,files:[]};
function clickApp(appId){
 const root=document.querySelector('#ucosOS');if(!root||!appId)return false;
 for(const el of root.querySelectorAll('[data-open-app]'))if(el.dataset.openApp===appId){el.click();return true}
 return false
}
function routeLaunchInputs(){
 const params=new URLSearchParams(location.search),requested=params.get('ucos_app');launchState.shortcutApp=requested||'';
 const share={title:params.get('share_title'),text:params.get('share_text'),url:params.get('share_url')};if(share.title||share.text||share.url){launchState.share=share;sessionStorage.setItem('ucos-launch-share',JSON.stringify(share))}
 const protocol=params.get('protocol');if(protocol){launchState.protocol=protocol;sessionStorage.setItem('ucos-launch-protocol',protocol)}
 if(requested){let attempts=0;const open=()=>{if(clickApp(requested))return;if(++attempts<20)setTimeout(open,100)};queueMicrotask(open)}
 if('launchQueue'in globalThis){try{launchQueue.setConsumer(params=>{launchState.files=[...(params.files||[])];globalThis.__UCOS_LAUNCH_FILES=launchState.files})}catch{}}
}
routeLaunchInputs();

const api=Object.freeze({version:'4.0',runtime:Runtime,vfs:VFS,workflows:Flows,jobsReady,launch:launchState,showRuntimeCenter,health:async()=>({runtime:Runtime.health(),vfs:VFS?.health?.(),workflows:Flows?.health?.(),jobs:await(await jobsReady)?.health?.()||null,launch:launchState})});
globalThis.SuperApiUCOSV4=api;
})();
