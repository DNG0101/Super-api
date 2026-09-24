'use strict';

const handles = new Map();
let handleSeq = 1;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

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

function pack(value) {
  if (value == null || ['string', 'number', 'boolean'].includes(typeof value)) return { value };
  if (typeof value === 'bigint') return { value: String(value), bigint: true };
  const id = `s${handleSeq++}`;
  handles.set(id, value);
  return {
    handle: id,
    type: typeof value,
    constructor: value?.constructor?.name || null,
    members: membersOf(value, 4).slice(0, 250)
  };
}

function decode(value) {
  if (Array.isArray(value)) return value.map(decode);
  if (value && typeof value === 'object') {
    if (typeof value.$handle === 'string') {
      if (!handles.has(value.$handle)) throw new Error(`Unknown handle: ${value.$handle}`);
      return handles.get(value.$handle);
    }
    const output = {};
    for (const [key, item] of Object.entries(value)) output[key] = decode(item);
    return output;
  }
  return value;
}

function roots() {
  return {
    global: self,
    registration: self.registration,
    clients: self.clients,
    navigator: self.navigator,
    caches: self.caches,
    crypto: self.crypto,
    performance: self.performance,
    indexedDB: self.indexedDB,
    scheduler: self.scheduler
  };
}

function resolveTarget(target = {}) {
  if (target.handle) {
    if (!handles.has(target.handle)) throw new Error(`Unknown handle: ${target.handle}`);
    return handles.get(target.handle);
  }
  const available = roots();
  let value = available[target.root || 'global'];
  if (value == null) throw new Error(`Root unavailable: ${target.root || 'global'}`);
  for (const part of target.path || []) {
    if (value == null || !(part in value)) throw new Error(`Path segment not found: ${part}`);
    value = value[part];
  }
  return value;
}

async function execute(command = {}) {
  const op = command.op || 'inspect';
  if (op === 'roots') {
    const available = roots();
    return {
      roots: Object.entries(available).filter(([, value]) => value != null).map(([name]) => name),
      globals: Object.getOwnPropertyNames(self).sort()
    };
  }
  if (op === 'release') {
    if (command.handle) handles.delete(command.handle);
    return { released: command.handle || null, handleCount: handles.size };
  }
  const target = resolveTarget(command.target || {});
  if (op === 'inspect') return { constructor: target?.constructor?.name || null, type: typeof target, members: membersOf(target) };
  if (op === 'get') return pack(target?.[command.member]);
  if (op === 'set') {
    target[command.member] = decode(command.value);
    return pack(target[command.member]);
  }
  if (op === 'call') {
    const fn = target?.[command.member];
    if (typeof fn !== 'function') throw new Error(`${command.member} is not callable.`);
    let result = fn.apply(target, decode(command.args || []));
    if (result && typeof result.then === 'function') result = await result;
    return pack(result);
  }
  if (op === 'construct') {
    if (typeof target !== 'function') throw new Error('Selected target is not constructable.');
    return pack(Reflect.construct(target, decode(command.args || [])));
  }
  throw new Error(`Unsupported operation: ${op}`);
}

self.addEventListener('message', event => {
  if (event.data?.type !== 'super-api-realm-rpc') return;
  const port = event.ports?.[0];
  if (!port) return;
  Promise.resolve(execute(event.data.command || {})).then(
    result => port.postMessage({ ok: true, result }),
    error => port.postMessage({ ok: false, error: `${error?.name || 'Error'}: ${error?.message || String(error)}` })
  );
});
