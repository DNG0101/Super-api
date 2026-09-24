(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);
  const WEBREF_INDEX = 'https://raw.githubusercontent.com/w3c/webref/curated/ed/idlnames.json';
  const WEBREF_PARSED_BASE = 'https://raw.githubusercontent.com/w3c/webref/curated/ed/';
  const MAX_HANDLES = 512;
  const RPC_ACTION = 'ext:webidl-rpc';
  const SUMMARY_ACTION = 'ext:interface-harness-summary';

  const INSTANCE_PATHS = {
    Navigator: 'navigator', NavigatorUAData: 'navigator.userAgentData', Document: 'document', Screen: 'screen', ScreenOrientation: 'screen.orientation',
    History: 'history', Location: 'location', Performance: 'performance', Crypto: 'crypto', SubtleCrypto: 'crypto.subtle', StorageManager: 'navigator.storage',
    Permissions: 'navigator.permissions', MediaDevices: 'navigator.mediaDevices', ServiceWorkerContainer: 'navigator.serviceWorker', LockManager: 'navigator.locks',
    CredentialsContainer: 'navigator.credentials', Clipboard: 'navigator.clipboard', GPU: 'navigator.gpu', XRSystem: 'navigator.xr', USB: 'navigator.usb', HID: 'navigator.hid',
    Serial: 'navigator.serial', Bluetooth: 'navigator.bluetooth', Geolocation: 'navigator.geolocation', MediaCapabilities: 'navigator.mediaCapabilities',
    MediaSession: 'navigator.mediaSession', WakeLock: 'navigator.wakeLock', Keyboard: 'navigator.keyboard', VirtualKeyboard: 'navigator.virtualKeyboard',
    Ink: 'navigator.ink', DevicePosture: 'navigator.devicePosture', AudioSession: 'navigator.audioSession', WindowControlsOverlay: 'navigator.windowControlsOverlay',
    UserActivation: 'navigator.userActivation', CacheStorage: 'caches', IDBFactory: 'indexedDB', CookieStore: 'cookieStore', SpeechSynthesis: 'speechSynthesis',
    Navigation: 'navigation', Scheduler: 'scheduler', VisualViewport: 'visualViewport', DocumentPictureInPicture: 'documentPictureInPicture', Storage: 'localStorage'
  };

  const DISCOVERY_ROOTS = ['navigator','document','screen','performance','crypto','history','location','caches','indexedDB','cookieStore','speechSynthesis','navigation','scheduler','visualViewport','documentPictureInPicture'];

  let definitions = [];
  let selectedDefinition = null;
  let selectedParsed = null;
  let selectedRuntime = null;
  let runtimeIndex = new Map();
  let handleCounter = 0;
  const handles = new Map();

  const logBox = $('#log');
  const normalize = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const unique = values => [...new Set(values.filter(Boolean))];

  function safe(value) {
    const seen = new WeakSet();
    try {
      return JSON.stringify(value, (_key, item) => {
        if (typeof item === 'bigint') return String(item);
        if (typeof item === 'function') return `[Function ${item.name || 'anonymous'}]`;
        if (item && typeof item === 'object') {
          if (seen.has(item)) return '[Circular]';
          seen.add(item);
          if (typeof Node !== 'undefined' && item instanceof Node) return `[${item.nodeName}]`;
          if (typeof Blob !== 'undefined' && item instanceof Blob) return {blob:true,size:item.size,type:item.type};
          if (item instanceof ArrayBuffer) return {arrayBuffer:true,byteLength:item.byteLength};
          if (ArrayBuffer.isView(item)) return {typedArray:item.constructor?.name,byteLength:item.byteLength};
          if (typeof Response !== 'undefined' && item instanceof Response) return {response:true,status:item.status,type:item.type,url:item.url};
        }
        return item;
      }, 2);
    } catch { return String(value); }
  }

  function log(...items) {
    if (!logBox) return;
    const text = items.map(item => typeof item === 'string' ? item : safe(item)).join(' ');
    logBox.textContent = `[${new Date().toLocaleTimeString()}] ${text}\n${logBox.textContent}`;
  }

  function resolvePath(path) {
    const parts = String(path || '').trim().split('.').filter(Boolean);
    if (!parts.length) return null;
    let current = globalThis;
    for (const part of parts) {
      if (current == null || !(part in current)) throw new Error(`Path segment not found: ${part}`);
      current = current[part];
    }
    return current;
  }

  function ownAndPrototypeMembers(object, maxDepth = 8) {
    const seen = new Set(), result = [];
    let current = object, depth = 0;
    while (current && depth++ < maxDepth) {
      let keys = [];
      try { keys = Reflect.ownKeys(current); } catch { break; }
      for (const key of keys) {
        const name = typeof key === 'symbol' ? key.toString() : String(key);
        if (name === 'constructor' || seen.has(name)) continue;
        seen.add(name);
        let descriptor = null;
        try { descriptor = Object.getOwnPropertyDescriptor(current, key); } catch {}
        result.push({name,kind:typeof descriptor?.value === 'function'?'method':(descriptor?.get||descriptor?.set?'accessor':'property'),depth:depth-1,getter:!!descriptor?.get,setter:!!descriptor?.set,writable:!!descriptor?.writable});
      }
      try { current = Object.getPrototypeOf(current); } catch { break; }
    }
    return result.sort((a,b)=>a.name.localeCompare(b.name));
  }

  function findDescriptor(object, property) {
    let current = object, depth = 0;
    while (current && depth++ < 12) {
      try {
        const descriptor = Object.getOwnPropertyDescriptor(current, property);
        if (descriptor) return descriptor;
        current = Object.getPrototypeOf(current);
      } catch { return null; }
    }
    return null;
  }

  function addRuntimeIndex(name, record) { if (name && record && !runtimeIndex.has(name)) runtimeIndex.set(name, record); }

  function buildRuntimeIndex() {
    runtimeIndex = new Map();
    for (const name of Object.getOwnPropertyNames(globalThis)) {
      let value;
      try { value = globalThis[name]; } catch { continue; }
      if (value == null) continue;
      addRuntimeIndex(name, {global:true,name});
      const ctor = value?.constructor?.name;
      if (ctor && !runtimeIndex.has(ctor) && typeof value !== 'function') addRuntimeIndex(ctor, {global:false,path:name,discovered:true});
    }
    for (const [name,path] of Object.entries(INSTANCE_PATHS)) {
      try { if (resolvePath(path) != null) addRuntimeIndex(name, {global:name in globalThis,path,explicit:true}); } catch {}
    }
    for (const rootPath of DISCOVERY_ROOTS) {
      let root;
      try { root = resolvePath(rootPath); } catch { continue; }
      if (!root) continue;
      const members = ownAndPrototypeMembers(root,5).filter(m=>!m.name.startsWith('on')&&!m.name.startsWith('Symbol(')).slice(0,500);
      for (const member of members) {
        let value;
        try { value = root[member.name]; } catch { continue; }
        if (!value || (typeof value !== 'object' && typeof value !== 'function')) continue;
        const ctor = value?.constructor?.name;
        if (!ctor || ['Object','Function','Array','String','Number','Boolean'].includes(ctor)) continue;
        addRuntimeIndex(ctor, {global:ctor in globalThis,path:`${rootPath}.${member.name}`,discovered:true});
      }
    }
    return runtimeIndex;
  }

  function findRuntime(name) {
    const indexed = runtimeIndex.get(name);
    const globalPresent = name in globalThis;
    let globalValue = null;
    if (globalPresent) { try { globalValue = globalThis[name]; } catch {} }
    let instancePath = indexed?.path || INSTANCE_PATHS[name] || null;
    let instance = null;
    if (instancePath) { try { instance = resolvePath(instancePath); } catch { instancePath = null; } }
    const staticMembers = globalValue && (typeof globalValue === 'function' || typeof globalValue === 'object') ? ownAndPrototypeMembers(globalValue,2) : [];
    const prototypeMembers = typeof globalValue === 'function' && globalValue.prototype ? ownAndPrototypeMembers(globalValue.prototype,10) : (instance ? ownAndPrototypeMembers(instance,10) : []);
    let constructable = false;
    if (typeof globalValue === 'function') { try { Reflect.construct(String,[],globalValue); constructable = true; } catch {} }
    return {name,global:globalPresent,globalType:globalPresent?typeof globalValue:null,instance:!!instance,instancePath,discovered:!!indexed?.discovered,constructorName:globalValue?.constructor?.name||instance?.constructor?.name||null,constructable,staticMembers,prototypeMembers};
  }

  async function fetchJson(url) {
    const response = await fetch(url,{cache:'no-store'});
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
    return response.json();
  }

  function fragmentsFrom(parsed) {
    const fragments = [], seen = new Set();
    function walk(node, relation='self', depth=0) {
      if (!node || typeof node !== 'object' || depth > 20) return;
      const key = `${relation}:${node.name||''}:${node.defined?.href||node.defined?.spec?.url||depth}`;
      if (seen.has(key)) return;
      seen.add(key);
      if (node.defined?.fragment) fragments.push({owner:node.name||parsed?.name||null,ownerType:node.type||null,relation,depth,source:'defined',spec:node.defined.spec||null,href:node.defined.href||null,fragment:node.defined.fragment});
      for (const item of node.extended||[]) if (item?.fragment) fragments.push({owner:node.name||parsed?.name||null,ownerType:node.type||null,relation,depth,source:'extended',spec:item.spec||null,href:item.href||null,fragment:item.fragment});
      if (node.inheritance) walk(node.inheritance,'inheritance',depth+1);
      for (const item of node.includes||[]) if (typeof item === 'object') walk(item,'include',depth+1);
    }
    walk(parsed);
    return fragments;
  }

  function parseIdl(parsed) {
    const fragments = fragmentsFrom(parsed), exposures=[], members=[], includes=[], iterable=[], constructors=[], specs=[], specUrls=[];
    for (const entry of fragments) {
      const text = entry.fragment||'';
      if (entry.spec?.title) specs.push(entry.spec.title);
      if (entry.spec?.url) specUrls.push(entry.spec.url);
      for (const match of text.matchAll(/\bExposed\s*=\s*(\*|\([^\)]*\)|[A-Za-z0-9_,-]+)/g)) exposures.push(...match[1].replace(/[()]/g,'').split(',').map(v=>v.trim()).filter(Boolean));
      for (const match of text.matchAll(/\bconstructor\s*\(([^\)]*)\)/g)) constructors.push({owner:entry.owner,relation:entry.relation,args:match[1].trim(),spec:entry.spec?.title||null});
      for (const match of text.matchAll(/\b(?:readonly\s+)?attribute\s+[^;]+?\s+([A-Za-z_][A-Za-z0-9_]*)\s*;/g)) members.push({name:match[1],kind:'attribute',owner:entry.owner,relation:entry.relation,spec:entry.spec?.title||null});
      for (const match of text.matchAll(/\bconst\s+[^;=]+?\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/g)) members.push({name:match[1],kind:'constant',owner:entry.owner,relation:entry.relation,spec:entry.spec?.title||null});
      const op=/(?:^|[;\n}])\s*(?:\[[^\]]*\]\s*)*(?:static\s+)?(?:getter\s+|setter\s+|deleter\s+|stringifier\s+)?[^;{}=]+?\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^;{}]*)\)\s*;/gm;
      for (const match of text.matchAll(op)) if (match[1] !== 'constructor') members.push({name:match[1],kind:'operation',owner:entry.owner,relation:entry.relation,spec:entry.spec?.title||null,args:match[2].trim()});
      for (const match of text.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\s+includes\s+([A-Za-z_][A-Za-z0-9_]*)\s*;/g)) includes.push(`${match[1]} includes ${match[2]}`);
      for (const match of text.matchAll(/\b(async\s+iterable|iterable|maplike|setlike)\s*</g)) iterable.push(match[1]);
    }
    const seen = new Set(), uniqueMembers=[];
    for (const m of members) { const key=`${m.kind}:${m.name}:${m.owner}:${m.relation}`; if(!seen.has(key)){seen.add(key);uniqueMembers.push(m);} }
    return {fragments,exposures:unique(exposures),secureContext:fragments.some(e=>/\bSecureContext\b/.test(e.fragment||'')),attributes:unique(uniqueMembers.filter(m=>m.kind==='attribute').map(m=>m.name)),operations:unique(uniqueMembers.filter(m=>m.kind==='operation').map(m=>m.name)),constants:unique(uniqueMembers.filter(m=>m.kind==='constant').map(m=>m.name)),members:uniqueMembers,constructors,includes:unique(includes),iterable:unique(iterable),specs:unique(specs),specUrls:unique(specUrls)};
  }

  function runtimeComparison(info,runtime) {
    const list=unique([...runtime.staticMembers,...runtime.prototypeMembers].map(m=>m.name));
    const map=new Map(list.map(n=>[normalize(n),n]));
    const idl=unique([...info.attributes,...info.operations,...info.constants]);
    return {idlMembers:idl,matched:idl.filter(n=>map.has(normalize(n))).map(n=>({idl:n,runtime:map.get(normalize(n))})),missingFromRuntime:idl.filter(n=>!map.has(normalize(n))),runtimeOnly:list.filter(n=>!idl.some(i=>normalize(i)===normalize(n)))};
  }

  function summary() {
    const counts={}; for(const d of definitions) counts[d.type]=(counts[d.type]||0)+1;
    const globals=definitions.filter(d=>d.runtime.global).length, instances=definitions.filter(d=>d.runtime.instance).length, mapped=definitions.filter(d=>d.runtime.global||d.runtime.instance).length;
    return {source:'w3c/webref curated ed/idlnames.json',webIdlNames:definitions.length,definitionTypes:counts,runtimeGlobals:globals,runtimeInstances:instances,runtimeMapped:mapped,dynamicallyIndexedRuntimeNames:runtimeIndex.size,specificationOnlyDefinitions:definitions.length-mapped,sessionRpc:{action:RPC_ACTION,operations:['inspect','call','get','set','construct','release','handles'],objectHandleChaining:true,arbitraryEval:false,arbitraryRemotePathLookup:false},note:'Generic runtime calls use one app-level session authorization. Browser/OS permission, secure-context, user-activation and realm requirements remain enforced by the browser.'};
  }

  function refreshTypeOptions(){const s=$('#idlType');if(!s)return;const cur=s.value,types=unique(definitions.map(d=>d.type)).sort();s.innerHTML='<option value="">All WebIDL types</option>';for(const t of types){const o=document.createElement('option');o.value=t;o.textContent=t;s.appendChild(o);}if(types.includes(cur))s.value=cur;}

  async function loadInventory(){
    $('#ifaceStatus').textContent='Loading W3C Webref WebIDL master index + browser runtime map…';buildRuntimeIndex();const index=await fetchJson(WEBREF_INDEX);
    definitions=Object.entries(index).map(([name,meta])=>({name,type:meta.type||'unknown',parsed:meta.parsed||null,fragment:meta.fragment||null,runtime:findRuntime(name)})).sort((a,b)=>a.name.localeCompare(b.name));
    refreshTypeOptions();renderDefinitions();const result=summary();$('#ifaceStatus').textContent=safe(result);log('WebIDL inventory loaded:',result);return result;
  }

  function filteredDefinitions(){const q=($('#ifaceFilter')?.value||'').trim().toLowerCase(),type=$('#idlType')?.value||'',mode=$('#ifaceMode')?.value||'';return definitions.filter(d=>{if(q&&!`${d.name} ${d.type} ${d.runtime.instancePath||''}`.toLowerCase().includes(q))return false;if(type&&d.type!==type)return false;if(mode==='global'&&!d.runtime.global)return false;if(mode==='instance'&&!d.runtime.instance)return false;if(mode==='runtime'&&!(d.runtime.global||d.runtime.instance))return false;if(mode==='spec-only'&&(d.runtime.global||d.runtime.instance))return false;return true;});}

  function renderDefinitions(){
    const root=$('#ifaceResults');if(!root)return;const rows=filteredDefinitions();root.innerHTML='';
    for(const d of rows.slice(0,1400)){const card=document.createElement('article');card.className='cap';card.innerHTML='<div class="category">W3C Webref WebIDL</div><h3></h3><div class="meta"></div><div class="line"><span class="status"></span><span class="policy safe"></span></div>';card.querySelector('h3').textContent=d.name;const r=d.runtime,mapping=r.global?'Window/global exposed':r.instance?`instance @ ${r.instancePath}`:'not exposed in this Window realm';card.querySelector('.meta').textContent=`${d.type} • ${mapping} • ${r.staticMembers.filter(m=>m.kind==='method').length+r.prototypeMembers.filter(m=>m.kind==='method').length} reflected method(s)`;const st=card.querySelector('.status');st.textContent=r.global||r.instance?'● runtime mapped':'○ spec definition';st.classList.add(r.global||r.instance?'ok':'warn');card.querySelector('.policy').textContent=r.global||r.instance?'LOCAL + SESSION RPC':'SPEC';const b=document.createElement('button');b.textContent='Inspect WebIDL';b.onclick=()=>inspectDefinition(d).catch(e=>{$('#ifaceSelected').textContent=`${e.name}: ${e.message}`;log('WebIDL inspect error:',e.message);});card.appendChild(b);root.appendChild(card);}
    if(rows.length>1400){const n=document.createElement('p');n.className='mini';n.textContent=`Showing 1400 of ${rows.length}. Use search/type/runtime filters to narrow the standards inventory.`;root.appendChild(n);}$('#ifaceStatus').textContent=safe({...summary(),filteredDefinitions:rows.length});
  }

  function populateRuntimeControls(runtime){const ms=$('#ifaceMethod'),ps=$('#ifaceProperty');if(ms)ms.innerHTML='';if(ps)ps.innerHTML='';if(!runtime)return;for(const m of runtime.staticMembers.filter(m=>m.kind==='method')){const o=document.createElement('option');o.value=`static:${m.name}`;o.textContent=`static • ${m.name}`;ms?.appendChild(o);}for(const m of runtime.prototypeMembers.filter(m=>m.kind==='method')){const o=document.createElement('option');o.value=`instance:${m.name}`;o.textContent=`instance • ${m.name}`;ms?.appendChild(o);}for(const m of unique([...runtime.staticMembers,...runtime.prototypeMembers].filter(m=>m.kind!=='method').map(m=>m.name))){const o=document.createElement('option');o.value=m;o.textContent=m;ps?.appendChild(o);}}

  async function inspectDefinition(d){
    selectedDefinition=d;selectedRuntime=findRuntime(d.name);selectedParsed=d.parsed?await fetchJson(`${WEBREF_PARSED_BASE}${d.parsed}`):null;
    const info=selectedParsed?parseIdl(selectedParsed):{fragments:[],exposures:[],secureContext:false,attributes:[],operations:[],constants:[],members:[],constructors:[],includes:[],iterable:[],specs:[],specUrls:[]};const comparison=runtimeComparison(info,selectedRuntime);
    $('#ifaceGlobal').value=selectedRuntime.global?d.name:'';$('#ifaceInstancePath').value=selectedRuntime.instancePath||'';$('#remoteDefinition').value=d.name;populateRuntimeControls(selectedRuntime);
    $('#ifaceSelected').textContent=safe({definition:{name:d.name,type:d.type,parsed:d.parsed,fragment:d.fragment},webidl:{exposed:info.exposures,secureContext:info.secureContext,constructors:info.constructors,attributes:info.attributes,operations:info.operations,constants:info.constants,membersWithOrigins:info.members,includes:info.includes,iterable:info.iterable,specs:info.specs,specUrls:info.specUrls},runtime:selectedRuntime,comparison,rawFragments:info.fragments});
    $('#ifaceCallResult').textContent=`Selected ${d.name}. WebIDL graph includes ${info.fragments.length} defining/partial/inherited/mixin fragment(s). ${comparison.missingFromRuntime.length} IDL member(s) are not exposed on the mapped runtime object in this browser.`;log('WebIDL definition inspected:',d.name,{type:d.type,fragments:info.fragments.length,exposures:info.exposures,missingFromRuntime:comparison.missingFromRuntime.length});
  }

  function runtimeTarget(scope){if(!selectedDefinition||!selectedRuntime)throw new Error('Inspect a WebIDL definition first.');if(scope==='static'){if(!(selectedDefinition.name in globalThis))throw new Error(`${selectedDefinition.name} is not a runtime global.`);return globalThis[selectedDefinition.name];}const override=($('#ifaceInstancePath')?.value||'').trim();if(override)return resolvePath(override);if(selectedRuntime.instancePath)return resolvePath(selectedRuntime.instancePath);throw new Error('No runtime instance is mapped. Create one through a constructor/method and use its returned handle in session RPC, or use a dedicated API test.');}

  async function callSelectedMethod(){const value=$('#ifaceMethod')?.value;if(!value)throw new Error('No runtime method is available for this selected definition.');const args=JSON.parse($('#ifaceArgs')?.value||'[]');if(!Array.isArray(args))throw new Error('Arguments must be a JSON array.');const [scope,method]=value.split(':'),target=runtimeTarget(scope);if(typeof target?.[method]!=='function')throw new Error(`${method} is not callable on the selected runtime target.`);let result=Reflect.apply(target[method],target,args);if(result&&typeof result.then==='function')result=await result;$('#ifaceCallResult').textContent=safe(result);log('Local WebIDL runtime call:',`${selectedDefinition.name}.${method}`,result);return result;}

  function readSelectedProperty(){const property=$('#ifaceProperty')?.value;if(!property)throw new Error('No readable runtime property is available for this definition.');let target=null;const override=($('#ifaceInstancePath')?.value||'').trim();if(override)target=resolvePath(override);else if(selectedRuntime?.instancePath)target=resolvePath(selectedRuntime.instancePath);else if(selectedDefinition?.name in globalThis)target=globalThis[selectedDefinition.name];if(!target)throw new Error('No runtime target is available.');const value=target[property];$('#ifaceCallResult').textContent=safe({property,value});log('Local WebIDL property read:',`${selectedDefinition.name}.${property}`,value);return value;}

  function constructSelected(){if(!selectedDefinition)throw new Error('Inspect a WebIDL definition first.');const C=globalThis[selectedDefinition.name];if(typeof C!=='function')throw new Error(`${selectedDefinition.name} is not a constructor function in this browser.`);const args=JSON.parse($('#ifaceArgs')?.value||'[]');if(!Array.isArray(args))throw new Error('Arguments must be a JSON array.');let instance;try{instance=Reflect.construct(C,args);}catch(e){throw new Error(`Construction failed: ${e.name}: ${e.message}`);}const result={constructor:instance?.constructor?.name||selectedDefinition.name,members:ownAndPrototypeMembers(instance,8)};$('#ifaceCallResult').textContent=safe(result);log('Local WebIDL construction:',selectedDefinition.name,result);return instance;}

  function exportInventory(){const compact=definitions.map(d=>({name:d.name,type:d.type,parsed:d.parsed,fragment:d.fragment,runtimeGlobal:d.runtime.global,runtimeInstance:d.runtime.instance,instancePath:d.runtime.instancePath,reflectedMethods:unique([...d.runtime.staticMembers,...d.runtime.prototypeMembers].filter(m=>m.kind==='method').map(m=>m.name))}));const blob=new Blob([JSON.stringify({summary:summary(),definitions:compact},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`super-api-webidl-${Date.now()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

  const isControlledPeer=()=>$('#hostBtn')?.classList.contains('primary')&&!$('#controllerBtn')?.classList.contains('primary');
  const isControllerPeer=()=>$('#controllerBtn')?.classList.contains('primary');
  const isSessionAuthorized=()=>!!$('#allowRequests')?.checked;

  function registerHandle(value,label=''){if((typeof value!=='object'||value===null)&&typeof value!=='function')return null;const id=`h${Date.now().toString(36)}-${(++handleCounter).toString(36)}`;handles.set(id,{value,label,createdAt:Date.now(),constructor:value?.constructor?.name||typeof value});while(handles.size>MAX_HANDLES)handles.delete(handles.keys().next().value);return id;}
  function handleRecord(id){const r=handles.get(id);if(!r)throw new Error(`Unknown or expired handle: ${id}`);return r;}

  function serializeRemote(value,label='',depth=0){
    if(value===null||typeof value==='string'||typeof value==='number'||typeof value==='boolean')return value;if(typeof value==='undefined')return {$type:'undefined'};if(typeof value==='bigint')return {$type:'bigint',value:String(value)};if(typeof value==='symbol')return {$type:'symbol',value:String(value)};
    const handle=registerHandle(value,label),constructor=value?.constructor?.name||typeof value,base={$handle:handle,$type:constructor};
    if(value instanceof Error)return {...base,name:value.name,message:value.message};if(typeof Node!=='undefined'&&value instanceof Node)return {...base,nodeName:value.nodeName,id:value.id||null,className:typeof value.className==='string'?value.className:null};if(typeof Blob!=='undefined'&&value instanceof Blob)return {...base,size:value.size,mime:value.type};if(value instanceof ArrayBuffer)return {...base,byteLength:value.byteLength};if(ArrayBuffer.isView(value))return {...base,byteLength:value.byteLength};if(typeof Response!=='undefined'&&value instanceof Response)return {...base,status:value.status,ok:value.ok,url:value.url,responseType:value.type};
    if(Array.isArray(value))return {...base,length:value.length,preview:depth<2?value.slice(0,20).map((item,i)=>serializeRemote(item,`${label}[${i}]`,depth+1)):'[depth-limit]'};
    const preview={};if(depth<2){let keys=[];try{keys=Object.keys(value).slice(0,20);}catch{}for(const key of keys){try{preview[key]=serializeRemote(value[key],`${label}.${key}`,depth+1);}catch(e){preview[key]={$error:`${e.name}: ${e.message}`};}}}return {...base,preview};
  }

  function decodeRemote(value){if(Array.isArray(value))return value.map(decodeRemote);if(!value||typeof value!=='object')return value;if(typeof value.$handle==='string')return handleRecord(value.$handle).value;if(value.$type==='bigint'&&typeof value.value==='string')return BigInt(value.value);const out={};for(const [k,v] of Object.entries(value))out[k]=decodeRemote(v);return out;}

  function resolveRpcTarget(message){const scope=message.scope||'instance';if(scope==='handle')return handleRecord(message.handle).value;const name=String(message.name||'').trim();if(!name)throw new Error('WebIDL/runtime name is required.');if(scope==='static'){if(!(name in globalThis))throw new Error(`${name} is not exposed as a global in this browser realm.`);return globalThis[name];}const runtime=findRuntime(name);if(runtime.instancePath)return resolvePath(runtime.instancePath);if(name in globalThis){const value=globalThis[name];if(typeof value==='object'&&value!==null)return value;}throw new Error(`${name} has no mapped instance in this Window realm. Construct/create an object first and continue through its returned handle.`);}
  function targetInspection(target){const members=ownAndPrototypeMembers(target,12);return {constructor:target?.constructor?.name||typeof target,methods:unique(members.filter(m=>m.kind==='method').map(m=>m.name)),properties:unique(members.filter(m=>m.kind!=='method').map(m=>m.name)),members};}

  async function runRpc(message){
    const op=String(message.op||'').trim();
    if(op==='inspect'){const target=resolveRpcTarget(message);return {target:serializeRemote(target,'inspect-target'),inspection:targetInspection(target)};}
    if(op==='call'){const target=resolveRpcTarget(message),member=String(message.member||'').trim();if(!member)throw new Error('Method/member name is required.');const fn=target?.[member];if(typeof fn!=='function')throw new Error(`${member} is not callable on ${target?.constructor?.name||'target'}.`);const args=Array.isArray(message.args)?message.args.map(decodeRemote):[];let result=Reflect.apply(fn,target,args);if(result&&typeof result.then==='function')result=await result;return {member,result:serializeRemote(result,member)};}
    if(op==='get'){const target=resolveRpcTarget(message),member=String(message.member||'').trim();if(!member)throw new Error('Property/member name is required.');return {member,result:serializeRemote(target[member],member)};}
    if(op==='set'){const target=resolveRpcTarget(message),member=String(message.member||'').trim();if(!member)throw new Error('Property/member name is required.');const d=findDescriptor(target,member);if(!d)throw new Error(`Refusing to create a new arbitrary property: ${member}. Only an existing writable/settable runtime member may be changed.`);if(!d.writable&&typeof d.set!=='function')throw new Error(`${member} is not writable/settable.`);const decoded=decodeRemote(message.value),ok=Reflect.set(target,member,decoded);if(!ok)throw new Error(`Setting ${member} failed.`);return {member,result:serializeRemote(target[member],member)};}
    if(op==='construct'){const name=String(message.name||'').trim();if(!name||!(name in globalThis))throw new Error(`${name||'Requested constructor'} is not a global in this browser realm.`);const C=globalThis[name];if(typeof C!=='function')throw new Error(`${name} is not a constructor function.`);const args=Array.isArray(message.args)?message.args.map(decodeRemote):[];let instance;try{instance=Reflect.construct(C,args);}catch(e){throw new Error(`Construction failed: ${e.name}: ${e.message}`);}return {result:serializeRemote(instance,`new ${name}`),inspection:targetInspection(instance)};}
    if(op==='release'){const id=String(message.handle||'').trim();if(!id)throw new Error('Handle id is required.');const existed=handles.delete(id);return {released:existed,handle:id,remaining:handles.size};}
    if(op==='handles')return {count:handles.size,handles:[...handles.entries()].map(([id,r])=>({id,label:r.label,constructor:r.constructor,createdAt:r.createdAt}))};
    throw new Error(`Unsupported WebIDL RPC operation: ${op||'(empty)'}`);
  }

  function sendPayload(channel,payload){try{if(channel?.readyState==='open')channel.send(JSON.stringify(payload));}catch{}}

  async function extensionHandler(channel,message,previous){
    if(message?.action!==RPC_ACTION&&message?.action!==SUMMARY_ACTION)return typeof previous==='function'?previous(channel,message):undefined;
    if(!isControlledPeer())return sendPayload(channel,{type:'error',action:message.action,id:message.id,error:'This peer is not in Controlled peer mode.'});
    if(!isSessionAuthorized())return sendPayload(channel,{type:'error',action:message.action,id:message.id,error:'Single session authorization is OFF on the controlled peer.'});
    try{if(!definitions.length)await loadInventory();if(message.action===SUMMARY_ACTION)return sendPayload(channel,{type:'result',action:message.action,id:message.id,result:summary()});const result=await runRpc(message);return sendPayload(channel,{type:'result',action:message.action,id:message.id,result});}
    catch(error){return sendPayload(channel,{type:'error',action:message.action,id:message.id,error:`${error.name}: ${error.message}`,nativeGate:['NotAllowedError','SecurityError','InvalidStateError'].includes(error.name)});}
  }

  function installPeerRpc(){
    if(window.__superApiWebIdlRpcInstalled)return;window.__superApiWebIdlRpcInstalled=true;const previous=window.SUPER_API_EXT_HANDLE;window.SUPER_API_EXT_HANDLE=(channel,message)=>extensionHandler(channel,message,previous);
    const select=$('#remoteAction');if(select&&![...select.options].some(o=>o.value===SUMMARY_ACTION)){const o=document.createElement('option');o.value=SUMMARY_ACTION;o.textContent='SESSION • WebIDL standards + RPC coverage summary';select.appendChild(o);}
    $('#allowRequests')?.addEventListener('change',e=>{if(!e.target.checked)handles.clear();});$('#controllerBtn')?.addEventListener('click',()=>handles.clear());
  }

  function openTrackedChannel(){const channels=[...(window.__superApiTrackedChannels||[])],channel=channels.find(c=>c?.readyState==='open');if(!channel)throw new Error('No open paired WebRTC data channel was found.');return channel;}

  function sendRpcRequest(op,payload={}){
    if(!isControllerPeer())return Promise.reject(new Error('Switch this peer to Controller mode first.'));const channel=openTrackedChannel(),id=`webidl-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,message={type:'request',action:RPC_ACTION,id,op,...payload};
    return new Promise((resolve,reject)=>{let timer=null;const onMessage=event=>{let response;try{response=JSON.parse(event.data);}catch{return;}if(!response||response.id!==id||response.action!==RPC_ACTION)return;channel.removeEventListener('message',onMessage);if(timer)clearTimeout(timer);if(response.type==='error')reject(new Error(response.error||'Peer WebIDL RPC failed.'));else resolve(response.result);};channel.addEventListener('message',onMessage);timer=setTimeout(()=>{channel.removeEventListener('message',onMessage);reject(new Error('Timed out waiting for peer WebIDL RPC response. A native browser picker/prompt may still be pending on the controlled peer.'));},60000);try{channel.send(JSON.stringify(message));}catch(error){channel.removeEventListener('message',onMessage);clearTimeout(timer);reject(error);}});
  }

  function rpcFields(){const scope=$('#remoteScope')?.value||'instance',name=($('#remoteDefinition')?.value||'').trim(),handle=($('#remoteHandle')?.value||'').trim(),member=($('#remoteMember')?.value||'').trim(),args=JSON.parse($('#remoteArgs')?.value||'[]');if(!Array.isArray(args))throw new Error('Remote arguments must be a JSON array.');const value=JSON.parse($('#remoteValue')?.value||'null');return {scope,name,handle,member,args,value};}
  function showRpcResult(result){const box=$('#remoteRpcResult');if(box)box.textContent=safe(result);const returned=result?.result?.$handle||result?.target?.$handle;if(returned&&$('#remoteHandle'))$('#remoteHandle').value=returned;log('Peer WebIDL RPC result:',result);}
  async function runRemoteUi(op){let fields;try{fields=rpcFields();}catch(error){$('#remoteRpcResult').textContent=`${error.name}: ${error.message}`;return;}const payload=op==='construct'?{name:fields.name,args:fields.args}:op==='release'?{handle:fields.handle}:op==='handles'?{}:{scope:fields.scope,name:fields.name,handle:fields.handle,member:fields.member,args:fields.args,value:fields.value};$('#remoteRpcResult').textContent=`Running ${op} on paired peer…`;try{showRpcResult(await sendRpcRequest(op,payload));}catch(error){$('#remoteRpcResult').textContent=`${error.name}: ${error.message}`;log('Peer WebIDL RPC error:',error.message);}}

  function buildPanel(){
    if($('#interfaceHarnessPanel'))return;const panel=document.createElement('section');panel.id='interfaceHarnessPanel';panel.className='panel';
    panel.innerHTML=`<h2>Standards WebIDL inventory + session RPC</h2><p class="mini">Loads W3C Webref's generated WebIDL master index, recursively includes partial interfaces, inherited interfaces and included mixins, then compares that standards graph with the actual runtime exposed by this browser. Runtime objects returned by calls are kept as temporary page-session handles so chained APIs can be exercised without hard-coding every object type.</p><div class="row"><button id="ifaceLoad" class="primary">Load complete WebIDL index</button><button id="ifaceExport">Export inventory JSON</button><input id="ifaceFilter" class="grow" placeholder="Search WebIDL name/type/path…"><select id="idlType"><option value="">All WebIDL types</option></select><select id="ifaceMode"><option value="">All definitions</option><option value="runtime">Runtime mapped</option><option value="global">Window/global exposed</option><option value="instance">Known/discovered instance mapped</option><option value="spec-only">Specification only in this realm</option></select></div><pre id="ifaceStatus">Not loaded.</pre>
    <details open><summary>Selected WebIDL definition + local runtime runner</summary><div class="grid"><label>Selected global<input id="ifaceGlobal" class="grow" readonly></label><label>Runtime method<select id="ifaceMethod" class="grow"></select></label><label>Runtime property<select id="ifaceProperty" class="grow"></select></label><label>Existing instance path<input id="ifaceInstancePath" class="grow" placeholder="navigator.storage / document / ..."></label><label>Arguments JSON array<input id="ifaceArgs" class="grow" value="[]"></label></div><div class="row" style="margin-top:8px"><button id="ifaceCall" class="primary">Call method locally</button><button id="ifaceRead">Read property locally</button><button id="ifaceConstruct">Construct locally</button></div><pre id="ifaceSelected">No WebIDL definition selected.</pre><pre id="ifaceCallResult">No call yet.</pre></details>
    <details open><summary>Paired-peer generic WebIDL RPC — one app session authorization</summary><p class="mini">The controlled peer's single session authorization covers these app-level requests. This RPC uses reflected methods/properties/constructors and temporary object handles; it does not use eval and does not accept arbitrary remote JavaScript paths. Browser/OS permission prompts, secure-context restrictions, realm restrictions, native device pickers and transient user-activation requirements still apply.</p><div class="grid"><label>WebIDL/runtime name<input id="remoteDefinition" class="grow" placeholder="Navigator / AudioContext / Document / ..."></label><label>Target scope<select id="remoteScope" class="grow"><option value="instance">Mapped instance</option><option value="static">Global/static</option><option value="handle">Returned handle</option></select></label><label>Handle id<input id="remoteHandle" class="grow" placeholder="h... (auto-filled from returned objects)"></label><label>Method/property<input id="remoteMember" class="grow" placeholder="createElement / getContext / start / ..."></label><label>Arguments JSON<input id="remoteArgs" class="grow" value="[]"></label><label>Set value JSON<input id="remoteValue" class="grow" value="null"></label></div><div class="row" style="margin-top:8px"><button id="remoteInspect">Inspect peer target</button><button id="remoteCall" class="primary">Call on peer</button><button id="remoteGet">Read on peer</button><button id="remoteSet">Write existing property</button><button id="remoteConstruct">Construct on peer</button><button id="remoteHandles">List handles</button><button id="remoteRelease">Release handle</button></div><p class="mini">To pass a previously returned object as an argument, use <code>{"$handle":"h..."}</code> inside the arguments JSON. Returned object handles exist only for the current page session and are cleared when session authorization is revoked.</p><pre id="remoteRpcResult">No peer WebIDL RPC yet.</pre></details><div id="ifaceResults" class="cap-grid"></div>`;
    const mdn=$('#mdnLivePanel'),realms=$('#realmScannerPanel'),runtime=$('#runtimeSurfacePanel'),media=$('#localVideo')?.closest('section.panel');if(mdn)mdn.before(panel);else if(realms)realms.before(panel);else if(runtime)runtime.before(panel);else if(media)media.before(panel);else document.querySelector('main')?.append(panel);
    $('#ifaceLoad').onclick=()=>loadInventory().catch(e=>{$('#ifaceStatus').textContent=`${e.name}: ${e.message}`;log('WebIDL inventory error:',e.message);});$('#ifaceExport').onclick=exportInventory;$('#ifaceFilter').addEventListener('input',renderDefinitions);$('#idlType').addEventListener('change',renderDefinitions);$('#ifaceMode').addEventListener('change',renderDefinitions);
    $('#ifaceCall').onclick=()=>callSelectedMethod().catch(e=>{$('#ifaceCallResult').textContent=`${e.name}: ${e.message}`;log('Local WebIDL call error:',e.message);});$('#ifaceRead').onclick=()=>{try{readSelectedProperty();}catch(e){$('#ifaceCallResult').textContent=`${e.name}: ${e.message}`;log('Local WebIDL property error:',e.message);}};$('#ifaceConstruct').onclick=()=>{try{constructSelected();}catch(e){$('#ifaceCallResult').textContent=`${e.name}: ${e.message}`;log('Local WebIDL construction error:',e.message);}};
    $('#remoteInspect').onclick=()=>runRemoteUi('inspect');$('#remoteCall').onclick=()=>runRemoteUi('call');$('#remoteGet').onclick=()=>runRemoteUi('get');$('#remoteSet').onclick=()=>runRemoteUi('set');$('#remoteConstruct').onclick=()=>runRemoteUi('construct');$('#remoteHandles').onclick=()=>runRemoteUi('handles');$('#remoteRelease').onclick=()=>runRemoteUi('release');
  }

  buildRuntimeIndex();buildPanel();installPeerRpc();setTimeout(installPeerRpc,500);
})();
