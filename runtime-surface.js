(() => {
  'use strict';

  const $ = s => document.querySelector(s);
  const logBox = $('#log');
  const log = (...xs) => {
    const text = xs.map(v => typeof v === 'string' ? v : safe(v)).join(' ');
    if (logBox) logBox.textContent = `[${new Date().toLocaleTimeString()}] ${text}\n` + logBox.textContent;
  };
  const safe = value => {
    const seen = new WeakSet();
    try {
      return JSON.stringify(value, (_k, v) => {
        if (typeof v === 'bigint') return String(v);
        if (typeof v === 'function') return `[Function ${v.name || 'anonymous'}]`;
        if (typeof Node !== 'undefined' && v instanceof Node) return `[${v.nodeName}]`;
        if (v && typeof v === 'object') {
          if (seen.has(v)) return '[Circular]';
          seen.add(v);
          if (v instanceof ArrayBuffer) return {arrayBuffer:true,byteLength:v.byteLength};
          if (ArrayBuffer.isView(v)) return {typedArray:v.constructor?.name,length:v.length ?? v.byteLength};
          if (v instanceof Blob) return {blob:true,size:v.size,type:v.type};
          if (v instanceof Response) return {response:true,status:v.status,type:v.type,url:v.url};
          if (v instanceof MediaStream) return {mediaStream:true,tracks:v.getTracks().map(t=>({kind:t.kind,label:t.label,readyState:t.readyState}))};
        }
        return v;
      }, 2);
    } catch { return String(value); }
  };

  const roots = {
    window: () => globalThis,
    navigator: () => navigator,
    document: () => document,
    screen: () => screen,
    history: () => history,
    performance: () => performance,
    crypto: () => crypto,
    caches: () => globalThis.caches,
    localStorage: () => globalThis.localStorage,
    sessionStorage: () => globalThis.sessionStorage,
    navigation: () => globalThis.navigation,
    scheduler: () => globalThis.scheduler,
    visualViewport: () => globalThis.visualViewport,
    'navigator.mediaDevices': () => navigator.mediaDevices,
    'navigator.storage': () => navigator.storage,
    'navigator.permissions': () => navigator.permissions,
    'navigator.serviceWorker': () => navigator.serviceWorker,
    'navigator.connection': () => navigator.connection || navigator.mozConnection || navigator.webkitConnection,
    'navigator.bluetooth': () => navigator.bluetooth,
    'navigator.usb': () => navigator.usb,
    'navigator.hid': () => navigator.hid,
    'navigator.serial': () => navigator.serial,
    'navigator.gpu': () => navigator.gpu,
    'navigator.xr': () => navigator.xr,
    'navigator.credentials': () => navigator.credentials,
    'navigator.locks': () => navigator.locks,
    'navigator.clipboard': () => navigator.clipboard,
    'navigator.mediaCapabilities': () => navigator.mediaCapabilities,
    'navigator.mediaSession': () => navigator.mediaSession,
    'navigator.wakeLock': () => navigator.wakeLock,
    'navigator.keyboard': () => navigator.keyboard,
    'navigator.virtualKeyboard': () => navigator.virtualKeyboard,
    'navigator.windowControlsOverlay': () => navigator.windowControlsOverlay,
    'navigator.audioSession': () => navigator.audioSession,
    'navigator.ink': () => navigator.ink,
    'navigator.devicePosture': () => navigator.devicePosture,
    cookieStore: () => globalThis.cookieStore,
    sharedStorage: () => globalThis.sharedStorage,
    speechSynthesis: () => globalThis.speechSynthesis,
    documentPictureInPicture: () => globalThis.documentPictureInPicture,
    modelContext: () => globalThis.modelContext,
    ai: () => globalThis.ai
  };

  const state = { constructors: [], roots: [], scannedAt: null };

  function descriptorKind(d) {
    if (!d) return 'unknown';
    if (typeof d.value === 'function') return 'method';
    if (d.get || d.set) return 'accessor';
    return 'property';
  }

  function collectPrototypeMembers(proto, owner, maxDepth = 8) {
    const out = [];
    const seen = new Set();
    let p = proto, depth = 0;
    while (p && depth++ < maxDepth) {
      let names = [];
      try { names = Reflect.ownKeys(p); } catch { break; }
      for (const key of names) {
        if (key === 'constructor') continue;
        const name = typeof key === 'symbol' ? key.toString() : key;
        if (seen.has(name)) continue;
        seen.add(name);
        let d = null;
        try { d = Object.getOwnPropertyDescriptor(p, key); } catch {}
        out.push({ owner, name, kind: descriptorKind(d), inheritedDepth: depth - 1, writable: !!d?.writable, getter: !!d?.get, setter: !!d?.set });
      }
      try { p = Object.getPrototypeOf(p); } catch { break; }
    }
    return out;
  }

  function scanConstructors() {
    const out = [];
    let names = [];
    try { names = Object.getOwnPropertyNames(globalThis); } catch {}
    for (const name of names.sort()) {
      let d;
      try { d = Object.getOwnPropertyDescriptor(globalThis, name); } catch { continue; }
      const v = d?.value;
      if (typeof v !== 'function' || !v.prototype) continue;
      let protoNames = [];
      try { protoNames = Object.getOwnPropertyNames(v.prototype); } catch {}
      if (!protoNames.length) continue;
      const members = collectPrototypeMembers(v.prototype, name, 5);
      out.push({ name, constructable: isConstructable(v), members, memberCount: members.length });
    }
    return out;
  }

  function isConstructable(fn) {
    try { Reflect.construct(String, [], fn); return true; } catch { return false; }
  }

  function scanRoots() {
    const out = [];
    for (const [path, getter] of Object.entries(roots)) {
      let obj;
      try { obj = getter(); } catch { obj = null; }
      if (obj == null) { out.push({path, available:false, members:[]}); continue; }
      let proto = null;
      try { proto = Object.getPrototypeOf(obj); } catch {}
      const own = [];
      let keys = [];
      try { keys = Reflect.ownKeys(obj); } catch {}
      for (const key of keys) {
        const name = typeof key === 'symbol' ? key.toString() : key;
        let d = null;
        try { d = Object.getOwnPropertyDescriptor(obj, key); } catch {}
        own.push({owner:path,name,kind:descriptorKind(d),inheritedDepth:-1,writable:!!d?.writable,getter:!!d?.get,setter:!!d?.set});
      }
      const inherited = proto ? collectPrototypeMembers(proto, path, 8) : [];
      const uniq = new Map();
      for (const m of [...own, ...inherited]) if (!uniq.has(m.name)) uniq.set(m.name,m);
      out.push({path,available:true,constructor:obj.constructor?.name || null,members:[...uniq.values()].sort((a,b)=>a.name.localeCompare(b.name))});
    }
    return out;
  }

  function scan() {
    state.constructors = scanConstructors();
    state.roots = scanRoots();
    state.scannedAt = new Date().toISOString();
    render();
    return summary();
  }

  function summary() {
    const ctorMembers = state.constructors.reduce((n,x)=>n+x.memberCount,0);
    const rootMembers = state.roots.reduce((n,x)=>n+x.members.length,0);
    return {
      scannedAt: state.scannedAt,
      constructors: state.constructors.length,
      constructorMembers: ctorMembers,
      rootsAvailable: state.roots.filter(x=>x.available).length,
      rootsTotal: state.roots.length,
      rootMembers,
      userAgent: navigator.userAgent,
      secureContext: isSecureContext
    };
  }

  function resolvePath(path) {
    const parts = String(path || '').trim().split('.').filter(Boolean);
    if (!parts.length) throw new Error('Enter a method path, for example navigator.storage.estimate');
    let obj = globalThis;
    let parent = null;
    for (const part of parts) {
      parent = obj;
      if (obj == null || !(part in obj)) throw new Error(`Path segment not found: ${part}`);
      obj = obj[part];
    }
    return { value: obj, parent };
  }

  async function invokeLocal() {
    const path = $('#runtimeCallPath')?.value?.trim();
    const argsText = $('#runtimeCallArgs')?.value?.trim() || '[]';
    const args = JSON.parse(argsText);
    if (!Array.isArray(args)) throw new Error('Arguments must be a JSON array.');
    const {value,parent} = resolvePath(path);
    if (typeof value !== 'function') throw new Error(`${path} is not callable.`);
    log('Local generic call:', path, args);
    let result = value.apply(parent, args);
    if (result && typeof result.then === 'function') result = await result;
    $('#runtimeCallResult').textContent = safe(result);
    log('Local generic call result:', path, result);
    return result;
  }

  function exportInventory() {
    const payload = {summary:summary(),constructors:state.constructors,roots:state.roots};
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download=`super-api-runtime-${Date.now()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  function render() {
    const q = ($('#runtimeFilter')?.value || '').trim().toLowerCase();
    const summaryEl = $('#runtimeSummary');
    if (summaryEl) summaryEl.textContent = safe(summary());
    const root = $('#runtimeResults');
    if (!root) return;
    root.innerHTML='';

    const rows = [];
    for (const c of state.constructors) {
      for (const m of c.members) rows.push({source:'interface',owner:c.name,...m});
    }
    for (const r of state.roots) {
      for (const m of r.members) rows.push({source:'root',owner:r.path,...m});
    }
    const filtered = q ? rows.filter(x=>`${x.owner} ${x.name} ${x.kind} ${x.source}`.toLowerCase().includes(q)) : rows;
    const limited = filtered.slice(0,1000);
    for (const x of limited) {
      const el=document.createElement('article');el.className='cap';
      el.innerHTML='<div class="category"></div><h3></h3><div class="meta"></div><div class="line"><span class="status ok">● exposed</span><span class="policy safe"></span></div>';
      el.querySelector('.category').textContent=x.source;
      el.querySelector('h3').textContent=`${x.owner}.${x.name}`;
      el.querySelector('.meta').textContent=`${x.kind}${x.inheritedDepth>=0?` • prototype depth ${x.inheritedDepth}`:' • own member'}`;
      el.querySelector('.policy').textContent=x.kind.toUpperCase();
      root.appendChild(el);
    }
    if (filtered.length > limited.length) {
      const note=document.createElement('p');note.className='mini';note.textContent=`Showing first ${limited.length} of ${filtered.length} matching exposed members. Use search or Export JSON for the complete inventory.`;root.appendChild(note);
    }
  }

  function buildUI() {
    if ($('#runtimeSurfacePanel')) return;
    const panel=document.createElement('section');panel.id='runtimeSurfacePanel';panel.className='panel';
    panel.innerHTML=`
      <h2>Runtime Web API surface explorer</h2>
      <p class="mini">The fixed catalog covers specification families. This explorer reflects the actual browser at runtime, including individual interfaces, constructors, methods, accessors, experimental APIs and vendor-specific surfaces. Reflection does not invoke getters while scanning.</p>
      <div class="row">
        <button id="runtimeRescan" class="primary">Scan every exposed surface</button>
        <button id="runtimeExport">Export complete JSON</button>
        <input id="runtimeFilter" class="grow" placeholder="Search interface/method/property…">
      </div>
      <pre id="runtimeSummary">Not scanned.</pre>
      <details>
        <summary>Local generic method runner</summary>
        <p class="mini">Runs only on this device from your click. It is intentionally not exposed as arbitrary remote method execution. Browser permission/user-activation rules still apply.</p>
        <div class="grid">
          <label>Method path<input id="runtimeCallPath" class="grow" placeholder="navigator.storage.estimate"></label>
          <label>Arguments JSON array<input id="runtimeCallArgs" class="grow" value="[]"></label>
        </div>
        <div class="row" style="margin-top:8px"><button id="runtimeCall" class="primary">Call locally</button></div>
        <pre id="runtimeCallResult">No call yet.</pre>
      </details>
      <div id="runtimeResults" class="cap-grid"></div>`;
    const media=$('#localVideo')?.closest('section.panel');
    if(media) media.before(panel); else document.querySelector('main')?.append(panel);
    $('#runtimeRescan').onclick=()=>{const s=scan();log('Runtime Web API scan complete:',s);};
    $('#runtimeExport').onclick=exportInventory;
    $('#runtimeFilter').addEventListener('input',render);
    $('#runtimeCall').onclick=async()=>{try{await invokeLocal();}catch(e){$('#runtimeCallResult').textContent=`${e.name}: ${e.message}`;log('Generic local call error:',e.message);}};
  }

  function installPeerInventoryAction() {
    const previous=window.SUPER_API_EXT_HANDLE;
    window.SUPER_API_EXT_HANDLE=async (channel,msg)=>{
      if(msg?.action !== 'ext:runtime-scan') return typeof previous==='function' ? previous(channel,msg) : undefined;
      const isHost = $('#hostBtn')?.classList.contains('primary') && !$('#controllerBtn')?.classList.contains('primary');
      if(!isHost) { try{channel.send(JSON.stringify({type:'error',action:msg.action,id:msg.id,error:'This peer is not in Controlled peer mode.'}));}catch{} return; }
      if(!$('#allowRequests')?.checked){try{channel.send(JSON.stringify({type:'error',action:msg.action,id:msg.id,error:'Single session authorization is OFF on the controlled peer.'}));}catch{} return;}
      try{
        const s=scan();
        const compact={...s,interfaceNames:state.constructors.map(x=>x.name),rootPaths:state.roots.filter(x=>x.available).map(x=>x.path)};
        channel.send(JSON.stringify({type:'result',action:msg.action,id:msg.id,result:compact}));
      }catch(e){try{channel.send(JSON.stringify({type:'error',action:msg.action,id:msg.id,error:e?.message||String(e)}));}catch{}}
    };
    const select=$('#remoteAction');
    if(select && ![...select.options].some(o=>o.value==='ext:runtime-scan')){
      const o=document.createElement('option');o.value='ext:runtime-scan';o.textContent='SESSION • Runtime Web API surface inventory';select.appendChild(o);
    }
  }

  buildUI();
  installPeerInventoryAction();
  setTimeout(()=>{scan();installPeerInventoryAction();},300);
})();
