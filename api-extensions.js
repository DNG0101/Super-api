(() => {
  'use strict';

  const $ = s => document.querySelector(s);
  const logBox = $('#log');
  const log = (...xs) => {
    const fmt = v => {
      if (typeof v === 'string') return v;
      try { return JSON.stringify(v, (_k,x)=>typeof x === 'bigint' ? String(x) : x, 2); }
      catch { return String(v); }
    };
    if (logBox) logBox.textContent = `[${new Date().toLocaleTimeString()}] ${xs.map(fmt).join(' ')}\n` + logBox.textContent;
  };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const timed = (p, ms, label='Operation') => Promise.race([p, new Promise((_,rej)=>setTimeout(()=>rej(new Error(`${label} timed out`)),ms))]);

  let extRole = null;
  $('#hostBtn')?.addEventListener('click', () => { extRole = 'host'; });
  $('#controllerBtn')?.addEventListener('click', () => { extRole = 'controller'; });

  const EXT = new Map();
  const ext = (id, label, fn, note='') => EXT.set(`ext:${id}`, {id:`ext:${id}`, label, fn, note});
  const ensureSW = async () => {
    if (!('serviceWorker' in navigator)) throw new Error('Service Worker unavailable.');
    return navigator.serviceWorker.register('./sw.js');
  };
  const serial = v => {
    if (v == null) return v;
    if (v instanceof Blob) return {blob:true,type:v.type,size:v.size};
    if (v instanceof Response) return {response:true,status:v.status,type:v.type,url:v.url};
    if (v instanceof Error) return {name:v.name,message:v.message};
    try { return JSON.parse(JSON.stringify(v,(_k,x)=>typeof x==='bigint'?String(x):x)); }
    catch { return String(v); }
  };
  const cfg = id => $(`#${id}`)?.value?.trim() || '';

  // ---- APIs that were previously detection-only ----
  ext('background-fetch','Background Fetch: start same-origin test', async()=>{
    const r=await ensureSW();
    if(!r.backgroundFetch?.fetch) throw new Error('Background Fetch is not exposed on this service-worker registration.');
    const id=`super-api-bg-${Date.now()}`;
    const reg=await r.backgroundFetch.fetch(id,['./index.html'],{title:'Super API background fetch',downloadTotal:0});
    return {id:reg.id,result:reg.result,failureReason:reg.failureReason,downloaded:reg.downloaded,total:reg.downloadTotal};
  });

  ext('css-paint','CSS Painting: register paint worklet', async()=>{
    if(!CSS?.paintWorklet?.addModule) throw new Error('CSS Paint Worklet unavailable.');
    const name=`super-api-paint-${Date.now()}`;
    const source=`registerPaint('${name}',class{paint(ctx,g){ctx.fillStyle='#2463eb';ctx.fillRect(0,0,g.width,g.height)}})`;
    const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
    try { await CSS.paintWorklet.addModule(url); return {registered:name}; }
    finally { URL.revokeObjectURL(url); }
  });

  ext('content-index','Content Index: add/get/delete test entry', async()=>{
    const r=await ensureSW();
    if(!r.index) throw new Error('Content Index API unavailable on registration.');
    const id=`super-api-${Date.now()}`;
    await r.index.add({id,title:'Super API test',description:'Temporary capability test',url:'./',category:'homepage'});
    const all=await r.index.getAll();
    await r.index.delete(id);
    return {added:id,countBeforeDelete:all.length,deleted:true};
  });

  ext('eme','Encrypted Media Extensions: ClearKey access test', async()=>{
    if(!navigator.requestMediaKeySystemAccess) throw new Error('Encrypted Media Extensions unavailable.');
    const configs=[{initDataTypes:['keyids','cenc'],videoCapabilities:[{contentType:'video/mp4; codecs="avc1.42E01E"'}],persistentState:'optional',distinctiveIdentifier:'optional'}];
    const access=await navigator.requestMediaKeySystemAccess('org.w3.clearkey',configs);
    const config=access.getConfiguration();
    const keys=await access.createMediaKeys();
    return {keySystem:access.keySystem,configuration:config,mediaKeys:!!keys};
  });

  ext('fenced-frame','Fenced Frame: create/remove element', async()=>{
    const el=document.createElement('fencedframe');
    el.style.cssText='position:fixed;left:-9999px;width:1px;height:1px';
    document.body.appendChild(el);
    const out={constructor:el.constructor?.name,connected:el.isConnected,hasConfig:'config' in el};
    el.remove();
    return out;
  });

  ext('file-entries','File and Directory Entries: entry conversion test', async()=>{
    if(!DataTransferItem?.prototype?.webkitGetAsEntry) throw new Error('webkitGetAsEntry unavailable.');
    const dt=new DataTransfer();
    dt.items.add(new File(['Super API'],'super-api.txt',{type:'text/plain'}));
    const item=dt.items[0];
    const entry=item.webkitGetAsEntry();
    return {kind:item.kind,type:item.type,entry:entry?{name:entry.name,isFile:entry.isFile,isDirectory:entry.isDirectory}:null};
  });

  ext('force-touch','Force Touch: listen for a force event', async()=>{
    if(!('onwebkitmouseforcechanged' in window) && !globalThis.WebKitMouseForceEvent) throw new Error('Force Touch event surface unavailable.');
    return timed(new Promise(resolve=>{
      const done=e=>resolve({type:e.type,webkitForce:e.webkitForce??null});
      addEventListener('webkitmouseforcechanged',done,{once:true});
    }),3500,'Force Touch event');
  });

  ext('houdini','Houdini: Properties/Typed OM/Paint surface call', async()=>{
    const result={registerProperty:!!CSS?.registerProperty,paintWorklet:!!CSS?.paintWorklet,typedOM:!!globalThis.CSSStyleValue};
    if(CSS?.registerProperty){const name=`--super-api-h-${Date.now()}`;CSS.registerProperty({name,syntax:'<number>',inherits:false,initialValue:'0'});result.registered=name;}
    return result;
  });

  ext('invoker','Invoker Commands: create command/popover interaction', async()=>{
    if(!('command' in HTMLButtonElement.prototype) && !('commandForElement' in HTMLButtonElement.prototype)) throw new Error('Invoker Commands unavailable.');
    const pop=document.createElement('div'); pop.popover='manual'; pop.id=`super-api-pop-${Date.now()}`; pop.textContent='Invoker test';
    const btn=document.createElement('button'); btn.textContent='Invoke';
    document.body.append(pop,btn);
    if('commandForElement' in btn){btn.commandForElement=pop;btn.command='show-popover';} else {btn.setAttribute('commandfor',pop.id);btn.setAttribute('command','show-popover');}
    btn.click(); await sleep(50);
    const opened=pop.matches?.(':popover-open')||false;
    try{pop.hidePopover?.()}catch{} btn.remove();pop.remove();
    return {opened};
  });

  ext('self-profiler','JS Self-Profiling: short profile', async()=>{
    if(!globalThis.Profiler) throw new Error('Profiler unavailable.');
    const p=new Profiler({sampleInterval:10,maxBufferSize:1_000_000});
    const until=performance.now()+80; while(performance.now()<until){Math.sqrt(Math.random()*10000);}
    const trace=await p.stop();
    return {traceType:trace?.constructor?.name,samples:trace?.samples?.length??null,resources:trace?.resources?.length??null};
  });

  ext('launch-handler','Launch Handler: register launch consumer', async()=>{
    if(!globalThis.launchQueue?.setConsumer) throw new Error('Launch Handler API unavailable.');
    let received=null;
    launchQueue.setConsumer(params=>{received={targetURL:params.targetURL,files:params.files?.length||0};});
    return {consumerRegistered:true,received};
  });

  ext('presentation','Presentation API: availability query', async()=>{
    if(!globalThis.PresentationRequest) throw new Error('Presentation API unavailable.');
    const url=cfg('presentationUrl')||location.href;
    const request=new PresentationRequest([url]);
    const availability=await request.getAvailability?.();
    return {url,availability:availability?availability.value:null,startAvailable:typeof request.start==='function'};
  });

  ext('private-token','Private State Token: construct request options', async()=>{
    if(!('privateToken' in Request.prototype) && !globalThis.PrivateToken) throw new Error('Private State Token surface unavailable.');
    let request=null,error=null;
    try { request=new Request(location.href,{privateToken:{version:1,operation:'token-request'}}); }
    catch(e){error=e.message;}
    return {surface:true,requestConstructed:!!request,error,note:'A real token operation requires a compatible issuer/redemption server.'};
  });

  ext('push','Push API: permission/subscription state', async()=>{
    const r=await ensureSW();
    if(!r.pushManager) throw new Error('PushManager unavailable.');
    const sub=await r.pushManager.getSubscription();
    const permission=globalThis.Notification?.permission ?? null;
    return {permission,subscription:sub?{endpoint:sub.endpoint,expirationTime:sub.expirationTime,hasP256dh:!!sub.getKey('p256dh'),hasAuth:!!sub.getKey('auth')}:null,note:'Creating a new usable push subscription requires an application-server/VAPID key and push backend.'};
  });

  ext('remote-playback','Remote Playback: availability/state test', async()=>{
    const media=$('#localVideo');
    if(!media?.remote) throw new Error('Remote Playback API unavailable.');
    let availability=null;
    try { const id=await media.remote.watchAvailability(v=>{availability=v;}); await sleep(200); media.remote.cancelWatchAvailability?.(id); } catch {}
    return {state:media.remote.state,availability,promptAvailable:typeof media.remote.prompt==='function'};
  });

  ext('sse-live','Server-Sent Events: connect to configured endpoint', async()=>{
    const url=cfg('sseUrl'); if(!url) throw new Error('Enter an SSE endpoint first.');
    const es=new EventSource(url);
    try{return await timed(new Promise((resolve,reject)=>{es.onopen=()=>resolve({opened:true,url});es.onerror=()=>reject(new Error('SSE connection failed.'));}),5000,'SSE connection');}
    finally{es.close();}
  });

  ext('shared-storage','Shared Storage: set/append test', async()=>{
    const ss=globalThis.sharedStorage || window.sharedStorage;
    if(!ss) throw new Error('Shared Storage unavailable.');
    const key=`super-api-${Date.now()}`;
    await ss.set?.(key,'a');
    await ss.append?.(key,'b');
    return {key,setCalled:typeof ss.set==='function',appendCalled:typeof ss.append==='function',worklet:!!ss.worklet};
  });

  ext('topics','Topics API: browsingTopics call', async()=>{
    if(typeof document.browsingTopics!=='function') throw new Error('Browsing Topics API unavailable.');
    const topics=await document.browsingTopics({skipObservation:true});
    return {count:topics.length,topics};
  });

  ext('fragment-directive','Text Fragment: inspect/navigate/restore', async()=>{
    const before=location.href;
    const supported='fragmentDirective' in document;
    history.replaceState(history.state,'',`${location.pathname}${location.search}#:~:text=Super%20API`);
    await Promise.resolve();
    const now=location.href;
    history.replaceState(history.state,'',before);
    return {supported,navigated:now,restored:location.href};
  });

  ext('viewport-segments','Viewport Segments: CSS env probe', async()=>{
    const e=document.createElement('div');
    e.style.cssText='position:fixed;left:-9999px;top:env(viewport-segment-top 0 0, -1px);width:env(viewport-segment-width 0 0, -1px)';
    document.body.appendChild(e); const c=getComputedStyle(e); const out={top:c.top,width:c.width,cssSupports:CSS.supports?.('top: env(viewport-segment-top 0 0)')??false}; e.remove(); return out;
  });

  ext('periodic-sync','Periodic Background Sync: list registered tags', async()=>{
    const r=await ensureSW(); if(!r.periodicSync) throw new Error('Periodic Background Sync unavailable.');
    return {tags:await r.periodicSync.getTags(),permission:await navigator.permissions?.query?.({name:'periodic-background-sync'}).then(x=>x.state).catch(()=>null)};
  });

  ext('payment-handler','Payment Handler: registration state', async()=>{
    const r=await ensureSW(); const pm=r.paymentManager;
    if(!pm) throw new Error('PaymentManager unavailable on service-worker registration.');
    let keys=null; try{keys=await pm.instruments?.keys?.()}catch{}
    return {paymentManager:true,userHint:pm.userHint??null,instrumentKeys:keys};
  });

  ext('webvr','WebVR: enumerate legacy displays', async()=>{
    if(!navigator.getVRDisplays) throw new Error('Legacy WebVR unavailable.');
    const displays=await navigator.getVRDisplays();
    return displays.map(d=>({displayId:d.displayId,displayName:d.displayName,isConnected:d.isConnected,isPresenting:d.isPresenting}));
  });

  // ---- Live/network tests replacing surface-only checks ----
  ext('websocket-live','WebSocket: connect to configured endpoint', async()=>{
    const url=cfg('websocketUrl'); if(!url) throw new Error('Enter a ws:// or wss:// endpoint first.');
    const ws=new WebSocket(url);
    try{return await timed(new Promise((resolve,reject)=>{ws.onopen=()=>resolve({opened:true,protocol:ws.protocol,extensions:ws.extensions,url});ws.onerror=()=>reject(new Error('WebSocket connection failed.'));}),5000,'WebSocket connection');}
    finally{try{ws.close(1000,'Super API test complete')}catch{}}
  });

  ext('webtransport-live','WebTransport: connect to configured HTTP/3 endpoint', async()=>{
    const url=cfg('webtransportUrl'); if(!url) throw new Error('Enter a WebTransport HTTPS endpoint first.');
    if(!globalThis.WebTransport) throw new Error('WebTransport unavailable.');
    const t=new WebTransport(url);
    try{await timed(t.ready,7000,'WebTransport ready');return {ready:true,url,datagrams:!!t.datagrams,bidirectional:!!t.createBidirectionalStream};}
    finally{try{await t.close?.()}catch{}}
  });

  // ---- Supplemental practical browser calls not represented as separate MDN index rows ----
  ext('shared-worker','SharedWorker: message round-trip', async()=>{
    if(!globalThis.SharedWorker) throw new Error('SharedWorker unavailable.');
    const src=`onconnect=e=>{const p=e.ports[0];p.onmessage=x=>p.postMessage({echo:x.data,time:Date.now()});p.start()}`;
    const url=URL.createObjectURL(new Blob([src],{type:'text/javascript'}));
    try{const w=new SharedWorker(url);w.port.start();const out=await timed(new Promise((resolve,reject)=>{w.port.onmessage=e=>resolve(e.data);w.port.onmessageerror=reject;w.port.postMessage('super-api');}),2000,'SharedWorker');w.port.close();return out;}
    finally{URL.revokeObjectURL(url);}
  });

  ext('cache-storage','Cache Storage: put/match/delete round-trip', async()=>{
    const name=`super-api-ext-${Date.now()}`; const c=await caches.open(name); const key=`./?ext-cache=${Date.now()}`;
    await c.put(key,new Response('ok',{headers:{'content-type':'text/plain'}})); const text=await (await c.match(key)).text(); await caches.delete(name); return {text,deleted:true};
  });

  ext('opfs','OPFS: write/read/delete round-trip', async()=>{
    if(!navigator.storage?.getDirectory) throw new Error('Origin Private File System unavailable.');
    const root=await navigator.storage.getDirectory(); const name=`super-api-${Date.now()}.txt`; const h=await root.getFileHandle(name,{create:true}); const w=await h.createWritable(); await w.write('Super API OPFS'); await w.close(); const text=await (await h.getFile()).text(); await root.removeEntry(name); return {name,text,deleted:true};
  });

  ext('media-devices','MediaDevices: enumerate devices/constraints', async()=>{
    if(!navigator.mediaDevices) throw new Error('MediaDevices unavailable.');
    const devices=await navigator.mediaDevices.enumerateDevices();
    return {supportedConstraints:navigator.mediaDevices.getSupportedConstraints?.(),devices:devices.map(d=>({kind:d.kind,label:d.label,deviceId:d.deviceId,groupId:d.groupId}))};
  });

  ext('speech-recognition','Speech Recognition: one short result', async()=>{
    const R=globalThis.SpeechRecognition||globalThis.webkitSpeechRecognition; if(!R) throw new Error('Speech Recognition unavailable.');
    const r=new R(); r.continuous=false;r.interimResults=false;r.maxAlternatives=1;
    return timed(new Promise((resolve,reject)=>{r.onresult=e=>{const x=e.results[0]?.[0];resolve({transcript:x?.transcript,confidence:x?.confidence});};r.onerror=e=>reject(new Error(e.error||'Speech recognition failed'));r.start();}),10000,'Speech recognition');
  });

  ext('permissions-policy','Permissions Policy: allowed feature list', async()=>{
    const p=document.permissionsPolicy||document.featurePolicy;
    if(!p) throw new Error('Permissions Policy/Feature Policy introspection unavailable.');
    const features=p.allowedFeatures?.()||p.features?.()||[];
    return {features,allowsCamera:p.allowsFeature?.('camera'),allowsMicrophone:p.allowsFeature?.('microphone'),allowsGeolocation:p.allowsFeature?.('geolocation')};
  });

  ext('camera-photo','Camera: capture still-photo metadata', async()=>{
    const s=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
    try{const t=s.getVideoTracks()[0];if(globalThis.ImageCapture){const b=await new ImageCapture(t).takePhoto();return {size:b.size,type:b.type,label:t.label};}return {label:t.label,note:'ImageCapture.takePhoto unavailable; camera stream acquired successfully.'};}
    finally{s.getTracks().forEach(t=>t.stop());}
  });

  ext('torch-off','Camera: turn torch OFF on active preview', async()=>{
    const v=$('#localVideo');const s=v?.srcObject;if(!s) throw new Error('No active local camera stream.');const t=s.getVideoTracks?.()[0];if(!t) throw new Error('No active video track.');await t.applyConstraints({advanced:[{torch:false}]});return {torch:false,label:t.label};
  });

  const CATALOG_EXT = new Map([
    ['Background Fetch API','ext:background-fetch'],
    ['CSS Painting API','ext:css-paint'],
    ['Content Index API','ext:content-index'],
    ['Encrypted Media Extensions API','ext:eme'],
    ['Fenced Frame API','ext:fenced-frame'],
    ['File and Directory Entries API','ext:file-entries'],
    ['Force Touch events','ext:force-touch'],
    ['Houdini APIs','ext:houdini'],
    ['Invoker Commands API','ext:invoker'],
    ['JS Self-Profiling API','ext:self-profiler'],
    ['Launch Handler API','ext:launch-handler'],
    ['Presentation API','ext:presentation'],
    ['Private State Token API','ext:private-token'],
    ['Push API','ext:push'],
    ['Remote Playback API','ext:remote-playback'],
    ['Server-sent events','ext:sse-live'],
    ['Shared Storage API','ext:shared-storage'],
    ['Topics API','ext:topics'],
    ['URL Fragment Text Directives','ext:fragment-directive'],
    ['Viewport Segments API','ext:viewport-segments'],
    ['Web Periodic Background Synchronization API','ext:periodic-sync'],
    ['Web-based Payment Handler API','ext:payment-handler'],
    ['WebVR API','ext:webvr'],
    ['WebSocket API (WebSockets)','ext:websocket-live'],
    ['WebTransport API','ext:webtransport-live']
  ]);

  function send(ch,payload){try{if(ch?.readyState==='open')ch.send(JSON.stringify(payload));}catch{}}

  window.SUPER_API_EXT_HANDLE = async (channel,msg) => {
    if(extRole!=='host') return send(channel,{type:'error',action:msg.action,id:msg.id,error:'This peer is not in Controlled peer mode.'});
    if(!$('#allowRequests')?.checked) return send(channel,{type:'error',action:msg.action,id:msg.id,error:'Single session authorization is OFF on the controlled peer.'});
    const a=EXT.get(msg.action);
    if(!a) return send(channel,{type:'error',action:msg.action,id:msg.id,error:'Unknown extension action.'});
    try{log('Peer extension action:',a.label);const result=await a.fn();log(`${a.label} result:`,serial(result));send(channel,{type:'result',action:msg.action,id:msg.id,result:serial(result)});}
    catch(e){log(`${a.label} error:`,e?.message||String(e));send(channel,{type:'error',action:msg.action,id:msg.id,error:e?.message||String(e)});}
  };

  function addEndpointPanel(){
    if($('#extPanel')) return;
    const panel=document.createElement('section');panel.id='extPanel';panel.className='panel';
    panel.innerHTML=`<h2>Extended / server-backed API calls</h2>
      <p class="mini">These tests complete APIs that need an endpoint or were previously detection-only. The same one-session authorization applies to peer execution.</p>
      <div class="grid">
        <label>WebSocket endpoint<input id="websocketUrl" class="grow" placeholder="wss://example.com/socket"></label>
        <label>SSE endpoint<input id="sseUrl" class="grow" placeholder="https://example.com/events"></label>
        <label>WebTransport endpoint<input id="webtransportUrl" class="grow" placeholder="https://example.com/webtransport"></label>
        <label>Presentation URL<input id="presentationUrl" class="grow" placeholder="defaults to this page"></label>
      </div>
      <div id="extActions" class="cap-grid"></div>`;
    const media=$('#localVideo')?.closest('section.panel');
    if(media) media.before(panel); else document.querySelector('main')?.append(panel);
    const root=panel.querySelector('#extActions');
    for(const a of EXT.values()){
      const c=document.createElement('article');c.className='cap';
      c.innerHTML=`<div class="category">Extended call</div><h3></h3><div class="meta"></div><div class="line"><span class="status ok">● callable</span><span class="policy safe">SESSION</span></div>`;
      c.querySelector('h3').textContent=a.label;c.querySelector('.meta').textContent=a.note||'Runs locally or through the paired peer after single-session authorization.';
      const b=document.createElement('button');b.textContent='Test here';b.onclick=async()=>{try{log('Local extension action:',a.label);const r=await a.fn();log(`${a.label} result:`,serial(r));}catch(e){log(`${a.label} error:`,e.message)}};c.appendChild(b);root.appendChild(c);
    }
  }

  function addRemoteOptions(){
    const s=$('#remoteAction'); if(!s) return;
    const existing=new Set([...s.options].map(o=>o.value));
    for(const a of EXT.values()) if(!existing.has(a.id)){const o=document.createElement('option');o.value=a.id;o.textContent=`SESSION • ${a.label}`;s.appendChild(o);}
  }

  let decorating=false;
  function decorateCatalog(){
    if(decorating) return; decorating=true;
    requestAnimationFrame(()=>{
      try{
        for(const card of document.querySelectorAll('#catalog .cap')){
          const name=card.querySelector('h3')?.textContent; const id=CATALOG_EXT.get(name); if(!id) continue;
          if(card.querySelector('[data-ext-call]')) continue;
          const a=EXT.get(id); if(!a) continue;
          const b=document.createElement('button');b.dataset.extCall=id;b.textContent='Extended call';
          const detected=!card.querySelector('.status')?.classList.contains('bad'); b.disabled=!detected;
          b.onclick=async()=>{try{log('Local extension action:',a.label);const r=await a.fn();log(`${a.label} result:`,serial(r));}catch(e){log(`${a.label} error:`,e.message)}};
          card.appendChild(b);
          const policy=card.querySelector('.policy'); if(policy){policy.textContent='SESSION';policy.className='policy safe';}
        }
        const runnable=[...document.querySelectorAll('#catalog .cap')].filter(c=>c.querySelector('button')).length;
        if($('#apiRunnable')) $('#apiRunnable').textContent=runnable;
      } finally {decorating=false;}
    });
  }

  addEndpointPanel(); addRemoteOptions(); decorateCatalog();
  const catalog=$('#catalog'); if(catalog)new MutationObserver(decorateCatalog).observe(catalog,{childList:true,subtree:true});
  $('#refreshCaps')?.addEventListener('click',()=>setTimeout(()=>{addRemoteOptions();decorateCatalog();},0));
  $('#filter')?.addEventListener('input',()=>setTimeout(decorateCatalog,0));
  $('#categoryFilter')?.addEventListener('change',()=>setTimeout(decorateCatalog,0));
  $('#supportFilter')?.addEventListener('change',()=>setTimeout(decorateCatalog,0));
})();
