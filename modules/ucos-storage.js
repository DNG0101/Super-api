(()=>{
'use strict';
if(globalThis.SuperApiUCOSStorage)return;
const memory=new Map();
const enc=encodeURIComponent;
const prefix='super-api-ucos:';
const textEncoder=new TextEncoder(),textDecoder=new TextDecoder();
let revisionSeq=0;
const key=(ns,k)=>`${prefix}${enc(ns||'default')}:${enc(k)}`;
function safeParse(v){try{return JSON.parse(v)}catch{return null}}
function safeStorage(name){try{return globalThis[name]||null}catch{return null}}
function structuredCloneSafe(v){try{return structuredClone(v)}catch{try{return JSON.parse(JSON.stringify(v,(_k,x)=>typeof x==='bigint'?String(x):x))}catch{return String(v)}}}
function hexName(prefix,value){let out=prefix;for(const b of textEncoder.encode(String(value)))out+=b.toString(16).padStart(2,'0');return out}
function unhexName(prefix,value){const s=String(value||'');if(!s.startsWith(prefix))return null;const hex=s.slice(prefix.length);if(hex.length%2||!/^[0-9a-f]*$/i.test(hex))return null;const bytes=new Uint8Array(hex.length/2);for(let i=0;i<bytes.length;i++)bytes[i]=parseInt(hex.slice(i*2,i*2+2),16);try{return textDecoder.decode(bytes)}catch{return null}}
function legacySafe(value){const s=String(value);return Boolean(s)&&s!=='.'&&s!=='..'&&s===s.replace(/[^a-z0-9._-]/gi,'_')&&!/[\\/\0]/.test(s)}
function record(value,{deleted=false}={}){const now=Date.now(),revision=now*1000+(revisionSeq++%1000);return{__ucosRecord:2,revision,nonce:globalThis.crypto?.randomUUID?.()||`${Math.random()}`,writtenAt:now,deleted:Boolean(deleted),value:deleted?null:structuredCloneSafe(value)}}
function normalizeRecord(raw){if(raw&&raw.__ucosRecord===2&&Number.isFinite(Number(raw.revision)))return raw;return{__ucosRecord:1,revision:0,nonce:'legacy',writtenAt:0,deleted:false,value:raw}}
function newer(a,b){if(!a)return b;if(!b)return a;const ar=Number(a.revision)||0,br=Number(b.revision)||0;if(ar!==br)return br>ar?b:a;return String(b.nonce||'')>String(a.nonce||'')?b:a}
const MemoryStore={
 async get(ns,k){return memory.has(key(ns,k))?structuredCloneSafe(memory.get(key(ns,k))):null},
 async set(ns,k,v){memory.set(key(ns,k),structuredCloneSafe(v));return true},
 async delete(ns,k){return memory.delete(key(ns,k))},
 async list(ns){const p=`${prefix}${enc(ns||'default')}:`;return[...memory.keys()].filter(k=>k.startsWith(p)).map(k=>decodeURIComponent(k.slice(p.length))).sort()}
};
function webStorage(store){return{
 async get(ns,k){if(!store)throw new Error('Web Storage unavailable');const raw=store.getItem(key(ns,k));return raw==null?null:safeParse(raw)},
 async set(ns,k,v){if(!store)throw new Error('Web Storage unavailable');store.setItem(key(ns,k),JSON.stringify(structuredCloneSafe(v)));return true},
 async delete(ns,k){if(!store)throw new Error('Web Storage unavailable');const existed=store.getItem(key(ns,k))!==null;store.removeItem(key(ns,k));return existed},
 async list(ns){if(!store)throw new Error('Web Storage unavailable');const p=`${prefix}${enc(ns||'default')}:`,out=[];for(let i=0;i<store.length;i++){const x=store.key(i);if(x?.startsWith(p))out.push(decodeURIComponent(x.slice(p.length)))}return out.sort()}
}}
const sessionStoreRef=safeStorage('sessionStorage'),localStoreRef=safeStorage('localStorage');
const SessionStore=webStorage(sessionStoreRef),LocalStore=webStorage(localStoreRef);
let dbPromise=null;
function openDb(){if(dbPromise)return dbPromise;dbPromise=new Promise((resolve,reject)=>{if(!globalThis.indexedDB)return reject(new Error('IndexedDB unavailable'));const req=indexedDB.open('super-api-ucos',1);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains('kv'))db.createObjectStore('kv')};req.onsuccess=()=>resolve(req.result);req.onerror=()=>{dbPromise=null;reject(req.error||new Error('IndexedDB open failed'))};req.onblocked=()=>{dbPromise=null;reject(new Error('IndexedDB open blocked'))}});return dbPromise}
const IndexedDBStore={
 async get(ns,k){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction('kv','readonly'),req=tx.objectStore('kv').get(key(ns,k));req.onsuccess=()=>resolve(req.result??null);req.onerror=()=>reject(req.error)})},
 async set(ns,k,v){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction('kv','readwrite');tx.objectStore('kv').put(structuredCloneSafe(v),key(ns,k));tx.oncomplete=()=>resolve(true);tx.onerror=()=>reject(tx.error)})},
 async delete(ns,k){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction('kv','readwrite'),store=tx.objectStore('kv'),req=store.get(key(ns,k));let existed=false;req.onsuccess=()=>{existed=req.result!==undefined;store.delete(key(ns,k))};tx.oncomplete=()=>resolve(existed);tx.onerror=()=>reject(tx.error)})},
 async list(ns){const db=await openDb(),p=`${prefix}${enc(ns||'default')}:`;return new Promise((resolve,reject)=>{const tx=db.transaction('kv','readonly'),req=tx.objectStore('kv').getAllKeys();req.onsuccess=()=>resolve(req.result.filter(x=>String(x).startsWith(p)).map(x=>decodeURIComponent(String(x).slice(p.length))).sort());req.onerror=()=>reject(req.error)})}
};
async function opfsRoot(){if(!navigator.storage?.getDirectory)throw new Error('OPFS unavailable');return navigator.storage.getDirectory()}
async function opfsDir(ns,create=true,{legacy=false}={}){const root=await opfsRoot(),raw=String(ns||'default'),name=legacy?raw.replace(/[^a-z0-9._-]/gi,'_'):hexName('n-',raw);return root.getDirectoryHandle(name,{create})}
async function opfsRead(ns,k,{legacy=false}={}){const dir=await opfsDir(ns,false,{legacy}),name=legacy?String(k):hexName('k-',k),h=await dir.getFileHandle(name,{create:false}),f=await h.getFile();return safeParse(await f.text())}
async function opfsDeleteOne(ns,k,{legacy=false}={}){try{const dir=await opfsDir(ns,false,{legacy});await dir.removeEntry(legacy?String(k):hexName('k-',k));return true}catch(e){if(e?.name==='NotFoundError')return false;throw e}}
const OPFSStore={
 async get(ns,k){try{return await opfsRead(ns,k)}catch(e){if(e?.name!=='NotFoundError')throw e}if(!legacySafe(ns||'default')||!legacySafe(k))return null;try{const value=await opfsRead(ns,k,{legacy:true});if(value!==null)try{await OPFSStore.set(ns,k,value)}catch{}return value}catch(e){if(e?.name==='NotFoundError')return null;throw e}},
 async set(ns,k,v){const dir=await opfsDir(ns,true),h=await dir.getFileHandle(hexName('k-',k),{create:true}),w=await h.createWritable();try{await w.write(JSON.stringify(structuredCloneSafe(v)));await w.close()}catch(e){try{await w.abort?.()}catch{}throw e}return true},
 async delete(ns,k){let removed=await opfsDeleteOne(ns,k);if(legacySafe(ns||'default')&&legacySafe(k))removed=await opfsDeleteOne(ns,k,{legacy:true})||removed;return removed},
 async list(ns){const out=new Set();try{const dir=await opfsDir(ns,false);for await(const[name,h]of dir.entries()){if(h.kind!=='file')continue;const decoded=unhexName('k-',name);if(decoded!==null)out.add(decoded)}}catch(e){if(e?.name!=='NotFoundError')throw e}if(legacySafe(ns||'default'))try{const dir=await opfsDir(ns,false,{legacy:true});for await(const[name,h]of dir.entries())if(h.kind==='file'&&legacySafe(name))out.add(name)}catch(e){if(e?.name!=='NotFoundError')throw e}return[...out].sort()}
};
const adapters=new Map([['memory',MemoryStore],['session',SessionStore],['local',LocalStore],['indexeddb',IndexedDBStore],['opfs',OPFSStore]]);
const available={memory:()=>true,session:()=>!!sessionStoreRef,local:()=>!!localStoreRef,indexeddb:()=>!!globalThis.indexedDB,opfs:()=>!!navigator.storage?.getDirectory};
function candidates(preferred){const order=Array.isArray(preferred)&&preferred.length?preferred:['opfs','indexeddb','local','memory'];return order.filter((id,index)=>order.indexOf(id)===index&&adapters.has(id)&&available[id]?.()).map(id=>({id,adapter:adapters.get(id)}))}
async function readAll(ns,k,preferred){const rows=[];for(const c of candidates(preferred)){try{const raw=await c.adapter.get(ns,k);if(raw!==null&&raw!==undefined)rows.push({id:c.id,adapter:c.adapter,record:normalizeRecord(raw)})}catch{}}return rows}
async function getAcross(ns,k,preferred){const rows=await readAll(ns,k,preferred);let selected=null;for(const x of rows)selected=newer(selected,x.record);if(!selected||selected.deleted)return null;for(const c of candidates(preferred)){const existing=rows.find(x=>x.id===c.id)?.record;if(!existing||newer(existing,selected)===selected&&existing!==selected)try{await c.adapter.set(ns,k,selected)}catch{}}return structuredCloneSafe(selected.value)}
async function writeRecordAcross(ns,k,row,preferred){const list=candidates(preferred);if(!list.length)throw new Error('No storage adapter available for write');let success=0,lastError=null;for(const{adapter}of list){try{await adapter.set(ns,k,row);success++}catch(e){lastError=e}}if(!success)throw lastError||new Error('Storage write failed');return{success,total:list.length,partial:success!==list.length}}
async function setAcross(ns,k,v,preferred){await writeRecordAcross(ns,k,record(v),preferred);return true}
async function deleteAcross(ns,k,preferred){const existing=await getAcross(ns,k,preferred);await writeRecordAcross(ns,k,record(null,{deleted:true}),preferred);return existing!==null}
async function listAcross(ns,preferred){const keys=new Set();for(const{adapter}of candidates(preferred)){try{for(const k of await adapter.list(ns))keys.add(k)}catch{}}const out=[];for(const k of keys)if(await getAcross(ns,k,preferred)!==null)out.push(k);return out.sort()}
const api=Object.freeze({adapters,candidates,
 async get(ns,k,options={}){return getAcross(ns,k,options.preferred)},
 async set(ns,k,v,options={}){return setAcross(ns,k,v,options.preferred)},
 async delete(ns,k,options={}){return deleteAcross(ns,k,options.preferred)},
 async list(ns,options={}){return listAcross(ns,options.preferred)},
 health(){return{memory:true,session:available.session(),local:available.local(),indexeddb:available.indexeddb(),opfs:available.opfs(),preference:['opfs','indexeddb','local','memory'],fallbackReads:true,writeThrough:true,deleteAcrossBackends:true,opfsCollisionSafeNames:true,revisionConsistent:true,tombstones:true,readRepair:true}}
});
globalThis.SuperApiUCOSStorage=api;
})();