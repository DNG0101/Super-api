(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const logBox = $('#log');
  const fmt = v => { try { return typeof v === 'string' ? v : JSON.stringify(v, (_k,x)=>typeof x==='bigint'?String(x):x, 2); } catch { return String(v); } };
  const log = (...xs) => { if (logBox) logBox.textContent = `[${new Date().toLocaleTimeString()}] ${xs.map(fmt).join(' ')}\n` + logBox.textContent; };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const timeout = (p, ms, label='Operation') => Promise.race([p, new Promise((_,rej)=>setTimeout(()=>rej(new Error(`${label} timed out`)), ms))]);
  const cfg = id => $(`#${id}`)?.value?.trim() || '';
  const send = (ch,payload) => { try { if (ch?.readyState === 'open') ch.send(JSON.stringify(payload)); } catch {} };
  const serialize = v => {
    if (v == null) return v;
    if (v instanceof Error) return {name:v.name,message:v.message};
    if (v instanceof Blob) return {blob:true,size:v.size,type:v.type};
    try { return JSON.parse(JSON.stringify(v,(_k,x)=>typeof x==='bigint'?String(x):x)); } catch { return String(v); }
  };

  let role = null;
  $('#hostBtn')?.addEventListener('click',()=>role='host');
  $('#controllerBtn')?.addEventListener('click',()=>role='controller');

  const D = new Map();
  const add = (id,label,fn,note='') => D.set(`ext:deep-${id}`,{id:`ext:deep-${id}`,label,fn,note});

  add('webgpu','WebGPU: request device + submit empty command buffer',async()=>{
    if(!navigator.gpu) throw new Error('WebGPU unavailable.');
    const adapter=await navigator.gpu.requestAdapter(); if(!adapter) throw new Error('No GPU adapter.');
    const device=await adapter.requestDevice();
    const encoder=device.createCommandEncoder(); const commands=encoder.finish(); device.queue.submit([commands]);
    await device.queue.onSubmittedWorkDone();
    return {deviceReady:true,features:[...device.features],maxTextureDimension2D:device.limits.maxTextureDimension2D};
  });

  add('webxr-inline','WebXR: start/end inline session',async()=>{
    if(!navigator.xr) throw new Error('WebXR unavailable.');
    if(!(await navigator.xr.isSessionSupported('inline'))) throw new Error('Inline XR session unsupported.');
    const s=await navigator.xr.requestSession('inline'); const mode=s.mode; await s.end(); return {started:true,mode,ended:true};
  });

  add('webauthn-create','WebAuthn: create a test public-key credential',async()=>{
    if(!navigator.credentials?.create || !globalThis.PublicKeyCredential) throw new Error('WebAuthn unavailable.');
    const challenge=crypto.getRandomValues(new Uint8Array(32)); const userId=crypto.getRandomValues(new Uint8Array(16));
    const c=await navigator.credentials.create({publicKey:{challenge,rp:{name:'Super API Peer Lab'},user:{id:userId,name:`super-api-${Date.now()}@example.invalid`,displayName:'Super API Test'},pubKeyCredParams:[{type:'public-key',alg:-7},{type:'public-key',alg:-257}],timeout:60000,attestation:'none',authenticatorSelection:{userVerification:'preferred'}}});
    return {created:!!c,type:c?.type,authenticatorAttachment:c?.authenticatorAttachment||null,idRedacted:true};
  },'May create a browser/platform test credential; native authenticator UI still applies.');

  add('webotp','WebOTP: wait briefly for an origin-bound SMS (code redacted)',async()=>{
    if(!globalThis.OTPCredential || !navigator.credentials?.get) throw new Error('WebOTP unavailable.');
    const ac=new AbortController(); setTimeout(()=>ac.abort(),15000);
    const cred=await navigator.credentials.get({otp:{transport:['sms']},signal:ac.signal});
    return {received:!!cred,codeRedacted:true};
  },'Never returns the OTP value to the controller.');

  add('file-read','File System: choose and read a file',async()=>{
    let file;
    if(globalThis.showOpenFilePicker){const [h]=await showOpenFilePicker();file=await h.getFile();}
    else {file=await new Promise((resolve,reject)=>{const i=document.createElement('input');i.type='file';i.onchange=()=>i.files?.[0]?resolve(i.files[0]):reject(new Error('No file selected'));i.click();});}
    const slice=file.slice(0,65536); let preview=null; try{preview=await slice.text();preview=preview.slice(0,1000);}catch{}
    return {name:file.name,size:file.size,type:file.type,lastModified:file.lastModified,preview};
  });

  add('directory-read','File System: choose directory and enumerate entries',async()=>{
    if(!globalThis.showDirectoryPicker) throw new Error('Directory picker unavailable.');
    const h=await showDirectoryPicker({mode:'read'}); const entries=[];
    for await (const [name,handle] of h.entries()){entries.push({name,kind:handle.kind});if(entries.length>=100)break;}
    return {directory:h.name,entries,count:entries.length,truncated:entries.length>=100};
  });

  add('bluetooth-connect','Web Bluetooth: choose device and connect GATT',async()=>{
    if(!navigator.bluetooth?.requestDevice) throw new Error('Web Bluetooth unavailable.');
    const device=await navigator.bluetooth.requestDevice({acceptAllDevices:true});
    if(!device.gatt) return {name:device.name,id:device.id,gatt:false};
    const server=await device.gatt.connect(); const result={name:device.name,id:device.id,connected:server.connected}; device.gatt.disconnect(); return result;
  });

  add('usb-open','WebUSB: choose device, open, inspect, close',async()=>{
    if(!navigator.usb?.requestDevice) throw new Error('WebUSB unavailable.');
    const d=await navigator.usb.requestDevice({filters:[]});
    await d.open();
    try{return {productName:d.productName,manufacturerName:d.manufacturerName,vendorId:d.vendorId,productId:d.productId,opened:d.opened,configurations:d.configurations?.map(c=>({configurationValue:c.configurationValue,interfaces:c.interfaces.length}))||[]};}
    finally{try{await d.close()}catch{}}
  });

  add('hid-open','WebHID: choose device, open, inspect, close',async()=>{
    if(!navigator.hid?.requestDevice) throw new Error('WebHID unavailable.');
    const list=await navigator.hid.requestDevice({filters:[]}); if(!list.length) throw new Error('No HID device selected.');
    const d=list[0]; await d.open();
    try{return {productName:d.productName,vendorId:d.vendorId,productId:d.productId,opened:d.opened,collections:d.collections?.map(c=>({usagePage:c.usagePage,usage:c.usage}))||[]};}
    finally{try{await d.close()}catch{}}
  });

  add('media-source','MediaSource: attach, open and close lifecycle',async()=>{
    if(!globalThis.MediaSource) throw new Error('MediaSource unavailable.');
    const video=document.createElement('video'); const ms=new MediaSource(); const url=URL.createObjectURL(ms); video.src=url;
    try{await timeout(new Promise((resolve,reject)=>{ms.addEventListener('sourceopen',resolve,{once:true});setTimeout(()=>reject(new Error('sourceopen timeout')),4000);}),4500,'MediaSource');if(ms.readyState==='open')ms.endOfStream();return {opened:true,readyState:ms.readyState};}
    finally{URL.revokeObjectURL(url);video.remove();}
  });

  add('webcodecs','WebCodecs: construct/clone/close VideoFrame',async()=>{
    if(!globalThis.VideoFrame) throw new Error('VideoFrame unavailable.');
    const c=document.createElement('canvas');c.width=32;c.height=32;const x=c.getContext('2d');x.fillRect(0,0,32,32);
    const bitmap=await createImageBitmap(c); const frame=new VideoFrame(bitmap,{timestamp:0}); const clone=frame.clone();
    const out={codedWidth:frame.codedWidth,codedHeight:frame.codedHeight,format:frame.format,duration:frame.duration}; clone.close();frame.close();bitmap.close();return out;
  });

  add('periodic-sync-register','Periodic Sync: register test tag',async()=>{
    const r=await navigator.serviceWorker.register('./sw.js'); if(!r.periodicSync) throw new Error('Periodic Sync unavailable.');
    const tag='super-api-periodic'; await r.periodicSync.register(tag,{minInterval:24*60*60*1000}); return {registered:tag,tags:await r.periodicSync.getTags()};
  });

  add('push-subscribe','Push: create subscription with configured VAPID public key',async()=>{
    const keyText=cfg('vapidKey'); if(!keyText) throw new Error('Enter a VAPID public key first.');
    const b64=keyText.replace(/-/g,'+').replace(/_/g,'/');const pad='='.repeat((4-b64.length%4)%4);const bytes=Uint8Array.from(atob(b64+pad),c=>c.charCodeAt(0));
    const r=await navigator.serviceWorker.register('./sw.js'); if(!r.pushManager) throw new Error('PushManager unavailable.');
    const sub=await r.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});
    return {subscribed:true,endpointRedacted:true,expirationTime:sub.expirationTime};
  },'Subscription endpoint and keys are deliberately not returned to the controller.');

  add('fedcm','FedCM: configured identity request (token redacted)',async()=>{
    const configURL=cfg('fedcmConfigUrl'), clientId=cfg('fedcmClientId'), nonce=cfg('fedcmNonce')||crypto.randomUUID?.()||String(Date.now());
    if(!configURL||!clientId) throw new Error('Enter FedCM config URL and client ID first.');
    const cred=await navigator.credentials.get({identity:{providers:[{configURL,clientId,nonce}]}});
    return {received:!!cred,type:cred?.type||null,tokenRedacted:true};
  },'A compatible identity provider is required; returned identity tokens are redacted.');

  add('presentation-start','Presentation: start configured presentation',async()=>{
    if(!globalThis.PresentationRequest) throw new Error('Presentation API unavailable.'); const url=cfg('presentationUrl')||location.href;
    const req=new PresentationRequest([url]); const conn=await req.start(); return {started:true,id:conn.id||null,url:conn.url||url,state:conn.state||null};
  });

  add('remote-playback-prompt','Remote Playback: open device prompt',async()=>{
    const media=$('#localVideo'); if(!media?.remote?.prompt) throw new Error('Remote Playback prompt unavailable.'); await media.remote.prompt(); return {state:media.remote.state};
  });

  add('credentials-prevent-silent','Credential Management: prevent silent access',async()=>{
    if(!navigator.credentials?.preventSilentAccess) throw new Error('preventSilentAccess unavailable.'); await navigator.credentials.preventSilentAccess(); return {completed:true};
  });

  add('screen-orientation-lock','Screen Orientation: lock then unlock',async()=>{
    if(!screen.orientation?.lock) throw new Error('Orientation lock unavailable.'); await screen.orientation.lock('portrait'); const locked=screen.orientation.type; await wait(250); screen.orientation.unlock(); return {lockedType:locked,unlocked:true};
  });

  add('service-worker-message','Service Worker: request ping/pong',async()=>{
    const r=await navigator.serviceWorker.register('./sw.js'); await navigator.serviceWorker.ready; const target=navigator.serviceWorker.controller||r.active; if(!target) throw new Error('No active service worker controller. Reload once if this is the first registration.');
    const ch=new MessageChannel(); const p=timeout(new Promise((resolve,reject)=>{ch.port1.onmessage=e=>resolve(e.data);ch.port1.onmessageerror=reject;}),3000,'Service worker reply'); target.postMessage({type:'super-api-ping',time:Date.now()},[ch.port2]); return p;
  });

  const oldHandle=window.SUPER_API_EXT_HANDLE;
  window.SUPER_API_EXT_HANDLE=async (channel,msg)=>{
    if(!msg?.action?.startsWith('ext:deep-')) return typeof oldHandle==='function' ? oldHandle(channel,msg) : undefined;
    if(role!=='host') return send(channel,{type:'error',action:msg.action,id:msg.id,error:'This peer is not in Controlled peer mode.'});
    if(!$('#allowRequests')?.checked) return send(channel,{type:'error',action:msg.action,id:msg.id,error:'Single session authorization is OFF on the controlled peer.'});
    const a=D.get(msg.action); if(!a) return send(channel,{type:'error',action:msg.action,id:msg.id,error:'Unknown deep action.'});
    try{log('Peer deep action:',a.label);const result=await a.fn();log(`${a.label} result:`,serialize(result));send(channel,{type:'result',action:msg.action,id:msg.id,result:serialize(result)});}
    catch(e){log(`${a.label} error:`,e?.message||String(e));send(channel,{type:'error',action:msg.action,id:msg.id,error:e?.message||String(e)});}
  };

  function addConfigFields(){
    const panel=$('#extPanel'); if(!panel||$('#deepConfig')) return;
    const div=document.createElement('div');div.id='deepConfig';div.className='grid';div.style.marginTop='10px';
    div.innerHTML=`
      <label>Push VAPID public key<input id="vapidKey" class="grow" placeholder="base64url public key"></label>
      <label>FedCM config URL<input id="fedcmConfigUrl" class="grow" placeholder="https://idp.example/config.json"></label>
      <label>FedCM client ID<input id="fedcmClientId" class="grow" placeholder="client-id"></label>
      <label>FedCM nonce<input id="fedcmNonce" class="grow" placeholder="optional"></label>`;
    panel.querySelector('p')?.after(div);
  }

  function addUI(){
    const s=$('#remoteAction'); if(s){const existing=new Set([...s.options].map(o=>o.value));for(const a of D.values())if(!existing.has(a.id)){const o=document.createElement('option');o.value=a.id;o.textContent=`SESSION • ${a.label}`;s.appendChild(o);}}
    const extPanel=$('#extPanel'); if(!extPanel||$('#deepActions')) return;
    const root=document.createElement('div');root.id='deepActions';root.className='cap-grid';root.style.marginTop='12px';
    for(const a of D.values()){
      const c=document.createElement('article');c.className='cap';c.innerHTML='<div class="category">Deep call</div><h3></h3><div class="meta"></div><div class="line"><span class="status ok">● callable</span><span class="policy safe">SESSION</span></div>';
      c.querySelector('h3').textContent=a.label;c.querySelector('.meta').textContent=a.note||'Exercises a deeper path of this Web API. Native browser UI may still be required.';
      const b=document.createElement('button');b.textContent='Deep test';b.onclick=async()=>{try{log('Local deep action:',a.label);const r=await a.fn();log(`${a.label} result:`,serialize(r));}catch(e){log(`${a.label} error:`,e?.message||String(e));}};c.appendChild(b);root.appendChild(c);
    }
    extPanel.appendChild(root);
  }

  addConfigFields(); addUI();
  setTimeout(()=>{addConfigFields();addUI();},200);
})();
