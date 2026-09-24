(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const API_URL = 'https://api.github.com/repos/mdn/content/contents/files/en-us/web/api?ref=main';
  const logBox = $('#log');
  const log = (...xs) => { const t = xs.map(x => typeof x === 'string' ? x : safe(x)).join(' '); if (logBox) logBox.textContent = `[${new Date().toLocaleTimeString()}] ${t}\n` + logBox.textContent; };
  const safe = v => { const seen = new WeakSet(); try { return JSON.stringify(v, (_k, x) => { if (typeof x === 'bigint') return String(x); if (typeof x === 'function') return `[Function ${x.name || 'anonymous'}]`; if (x && typeof x === 'object') { if (seen.has(x)) return '[Circular]'; seen.add(x); if (typeof Node !== 'undefined' && x instanceof Node) return `[${x.nodeName}]`; if (x instanceof Blob) return {blob:true,size:x.size,type:x.type}; if (x instanceof ArrayBuffer) return {arrayBuffer:true,byteLength:x.byteLength}; } return x; }, 2); } catch { return String(v); } };
  const normalize = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  let entries = [];
  let detail = null;

  function descriptors(obj, maxDepth = 5) {
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

  function inspectGlobal(globalName) {
    if (!globalName || !(globalName in globalThis)) return null;
    const value = globalThis[globalName];
    const type = typeof value;
    const staticMembers = value && (type === 'function' || type === 'object') ? descriptors(value, 2) : [];
    const proto = type === 'function' ? value.prototype : Object.getPrototypeOf(value);
    const prototypeMembers = proto ? descriptors(proto, 5) : [];
    let constructable = false;
    if (type === 'function') { try { Reflect.construct(String, [], value); constructable = true; } catch {} }
    return {globalName,type,constructorName:value?.constructor?.name || null,functionLength:type === 'function' ? value.length : null,constructable,staticMembers,prototypeMembers};
  }

  async function loadIndex() {
    $('#ifaceStatus').textContent = 'Loading current MDN Web/API directory…';
    const r = await fetch(API_URL, {headers:{Accept:'application/vnd.github+json'},cache:'no-store'});
    if (!r.ok) throw new Error(`GitHub API ${r.status}`);
    const data = await r.json();
    const gm = globalMap();
    entries = data.filter(x=>x.type==='dir').map(x=>{ const globalName = gm.get(normalize(x.name)) || null; return {name:x.name,globalName,exposed:!!globalName,sha:x.sha,path:x.path}; }).sort((a,b)=>a.name.localeCompare(b.name));
    render(); const s = summary(); $('#ifaceStatus').textContent = safe(s); log('Interface harness loaded:', s); return s;
  }

  function summary() { return {mdnEntries:entries.length,exactGlobals:entries.filter(x=>x.exposed).length,reflectedGlobals:entries.filter(x=>x.exposed && inspectGlobal(x.globalName)).length,note:'Non-global entries may be dictionaries, instance-only objects, worker/worklet-only interfaces, overview pages, or unsupported APIs.'}; }

  function resolvePath(path) {
    const parts = String(path || '').trim().split('.').filter(Boolean); if (!parts.length) return null;
    let obj = globalThis; for (const part of parts) { if (obj == null || !(part in obj)) throw new Error(`Path segment not found: ${part}`); obj = obj[part]; }
    return obj;
  }

  function populateMethods() {
    const sel = $('#ifaceMethod'); if (!sel) return; sel.innerHTML = ''; if (!detail) return;
    for (const m of detail.staticMembers.filter(x=>x.kind==='method')) { const o=document.createElement('option'); o.value=`static:${m.name}`; o.textContent=`static • ${m.name}`; sel.appendChild(o); }
    for (const m of detail.prototypeMembers.filter(x=>x.kind==='method')) { const o=document.createElement('option'); o.value=`prototype:${m.name}`; o.textContent=`instance • ${m.name}`; sel.appendChild(o); }
  }

  function selectEntry(entry) {
    detail = inspectGlobal(entry.globalName);
    $('#ifaceSelected').textContent = detail ? safe({mdn:entry.name,...detail}) : safe({mdn:entry.name,exposedGlobal:null});
    $('#ifaceGlobal').value = entry.globalName || ''; populateMethods();
  }

  async function callSelected() {
    if (!detail) throw new Error('Select an exposed interface first.');
    const methodValue = $('#ifaceMethod').value; if (!methodValue) throw new Error('No method selected.');
    const args = JSON.parse($('#ifaceArgs').value || '[]'); if (!Array.isArray(args)) throw new Error('Arguments must be a JSON array.');
    const [scope, method] = methodValue.split(':'); let target;
    if (scope === 'static') target = globalThis[detail.globalName];
    else {
      const instancePath = $('#ifaceInstancePath').value.trim();
      if (instancePath) target = resolvePath(instancePath);
      else { const Ctor = globalThis[detail.globalName]; if (!detail.constructable) throw new Error('This interface needs an existing instance. Enter a path such as navigator.storage or document.'); target = Reflect.construct(Ctor, []); }
    }
    if (!target || typeof target[method] !== 'function') throw new Error(`${method} is not callable on the selected target.`);
    let result = target[method](...args); if (result && typeof result.then === 'function') result = await result;
    $('#ifaceCallResult').textContent = safe(result); log('Interface method call:', `${detail.globalName}.${method}`, result); return result;
  }

  function render() {
    const root = $('#ifaceResults'); if (!root) return;
    const q = ($('#ifaceFilter').value || '').trim().toLowerCase(); const mode = $('#ifaceMode').value || '';
    let rows = entries; if (q) rows = rows.filter(x=>`${x.name} ${x.globalName || ''}`.toLowerCase().includes(q)); if (mode==='exposed') rows=rows.filter(x=>x.exposed); if (mode==='not-global') rows=rows.filter(x=>!x.exposed);
    root.innerHTML = '';
    for (const x of rows.slice(0,1000)) {
      const card=document.createElement('article'); card.className='cap'; card.innerHTML='<div class="category">MDN interface/page</div><h3></h3><div class="meta"></div><div class="line"><span class="status"></span><span class="policy safe"></span></div>';
      card.querySelector('h3').textContent=x.name; const meta=card.querySelector('.meta'); const st=card.querySelector('.status');
      if (x.exposed) {
        const info=inspectGlobal(x.globalName); const staticCalls=info?.staticMembers.filter(m=>m.kind==='method').length||0; const instanceCalls=info?.prototypeMembers.filter(m=>m.kind==='method').length||0;
        meta.textContent=`${x.globalName} • static methods ${staticCalls} • instance methods ${instanceCalls}`; st.textContent='● exposed'; st.classList.add('ok');
        const b=document.createElement('button'); b.textContent='Inspect / call'; b.onclick=()=>selectEntry(x); card.appendChild(b);
      } else { meta.textContent='No exact Window global. Check realm scanner/runtime inventory; this may be instance-only, worker-only, a dictionary, an event type, or unsupported.'; st.textContent='○ indexed'; st.classList.add('warn'); }
      card.querySelector('.policy').textContent=x.exposed?'CALLABLE LOCALLY':'DISCOVERY'; root.appendChild(card);
    }
    $('#ifaceStatus').textContent=safe({...summary(),filtered:rows.length});
  }

  function build() {
    if ($('#interfaceHarnessPanel')) return;
    const p=document.createElement('section'); p.id='interfaceHarnessPanel'; p.className='panel';
    p.innerHTML=`<h2>All-interface harness</h2><p class="mini">Loads every current MDN Web/API top-level page, maps exact exposed browser globals, reflects static/prototype members, and provides a structured local method runner. Dictionaries and unsupported interfaces are reported rather than falsely treated as callable constructors.</p><div class="row"><button id="ifaceLoad" class="primary">Load every MDN interface/page</button><input id="ifaceFilter" class="grow" placeholder="Search interface…"><select id="ifaceMode"><option value="">All</option><option value="exposed">Exposed globals</option><option value="not-global">Not Window-global</option></select></div><pre id="ifaceStatus">Not loaded.</pre><details open><summary>Structured local interface method runner</summary><div class="grid"><label>Selected global<input id="ifaceGlobal" class="grow" readonly></label><label>Method<select id="ifaceMethod" class="grow"></select></label><label>Existing instance path (for instance methods)<input id="ifaceInstancePath" class="grow" placeholder="navigator.storage / document / screen / ..."></label><label>Arguments JSON array<input id="ifaceArgs" class="grow" value="[]"></label></div><div class="row" style="margin-top:8px"><button id="ifaceCall" class="primary">Call selected method locally</button></div><pre id="ifaceSelected">No interface selected.</pre><pre id="ifaceCallResult">No call yet.</pre></details><div id="ifaceResults" class="cap-grid"></div>`;
    const mdn=$('#mdnLivePanel'),realms=$('#realmScannerPanel'),runtime=$('#runtimeSurfacePanel'),media=$('#localVideo')?.closest('section.panel'); if(mdn)mdn.before(p);else if(realms)realms.before(p);else if(runtime)runtime.before(p);else if(media)media.before(p);else document.querySelector('main')?.append(p);
    $('#ifaceLoad').onclick=()=>loadIndex().catch(e=>{$('#ifaceStatus').textContent=`${e.name}: ${e.message}`;log('Interface harness error:',e.message);}); $('#ifaceFilter').addEventListener('input',render); $('#ifaceMode').addEventListener('change',render); $('#ifaceCall').onclick=()=>callSelected().catch(e=>{$('#ifaceCallResult').textContent=`${e.name}: ${e.message}`;log('Interface call error:',e.message);});
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
    const s=$('#remoteAction'); if(s&&![...s.options].some(o=>o.value==='ext:interface-harness-summary')){const o=document.createElement('option');o.value='ext:interface-harness-summary';o.textContent='SESSION • All-interface coverage summary';s.appendChild(o);}
  }

  build(); installPeerSummary(); setTimeout(installPeerSummary,500);
})();
