(()=>{
'use strict';
if(globalThis.SuperApiUCOSStorage)return;
const memory=new Map();
const enc=encodeURIComponent;
const prefix='super-api-ucos:';
const key=(ns,k)=>`${prefix}${enc(ns||'default')}:${enc(k)}`;
function safeParse(v){try{return JSON.parse(v)}catch{return null}}
function safeStorage(name){try{return globalThis[name]||null}catch{return null}}
function structuredCloneSafe(v){try{return structuredClone(v)}catch{try{return JSON.parse(JSON.stringify(v,(_k,x)=>typeof x==='bigint'?String(x):x))}catch{return String(v)}}}
const MemoryStore={
  async get(ns,k){return memory.has(key(ns,k))?memory.get(key(ns,k)):null},
  async set(ns,k,v){memory.set(key(ns,k),structuredCloneSafe(v));return true},
  async delete(ns,k){return memory.delete(key(ns,k))},
  async list(ns){const p=`${prefix}${enc(ns||'default')}:`;return [...memory.keys()].filter(k=>k.startsWith(p)).map(k=>decodeURIComponent(k.slice(p.length)))}
};
function webStorage(store){return{
  async get(ns,k){if(!store)throw new Error('Web Storage unavailable');const raw=store.getItem(key(ns,k));return raw==null?null:safeParse(raw)},
  async set(ns,k,v){if(!store)throw new Error('Web Storage unavailable');store.setItem(key(ns,k),JSON.stringify(structuredCloneSafe(v)));return true},
  async delete(ns,k){if(!store)throw new Error('Web Storage unavailable');store.removeItem(key(ns,k));return true},
  async list(ns){if(!store)throw new Error('Web Storage unavailable');const p=`${prefix}${enc(ns||'default')}:`,out=[];for(let i=0;i<store.length;i++){const x=store.key(i);if(x?.startsWith(p))out.push(decodeURIComponent(x.slice(p.length)));}return out.sort()}
}}
const sessionStoreRef=safeStorage('sessionStorage');
const localStoreRef=safeStorage('localStorage');
const SessionStore=webStorage(sessionStoreRef);
const LocalStore=webStorage(localStoreRef);
function openDb(){return new Promise((resolve,reject)=>{if(!globalThis.indexedDB)return reject(new Error('IndexedDB unavailable'));const req=indexedDB.open('super-api-ucos',1);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains('kv'))db.createObjectStore('kv')};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error('IndexedDB open failed'))})}
const IndexedDBStore={
  async get(ns,k){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction('kv','readonly');const req=tx.objectStore('kv').get(key(ns,k));req.onsuccess=()=>resolve(req.result??null);req.onerror=()=>reject(req.error)})},
  async set(ns,k,v){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction('kv','readwrite');tx.objectStore('kv').put(structuredCloneSafe(v),key(ns,k));tx.oncomplete=()=>resolve(true);tx.onerror=()=>reject(tx.error)})},
  async delete(ns,k){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction('kv','readwrite');tx.objectStore('kv').delete(key(ns,k));tx.oncomplete=()=>resolve(true);tx.onerror=()=>reject(tx.error)})},
  async list(ns){const db=await openDb();const p=`${prefix}${enc(ns||'default')}:`;return new Promise((resolve,reject)=>{const tx=db.transaction('kv','readonly');const req=tx.objectStore('kv').getAllKeys();req.onsuccess=()=>resolve(req.result.filter(x=>String(x).startsWith(p)).map(x=>decodeURIComponent(String(x).slice(p.length))).sort());req.onerror=()=>reject(req.error)})}
};
async function opfsRoot(){if(!navigator.storage?.getDirectory)throw new Error('OPFS unavailable');return navigator.storage.getDirectory()}
async function opfsDir(ns,create=true){const root=await opfsRoot();return root.getDirectoryHandle(String(ns||'default').replace(/[^a-z0-9._-]/gi,'_'),{create})}
const OPFSStore={
  async get(ns,k){try{const dir=await opfsDir(ns,false),h=await dir.getFileHandle(String(k),{create:false}),f=await h.getFile();return safeParse(await f.text())}catch(e){if(e?.name==='NotFoundError')return null;throw e}},
  async set(ns,k,v){const dir=await opfsDir(ns,true),h=await dir.getFileHandle(String(k),{create:true}),w=await h.createWritable();await w.write(JSON.stringify(structuredCloneSafe(v)));await w.close();return true},
  async delete(ns,k){try{const dir=await opfsDir(ns,false);await dir.removeEntry(String(k));return true}catch(e){if(e?.name==='NotFoundError')return false;throw e}},
  async list(ns){try{const dir=await opfsDir(ns,false),out=[];for await(const [name] of dir.entries())out.push(name);return out.sort()}catch(e){if(e?.name==='NotFoundError')return[];throw e}}
};
const adapters=new Map([['memory',MemoryStore],['session',SessionStore],['local',LocalStore],['indexeddb',IndexedDBStore],['opfs',OPFSStore]]);
const available={memory:()=>true,session:()=>!!sessionStoreRef,local:()=>!!localStoreRef,indexeddb:()=>!!globalThis.indexedDB,opfs:()=>!!navigator.storage?.getDirectory};
function candidates(preferred){const order=Array.isArray(preferred)&&preferred.length?preferred:['opfs','indexeddb','local','memory'];return order.filter((id,index)=>order.indexOf(id)===index&&adapters.has(id)&&available[id]?.()).map(id=>({id,adapter:adapters.get(id)}))}
async function perform(method,args,preferred){let lastError=null;for(const{adapter}of candidates(preferred)){try{return await adapter[method](...args)}catch(e){lastError=e}}if(lastError)throw lastError;throw new Error(`No storage adapter available for ${method}`)}
const api=Object.freeze({
  adapters,
  async get(ns,k,options={}){return perform('get',[ns,k],options.preferred)},
  async set(ns,k,v,options={}){return perform('set',[ns,k,v],options.preferred)},
  async delete(ns,k,options={}){return perform('delete',[ns,k],options.preferred)},
  async list(ns,options={}){return perform('list',[ns],options.preferred)},
  health(){return{memory:true,session:available.session(),local:available.local(),indexeddb:available.indexeddb(),opfs:available.opfs(),preference:['opfs','indexeddb','local','memory']}}
});
globalThis.SuperApiUCOSStorage=api;
})();
