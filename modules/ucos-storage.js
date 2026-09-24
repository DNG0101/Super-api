(()=>{
'use strict';
if(globalThis.SuperApiUCOSStorage)return;
const memory=new Map();
const enc=encodeURIComponent;
const prefix='super-api-ucos:';
const key=(ns,k)=>`${prefix}${enc(ns||'default')}:${enc(k)}`;
function safeParse(v){try{return JSON.parse(v)}catch{return null}}
const MemoryStore={
  async get(ns,k){return memory.has(key(ns,k))?memory.get(key(ns,k)):null},
  async set(ns,k,v){memory.set(key(ns,k),structuredCloneSafe(v));return true},
  async delete(ns,k){return memory.delete(key(ns,k))},
  async list(ns){const p=`${prefix}${enc(ns||'default')}:`;return [...memory.keys()].filter(k=>k.startsWith(p)).map(k=>decodeURIComponent(k.slice(p.length)))}
};
function webStorage(store){return{
  async get(ns,k){const raw=store?.getItem?.(key(ns,k));return raw==null?null:safeParse(raw)},
  async set(ns,k,v){store?.setItem?.(key(ns,k),JSON.stringify(structuredCloneSafe(v)));return true},
  async delete(ns,k){store?.removeItem?.(key(ns,k));return true},
  async list(ns){const p=`${prefix}${enc(ns||'default')}:`,out=[];for(let i=0;i<(store?.length||0);i++){const x=store.key(i);if(x?.startsWith(p))out.push(decodeURIComponent(x.slice(p.length)));}return out.sort()}
}}
function structuredCloneSafe(v){try{return structuredClone(v)}catch{try{return JSON.parse(JSON.stringify(v,(_k,x)=>typeof x==='bigint'?String(x):x))}catch{return String(v)}}}
const SessionStore=webStorage(globalThis.sessionStorage);
const LocalStore=webStorage(globalThis.localStorage);
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
function pick(preferred){for(const id of preferred||['opfs','indexeddb','local','memory']){const a=adapters.get(id);if(a)return{id,adapter:a}}return{id:'memory',adapter:MemoryStore}}
const api=Object.freeze({
  adapters,
  async get(ns,k,options={}){const{id,adapter}=pick(options.preferred);try{return await adapter.get(ns,k)}catch(e){if(id!=='memory')return MemoryStore.get(ns,k);throw e}},
  async set(ns,k,v,options={}){const{id,adapter}=pick(options.preferred);try{return await adapter.set(ns,k,v)}catch(e){if(id!=='memory')return MemoryStore.set(ns,k,v);throw e}},
  async delete(ns,k,options={}){const{id,adapter}=pick(options.preferred);try{return await adapter.delete(ns,k)}catch(e){if(id!=='memory')return MemoryStore.delete(ns,k);throw e}},
  async list(ns,options={}){const{id,adapter}=pick(options.preferred);try{return await adapter.list(ns)}catch(e){if(id!=='memory')return MemoryStore.list(ns);throw e}},
  health(){return{memory:true,session:!!globalThis.sessionStorage,local:!!globalThis.localStorage,indexeddb:!!globalThis.indexedDB,opfs:!!navigator.storage?.getDirectory}}
});
globalThis.SuperApiUCOSStorage=api;
})();
