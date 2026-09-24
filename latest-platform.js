(() => {
  'use strict';
  const $=s=>document.querySelector(s);
  const logBox=$('#log');
  const fmt=v=>{try{return typeof v==='string'?v:JSON.stringify(v,(_k,x)=>typeof x==='bigint'?String(x):x,2)}catch{return String(v)}};
  const log=(...xs)=>{if(logBox)logBox.textContent=`[${new Date().toLocaleTimeString()}] ${xs.map(fmt).join(' ')}\n`+logBox.textContent;};
  const send=(ch,p)=>{try{if(ch?.readyState==='open')ch.send(JSON.stringify(p));}catch{}};
  const cfg=id=>$(`#${id}`)?.value?.trim()||'';
  const safe=v=>{if(v==null)return v;if(v instanceof Error)return{name:v.name,message:v.message};try{return JSON.parse(JSON.stringify(v,(_k,x)=>typeof x==='bigint'?String(x):x))}catch{return String(v)}};
  const timeout=(p,ms,label='Operation')=>Promise.race([p,new Promise((_,rej)=>setTimeout(()=>rej(new Error(`${label} timed out`)),ms))]);
  let role=null;
  $('#hostBtn')?.addEventListener('click',()=>role='host');
  $('#controllerBtn')?.addEventListener('click',()=>role='controller');
  const L=new Map();
  const add=(id,label,fn,note='')=>L.set(`ext:latest-${id}`,{id:`ext:latest-${id}`,label,fn,note});

  add('cpu-performance','CPU Performance API: read performance tier',async()=>{
    if(!('cpuPerformance' in navigator))throw new Error('navigator.cpuPerformance unavailable.');
    return {tier:navigator.cpuPerformance,secureContext:isSecureContext};
  });

  add('capability-elements','Capability elements: detect camera/microphone/usermedia/geolocation controls',async()=>{
    const names=['camera','microphone','usermedia','geolocation'];
    return names.map(name=>{const el=document.createElement(name);return{name,constructor:el.constructor?.name||null,recognized:!(el instanceof HTMLUnknownElement),properties:Object.getOwnPropertyNames(Object.getPrototypeOf(el)).filter(x=>x!=='constructor')}});
  },'These are browser-controlled/user-activated elements. This test detects their implementation but does not synthesize a user click.');

  add('webaudio-render-quantum','WebAudio: configurable renderSizeHint',async()=>{
    const AC=globalThis.AudioContext||globalThis.webkitAudioContext;if(!AC)throw new Error('AudioContext unavailable.');
    const results=[];
    for(const hint of ['default','hardware',256]){
      let c;try{c=new AC({renderSizeHint:hint});results.push({hint,created:true,sampleRate:c.sampleRate,baseLatency:c.baseLatency,state:c.state});}catch(e){results.push({hint,created:false,error:`${e.name}: ${e.message}`});}finally{try{await c?.close()}catch{}}
    }
    return results;
  });

  add('websocket-init','WebSocketInit options dictionary + targetAddressSpace',async()=>{
    const url=cfg('websocketUrl');if(!url)throw new Error('Enter a WebSocket endpoint in the Extended panel first.');
    const addressSpace=cfg('latestWsAddressSpace');
    const options={protocols:[]};if(addressSpace)options.targetAddressSpace=addressSpace;
    const ws=new WebSocket(url,options);
    try{return await timeout(new Promise((resolve,reject)=>{ws.onopen=()=>resolve({opened:true,url,protocol:ws.protocol,extensions:ws.extensions,targetAddressSpace:addressSpace||null});ws.onerror=()=>reject(new Error('WebSocket options connection failed.'));}),6000,'WebSocket options');}
    finally{try{ws.close(1000,'Super API test complete')}catch{}}
  });

  add('fetch-abort-reason','Fetch: propagate AbortController reason through Response body',async()=>{
    const ac=new AbortController();
    const r=await fetch(`./?abort-reason=${Date.now()}`,{signal:ac.signal,cache:'no-store'});
    ac.abort(new DOMException('Super API abort reason','AbortError'));
    let bodyError=null;try{await r.text()}catch(e){bodyError={name:e.name,message:e.message};}
    return {status:r.status,signalAborted:ac.signal.aborted,signalReason:{name:ac.signal.reason?.name,message:ac.signal.reason?.message},bodyError};
  });

  add('modern-webcrypto','Modern WebCrypto: feature-test post-quantum/AEAD algorithms',async()=>{
    if(!crypto?.subtle)throw new Error('SubtleCrypto unavailable.');
    const tests=[
      {name:'ML-KEM-768',usages:['encapsulateBits','decapsulateBits']},
      {name:'ML-KEM-1024',usages:['encapsulateBits','decapsulateBits']},
      {name:'ML-DSA-44',usages:['sign','verify']},
      {name:'ML-DSA-65',usages:['sign','verify']},
      {name:'ML-DSA-87',usages:['sign','verify']},
      {name:'ChaCha20-Poly1305',usages:['encrypt','decrypt']},
      {name:'X-Wing',usages:['encapsulateBits','decapsulateBits']}
    ];
    const results=[];
    for(const t of tests){
      const x={algorithm:t.name,supportsGenerate:null,generateKey:false};
      try{if(typeof globalThis.SubtleCrypto?.supports==='function')x.supportsGenerate=SubtleCrypto.supports('generateKey',{name:t.name});}catch{}
      try{const k=await crypto.subtle.generateKey({name:t.name},false,t.usages);x.generateKey=!!k;x.keyType=k?.privateKey?'pair':k?.type||'unknown';}catch(e){x.error=`${e.name}: ${e.message}`;}
      results.push(x);
    }
    return {newKemMethods:{encapsulateBits:typeof crypto.subtle.encapsulateBits==='function',decapsulateBits:typeof crypto.subtle.decapsulateBits==='function',encapsulateKey:typeof crypto.subtle.encapsulateKey==='function',decapsulateKey:typeof crypto.subtle.decapsulateKey==='function',getPublicKey:typeof crypto.subtle.getPublicKey==='function'},algorithms:results};
  },'Only reports support/result metadata. Generated key material is not exported.');

  add('renewed-html','Renewed HTML insertion + streaming methods',async()=>{
    const e=document.createElement('div');const result={methods:{}};
    const names=['setHTML','setHTMLUnsafe','beforeHTML','beforeHTMLUnsafe','afterHTML','afterHTMLUnsafe','prependHTML','prependHTMLUnsafe','appendHTML','appendHTMLUnsafe','replaceWithHTML','replaceWithHTMLUnsafe','streamHTML','streamHTMLUnsafe','streamBeforeHTML','streamBeforeHTMLUnsafe','streamAfterHTML','streamAfterHTMLUnsafe','streamPrependHTML','streamPrependHTMLUnsafe','streamAppendHTML','streamAppendHTMLUnsafe','streamReplaceWithHTML','streamReplaceWithHTMLUnsafe'];
    for(const name of names)result.methods[name]=typeof e[name]==='function';
    if(typeof e.setHTMLUnsafe==='function'){e.setHTMLUnsafe('<b>Super API</b>');result.staticResult=e.innerHTML;}
    else if(typeof e.setHTML==='function'){try{e.setHTML('<b>Super API</b>');result.staticResult=e.innerHTML;}catch(err){result.staticError=`${err.name}: ${err.message}`;}}
    const streamFn=e.streamAppendHTML||e.streamAppendHTMLUnsafe;
    if(typeof streamFn==='function'){
      try{const stream=streamFn.call(e);const writer=stream.getWriter();await writer.write('<i> stream</i>');await writer.close();result.streamResult=e.innerHTML;}catch(err){result.streamError=`${err.name}: ${err.message}`;}
    }
    return result;
  });

  add('installed-related-apps','Get Installed Related Apps: count/platform summary',async()=>{
    if(typeof navigator.getInstalledRelatedApps!=='function')throw new Error('getInstalledRelatedApps unavailable.');
    const apps=await navigator.getInstalledRelatedApps();
    return {count:apps.length,platforms:[...new Set(apps.map(x=>x.platform).filter(Boolean))],detailsRedacted:true};
  },'Application identifiers and URLs are intentionally not returned to the peer.');

  add('digital-credential-issuance','Digital Credentials: configured issuance request',async()=>{
    if(!globalThis.DigitalCredential||!navigator.credentials?.create)throw new Error('Digital Credential issuance unavailable.');
    const protocol=cfg('digitalCredentialIssueProtocol')||'openid4vci-v1';
    const raw=cfg('digitalCredentialIssueData');if(!raw)throw new Error('Enter issuance request data JSON first.');
    const allowed=await DigitalCredential.userAgentAllowsProtocol?.(protocol).catch(()=>null);
    const data=JSON.parse(raw);
    const credential=await navigator.credentials.create({digital:{requests:[{protocol,data}]}});
    return {received:!!credential,type:credential?.type||null,protocol,protocolAllowed:allowed,payloadRedacted:true};
  },'Wallet selection and native user mediation remain browser/platform controlled. Credential payload is redacted.');

  add('webtransport-headers','WebTransport: request headers + responseHeaders',async()=>{
    const url=cfg('webtransportUrl');if(!url)throw new Error('Enter a WebTransport endpoint in the Extended panel first.');
    if(!globalThis.WebTransport)throw new Error('WebTransport unavailable.');
    const headerName=cfg('webtransportHeaderName')||'x-super-api';
    const headerValue=cfg('webtransportHeaderValue')||'test';
    let transport;
    try{transport=new WebTransport(url,{headers:{[headerName]:headerValue}});}catch(e){throw new Error(`WebTransport header option rejected: ${e.message}`);}
    try{
      await timeout(transport.ready,8000,'WebTransport ready');
      let responseHeaders=null;
      try{const h=await transport.responseHeaders;responseHeaders=h?Object.fromEntries(h.entries?.()||[]):null;}catch(e){responseHeaders={error:`${e.name}: ${e.message}`};}
      return {ready:true,url,requestHeaderName:headerName,requestHeaderValueRedacted:true,responseHeaders};
    }finally{try{transport.close()}catch{}}
  });

  add('window-management-latest','Window Management: latest control/status surfaces',async()=>{
    const keys=['getScreenDetails','moveTo','moveBy','resizeTo','resizeBy','maximize','minimize','restore','setResizable','setAlwaysOnTop'];
    const out={};for(const k of keys)out[k]=typeof globalThis[k]==='function'||typeof window[k]==='function';
    out.media={displayState:matchMedia?.('(display-state: maximized)')?.matches??null,resizable:matchMedia?.('(resizable: true)')?.matches??null};
    out.windowShape={WindowShape:!!globalThis.WindowShape,windowShape:'windowShape' in window,shape:window.windowShape?.constructor?.name||null};
    return out;
  },'Detection only for window-changing methods; the lab does not remotely move/resize/maximize the user window.');

  add('css-pseudo-element','CSSPseudoElement: interface/pseudo access support',async()=>{
    const e=document.createElement('div');e.style.cssText='position:fixed;left:-9999px';e.textContent='x';document.body.appendChild(e);
    try{
      const out={CSSPseudoElement:!!globalThis.CSSPseudoElement,elementPseudo:typeof e.pseudo==='function',pseudoNames:[]};
      if(typeof e.pseudo==='function')for(const p of ['::before','::after','::backdrop','::scroll-marker','::view-transition']){try{const x=e.pseudo(p);out.pseudoNames.push({name:p,returned:!!x,constructor:x?.constructor?.name||null});}catch(err){out.pseudoNames.push({name:p,error:err.name});}}
      return out;
    }finally{e.remove();}
  });

  function buildPanel(){
    if($('#latestPlatformPanel'))return;
    const p=document.createElement('section');p.id='latestPlatformPanel';p.className='panel';p.innerHTML=`<h2>Latest platform API tests</h2><p class="mini">Version-specific tests for newly shipping and beta web-platform surfaces. Unsupported/flagged APIs return their actual browser error instead of being reported as implemented.</p><div class="grid"><label>WebSocket target address space<select id="latestWsAddressSpace" class="grow"><option value="">none</option><option value="local">local</option><option value="loopback">loopback</option></select></label><label>Digital Credential issuance protocol<input id="digitalCredentialIssueProtocol" class="grow" value="openid4vci-v1"></label><label>WebTransport header name<input id="webtransportHeaderName" class="grow" value="x-super-api"></label><label>WebTransport header value<input id="webtransportHeaderValue" class="grow" value="test"></label></div><label>Digital Credential issuance data JSON<textarea id="digitalCredentialIssueData" class="code" placeholder='{"credential_offer":{}}'></textarea></label><div id="latestPlatformActions" class="cap-grid"></div>`;
    const mdn=$('#mdnLivePanel'),realms=$('#realmScannerPanel'),runtime=$('#runtimeSurfacePanel'),media=$('#localVideo')?.closest('section.panel');if(mdn)mdn.before(p);else if(realms)realms.before(p);else if(runtime)runtime.before(p);else if(media)media.before(p);else document.querySelector('main')?.append(p);
    const root=p.querySelector('#latestPlatformActions');for(const a of L.values()){const c=document.createElement('article');c.className='cap';c.innerHTML='<div class="category">Latest platform</div><h3></h3><div class="meta"></div><div class="line"><span class="status ok">● callable when exposed</span><span class="policy safe">SESSION</span></div>';c.querySelector('h3').textContent=a.label;c.querySelector('.meta').textContent=a.note||'Runs the real feature-detected operation and reports success or browser rejection.';const b=document.createElement('button');b.textContent='Test here';b.onclick=async()=>{try{log('Latest API action:',a.label);const r=await a.fn();log(`${a.label} result:`,safe(r));}catch(e){log(`${a.label} error:`,`${e.name}: ${e.message}`);}};c.appendChild(b);root.appendChild(c);}
  }

  const previous=window.SUPER_API_EXT_HANDLE;
  window.SUPER_API_EXT_HANDLE=async(channel,msg)=>{
    if(!msg?.action?.startsWith('ext:latest-'))return typeof previous==='function'?previous(channel,msg):undefined;
    if(role!=='host')return send(channel,{type:'error',action:msg.action,id:msg.id,error:'This peer is not in Controlled peer mode.'});
    if(!$('#allowRequests')?.checked)return send(channel,{type:'error',action:msg.action,id:msg.id,error:'Single session authorization is OFF on the controlled peer.'});
    const a=L.get(msg.action);if(!a)return send(channel,{type:'error',action:msg.action,id:msg.id,error:'Unknown latest-platform action.'});
    try{const r=await a.fn();send(channel,{type:'result',action:msg.action,id:msg.id,result:safe(r)});}catch(e){send(channel,{type:'error',action:msg.action,id:msg.id,error:`${e.name}: ${e.message}`});}
  };
  function addRemote(){const s=$('#remoteAction');if(!s)return;const existing=new Set([...s.options].map(o=>o.value));for(const a of L.values())if(!existing.has(a.id)){const o=document.createElement('option');o.value=a.id;o.textContent=`SESSION • ${a.label}`;s.appendChild(o);}}
  buildPanel();addRemote();setTimeout(addRemote,600);
})();
