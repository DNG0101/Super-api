(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const API_PARENT_URL = 'https://api.github.com/repos/mdn/content/contents/files/en-us/web?ref=main';
  const TREE_URL = sha => `https://api.github.com/repos/mdn/content/git/trees/${encodeURIComponent(sha)}?recursive=1`;
  const logBox = $('#log');
  const log = (...xs) => { const t = xs.map(x => typeof x === 'string' ? x : safe(x)).join(' '); if (logBox) logBox.textContent = `[${new Date().toLocaleTimeString()}] ${t}\n` + logBox.textContent; };
  const safe = v => { const seen = new WeakSet(); try { return JSON.stringify(v, (_k, x) => { if (typeof x === 'bigint') return String(x); if (typeof x === 'function') return `[Function ${x.name || 'anonymous'}]`; if (x && typeof x === 'object') { if (seen.has(x)) return '[Circular]'; seen.add(x); if (typeof Node !== 'undefined' && x instanceof Node) return `[${x.nodeName}]`; if (x instanceof Blob) return {blob:true,size:x.size,type:x.type}; if (x instanceof ArrayBuffer) return {arrayBuffer:true,byteLength:x.byteLength}; if (ArrayBuffer.isView(x)) return {typedArray:x.constructor?.name,byteLength:x.byteLength}; if (x instanceof Response) return {response:true,status:x.status,type:x.type,url:x.url}; } return x; }, 2); } catch { return String(v); } };
  const normalize = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  let entries = [];
  let detail = null;
  let treeMeta = {sha:null,truncated:null,totalEntries:0,memberPages:0};

  const INSTANCE_PATHS = {
    Navigator:'navigator', Document:'document', Screen:'screen', History:'history', Location:'location', Performance:'performance', Crypto:'crypto', SubtleCrypto:'crypto.subtle',
    StorageManager:'navigator.storage', Permissions:'navigator.permissions', MediaDevices:'navigator.mediaDevices', ServiceWorkerContainer:'navigator.serviceWorker', LockManager:'navigator.locks',
    CredentialsContainer:'navigator.credentials', Clipboard:'navigator.clipboard', GPU:'navigator.gpu', XRSystem:'navigator.xr', USB:'navigator.usb', HID:'navigator.hid', Serial:'navigator.serial',
    Bluetooth:'navigator.bluetooth', MediaCapabilities:'navigator.mediaCapabilities', MediaSession:'navigator.mediaSession', WakeLock:'navigator.wakeLock', Keyboard:'navigator.keyboard',
    VirtualKeyboard:'navigator.virtualKeyboard', Ink:'navigator.ink', DevicePosture:'navigator.devicePosture', AudioSession:'navigator.audioSession', WindowControlsOverlay:'navigator.windowControlsOverlay',
    CacheStorage:'caches', IDBFactory:'indexedDB', CookieStore:'cookieStore', SpeechSynthesis:'speechSynthesis', Navigation:'navigation', Scheduler:'scheduler', VisualViewport:'visualViewport',
    DocumentPictureInPicture:'documentPictureInPicture'
  };

  function descriptors(obj, maxDepth = 6) {
    const out = [], seen = new Set();
    let p = obj, depth = 0;
    while (p && depth++ < maxDepth) {
      let keys = []; try { keys = Reflect.ownKeys(p); } catch { break; }
      for (const key of keys) {
        const name = typeof key === 'symbol' ? key.toString() : String(key);
        if (name === 'constructor' || seen.has(name)) continue;
        seen.add(name);
        let d = null; try { d = Object.getOwnPropertyDescriptor(p, key); } catch {}
        out.push({name,kind:typeof d?.value === 'function' ? 'method' : (d?.get || d?.set ? 'accessor' : 'property'),depth:depth-1,getter:!!d?.get,setter:!!d?.set,writable:!!d?.writable});
      }
      try { p = Object.getPrototypeOf(p); } catch { break; }
    }
    return out.sort((a,b)=>a.name.localeCompare(b.name));
  }

  function globalMap() {
    const m = new Map();
    for (const name of Object.getOwnPropertyNames(globalThis)) { const k = normalize(name); if (!m.has(k)) m.set(k, name); }
    return m;
  }

  function resolvePath(path) {
    const parts = String(path || '').trim().split('.').filter(Boolean); if (!parts.length) return null;
    let obj = globalThis; for (const part of parts) { if (obj == null || !(part in obj)) throw new Error(`Path segment not found: ${part}`); obj = obj[part]; }
    return obj;
  }

  function discoverInstance(interfaceName) {
    const explicit = INSTANCE_PATHS[interfaceName];
    if (explicit) { try { const value = resolvePath(explicit); if (value != null) return {path:explicit,value}; } catch {} }
    const candidates = ['navigator','document','screen','performance','crypto','history','location','caches','indexedDB','cookieStore','speechSynthesis','navigation','scheduler','visualViewport','documentPictureInPicture'];
    for (const path of candidates) {
      try {
        const value = resolvePath(path);
        if (value?.constructor?.name === interfaceName) return {path,value};
      } catch {}
    }
    return null;
  }

  function inspectInterface(globalName, interfaceName) {
    let value = null;
    let source = null;
    let sourcePath = null;
    if (globalName && globalName in globalThis) { value = globalThis[globalName]; source = 'global'; sourcePath = globalName; }
    const discovered = discoverInstance(interfaceName);
    const type = typeof value;
    let constructable = false;
    if (type === 'function') { try { Reflect.construct(String, [], value); constructable = true; } catch {} }
    const staticMembers = value && (type === 'function' || type === 'object') ? descriptors(value, 2) : [];
    let prototypeMembers = [];
    if (type === 'function' && value.prototype) prototypeMembers = descriptors(value.prototype, 8);
    else if (discovered?.value) prototypeMembers = descriptors(discovered.value, 8);
    if (!source && discovered) { source = 'instance'; sourcePath = discovered.path; }
    return {globalName:globalName||null,interfaceName,type:globalName?type:null,source,sourcePath,constructorName:value?.constructor?.name || discovered?.value?.constructor?.name || null,functionLength:type === 'function' ? value.length : null,constructable,staticMembers,prototypeMembers};
  }

  async function fetchJson(url) {
    const r = await fetch(url, {headers:{Accept:'application/vnd.github+json'},cache:'no-store'});
    if (!r.ok) throw new Error(`GitHub API ${r.status} for ${url}`);
    return r.json();
  }

  function documentedMembersFor(tree, interfaceDir) {
    const prefix = `${interfaceDir}/`;
    const members = new Map();
    for (const item of tree) {
      if (item.type !== 'blob' || !item.path.startsWith(prefix) || !item.path.endsWith('/index.md')) continue;
      const rest = item.path.slice(prefix.length, -'/index.md'.length);
      if (!rest || rest.includes('/')) continue;
      const key = normalize(rest.replace(/_event$/,''));
      if (!key) continue;
      members.set(key, {slug:rest,path:item.path,event:/_event$/.test(rest)});
    }
    return [...members.values()].sort((a,b)=>a.slug.localeCompare(b.slug));
  }

  async function loadIndex() {
    $('#ifaceStatus').textContent = 'Loading recursive MDN Web/API subtree…';
    const parent = await fetchJson(API_PARENT_URL);
    const apiDir = parent.find(x => x.type === 'dir' && x.name === 'api');
    if (!apiDir?.sha) throw new Error('Could not resolve MDN files/en-us/web/api tree SHA.');
    const treeResponse = await fetchJson(TREE_URL(apiDir.sha));
    const tree = Array.isArray(treeResponse.tree) ? treeResponse.tree : [];
    const topDirs = tree.filter(x => x.type === 'tree' && !x.path.includes('/'));
    const gm = globalMap();
    entries = topDirs.map(x => {
      const globalName = gm.get(normalize(x.path)) || null;
      const interfaceName = globalName || x.path;
      const info = inspectInterface(globalName, interfaceName);
      const documentedMembers = documentedMembersFor(tree, x.path);
      const runtimeNames = new Map([...info.staticMembers, ...info.prototypeMembers].map(m => [normalize(m.name),m]));
      const members = documentedMembers.map(m => ({...m,runtimeMatch:runtimeNames.get(normalize(m.slug.replace(/_event$/,'')))?.name || null}));
      return {name:x.path,globalName,exposed:!!globalName,instancePath:info.source === 'instance' ? info.sourcePath : null,sha:x.sha,path:`files/en-us/web/api/${x.path}`,documentedMembers:members};
    }).sort((a,b)=>a.name.localeCompare(b.name));
    treeMeta = {sha:apiDir.sha,truncated:!!treeResponse.truncated,totalEntries:tree.length,memberPages:entries.reduce((n,x)=>n+x.documentedMembers.length,0)};
    render(); const s = summary(); $('#ifaceStatus').textContent = safe(s); log('Recursive interface harness loaded:', s); return s;
  }

  function summary() {
    const exposed = entries.filter(x=>x.exposed).length;
    const instanceMapped = entries.filter(x=>x.instancePath).length;
    const reflected = entries.map(x=>inspectInterface(x.globalName, x.globalName || x.name));
    const staticMethods = reflected.reduce((n,x)=>n+x.staticMembers.filter(m=>m.kind==='method').length,0);
    const prototypeMethods = reflected.reduce((n,x)=>n+x.prototypeMembers.filter(m=>m.kind==='method').length,0);
    const documentedMembers = entries.reduce((n,x)=>n+x.documentedMembers.length,0);
    const matchedDocs = entries.reduce((n,x)=>n+x.documentedMembers.filter(m=>m.runtimeMatch).length,0);
    return {mdnInterfaceDirectories:entries.length,recursiveTreeEntries:treeMeta.totalEntries,documentedMemberPages:documentedMembers,documentedMembersMatchedToRuntime:matchedDocs,exactWindowGlobals:exposed,knownInstanceMappings:instanceMapped,reflectedStaticMethods:staticMethods,reflectedPrototypeMethods:prototypeMethods,treeTruncated:treeMeta.truncated,treeSha:treeMeta.sha,note:'This inventory includes MDN interface directories plus direct member pages. Non-global APIs can still be worker/worklet-only, dictionary-only, event-only, unsupported, or require a constructed/runtime object.'};
  }

  function populateMethods() {
    const sel = $('#ifaceMethod'); if (!sel) return; sel.innerHTML = ''; if (!detail) return;
    for (const m of detail.staticMembers.filter(x=>x.kind==='method')) { const o=document.createElement('option'); o.value=`static:${m.name}`; o.textContent=`static • ${m.name}`; sel.appendChild(o); }
    for (const m of detail.prototypeMembers.filter(x=>x.kind==='method')) { const o=document.createElement('option'); o.value=`prototype:${m.name}`; o.textContent=`instance • ${m.name}`; sel.appendChild(o); }
  }

  function selectEntry(entry) {
    detail = inspectInterface(entry.globalName, entry.globalName || entry.name);
    $('#ifaceSelected').textContent = safe({mdn:entry.name,documentedMembers:entry.documentedMembers,...detail});
    $('#ifaceGlobal').value = entry.globalName || '';
    if (entry.instancePath) $('#ifaceInstancePath').value = entry.instancePath;
    populateMethods();
  }

  async function callSelected() {
    if (!detail) throw new Error('Select an exposed/mapped interface first.');
    const methodValue = $('#ifaceMethod').value; if (!methodValue) throw new Error('No method selected.');
    const args = JSON.parse($('#ifaceArgs').value || '[]'); if (!Array.isArray(args)) throw new Error('Arguments must be a JSON array.');
    const [scope, method] = methodValue.split(':'); let target;
    if (scope === 'static') target = globalThis[detail.globalName];
    else {
      const instancePath = $('#ifaceInstancePath').value.trim() || detail.sourcePath || '';
      if (instancePath) target = resolvePath(instancePath);
      else { const Ctor = globalThis[detail.globalName]; if (!detail.constructable) throw new Error('This interface needs an existing instance. Enter a path such as navigator.storage or document.'); target = Reflect.construct(Ctor, []); }
    }
    if (!target || typeof target[method] !== 'function') throw new Error(`${method} is not callable on the selected target.`);
    let result = target[method](...args); if (result && typeof result.then === 'function') result = await result;
    $('#ifaceCallResult').textContent = safe(result); log('Interface method call:', `${detail.interfaceName}.${method}`, result); return result;
  }

  function render() {
    const root = $('#ifaceResults'); if (!root) return;
    const q = ($('#ifaceFilter').value || '').trim().toLowerCase(); const mode = $('#ifaceMode').value || '';
    let rows = entries;
    if (q) rows = rows.filter(x=>`${x.name} ${x.globalName || ''} ${x.documentedMembers.map(m=>m.slug).join(' ')}`.toLowerCase().includes(q));
    if (mode==='exposed') rows=rows.filter(x=>x.exposed);
    if (mode==='mapped') rows=rows.filter(x=>x.exposed || x.instancePath);
    if (mode==='not-global') rows=rows.filter(x=>!x.exposed && !x.instancePath);
    if (mode==='unmatched-docs') rows=rows.filter(x=>x.documentedMembers.some(m=>!m.runtimeMatch));
    root.innerHTML = '';
    for (const x of rows.slice(0,1000)) {
      const card=document.createElement('article'); card.className='cap'; card.innerHTML='<div class="category">MDN recursive interface</div><h3></h3><div class="meta"></div><div class="line"><span class="status"></span><span class="policy safe"></span></div>';
      card.querySelector('h3').textContent=x.name; const meta=card.querySelector('.meta'); const st=card.querySelector('.status');
      const info=inspectInterface(x.globalName, x.globalName || x.name); const staticCalls=info.staticMembers.filter(m=>m.kind==='method').length; const instanceCalls=info.prototypeMembers.filter(m=>m.kind==='method').length; const matched=x.documentedMembers.filter(m=>m.runtimeMatch).length;
      if (x.exposed || x.instancePath) {
        meta.textContent=`${x.globalName || info.constructorName || x.name}${x.instancePath?` @ ${x.instancePath}`:''} • runtime methods ${staticCalls+instanceCalls} • documented members ${x.documentedMembers.length} (${matched} matched)`;
        st.textContent=x.exposed?'● global exposed':'● instance mapped'; st.classList.add('ok');
        const b=document.createElement('button'); b.textContent='Inspect / call'; b.onclick=()=>selectEntry(x); card.appendChild(b);
      } else {
        meta.textContent=`Documented member pages ${x.documentedMembers.length}. No exact Window global/known instance; check realm scanner/runtime inventory.`; st.textContent='○ indexed'; st.classList.add('warn');
      }
      card.querySelector('.policy').textContent=(x.exposed||x.instancePath)?'CALLABLE LOCALLY':'DISCOVERY'; root.appendChild(card);
    }
    $('#ifaceStatus').textContent=safe({...summary(),filtered:rows.length});
  }

  function exportAll() {
    const blob = new Blob([JSON.stringify({summary:summary(),entries}, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`super-api-recursive-mdn-${Date.now()}.json`; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  function build() {
    if ($('#interfaceHarnessPanel')) return;
    const p=document.createElement('section'); p.id='interfaceHarnessPanel'; p.className='panel';
    p.innerHTML=`<h2>Recursive all-interface harness</h2><p class="mini">Loads the entire current MDN Web/API subtree, including interface directories and direct documented member pages, then maps them to Window globals and known runtime instances. Worker/worklet and dynamically created objects remain covered by the realm/runtime scanners.</p><div class="row"><button id="ifaceLoad" class="primary">Load recursive MDN Web/API tree</button><button id="ifaceExport">Export full JSON</button><input id="ifaceFilter" class="grow" placeholder="Search interface/member…"><select id="ifaceMode"><option value="">All</option><option value="mapped">Global + known instances</option><option value="exposed">Window globals</option><option value="not-global">Not mapped</option><option value="unmatched-docs">Documented members not matched</option></select></div><pre id="ifaceStatus">Not loaded.</pre><details open><summary>Structured local interface method runner</summary><div class="grid"><label>Selected global<input id="ifaceGlobal" class="grow" readonly></label><label>Method<select id="ifaceMethod" class="grow"></select></label><label>Existing instance path<input id="ifaceInstancePath" class="grow" placeholder="navigator.storage / document / screen / ..."></label><label>Arguments JSON array<input id="ifaceArgs" class="grow" value="[]"></label></div><div class="row" style="margin-top:8px"><button id="ifaceCall" class="primary">Call selected method locally</button></div><p class="mini">This generic caller stays local. Peer control uses explicit test actions and inventory summaries; browser/OS permission and trusted-gesture requirements are not bypassed.</p><pre id="ifaceSelected">No interface selected.</pre><pre id="ifaceCallResult">No call yet.</pre></details><div id="ifaceResults" class="cap-grid"></div>`;
    const mdn=$('#mdnLivePanel'),realms=$('#realmScannerPanel'),runtime=$('#runtimeSurfacePanel'),media=$('#localVideo')?.closest('section.panel'); if(mdn)mdn.before(p);else if(realms)realms.before(p);else if(runtime)runtime.before(p);else if(media)media.before(p);else document.querySelector('main')?.append(p);
    $('#ifaceLoad').onclick=()=>loadIndex().catch(e=>{$('#ifaceStatus').textContent=`${e.name}: ${e.message}`;log('Interface harness error:',e.message);}); $('#ifaceExport').onclick=exportAll; $('#ifaceFilter').addEventListener('input',render); $('#ifaceMode').addEventListener('change',render); $('#ifaceCall').onclick=()=>callSelected().catch(e=>{$('#ifaceCallResult').textContent=`${e.name}: ${e.message}`;log('Interface call error:',e.message);});
  }

  function installPeerSummary() {
    const previous=window.SUPER_API_EXT_HANDLE;
    window.SUPER_API_EXT_HANDLE=async(channel,msg)=>{
      if(msg?.action!=='ext:interface-harness-summary')return typeof previous==='function'?previous(channel,msg):undefined;
      const send=payload=>{try{if(channel?.readyState==='open')channel.send(JSON.stringify(payload));}catch{}};
      const host=$('#hostBtn')?.classList.contains('primary')&&!$('#controllerBtn')?.classList.contains('primary');
      if(!host)return send({type:'error',action:msg.action,id:msg.id,error:'This peer is not in Controlled peer mode.'});
      if(!$('#allowRequests')?.checked)return send({type:'error',action:msg.action,id:msg.id,error:'Single session authorization is OFF on the controlled peer.'});
      try{if(!entries.length)await loadIndex();send({type:'result',action:msg.action,id:msg.id,result:summary()});}catch(e){send({type:'error',action:msg.action,id:msg.id,error:`${e.name}: ${e.message}`});}
    };
    const s=$('#remoteAction'); if(s&&![...s.options].some(o=>o.value==='ext:interface-harness-summary')){const o=document.createElement('option');o.value='ext:interface-harness-summary';o.textContent='SESSION • Recursive all-interface coverage summary';s.appendChild(o);}
  }

  build(); installPeerSummary(); setTimeout(installPeerSummary,500);
})();
