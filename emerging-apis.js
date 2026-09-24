(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const logBox = $('#log');
  const log = (...xs) => {
    const fmt=v=>{try{return typeof v==='string'?v:JSON.stringify(v,(_k,x)=>typeof x==='bigint'?String(x):x,2)}catch{return String(v)}};
    if(logBox)logBox.textContent=`[${new Date().toLocaleTimeString()}] ${xs.map(fmt).join(' ')}\n`+logBox.textContent;
  };
  const safeResult = v => {
    if(v == null) return v;
    if(v instanceof Error) return {name:v.name,message:v.message};
    try{return JSON.parse(JSON.stringify(v,(_k,x)=>typeof x==='bigint'?String(x):x));}catch{return String(v);}
  };
  const send=(ch,payload)=>{try{if(ch?.readyState==='open')ch.send(JSON.stringify(payload));}catch{}};
  const cfg=id=>$(`#${id}`)?.value?.trim()||'';
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  let role=null;
  $('#hostBtn')?.addEventListener('click',()=>role='host');
  $('#controllerBtn')?.addEventListener('click',()=>role='controller');

  const E=new Map();
  const add=(id,label,fn,note='')=>E.set(`ext:emerging-${id}`,{id:`ext:emerging-${id}`,label,fn,note});

  async function makeAI(Cls, options={}) {
    if(!Cls) throw new Error('API unavailable.');
    const availability=await Cls.availability?.(options);
    const session=await Cls.create(options);
    return {session,availability};
  }

  add('prompt','Prompt API: create session + prompt',async()=>{
    const LM=globalThis.LanguageModel||globalThis.ai?.languageModel;
    if(!LM) throw new Error('Prompt/LanguageModel API unavailable.');
    const input=cfg('emergingAiText')||'Reply with exactly: Super API works';
    if(globalThis.LanguageModel){
      const availability=await LanguageModel.availability({expectedInputs:[{type:'text',languages:['en']}],expectedOutputs:[{type:'text',languages:['en']}]});
      const s=await LanguageModel.create({expectedInputs:[{type:'text',languages:['en']}],expectedOutputs:[{type:'text',languages:['en']}]});
      try{return {availability,output:await s.prompt(input)}}finally{try{s.destroy?.()}catch{}}
    }
    const caps=await LM.capabilities?.(); const s=await LM.createTextSession?.() || await LM.create?.();
    try{return {capabilities:caps,output:await s.prompt(input)}}finally{try{s.destroy?.()}catch{}}
  });

  add('writer','Writer API: create + write',async()=>{
    if(!globalThis.Writer) throw new Error('Writer API unavailable.');
    const input=cfg('emergingAiText')||'Write one short sentence about browser APIs.';
    const availability=await Writer.availability(); const w=await Writer.create({tone:'neutral',format:'plain-text'}).catch(()=>Writer.create());
    try{return {availability,output:await w.write(input)}}finally{try{w.destroy?.()}catch{}}
  });

  add('rewriter','Rewriter API: create + rewrite',async()=>{
    if(!globalThis.Rewriter) throw new Error('Rewriter API unavailable.');
    const input=cfg('emergingAiText')||'Browser APIs are useful.';
    const availability=await Rewriter.availability(); const r=await Rewriter.create({tone:'more-formal'}).catch(()=>Rewriter.create());
    try{return {availability,output:await r.rewrite(input)}}finally{try{r.destroy?.()}catch{}}
  });

  add('proofreader','Proofreader API: create + proofread',async()=>{
    if(!globalThis.Proofreader) throw new Error('Proofreader API unavailable.');
    const input=cfg('emergingAiText')||'I seen him yesterday and he buy two loafs.';
    const availability=await Proofreader.availability({expectedInputLanguages:['en']}).catch(()=>Proofreader.availability());
    const p=await Proofreader.create({expectedInputLanguages:['en']}).catch(()=>Proofreader.create());
    try{const out=await p.proofread(input);return {availability,correctedInput:out.correctedInput,corrections:out.corrections?.map(c=>({startIndex:c.startIndex,endIndex:c.endIndex,correction:c.correction}))||[]};}finally{try{p.destroy?.()}catch{}}
  });

  add('summarizer','Summarizer API: create + summarize',async()=>{
    if(!globalThis.Summarizer) throw new Error('Summarizer API unavailable.');
    const input=cfg('emergingAiText')||'Web browsers expose many APIs for media, storage, networking, graphics, hardware and installed application capabilities. Browser support and permission requirements vary by platform.';
    const availability=await Summarizer.availability(); const s=await Summarizer.create({type:'key-points',length:'short'}).catch(()=>Summarizer.create());
    try{return {availability,output:await s.summarize(input)}}finally{try{s.destroy?.()}catch{}}
  });

  add('translator','Translator API: create + translate',async()=>{
    if(!globalThis.Translator) throw new Error('Translator API unavailable.');
    const availability=await Translator.availability({sourceLanguage:'en',targetLanguage:'es'});
    const t=await Translator.create({sourceLanguage:'en',targetLanguage:'es'});
    try{return {availability,output:await t.translate(cfg('emergingAiText')||'Browser APIs are working.')}}finally{try{t.destroy?.()}catch{}}
  });

  add('language-detector','Language Detector API: create + detect',async()=>{
    if(!globalThis.LanguageDetector) throw new Error('Language Detector API unavailable.');
    const availability=await LanguageDetector.availability(); const d=await LanguageDetector.create();
    try{return {availability,results:await d.detect(cfg('emergingAiText')||'This sentence is written in English.')}}finally{try{d.destroy?.()}catch{}}
  });

  add('fetch-later','fetchLater(): schedule same-origin deferred request',async()=>{
    if(typeof globalThis.fetchLater!=='function') throw new Error('fetchLater() unavailable.');
    const result=fetchLater(`./?fetchLater=${Date.now()}`,{activateAfter:5000,cache:'no-store',mode:'same-origin'});
    return {scheduled:true,activated:result?.activated??null,activateAfter:5000};
  });

  add('crop-target','Region Capture: create CropTarget from element',async()=>{
    if(!globalThis.CropTarget?.fromElement) throw new Error('CropTarget.fromElement unavailable.');
    const target=await CropTarget.fromElement(document.querySelector('main')||document.body);
    return {created:!!target,constructor:target.constructor?.name||'CropTarget'};
  });

  add('restriction-target','Element Capture: create RestrictionTarget from element',async()=>{
    if(!globalThis.RestrictionTarget?.fromElement) throw new Error('RestrictionTarget.fromElement unavailable.');
    const target=await RestrictionTarget.fromElement(document.querySelector('main')||document.body);
    return {created:!!target,constructor:target.constructor?.name||'RestrictionTarget'};
  });

  add('capture-controller','Captured Surface Control: capture with CaptureController',async()=>{
    if(!globalThis.CaptureController) throw new Error('CaptureController unavailable.');
    if(!navigator.mediaDevices?.getDisplayMedia) throw new Error('getDisplayMedia unavailable.');
    const controller=new CaptureController(); const stream=await navigator.mediaDevices.getDisplayMedia({video:true,audio:false,controller});
    try{
      const track=stream.getVideoTracks()[0]; const settings=track.getSettings?.()||{};
      let zoomLevels=null; try{zoomLevels=controller.getSupportedZoomLevels?.()||null}catch{}
      return {captured:true,displaySurface:settings.displaySurface||null,zoomLevel:controller.zoomLevel??null,zoomLevels};
    } finally {stream.getTracks().forEach(t=>t.stop());}
  });

  add('handwriting','Handwriting Recognition: create recognizer',async()=>{
    if(!navigator.createHandwritingRecognizer) throw new Error('Handwriting Recognition API unavailable.');
    let support=null; try{support=await navigator.queryHandwritingRecognizerSupport?.({languages:['en']})}catch{}
    const recognizer=await navigator.createHandwritingRecognizer({languages:['en']});
    try{return {created:true,support,constructor:recognizer.constructor?.name||'HandwritingRecognizer'}}finally{try{recognizer.finish?.()}catch{}}
  });

  add('webmcp','WebMCP: register and unregister harmless tool',async()=>{
    const mc=document.modelContext||globalThis.modelContext;
    if(!mc?.registerTool) throw new Error('WebMCP modelContext unavailable.');
    const name=`super_api_test_${Date.now()}`;
    await mc.registerTool({name,description:'Return a fixed Super API test value',inputSchema:{type:'object',properties:{}},execute:async()=>({ok:true,source:'Super API Peer Lab'})});
    let unregistered=false;
    try{if(mc.unregisterTool){await mc.unregisterTool(name);unregistered=true;}}catch{}
    return {registered:name,unregistered};
  });

  add('digital-credential-protocol','Digital Credentials: protocol support check',async()=>{
    if(!globalThis.DigitalCredential) throw new Error('DigitalCredential unavailable.');
    const protocol=cfg('digitalCredentialProtocol')||'openid4vp-v1-unsigned';
    const allowed=await DigitalCredential.userAgentAllowsProtocol?.(protocol);
    return {protocol,userAgentAllowsProtocol:allowed};
  });

  add('digital-credential-request','Digital Credentials: configured presentation request',async()=>{
    if(!globalThis.DigitalCredential || !navigator.credentials?.get) throw new Error('Digital Credentials API unavailable.');
    const protocol=cfg('digitalCredentialProtocol')||'openid4vp-v1-unsigned';
    const raw=cfg('digitalCredentialData'); if(!raw) throw new Error('Enter Digital Credential request data JSON first.');
    const data=JSON.parse(raw);
    const credential=await navigator.credentials.get({digital:{requests:[{protocol,data}]}});
    return {received:!!credential,type:credential?.type||null,protocol:credential?.protocol||protocol,dataRedacted:true};
  },'Credential payload is deliberately not returned to the controller.');

  add('highlights-from-point','CSS Highlight: highlightsFromPoint probe',async()=>{
    if(!CSS.highlights || typeof document.highlightsFromPoint!=='function') throw new Error('highlightsFromPoint unavailable.');
    const span=document.createElement('span');span.textContent='Super API highlight point';span.style.cssText='position:fixed;left:20px;top:20px;z-index:99999;background:white;color:black';document.body.appendChild(span);
    const range=new Range();range.selectNodeContents(span);const h=new Highlight(range);CSS.highlights.set('super-api-point',h);await wait(30);
    const r=span.getBoundingClientRect();const hits=document.highlightsFromPoint(r.left+2,r.top+2);CSS.highlights.delete('super-api-point');span.remove();
    return {hits:hits?.length??0,names:hits?.map?.(x=>x.name)||[]};
  });

  add('filesystem-observer','FileSystemObserver: observe OPFS mutation',async()=>{
    if(!globalThis.FileSystemObserver || !navigator.storage?.getDirectory) throw new Error('FileSystemObserver/OPFS unavailable.');
    const root=await navigator.storage.getDirectory(); const name=`observer-${Date.now()}.txt`; const handle=await root.getFileHandle(name,{create:true});
    let records=null; const observer=new FileSystemObserver(changes=>{records=changes.map(x=>({type:x.type,relativePathComponents:x.relativePathComponents||[]}));});
    await observer.observe(handle); const w=await handle.createWritable();await w.write('Super API observer');await w.close();
    for(let i=0;i<20&&!records;i++)await wait(50);observer.disconnect();await root.removeEntry(name).catch(()=>{});return {observed:!!records,records};
  });

  const previous=window.SUPER_API_EXT_HANDLE;
  window.SUPER_API_EXT_HANDLE=async(channel,msg)=>{
    if(!msg?.action?.startsWith('ext:emerging-')) return typeof previous==='function'?previous(channel,msg):undefined;
    if(role!=='host') return send(channel,{type:'error',action:msg.action,id:msg.id,error:'This peer is not in Controlled peer mode.'});
    if(!$('#allowRequests')?.checked) return send(channel,{type:'error',action:msg.action,id:msg.id,error:'Single session authorization is OFF on the controlled peer.'});
    const a=E.get(msg.action);if(!a)return send(channel,{type:'error',action:msg.action,id:msg.id,error:'Unknown emerging API action.'});
    try{log('Peer emerging action:',a.label);const result=await a.fn();send(channel,{type:'result',action:msg.action,id:msg.id,result:safeResult(result)});}
    catch(e){log(`${a.label} error:`,e?.message||String(e));send(channel,{type:'error',action:msg.action,id:msg.id,error:e?.message||String(e)});}
  };

  function buildPanel(){
    if($('#emergingApisPanel')) return;
    const panel=document.createElement('section');panel.id='emergingApisPanel';panel.className='panel';
    panel.innerHTML=`<h2>Emerging / Chromium capability calls</h2>
      <p class="mini">Covers newer browser capabilities that are not all represented as separate MDN specification-family rows. Availability depends on browser version, platform, flags/origin trials and hardware.</p>
      <div class="grid">
        <label>AI test text<input id="emergingAiText" class="grow" placeholder="text for Prompt/Writer/Rewriter/etc."></label>
        <label>Digital Credential protocol<input id="digitalCredentialProtocol" class="grow" value="openid4vp-v1-unsigned"></label>
      </div>
      <label>Digital Credential request data JSON<textarea id="digitalCredentialData" class="code" placeholder='{"response_type":"vp_token","nonce":"...","client_metadata":{},"dcql_query":{}}'></textarea></label>
      <div id="emergingActions" class="cap-grid"></div>`;
    const runtime=$('#runtimeSurfacePanel');const media=$('#localVideo')?.closest('section.panel');
    if(runtime)runtime.before(panel);else if(media)media.before(panel);else document.querySelector('main')?.append(panel);
    const root=panel.querySelector('#emergingActions');
    for(const a of E.values()){
      const c=document.createElement('article');c.className='cap';c.innerHTML='<div class="category">Emerging API</div><h3></h3><div class="meta"></div><div class="line"><span class="status ok">● callable when exposed</span><span class="policy safe">SESSION</span></div>';
      c.querySelector('h3').textContent=a.label;c.querySelector('.meta').textContent=a.note||'Attempts the real browser call and reports the actual browser result/error.';
      const b=document.createElement('button');b.textContent='Test here';b.onclick=async()=>{try{log('Local emerging action:',a.label);const r=await a.fn();log(`${a.label} result:`,safeResult(r));}catch(e){log(`${a.label} error:`,e?.message||String(e));}};c.appendChild(b);root.appendChild(c);
    }
  }

  function addRemoteOptions(){
    const s=$('#remoteAction');if(!s)return;const existing=new Set([...s.options].map(o=>o.value));
    for(const a of E.values())if(!existing.has(a.id)){const o=document.createElement('option');o.value=a.id;o.textContent=`SESSION • ${a.label}`;s.appendChild(o);}
  }

  buildPanel();addRemoteOptions();setTimeout(()=>{buildPanel();addRemoteOptions();},300);
})();
