(()=>{
'use strict';
if(globalThis.SuperApiUCOSVFS)return;
const mounts=new Map();
const ROOT_DIRS=['system','apps','home','tmp','devices','mounts'];
const cleanPart=p=>String(p||'').trim();
function normalize(path='/'){const parts=[];for(const raw of cleanPart(path).replace(/\\/g,'/').split('/')){if(!raw||raw==='.')continue;if(raw==='..'){if(!parts.length)throw new Error('path-traversal-above-root');parts.pop();continue}if(raw.includes('\0'))throw new Error('invalid-path');parts.push(raw)}return'/'+parts.join('/')}
function split(path){return normalize(path).split('/').filter(Boolean)}
function parent(path){const a=split(path);a.pop();return'/'+a.join('/')}
function base(path){return split(path).at(-1)||''}
function isSameOrDescendant(parentPath,candidate){const p=normalize(parentPath),c=normalize(candidate);return c===p||c.startsWith(`${p}/`)}
function lockName(path){return`ucos-vfs:${normalize(path)}`}
async function withLock(path,fn,{mode='exclusive'}={}){if(navigator.locks?.request)return navigator.locks.request(lockName(path),{mode},fn);return fn()}
async function withLocks(paths,fn){const names=[...new Set(paths.map(normalize))].sort();const next=async i=>i>=names.length?fn():withLock(names[i],()=>next(i+1));return next(0)}
async function opfsRoot(){if(!navigator.storage?.getDirectory)throw new Error('OPFS unavailable');return navigator.storage.getDirectory()}
async function ensureBase(){const root=await opfsRoot();for(const d of ROOT_DIRS)await root.getDirectoryHandle(d,{create:true});await root.getDirectoryHandle('home',{create:true}).then(h=>h.getDirectoryHandle('.Trash',{create:true}));return root}
async function resolveMount(parts){if(parts[0]!=='mounts'||parts.length<2)return null;const name=parts[1],root=mounts.get(name);if(!root)return null;return{root,parts:parts.slice(2),mount:name}}
async function dirAt(root,parts,{create=false}={}){let d=root;for(const p of parts)d=await d.getDirectoryHandle(p,{create});return d}
async function resolveDir(path,{create=false}={}){const parts=split(path),mounted=await resolveMount(parts);if(mounted)return{handle:await dirAt(mounted.root,mounted.parts,{create:false}),mount:mounted.mount};const root=await ensureBase();return{handle:await dirAt(root,parts,{create}),mount:null}}
async function resolveParent(path,{create=false}={}){const parts=split(path),name=parts.pop(),mounted=await resolveMount([...parts,name]);if(mounted){if(!mounted.parts.length)throw new Error('mount-root-has-no-parent');const parentParts=mounted.parts.slice(0,-1);return{dir:await dirAt(mounted.root,parentParts,{create:false}),name:mounted.parts.at(-1),mount:mounted.mount}}const root=await ensureBase();return{dir:await dirAt(root,parts,{create}),name,mount:null}}
async function stat(path){path=normalize(path);if(path==='/')return{path,name:'/',kind:'directory',mount:null};const parts=split(path);if(parts[0]==='mounts'&&parts.length===2&&mounts.has(parts[1]))return{path,name:parts[1],kind:'directory',mount:parts[1],mountRoot:true};const {dir,name,mount}=await resolveParent(path);try{const h=await dir.getFileHandle(name),f=await h.getFile();return{path,name,kind:'file',size:f.size,type:f.type,lastModified:f.lastModified,mount}}catch(e){if(e?.name!=='TypeMismatchError'&&e?.name!=='NotFoundError')throw e}try{await dir.getDirectoryHandle(name);return{path,name,kind:'directory',mount}}catch(e){if(e?.name==='NotFoundError')return null;throw e}}
async function exists(path){return Boolean(await stat(path))}
async function list(path='/'){const {handle,mount}=await resolveDir(path);const out=[];for await(const[name,h]of handle.entries()){if(h.kind==='file'){const f=await h.getFile();out.push({name,kind:'file',path:normalize(`${path}/${name}`),size:f.size,type:f.type,lastModified:f.lastModified,mount})}else out.push({name,kind:'directory',path:normalize(`${path}/${name}`),mount})}return out.sort((a,b)=>a.kind===b.kind?a.name.localeCompare(b.name):a.kind==='directory'?-1:1)}
async function mkdirUnlocked(path,{recursive=true}={}){path=normalize(path);if(path==='/')return true;const parts=split(path),mounted=await resolveMount(parts);if(mounted){if(!mounted.parts.length)return true;if(recursive){await dirAt(mounted.root,mounted.parts,{create:true});return true}const parentParts=mounted.parts.slice(0,-1),name=mounted.parts.at(-1),d=await dirAt(mounted.root,parentParts);await d.getDirectoryHandle(name,{create:true});return true}const root=await ensureBase();if(recursive){await dirAt(root,parts,{create:true});return true}const p=parts.slice(0,-1),name=parts.at(-1),d=await dirAt(root,p);await d.getDirectoryHandle(name,{create:true});return true}
async function mkdir(path,opts={}){path=normalize(path);return withLock(path,()=>mkdirUnlocked(path,opts))}
async function writeBlobUnlocked(path,data,{type='application/octet-stream'}={}){path=normalize(path);if(!base(path))throw new Error('file-name-required');const {dir,name}=await resolveParent(path,{create:true}),h=await dir.getFileHandle(name,{create:true}),w=await h.createWritable({keepExistingData:false}),blob=data instanceof Blob?data:new Blob([data],{type});try{await w.write(blob);await w.close()}catch(e){try{await w.abort?.()}catch{}throw e}return stat(path)}
async function writeBlob(path,data,opts={}){path=normalize(path);return withLock(path,()=>writeBlobUnlocked(path,data,opts))}
async function writeAtomic(path,data,opts={}){return writeBlob(path,data,opts)}
async function writeText(path,text){return writeBlob(path,String(text),{type:'text/plain;charset=utf-8'})}
async function writeJSON(path,value){return writeBlob(path,JSON.stringify(value,null,2),{type:'application/json'})}
async function readBlobUnlocked(path){const {dir,name}=await resolveParent(path),h=await dir.getFileHandle(name);return h.getFile()}
async function readBlob(path){path=normalize(path);return withLock(path,()=>readBlobUnlocked(path),{mode:'shared'})}
async function readText(path){return(await readBlob(path)).text()}
async function readJSON(path){return JSON.parse(await readText(path))}
async function readRange(path,start=0,end=null){const f=await readBlob(path),a=Math.max(0,Number(start)||0),b=end==null?f.size:Math.max(a,Number(end)||0);return f.slice(a,b,f.type)}
async function removeUnlocked(path,{recursive=false}={}){const {dir,name}=await resolveParent(path);await dir.removeEntry(name,{recursive});return true}
async function remove(path,{recursive=false}={}){path=normalize(path);const parts=split(path);if(path==='/'||ROOT_DIRS.includes(base(path))&&parts.length===1)throw new Error('protected-path');if(parts[0]==='mounts'&&parts.length===2&&mounts.has(parts[1]))throw new Error('protected-mount-root');return withLock(path,()=>removeUnlocked(path,{recursive}))}
async function copyUnlocked(src,dst){const s=await stat(src);if(!s)throw new Error('source-not-found');if(s.kind==='file'){const f=await readBlobUnlocked(src);return writeBlobUnlocked(dst,f,{type:f.type})}await mkdirUnlocked(dst,{recursive:true});const snapshot=await list(src);for(const item of snapshot)await copyUnlocked(item.path,normalize(`${dst}/${item.name}`));return stat(dst)}
async function assertTransfer(src,dst){const s=await stat(src);if(!s)throw new Error('source-not-found');if(normalize(src)===normalize(dst))throw new Error('source-and-destination-identical');if(s.kind==='directory'&&isSameOrDescendant(src,dst))throw new Error('destination-inside-source');return s}
async function copy(src,dst){src=normalize(src);dst=normalize(dst);return withLocks([src,dst],async()=>{await assertTransfer(src,dst);return copyUnlocked(src,dst)})}
async function move(src,dst){src=normalize(src);dst=normalize(dst);return withLocks([src,dst],async()=>{await assertTransfer(src,dst);const r=await copyUnlocked(src,dst);await removeUnlocked(src,{recursive:true});return r})}
async function rename(src,newName){const n=String(newName??'').trim();if(!n||n==='.'||n==='..'||n.length>255||/[\\/\0]/.test(n))throw new Error('invalid-name');return move(src,normalize(`${parent(src)}/${n}`))}
function trashSuffix(){try{return crypto.randomUUID().replace(/-/g,'').slice(0,12)}catch{return`${Date.now().toString(36)}${Math.random().toString(36).slice(2,8)}`}}
async function trash(path){path=normalize(path);if(path==='/'||split(path).length===1&&ROOT_DIRS.includes(base(path)))throw new Error('protected-path');const dest=normalize(`/home/.Trash/${Date.now()}-${trashSuffix()}-${base(path)}`);return move(path,dest)}
async function emptyTrash(){const p='/home/.Trash';for(const item of await list(p))await remove(item.path,{recursive:true});return true}
async function quota(){const est=await navigator.storage?.estimate?.();return{usage:est?.usage??null,quota:est?.quota??null,usageDetails:est?.usageDetails??null,persisted:await navigator.storage?.persisted?.(),persistenceAvailable:Boolean(navigator.storage?.persist)}}
async function requestPersistence(){if(!navigator.storage?.persist)throw new Error('persistent-storage-unavailable');return navigator.storage.persist()}
function sanitizeMountName(name){const n=String(name||'mount').replace(/[^a-z0-9._-]/gi,'_');return n||'mount'}
async function mountDirectory(name,handle){if(!handle||handle.kind!=='directory')throw new Error('directory-handle-required');if(handle.queryPermission){let p=await handle.queryPermission({mode:'readwrite'});if(p!=='granted'&&handle.requestPermission)p=await handle.requestPermission({mode:'readwrite'});if(p!=='granted')throw new Error('mount-permission-denied')}const n=sanitizeMountName(name||handle.name),existing=mounts.get(n);if(existing&&existing!==handle)throw new Error('mount-name-in-use');mounts.set(n,handle);return`/mounts/${n}`}
function unmount(name){return mounts.delete(sanitizeMountName(name))}
function listMounts(){return[...mounts.entries()].map(([name,h])=>({name,path:`/mounts/${name}`,label:h.name||name,kind:'directory'}))}
async function requestExternalMount(name){if(!globalThis.showDirectoryPicker)throw new Error('Directory picker unavailable');const h=await showDirectoryPicker({mode:'readwrite'});return mountDirectory(name||h.name,h)}
async function init(){await ensureBase();return health()}
function health(){return{version:6,opfs:Boolean(navigator.storage?.getDirectory),locks:Boolean(navigator.locks?.request),roots:[...ROOT_DIRS],mounts:listMounts(),descendantTransferGuard:true,rootTraversalGuard:true,collisionSafeTrash:true}}
const api=Object.freeze({normalize,split,parent,base,isSameOrDescendant,init,health,stat,exists,list,mkdir,writeBlob,writeAtomic,writeText,writeJSON,readBlob,readText,readJSON,readRange,remove,copy,move,rename,trash,emptyTrash,quota,requestPersistence,mountDirectory,requestExternalMount,unmount,listMounts,withLock});
globalThis.SuperApiUCOSVFS=api;
})();