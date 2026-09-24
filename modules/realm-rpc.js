(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);
  const logBox = $('#log');
  const log = (...items) => {
    const text = items.map(item => typeof item === 'string' ? item : safe(item)).join(' ');
    if (logBox) logBox.textContent = `[${new Date().toLocaleTimeString()}] ${text}\n${logBox.textContent}`;
  };
  const safe = value => {
    const seen = new WeakSet();
    try {
      return JSON.stringify(value, (_key, item) => {
        if (typeof item === 'bigint') return String(item);
        if (typeof item === 'function') return `[Function ${item.name || 'anonymous'}]`;
        if (item && typeof item === 'object') {
          if (seen.has(item)) return '[Circular]';
          seen.add(item);
          if (typeof Node !== 'undefined' && item instanceof Node) return `[${item.nodeName}]`;
          if (item instanceof Blob) return { blob: true, size: item.size, type: item.type };
          if (item instanceof ArrayBuffer) return { arrayBuffer: true, byteLength: item.byteLength };
          if (ArrayBuffer.isView(item)) return { typedArray: item.constructor?.name, byteLength: item.byteLength };
        }
        return item;
      }, 2);
    } catch {
      return String(value);
    }
  };
  const withTimeout = (promise, ms, label) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), ms))
  ]);

  const windowHandles = new Map();
  const seeded = new Map();
  let handleSeq = 1;
  let dedicated = null;
  let shared = null;
  let audio = null;
  let service = null;
  const pending = new Map();
  let requestSeq = 1;

  function membersOf(object, maxDepth = 8) {
    const seen = new Set();
    const result = [];
    let current = object;
    let depth = 0;
    while (current && depth++ < maxDepth) {
      let keys = [];
      try { keys = Reflect.ownKeys(current); } catch { break; }
      for (const key of keys) {
        const name = typeof key === 'symbol' ? key.toString() : String(key);
        if (name === 'constructor' || seen.has(name)) continue;
        seen.add(name);
        let descriptor = null;
        try { descriptor = Object.getOwnPropertyDescriptor(current, key); } catch {}
        result.push({
          name,
          kind: typeof descriptor?.value === 'function' ? 'method' : (descriptor?.get || descriptor?.set ? 'accessor' : 'property'),
          depth: depth - 1,
          getter: !!descriptor?.get,
          setter: !!descriptor?.set,
          writable: !!descriptor?.writable
        });
      }
      try { current = Object.getPrototypeOf(current); } catch { break; }
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }

  function preview(value) {
    if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) return value;
    if (typeof value === 'bigint') return String(value);
    if (value instanceof Error) return { error: true, name: value.name, message: value.message };
    if (value instanceof Blob) return { blob: true, size: value.size, type: value.type };
    if (value instanceof ArrayBuffer) return { arrayBuffer: true, byteLength: value.byteLength };
    if (ArrayBuffer.isView(value)) return { typedArray: value.constructor?.name || null, byteLength: value.byteLength };
    if (value instanceof URL) return { url: value.href };
    if (value instanceof Request) return { request: true, method: value.method, url: value.url, mode: value.mode, credentials: value.credentials };
    if (value instanceof Response) return { response: true, status: value.status, type: value.type, url: value.url };
    if (typeof Node !== 'undefined' && value instanceof Node) return { node: value.nodeName, id: value.id || null, className: typeof value.className === 'string' ? value.className : null };
    return { constructor: value?.constructor?.name || typeof value };
  }

  function packWindow(value) {
    if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) return { value };
    if (typeof value === 'bigint') return { value: String(value), bigint: true };
    const id = `w${handleSeq++}`;
    windowHandles.set(id, value);
    return {
      handle: id,
      type: typeof value,
      constructor: value?.constructor?.name || null,
      preview: preview(value),
      members: membersOf(value, 4).slice(0, 250)
    };
  }

  function decodeWindow(value) {
    if (Array.isArray(value)) return value.map(decodeWindow);
    if (value && typeof value === 'object') {
      if (typeof value.$handle === 'string') {
        if (!windowHandles.has(value.$handle)) throw new Error(`Unknown Window handle: ${value.$handle}`);
        return windowHandles.get(value.$handle);
      }
      const output = {};
      for (const [key, item] of Object.entries(value)) output[key] = decodeWindow(item);
      return output;
    }
    return value;
  }

  async function seedWindowRoot(name) {
    if (seeded.has(name)) return seeded.get(name);
    let value;
    switch (name) {
      case 'global': value = globalThis; break;
      case 'navigator': value = navigator; break;
      case 'document': value = document; break;
      case 'screen': value = screen; break;
      case 'performance': value = performance; break;
      case 'crypto': value = crypto; break;
      case 'caches': value = globalThis.caches; break;
      case 'indexedDB': value = globalThis.indexedDB; break;
      case 'scheduler': value = globalThis.scheduler; break;
      case 'navigation': value = globalThis.navigation; break;
      case 'mediaDevices': value = navigator.mediaDevices; break;
      case 'serviceWorker': value = navigator.serviceWorker; break;
      case 'storage': value = navigator.storage; break;
      case 'permissions': value = navigator.permissions; break;
      case 'credentials': value = navigator.credentials; break;
      case 'clipboard': value = navigator.clipboard; break;
      case 'canvas': value = document.createElement('canvas'); break;
      case 'canvas2d': {
        const canvas = document.createElement('canvas');
        value = canvas.getContext('2d');
        break;
      }
      case 'webgl': {
        const canvas = document.createElement('canvas');
        value = canvas.getContext('webgl');
        break;
      }
      case 'webgl2': {
        const canvas = document.createElement('canvas');
        value = canvas.getContext('webgl2');
        break;
      }
      case 'offscreenCanvas': value = globalThis.OffscreenCanvas ? new OffscreenCanvas(64, 64) : null; break;
      case 'audioContext': {
        const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
        value = AC ? new AC() : null;
        break;
      }
      case 'rtcPeer': value = globalThis.RTCPeerConnection ? new RTCPeerConnection() : null; break;
      case 'rtcDataChannel': {
        if (!globalThis.RTCPeerConnection) value = null;
        else {
          const pc = seeded.get('rtcPeer') || new RTCPeerConnection();
          seeded.set('rtcPeer', pc);
          value = pc.createDataChannel('super-api-realm-rpc');
        }
        break;
      }
      case 'messageChannel': value = globalThis.MessageChannel ? new MessageChannel() : null; break;
      case 'broadcastChannel': value = globalThis.BroadcastChannel ? new BroadcastChannel(`super-api-${Date.now()}`) : null; break;
      case 'abortController': value = globalThis.AbortController ? new AbortController() : null; break;
      case 'opfs': value = navigator.storage?.getDirectory ? await navigator.storage.getDirectory() : null; break;
      case 'webgpuAdapter': value = navigator.gpu ? await navigator.gpu.requestAdapter() : null; break;
      case 'webgpuDevice': {
        const adapter = seeded.get('webgpuAdapter') || (navigator.gpu ? await navigator.gpu.requestAdapter() : null);
        if (adapter) seeded.set('webgpuAdapter', adapter);
        value = adapter ? await adapter.requestDevice() : null;
        break;
      }
      case 'webgpuQueue': {
        const device = seeded.get('webgpuDevice') || await seedWindowRoot('webgpuDevice');
        value = device?.queue || null;
        break;
      }
      default: {
        if (name in globalThis) value = globalThis[name];
        else if (name in navigator) value = navigator[name];
        else throw new Error(`Unknown Window root: ${name}`);
      }
    }
    if (value == null) throw new Error(`${name} is not available in this browser.`);
    seeded.set(name, value);
    return value;
  }

  async function resolveWindowTarget(target = {}) {
    if (target.handle) {
      if (!windowHandles.has(target.handle)) throw new Error(`Unknown Window handle: ${target.handle}`);
      return windowHandles.get(target.handle);
    }
    const root = await seedWindowRoot(target.root || 'global');
    let value = root;
    for (const part of target.path || []) {
      if (value == null || !(part in value)) throw new Error(`Path segment not found: ${part}`);
      value = value[part];
    }
    return value;
  }

  async function executeWindow(command = {}) {
    const op = command.op || 'inspect';
    if (op === 'roots') {
      return {
        roots: [
          'global','navigator','document','screen','performance','crypto','caches','indexedDB','scheduler','navigation',
          'mediaDevices','serviceWorker','storage','permissions','credentials','clipboard','canvas','canvas2d','webgl','webgl2',
          'offscreenCanvas','audioContext','rtcPeer','rtcDataChannel','messageChannel','broadcastChannel','abortController',
          'opfs','webgpuAdapter','webgpuDevice','webgpuQueue'
        ],
        globals: Object.getOwnPropertyNames(globalThis).sort()
      };
    }
    if (op === 'release') {
      if (command.handle) windowHandles.delete(command.handle);
      return { released: command.handle || null, handleCount: windowHandles.size };
    }
    if (op === 'seed') {
      const value = await seedWindowRoot(command.name);
      return packWindow(value);
    }
    const target = await resolveWindowTarget(command.target || {});
    if (op === 'inspect') return { constructor: target?.constructor?.name || null, type: typeof target, members: membersOf(target) };
    if (op === 'get') return packWindow(target?.[command.member]);
    if (op === 'set') {
      target[command.member] = decodeWindow(command.value);
      return packWindow(target[command.member]);
    }
    if (op === 'call') {
      const fn = target?.[command.member];
      if (typeof fn !== 'function') throw new Error(`${command.member} is not callable on the selected target.`);
      let result = fn.apply(target, decodeWindow(command.args || []));
      if (result && typeof result.then === 'function') result = await result;
      return packWindow(result);
    }
    if (op === 'construct') {
      if (typeof target !== 'function') throw new Error('Selected target is not constructable.');
      const result = Reflect.construct(target, decodeWindow(command.args || []));
      return packWindow(result);
    }
    throw new Error(`Unsupported Window operation: ${op}`);
  }

  function brokerSource(mode) {
    const sharedPrefix = mode === 'shared' ? `
      onconnect = event => {
        const port = event.ports[0];
        port.start();
        port.onmessage = event => handle(event.data).then(
          result => port.postMessage({id:event.data.id, ok:true, result}),
          error => port.postMessage({id:event.data.id, ok:false, error:String(error?.message || error)})
        );
      };
    ` : `
      onmessage = event => handle(event.data).then(
        result => postMessage({id:event.data.id, ok:true, result}),
        error => postMessage({id:event.data.id, ok:false, error:String(error?.message || error)})
      );
    `;
    return `
      const handles = new Map();
      let seq = 1;
      const roots = {
        global: globalThis,
        navigator: globalThis.navigator,
        performance: globalThis.performance,
        crypto: globalThis.crypto,
        caches: globalThis.caches,
        indexedDB: globalThis.indexedDB,
        scheduler: globalThis.scheduler
      };
      function membersOf(object,maxDepth=8){
        const seen=new Set(),result=[];let current=object,depth=0;
        while(current&&depth++<maxDepth){
          let keys=[];try{keys=Reflect.ownKeys(current)}catch{break}
          for(const key of keys){
            const name=typeof key==='symbol'?key.toString():String(key);
            if(name==='constructor'||seen.has(name))continue;
            seen.add(name);let descriptor=null;try{descriptor=Object.getOwnPropertyDescriptor(current,key)}catch{}
            result.push({name,kind:typeof descriptor?.value==='function'?'method':(descriptor?.get||descriptor?.set?'accessor':'property'),depth:depth-1});
          }
          try{current=Object.getPrototypeOf(current)}catch{break}
        }
        return result.sort((a,b)=>a.name.localeCompare(b.name));
      }
      function pack(value){
        if(value==null||['string','number','boolean'].includes(typeof value))return {value};
        if(typeof value==='bigint')return {value:String(value),bigint:true};
        const id='h'+seq++;handles.set(id,value);
        return {handle:id,type:typeof value,constructor:value?.constructor?.name||null,members:membersOf(value,4).slice(0,250)};
      }
      function decode(value){
        if(Array.isArray(value))return value.map(decode);
        if(value&&typeof value==='object'){
          if(typeof value.$handle==='string'){
            if(!handles.has(value.$handle))throw new Error('Unknown handle: '+value.$handle);
            return handles.get(value.$handle);
          }
          const out={};for(const [key,item] of Object.entries(value))out[key]=decode(item);return out;
        }
        return value;
      }
      function resolve(target={}){
        if(target.handle){
          if(!handles.has(target.handle))throw new Error('Unknown handle: '+target.handle);
          return handles.get(target.handle);
        }
        let value=roots[target.root||'global'];
        if(value==null)throw new Error('Root unavailable: '+(target.root||'global'));
        for(const part of target.path||[]){
          if(value==null||!(part in value))throw new Error('Path segment not found: '+part);
          value=value[part];
        }
        return value;
      }
      async function handle(message={}){
        const command=message.command||{};
        const op=command.op||'inspect';
        if(op==='roots')return {roots:Object.entries(roots).filter(([,value])=>value!=null).map(([name])=>name),globals:Object.getOwnPropertyNames(globalThis).sort()};
        if(op==='release'){if(command.handle)handles.delete(command.handle);return {released:command.handle||null,handleCount:handles.size};}
        const target=resolve(command.target||{});
        if(op==='inspect')return {constructor:target?.constructor?.name||null,type:typeof target,members:membersOf(target)};
        if(op==='get')return pack(target?.[command.member]);
        if(op==='set'){target[command.member]=decode(command.value);return pack(target[command.member]);}
        if(op==='call'){
          const fn=target?.[command.member];
          if(typeof fn!=='function')throw new Error(command.member+' is not callable.');
          let result=fn.apply(target,decode(command.args||[]));if(result&&typeof result.then==='function')result=await result;return pack(result);
        }
        if(op==='construct'){
          if(typeof target!=='function')throw new Error('Selected target is not constructable.');
          return pack(Reflect.construct(target,decode(command.args||[])));
        }
        throw new Error('Unsupported operation: '+op);
      }
      ${sharedPrefix}
    `;
  }

  function attachPort(port, label) {
    port.start?.();
    port.onmessage = event => {
      const message = event.data || {};
      const record = pending.get(`${label}:${message.id}`);
      if (!record) return;
      pending.delete(`${label}:${message.id}`);
      if (message.ok) record.resolve(message.result);
      else record.reject(new Error(message.error || `${label} broker error`));
    };
    port.onmessageerror = () => {
      for (const [key, record] of pending) {
        if (key.startsWith(`${label}:`)) {
          pending.delete(key);
          record.reject(new Error(`${label} message error`));
        }
      }
    };
    return port;
  }

  function requestPort(port, label, command) {
    const id = requestSeq++;
    const key = `${label}:${id}`;
    const promise = new Promise((resolve, reject) => pending.set(key, { resolve, reject }));
    port.postMessage({ id, command });
    return withTimeout(promise.finally(() => pending.delete(key)), 10000, `${label} RPC`);
  }

  async function ensureDedicated() {
    if (dedicated) return dedicated;
    if (!globalThis.Worker) throw new Error('Dedicated Worker unavailable.');
    const url = URL.createObjectURL(new Blob([brokerSource('dedicated')], { type: 'text/javascript' }));
    const worker = new Worker(url);
    URL.revokeObjectURL(url);
    worker.onmessage = event => {
      const message = event.data || {};
      const record = pending.get(`dedicated:${message.id}`);
      if (!record) return;
      pending.delete(`dedicated:${message.id}`);
      if (message.ok) record.resolve(message.result);
      else record.reject(new Error(message.error || 'Dedicated Worker broker error'));
    };
    dedicated = worker;
    return worker;
  }

  async function dispatchDedicated(command) {
    const worker = await ensureDedicated();
    const id = requestSeq++;
    const key = `dedicated:${id}`;
    const promise = new Promise((resolve, reject) => pending.set(key, { resolve, reject }));
    worker.postMessage({ id, command });
    return withTimeout(promise.finally(() => pending.delete(key)), 10000, 'Dedicated Worker RPC');
  }

  async function ensureShared() {
    if (shared) return shared;
    if (!globalThis.SharedWorker) throw new Error('Shared Worker unavailable.');
    const url = URL.createObjectURL(new Blob([brokerSource('shared')], { type: 'text/javascript' }));
    const worker = new SharedWorker(url, { name: `super-api-realm-rpc-${Date.now()}` });
    URL.revokeObjectURL(url);
    shared = { worker, port: attachPort(worker.port, 'shared') };
    return shared;
  }

  async function dispatchShared(command) {
    const item = await ensureShared();
    return requestPort(item.port, 'shared', command);
  }

  async function ensureService() {
    if (service) return service;
    if (!navigator.serviceWorker) throw new Error('Service Worker unavailable.');
    const registration = await navigator.serviceWorker.register('./workers/realm-rpc-sw.js', { scope: './workers/realm-rpc-scope/' });
    await navigator.serviceWorker.ready.catch(() => {});
    let worker = registration.active || registration.waiting || registration.installing;
    if (worker?.state === 'installing') {
      await withTimeout(new Promise(resolve => worker.addEventListener('statechange', () => {
        if (worker.state === 'activated') resolve();
      })), 10000, 'Realm Service Worker activation').catch(() => {});
      worker = registration.active || registration.waiting || worker;
    }
    if (!worker) throw new Error('Realm Service Worker is not active yet.');
    service = { registration, worker };
    return service;
  }

  async function dispatchService(command) {
    const item = await ensureService();
    const channel = new MessageChannel();
    const promise = new Promise((resolve, reject) => {
      channel.port1.onmessage = event => event.data?.ok ? resolve(event.data.result) : reject(new Error(event.data?.error || 'Service Worker broker error'));
      channel.port1.onmessageerror = () => reject(new Error('Service Worker broker message error'));
    });
    item.worker.postMessage({ type: 'super-api-realm-rpc', command }, [channel.port2]);
    return withTimeout(promise, 10000, 'Service Worker RPC');
  }

  async function ensureAudio() {
    if (audio) return audio;
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) throw new Error('Web Audio unavailable.');
    const context = new AC();
    if (!context.audioWorklet?.addModule) {
      await context.close();
      throw new Error('AudioWorklet unavailable.');
    }
    const processorName = `super-api-rpc-${Date.now()}`;
    const source = `
      class SuperApiRealmRpc extends AudioWorkletProcessor {
        constructor(){
          super();
          this.handles=new Map();this.seq=1;
          this.roots={global:globalThis,processor:this,port:this.port};
          this.port.onmessage=event=>this.handle(event.data).then(
            result=>this.port.postMessage({id:event.data.id,ok:true,result}),
            error=>this.port.postMessage({id:event.data.id,ok:false,error:String(error?.message||error)})
          );
        }
        members(object,maxDepth=6){
          const seen=new Set(),result=[];let current=object,depth=0;
          while(current&&depth++<maxDepth){
            let keys=[];try{keys=Reflect.ownKeys(current)}catch{break}
            for(const key of keys){
              const name=typeof key==='symbol'?key.toString():String(key);
              if(name==='constructor'||seen.has(name))continue;
              seen.add(name);let d=null;try{d=Object.getOwnPropertyDescriptor(current,key)}catch{}
              result.push({name,kind:typeof d?.value==='function'?'method':(d?.get||d?.set?'accessor':'property'),depth:depth-1});
            }
            try{current=Object.getPrototypeOf(current)}catch{break}
          }
          return result.sort((a,b)=>a.name.localeCompare(b.name));
        }
        pack(value){
          if(value==null||['string','number','boolean'].includes(typeof value))return {value};
          if(typeof value==='bigint')return {value:String(value),bigint:true};
          const id='a'+this.seq++;this.handles.set(id,value);
          return {handle:id,type:typeof value,constructor:value?.constructor?.name||null,members:this.members(value,4).slice(0,250)};
        }
        decode(value){
          if(Array.isArray(value))return value.map(item=>this.decode(item));
          if(value&&typeof value==='object'){
            if(typeof value.$handle==='string'){
              if(!this.handles.has(value.$handle))throw new Error('Unknown handle: '+value.$handle);
              return this.handles.get(value.$handle);
            }
            const out={};for(const [key,item] of Object.entries(value))out[key]=this.decode(item);return out;
          }
          return value;
        }
        resolve(target={}){
          if(target.handle){
            if(!this.handles.has(target.handle))throw new Error('Unknown handle: '+target.handle);
            return this.handles.get(target.handle);
          }
          let value=this.roots[target.root||'global'];
          if(value==null)throw new Error('Root unavailable: '+(target.root||'global'));
          for(const part of target.path||[]){
            if(value==null||!(part in value))throw new Error('Path segment not found: '+part);
            value=value[part];
          }
          return value;
        }
        async handle(message={}){
          const command=message.command||{};const op=command.op||'inspect';
          if(op==='roots')return {roots:Object.keys(this.roots),globals:Object.getOwnPropertyNames(globalThis).sort()};
          if(op==='release'){if(command.handle)this.handles.delete(command.handle);return {released:command.handle||null,handleCount:this.handles.size};}
          const target=this.resolve(command.target||{});
          if(op==='inspect')return {constructor:target?.constructor?.name||null,type:typeof target,members:this.members(target)};
          if(op==='get')return this.pack(target?.[command.member]);
          if(op==='set'){target[command.member]=this.decode(command.value);return this.pack(target[command.member]);}
          if(op==='call'){const fn=target?.[command.member];if(typeof fn!=='function')throw new Error(command.member+' is not callable.');let result=fn.apply(target,this.decode(command.args||[]));if(result&&typeof result.then==='function')result=await result;return this.pack(result);}
          if(op==='construct'){if(typeof target!=='function')throw new Error('Selected target is not constructable.');return this.pack(Reflect.construct(target,this.decode(command.args||[])));}
          throw new Error('Unsupported operation: '+op);
        }
        process(){return true;}
      }
      registerProcessor('${processorName}',SuperApiRealmRpc);
    `;
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    try {
      await context.audioWorklet.addModule(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    const node = new AudioWorkletNode(context, processorName);
    audio = { context, node, port: attachPort(node.port, 'audio') };
    return audio;
  }

  async function dispatchAudio(command) {
    const item = await ensureAudio();
    return requestPort(item.port, 'audio', command);
  }

  async function dispatchRealm(realm, command) {
    switch (realm) {
      case 'window': return executeWindow(command);
      case 'dedicated-worker': return dispatchDedicated(command);
      case 'shared-worker': return dispatchShared(command);
      case 'service-worker': return dispatchService(command);
      case 'audio-worklet': return dispatchAudio(command);
      default: throw new Error(`Unknown realm: ${realm}`);
    }
  }

  function parseTarget(text) {
    const raw = String(text || '').trim();
    if (!raw) return { root: 'global', path: [] };
    if (raw.startsWith('@')) return { handle: raw.slice(1) };
    const parts = raw.split('.').filter(Boolean);
    return { root: parts.shift() || 'global', path: parts };
  }

  function commandFromUI() {
    const op = $('#realmRpcOp')?.value || 'inspect';
    const payloadText = $('#realmRpcPayload')?.value?.trim() || '[]';
    let payload;
    try { payload = JSON.parse(payloadText); }
    catch (error) { throw new Error(`Payload JSON is invalid: ${error.message}`); }
    const command = {
      op,
      target: parseTarget($('#realmRpcTarget')?.value),
      member: $('#realmRpcMember')?.value?.trim() || undefined
    };
    if (op === 'call' || op === 'construct') {
      if (!Array.isArray(payload)) throw new Error('call/construct payload must be a JSON array.');
      command.args = payload;
    } else if (op === 'set') command.value = payload;
    else if (op === 'release') command.handle = (command.target.handle || $('#realmRpcTarget')?.value?.replace(/^@/, ''));
    else if (op === 'seed') command.name = $('#realmRpcTarget')?.value?.trim();
    return command;
  }

  function openPeerChannel() {
    const channels = [...(window.__superApiTrackedChannels || [])].filter(channel => channel.readyState === 'open');
    if (!channels.length) throw new Error('Peer data channel is not connected.');
    return channels[channels.length - 1];
  }

  function renderResult(value) {
    const box = $('#realmRpcResult');
    if (box) box.textContent = safe(value);
    log('Realm RPC result:', value);
  }

  async function runLocal() {
    const realm = $('#realmRpcRealm')?.value || 'window';
    const command = commandFromUI();
    renderResult(await dispatchRealm(realm, command));
  }

  function runPeer() {
    const channel = openPeerChannel();
    const id = crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    const message = {
      type: 'request',
      action: 'ext:realm-rpc',
      id,
      realm: $('#realmRpcRealm')?.value || 'window',
      command: commandFromUI()
    };
    channel.send(JSON.stringify(message));
    renderResult({ sent: true, id, realm: message.realm, command: message.command });
  }

  async function resetRealms() {
    windowHandles.clear();
    seeded.clear();
    try { dedicated?.terminate?.(); } catch {}
    dedicated = null;
    try { shared?.port?.close?.(); } catch {}
    shared = null;
    try { audio?.node?.disconnect?.(); } catch {}
    try { await audio?.context?.close?.(); } catch {}
    audio = null;
    pending.clear();
    handleSeq = 1;
    renderResult({ reset: true });
  }

  function buildUI() {
    if ($('#realmRpcPanel')) return;
    const panel = document.createElement('section');
    panel.id = 'realmRpcPanel';
    panel.className = 'panel';
    panel.innerHTML = `
      <h2>Cross-realm Web API RPC</h2>
      <p class="mini">After the one session authorization, the paired controller can inspect and invoke browser-exposed APIs across Window, Dedicated Worker, Shared Worker, Service Worker and AudioWorklet realms. No eval is used. Browser/OS permissions, secure-context rules and trusted-user-activation requirements remain enforced.</p>
      <div class="grid">
        <label>Realm<select id="realmRpcRealm" class="grow">
          <option value="window">Window</option>
          <option value="dedicated-worker">Dedicated Worker</option>
          <option value="shared-worker">Shared Worker</option>
          <option value="service-worker">Service Worker</option>
          <option value="audio-worklet">AudioWorklet</option>
        </select></label>
        <label>Operation<select id="realmRpcOp" class="grow">
          <option value="roots">List roots/globals</option>
          <option value="inspect">Inspect target</option>
          <option value="get">Read property</option>
          <option value="set">Set property</option>
          <option value="call">Call method</option>
          <option value="construct">Construct target</option>
          <option value="seed">Seed Window context</option>
          <option value="release">Release handle</option>
        </select></label>
        <label>Target / handle<input id="realmRpcTarget" class="grow" value="navigator" placeholder="navigator.storage / global.AbortController / @w1"></label>
        <label>Member<input id="realmRpcMember" class="grow" placeholder="estimate / getRandomValues / ..."></label>
      </div>
      <label>Arguments/value JSON<textarea id="realmRpcPayload" class="code">[]</textarea></label>
      <div class="row">
        <button id="realmRpcLocal" class="primary">Run locally</button>
        <button id="realmRpcPeer">Run on paired peer</button>
        <button id="realmRpcReset" class="danger">Reset realm handles</button>
      </div>
      <p class="mini">Handle chaining: if a result returns <code>{"handle":"w1"}</code>, use <code>@w1</code> as the next target. In Worker/Worklet realms the returned handle prefix may differ. Use <code>{"$handle":"w1"}</code> inside argument JSON to pass a previously returned object back into another call in the same realm.</p>
      <pre id="realmRpcResult">No realm RPC call yet.</pre>`;
    const realmScanner = $('#realmScannerPanel');
    const runtime = $('#runtimeSurfacePanel');
    if (realmScanner) realmScanner.after(panel);
    else if (runtime) runtime.before(panel);
    else document.querySelector('main')?.append(panel);

    $('#realmRpcLocal').onclick = () => runLocal().catch(error => renderResult({ error: `${error.name}: ${error.message}` }));
    $('#realmRpcPeer').onclick = () => {
      try { runPeer(); } catch (error) { renderResult({ error: `${error.name}: ${error.message}` }); }
    };
    $('#realmRpcReset').onclick = () => resetRealms().catch(error => renderResult({ error: `${error.name}: ${error.message}` }));
  }

  const previousHandler = window.SUPER_API_EXT_HANDLE;
  window.SUPER_API_EXT_HANDLE = async (channel, message) => {
    if (message?.action !== 'ext:realm-rpc') return typeof previousHandler === 'function' ? previousHandler(channel, message) : undefined;
    const send = payload => {
      try { if (channel?.readyState === 'open') channel.send(JSON.stringify(payload)); } catch {}
    };
    const isHost = $('#hostBtn')?.classList.contains('primary') && !$('#controllerBtn')?.classList.contains('primary');
    if (!isHost) return send({ type: 'error', action: message.action, id: message.id, error: 'This peer is not in Controlled peer mode.' });
    if (!$('#allowRequests')?.checked) return send({ type: 'error', action: message.action, id: message.id, error: 'Single session authorization is OFF on the controlled peer.' });
    try {
      const result = await dispatchRealm(message.realm || 'window', message.command || {});
      send({ type: 'result', action: message.action, id: message.id, result });
    } catch (error) {
      send({ type: 'error', action: message.action, id: message.id, error: `${error.name}: ${error.message}` });
    }
  };

  $('#allowRequests')?.addEventListener('change', () => {
    if (!$('#allowRequests').checked) resetRealms().catch(() => {});
  });
  $('#controllerBtn')?.addEventListener('click', () => resetRealms().catch(() => {}));

  buildUI();
})();
