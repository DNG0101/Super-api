(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const logBox = $('#log');
  const log = (...xs) => {
    const text = xs.map(v => typeof v === 'string' ? v : safe(v)).join(' ');
    if (logBox) logBox.textContent = `[${new Date().toLocaleTimeString()}] ${text}\n` + logBox.textContent;
  };
  const safe = value => { try { return JSON.stringify(value, (_k,v)=>typeof v==='bigint'?String(v):v, 2); } catch { return String(value); } };
  const timeout=(p,ms,label='Operation')=>Promise.race([p,new Promise((_,rej)=>setTimeout(()=>rej(new Error(`${label} timed out`)),ms))]);
  const state = new Map();
  let role = null;
  $('#hostBtn')?.addEventListener('click',()=>role='host');
  $('#controllerBtn')?.addEventListener('click',()=>role='controller');

  function membersOf(obj, maxDepth=6) {
    const seen=new Set(), out=[];
    let p=obj, depth=0;
    while(p && depth++<maxDepth){
      let keys=[]; try{keys=Reflect.ownKeys(p)}catch{break}
      for(const key of keys){
        const name=typeof key==='symbol'?key.toString():String(key);
        if(name==='constructor'||seen.has(name))continue;
        seen.add(name);
        let d; try{d=Object.getOwnPropertyDescriptor(p,key)}catch{}
        out.push({name,kind:typeof d?.value==='function'?'method':(d?.get||d?.set?'accessor':'property'),depth:depth-1});
      }
      try{p=Object.getPrototypeOf(p)}catch{break}
    }
    return out.sort((a,b)=>a.name.localeCompare(b.name));
  }
  const compact=(name,obj,extra={})=>({name,constructor:obj?.constructor?.name||null,members:obj?membersOf(obj):[],...extra});

  async function scanDedicatedWorker(){
    if(!globalThis.Worker) throw new Error('Dedicated Worker unavailable.');
    const src=`const m=o=>{const s=new Set(),r=[];let p=o,d=0;while(p&&d++<6){for(const k of Reflect.ownKeys(p)){const n=typeof k==='symbol'?k.toString():String(k);if(n==='constructor'||s.has(n))continue;s.add(n);let x;try{x=Object.getOwnPropertyDescriptor(p,k)}catch{}r.push({name:n,kind:typeof x?.value==='function'?'method':(x?.get||x?.set?'accessor':'property'),depth:d-1})}try{p=Object.getPrototypeOf(p)}catch{break}}return r.sort((a,b)=>a.name.localeCompare(b.name))};postMessage({realm:'DedicatedWorkerGlobalScope',constructor:self.constructor?.name||null,globals:Object.getOwnPropertyNames(self).sort(),members:m(self),navigator:m(navigator),performance:m(performance),crypto:m(crypto)});`;
    const url=URL.createObjectURL(new Blob([src],{type:'text/javascript'}));
    const w=new Worker(url);
    try{return await timeout(new Promise((resolve,reject)=>{w.onmessage=e=>resolve(e.data);w.onerror=e=>reject(e.error||new Error(e.message));}),5000,'Dedicated Worker scan');}
    finally{w.terminate();URL.revokeObjectURL(url);}
  }

  async function scanSharedWorker(){
    if(!globalThis.SharedWorker) throw new Error('SharedWorker unavailable.');
    const src=`const m=o=>{const s=new Set(),r=[];let p=o,d=0;while(p&&d++<6){for(const k of Reflect.ownKeys(p)){const n=typeof k==='symbol'?k.toString():String(k);if(n==='constructor'||s.has(n))continue;s.add(n);let x;try{x=Object.getOwnPropertyDescriptor(p,k)}catch{}r.push({name:n,kind:typeof x?.value==='function'?'method':(x?.get||x?.set?'accessor':'property'),depth:d-1})}try{p=Object.getPrototypeOf(p)}catch{break}}return r.sort((a,b)=>a.name.localeCompare(b.name))};onconnect=e=>{const p=e.ports[0];p.start();p.postMessage({realm:'SharedWorkerGlobalScope',constructor:self.constructor?.name||null,globals:Object.getOwnPropertyNames(self).sort(),members:m(self),navigator:m(navigator),performance:m(performance),crypto:m(crypto)})};`;
    const url=URL.createObjectURL(new Blob([src],{type:'text/javascript'}));
    const w=new SharedWorker(url); w.port.start();
    try{return await timeout(new Promise((resolve,reject)=>{w.port.onmessage=e=>resolve(e.data);w.port.onmessageerror=()=>reject(new Error('SharedWorker message error'));}),5000,'Shared Worker scan');}
    finally{try{w.port.close()}catch{} URL.revokeObjectURL(url);}
  }

  async function scanServiceWorker(){
    if(!navigator.serviceWorker) throw new Error('Service Worker unavailable.');
    const reg=await navigator.serviceWorker.register('./sw.js');
    await navigator.serviceWorker.ready;
    const target=navigator.serviceWorker.controller||reg.active;
    if(!target) throw new Error('No active service worker. Reload once after first registration.');
    const ch=new MessageChannel();
    const p=timeout(new Promise((resolve,reject)=>{ch.port1.onmessage=e=>resolve(e.data);ch.port1.onmessageerror=()=>reject(new Error('Service Worker message error'));}),5000,'Service Worker scan');
    target.postMessage({type:'super-api-realm-scan'},[ch.port2]);
    return p;
  }

  async function scanAudioWorklet(){
    const AC=globalThis.AudioContext||globalThis.webkitAudioContext;
    if(!AC) throw new Error('Web Audio unavailable.');
    const ctx=new AC();
    if(!ctx.audioWorklet?.addModule){await ctx.close();throw new Error('AudioWorklet unavailable.');}
    const name=`super-api-scan-${Date.now()}`;
    const src=`class P extends AudioWorkletProcessor{constructor(){super();const m=o=>{const s=new Set(),r=[];let p=o,d=0;while(p&&d++<5){for(const k of Reflect.ownKeys(p)){const n=typeof k==='symbol'?k.toString():String(k);if(n==='constructor'||s.has(n))continue;s.add(n);let x;try{x=Object.getOwnPropertyDescriptor(p,k)}catch{}r.push({name:n,kind:typeof x?.value==='function'?'method':(x?.get||x?.set?'accessor':'property')})}try{p=Object.getPrototypeOf(p)}catch{break}}return r};this.port.postMessage({realm:'AudioWorkletGlobalScope',globals:Object.getOwnPropertyNames(globalThis).sort(),processor:m(this),globalMembers:m(globalThis)});}process(){return false}}registerProcessor('${name}',P);`;
    const url=URL.createObjectURL(new Blob([src],{type:'text/javascript'}));
    try{
      await ctx.audioWorklet.addModule(url);
      const node=new AudioWorkletNode(ctx,name);
      return await timeout(new Promise((resolve,reject)=>{node.port.onmessage=e=>resolve(e.data);node.port.onmessageerror=()=>reject(new Error('AudioWorklet message error'));}),5000,'AudioWorklet scan');
    } finally { URL.revokeObjectURL(url); await ctx.close().catch(()=>{}); }
  }

  async function scanWebGL(){
    const canvas=document.createElement('canvas');
    const gl=canvas.getContext('webgl2')||canvas.getContext('webgl');
    if(!gl) throw new Error('WebGL unavailable.');
    const extensions=gl.getSupportedExtensions?.()||[];
    const extensionObjects=[];
    for(const name of extensions){
      try{const x=gl.getExtension(name); if(x) extensionObjects.push({name,constructor:x.constructor?.name||null,members:membersOf(x,4)});}catch{}
    }
    return {realm:gl instanceof WebGL2RenderingContext?'WebGL2':'WebGL',context:compact('context',gl),extensions,extensionObjects};
  }

  async function scanWebGPU(){
    if(!navigator.gpu) throw new Error('WebGPU unavailable.');
    const adapter=await navigator.gpu.requestAdapter();
    if(!adapter) throw new Error('No GPU adapter.');
    const device=await adapter.requestDevice();
    const encoder=device.createCommandEncoder();
    const buffer=device.createBuffer({size:16,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC});
    const texture=device.createTexture({size:[1,1,1],format:'rgba8unorm',usage:GPUTextureUsage.COPY_DST|GPUTextureUsage.TEXTURE_BINDING});
    const sampler=device.createSampler();
    const result={realm:'WebGPU',gpu:compact('GPU',navigator.gpu),adapter:compact('GPUAdapter',adapter,{features:[...adapter.features]}),device:compact('GPUDevice',device,{features:[...device.features]}),queue:compact('GPUQueue',device.queue),encoder:compact('GPUCommandEncoder',encoder),buffer:compact('GPUBuffer',buffer),texture:compact('GPUTexture',texture),sampler:compact('GPUSampler',sampler)};
    try{buffer.destroy()}catch{} try{texture.destroy()}catch{}
    return result;
  }

  async function scanWebRTC(){
    if(!globalThis.RTCPeerConnection) throw new Error('WebRTC unavailable.');
    const pc=new RTCPeerConnection();
    const dc=pc.createDataChannel('scan');
    try{
      const transceiver=pc.addTransceiver?.('audio');
      return {realm:'WebRTC',peerConnection:compact('RTCPeerConnection',pc),dataChannel:compact('RTCDataChannel',dc),sctp:pc.sctp?compact('RTCSctpTransport',pc.sctp):null,sender:transceiver?.sender?compact('RTCRtpSender',transceiver.sender):null,receiver:transceiver?.receiver?compact('RTCRtpReceiver',transceiver.receiver):null,transceiver:transceiver?compact('RTCRtpTransceiver',transceiver):null};
    } finally {try{dc.close()}catch{} try{pc.close()}catch{}}
  }

  async function scanMedia(){
    if(!navigator.mediaDevices?.getUserMedia) throw new Error('Media Capture unavailable.');
    const devices=await navigator.mediaDevices.enumerateDevices();
    let stream=null;
    try{
      stream=await navigator.mediaDevices.getUserMedia({audio:true,video:true});
      const tracks=stream.getTracks().map(t=>({kind:t.kind,track:compact('MediaStreamTrack',t),settings:t.getSettings?.()||{},capabilityKeys:Object.keys(t.getCapabilities?.()||{}),constraintKeys:Object.keys(t.getConstraints?.()||{})}));
      return {realm:'Media',mediaDevices:compact('MediaDevices',navigator.mediaDevices),deviceKinds:devices.map(d=>d.kind),stream:compact('MediaStream',stream),tracks};
    } finally {stream?.getTracks().forEach(t=>t.stop());}
  }

  async function scanStorageAndDB(){
    const result={realm:'Storage/DB'};
    if(globalThis.caches) result.cacheStorage=compact('CacheStorage',caches);
    if(navigator.storage) result.storageManager=compact('StorageManager',navigator.storage);
    if(globalThis.indexedDB){
      result.indexedDB=compact('IDBFactory',indexedDB);
      const name=`super-api-realm-${Date.now()}`;
      const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(name,1);r.onupgradeneeded=()=>r.result.createObjectStore('x');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
      result.database=compact('IDBDatabase',db);
      const tx=db.transaction('x','readwrite');result.transaction=compact('IDBTransaction',tx);result.objectStore=compact('IDBObjectStore',tx.objectStore('x'));
      await new Promise(res=>{tx.oncomplete=res;tx.onabort=res;tx.onerror=res;});db.close();indexedDB.deleteDatabase(name);
    }
    return result;
  }

  const scanners=new Map([
    ['dedicated-worker',{label:'Dedicated Worker realm',fn:scanDedicatedWorker}],
    ['shared-worker',{label:'Shared Worker realm',fn:scanSharedWorker}],
    ['service-worker',{label:'Service Worker realm',fn:scanServiceWorker}],
    ['audio-worklet',{label:'AudioWorklet realm',fn:scanAudioWorklet}],
    ['webgl',{label:'WebGL + extensions',fn:scanWebGL}],
    ['webgpu',{label:'WebGPU instantiated objects',fn:scanWebGPU}],
    ['webrtc',{label:'WebRTC instantiated objects',fn:scanWebRTC}],
    ['media',{label:'MediaStream instantiated objects',fn:scanMedia}],
    ['storage-db',{label:'Storage + IndexedDB objects',fn:scanStorageAndDB}]
  ]);

  async function runOne(id){
    const s=scanners.get(id);if(!s)throw new Error('Unknown scanner.');
    const started=performance.now();
    try{const data=await s.fn();const result={ok:true,label:s.label,durationMs:Math.round(performance.now()-started),data};state.set(id,result);render();return result;}
    catch(e){const result={ok:false,label:s.label,durationMs:Math.round(performance.now()-started),error:`${e?.name||'Error'}: ${e?.message||String(e)}`};state.set(id,result);render();return result;}
  }
  async function runAll(){for(const id of scanners.keys())await runOne(id);return summary();}
  function summary(){return [...state.entries()].map(([id,x])=>({id,label:x.label,ok:x.ok,durationMs:x.durationMs,error:x.error||null,memberCount:countMembers(x.data)}));}
  function countMembers(v){let n=0;const walk=x=>{if(!x||typeof x!=='object')return;if(Array.isArray(x)){for(const y of x)walk(y);return;}if(Array.isArray(x.members))n+=x.members.length;for(const [k,y] of Object.entries(x))if(k!=='members')walk(y)};walk(v);return n;}
  function exportAll(){const blob=new Blob([JSON.stringify({createdAt:new Date().toISOString(),summary:summary(),results:Object.fromEntries(state)},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`super-api-realms-${Date.now()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function render(){const root=$('#realmResults');if(!root)return;root.innerHTML='';for(const [id,s] of scanners){const r=state.get(id);const card=document.createElement('article');card.className='cap';card.innerHTML='<div class="category">Execution realm</div><h3></h3><div class="meta"></div><div class="line"><span class="status"></span><span class="policy safe">SCAN</span></div>';card.querySelector('h3').textContent=s.label;card.querySelector('.meta').textContent=r?(r.ok?`${countMembers(r.data)} reflected members • ${r.durationMs} ms`:r.error):'Not scanned yet';const st=card.querySelector('.status');st.textContent=r?(r.ok?'● scanned':'○ blocked/error'):'○ pending';st.classList.add(r?.ok?'ok':(r?'bad':'warn'));const b=document.createElement('button');b.textContent='Scan';b.onclick=async()=>{log('Realm scan:',s.label);const out=await runOne(id);log('Realm result:',out);};card.appendChild(b);root.appendChild(card);}$('#realmSummary').textContent=safe(summary());}
  function buildUI(){if($('#realmScannerPanel'))return;const panel=document.createElement('section');panel.id='realmScannerPanel';panel.className='panel';panel.innerHTML=`<h2>Worker / worklet / instantiated-object coverage</h2><p class="mini">Many Web APIs do not exist directly on Window. This scanner exercises DedicatedWorker, SharedWorker, ServiceWorker, AudioWorklet, WebGL extension objects, WebGPU, WebRTC, MediaStream, Storage and IndexedDB contexts, then reflects their real interfaces and methods.</p><div class="row"><button id="scanAllRealms" class="primary">Scan all realms</button><button id="exportRealms">Export realm JSON</button></div><pre id="realmSummary">No realm scans yet.</pre><div id="realmResults" class="cap-grid"></div>`;const runtime=$('#runtimeSurfacePanel');const media=$('#localVideo')?.closest('section.panel');if(runtime)runtime.before(panel);else if(media)media.before(panel);else document.querySelector('main')?.append(panel);$('#scanAllRealms').onclick=async()=>{log('Scanning all Web API realms…');const x=await runAll();log('All realm scans complete:',x);};$('#exportRealms').onclick=exportAll;render();}

  const previous=window.SUPER_API_EXT_HANDLE;
  window.SUPER_API_EXT_HANDLE=async(channel,msg)=>{
    if(msg?.action!=='ext:realm-scan')return typeof previous==='function'?previous(channel,msg):undefined;
    if(role!=='host')return channel.send(JSON.stringify({type:'error',action:msg.action,id:msg.id,error:'This peer is not in Controlled peer mode.'}));
    if(!$('#allowRequests')?.checked)return channel.send(JSON.stringify({type:'error',action:msg.action,id:msg.id,error:'Single session authorization is OFF on the controlled peer.'}));
    try{await runAll();channel.send(JSON.stringify({type:'result',action:msg.action,id:msg.id,result:summary()}));}
    catch(e){channel.send(JSON.stringify({type:'error',action:msg.action,id:msg.id,error:e?.message||String(e)}));}
  };
  function addRemote(){const s=$('#remoteAction');if(s&&![...s.options].some(o=>o.value==='ext:realm-scan')){const o=document.createElement('option');o.value='ext:realm-scan';o.textContent='SESSION • Scan worker/worklet/context API realms';s.appendChild(o);}}
  buildUI();addRemote();setTimeout(addRemote,500);
})();
