(()=>{
'use strict';
if(globalThis.SuperApiUCOSVFS)return;
const mounts=new Map();
const ROOT_DIRS=['system','apps','home','tmp','devices','mounts'];
const cleanPart=p=>String(p||'').trim();
function normalize(path='/'){
  const parts=[];for(const raw of cleanPart(path).replace(/\\/g,'/').split('/')){if(!raw||raw==='.')continue;if(raw==='..'){parts.pop();continue}if(raw.includes('\0'))throw new Error('invalid-path');parts.push(raw)}return'/'+parts.join('/')
}
function split(path){return normalize(path).split('/').filter(Boolean)}
function parent(path){const a=split(path);a.pop();return'/'+a.join('/')}
function base(path){return split(path).at(-1)||''}
async function opfsRoot(){if(!navigator.storage?.getDirectory)throw new Error('OPFS unavailable');return navigator.storage.getDirectory()}
async function ensureBase(){const root=await opfsRoot();for(const d of ROOT_DIRS)await root.getDirectoryHandle(d,{create:true});return root}
async function resolveMount(parts){if(parts[0]!=='mounts'||parts.length<2)return null;const name=parts[1],root=mounts.get(name);if(!root)return null;return{root,parts:parts.slice(2),mount:name}}
async function dirAt(root,parts,{create=false}={}){let d=root;for(const p of parts)d=await d.getDirectoryHandle(p,{create});return d}
async function resolveDir(path,{create=false}={}){const parts=split(path);const mounted=await resolveMount(parts);if(mounted)return{handle:await dirAt(mounted.root,mounted.parts,{create:false}),mount:mounted.mount};const root=await ensureBase();return{handle:await dirAt(root,parts,{create}),mount:null}}
async function resolveParent(path,{create=false}={}){const parts=split(path);const name=parts.pop();const mounted=await resolveMount([...parts,name]);if(mounted){const parentParts=mounted.parts.slice(0,-1);return{dir:await dirAt(mounted.root,parentParts,{create:false}),name:mounted.parts.at(-1),mount:mounted.mount}}const root=await ensureBase();return{dir:await dirAt(root,parts,{create}),name,mount:null}}
async function stat(path){path=normalize(path);if(path==='/')return{path,name:'/',kind:'directory',mount:null};const {dir,name,mount}=await resolveParent(path);try{const h=await dir.getFileHandle(name);const f=await h.getFile();return{path,name,kind:'file',size:f.size,type:f.type,lastModified:f.lastModified,mount}}catch(e){if(e?.name!=='TypeMismatchError'&&e?.name!=='NotFoundError')throw e}try{await dir.getDirectoryHandle(name);return{path,name,kind:'directory',mount}}catch(e){if(e?.name==='NotFoundError')return null;throw e}}
async function list(path='/'){const {handle,mount}=await resolveDir(path);const out=[];for await(const [name,h] of handle.entries()){if(h.kind==='file'){const f=await h.getFile();out.push({name,kind:'file',path:normalize(`${path}/${name}`),size:f.size,type:f.type,lastModified:f.lastModified,mount})}else out.push({name,kind:'directory',path:normalize(`${path}/${name}`),mount})}return out.sort((a,b)=>a.kind===b.kind?a.name.localeCompare(b.name):a.kind==='directory'?-1:1)}
async function mkdir(path,{recursive=true}={}){path=normalize(path);if(path==='/')return true;const parts=split(path);const mounted=await resolveMount(parts);if(mounted){if(recursive){await dirAt(mounted.root,mounted.parts,{create:true});return true}const parentParts=mounted.parts.slice(0,-1),name=mounted.parts.at(-1);const d=await dirAt(mounted.root,parentParts);await d.getDirectoryHandle(name,{create:true});return true}const root=await ensureBase();if(recursive){await dirAt(root,parts,{create:true});return true}const p=parts.slice(0,-1),name=parts.at(-1);const d=await dirAt(root,p);await d.getDirectoryHandle(name,{create:true});return true}
async function writeBlob(path,data,{type='application/octet-stream'}={}){path=normalize(path);if(!base(path))throw new Error('file-name-required');const {dir,name}=await resolveParent(path,{create:true});const h=await dir.getFileHandle(name,{create:true}),w=await h.createWritable();const blob=data instanceof Blob?data:new Blob([data],{type});await w.write(blob);await w.close();return stat(path)}
async function writeText(path,text){return writeBlob(path,String(text),{type:'text/plain;charset=utf-8'})}
async function readBlob(path){const {dir,name}=await resolveParent(path);const h=await dir.getFileHandle(name);return h.getFile()}
async function readText(path){return(await readBlob(path)).text()}
async function remove(path,{recursive=false}={}){path=normalize(path);if(path==='/'||ROOT_DIRS.includes(base(path))&&split(path).length===1)throw new Error('protected-path');const {dir,name}=await resolveParent(path);await dir.removeEntry(name,{recursive});return true}
async function copy(src,dst){const s=await stat(src);if(!s)throw new Error('source-not-found');if(s.kind==='file'){const f=await readBlob(src);return writeBlob(dst,f,{type:f.type})}await mkdir(dst,{recursive:true});for(const item of await list(src))await copy(item.path,normalize(`${dst}/${item.name}`));return stat(dst)}
async function move(src,dst){const r=await copy(src,dst);await remove(src,{recursive:true});return r}
function sanitizeMountName(name){const n=String(name||'mount').replace(/[^a-z0-9._-]/gi,'_');return n||'mount'}
async function mountDirectory(name,handle){if(!handle||handle.kind!=='directory')throw new Error('directory-handle-required');const n=sanitizeMountName(name||handle.name);mounts.set(n,handle);return`/mounts/${n}`}
function unmount(name){return mounts.delete(sanitizeMountName(name))}
function listMounts(){return[...mounts.entries()].map(([name,h])=>({name,path:`/mounts/${name}`,label:h.name||name,kind:'directory'}))}
async function requestExternalMount(name){if(!globalThis.showDirectoryPicker)throw new Error('Directory picker unavailable');const h=await showDirectoryPicker({mode:'readwrite'});return mountDirectory(name||h.name,h)}
async function init(){await ensureBase();return health()}
function health(){return{opfs:Boolean(navigator.storage?.getDirectory),roots:[...ROOT_DIRS],mounts:listMounts()}}
const api=Object.freeze({normalize,split,parent,base,init,health,stat,list,mkdir,writeBlob,writeText,readBlob,readText,remove,copy,move,mountDirectory,requestExternalMount,unmount,listMounts});
globalThis.SuperApiUCOSVFS=api;
})();
