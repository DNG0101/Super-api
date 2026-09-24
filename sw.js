const CACHE='super-api-peer-lab-v20';
const CORE=['./','./index.html','./app.js','./catalog.js','./peer-hook.js','./session-consent.js','./api-extensions.js','./deep-api-tests.js','./session-bootstrap.js','./runtime-surface.js','./emerging-apis.js','./realm-scanners.js','./mdn-live-index.js','./interface-harness.js','./latest-platform.js','./modules/realm-rpc.js','./modules/universal-core.js','./modules/universal-api.js','./modules/universal-api-v2.js','./modules/network-signal-core.js','./modules/network-signal.js','./modules/wireless-radio-core.js','./modules/wireless-radio.js','./modules/capability-os-core.js','./modules/capability-os.js','./modules/ucos-fabric-core.js','./modules/ucos-storage.js','./modules/ucos-fabric.js','./modules/ucos-shell.js','./workers/realm-rpc-sw.js','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)));self.skipWaiting();});
self.addEventListener('activate',event=>{event.waitUntil((async()=>{for(const k of await caches.keys())if(k.startsWith('super-api-peer-lab-')&&k!==CACHE)await caches.delete(k);await self.clients.claim();})());});
async function networkFirst(req){
  try{
    const response=await fetch(req);
    if(response.ok){const cache=await caches.open(CACHE);await cache.put(req,response.clone());}
    return response;
  }catch(error){
    const cached=await caches.match(req);
    if(cached)return cached;
    throw error;
  }
}
self.addEventListener('fetch',event=>{
  const req=event.request;if(req.method!=='GET')return;
  const url=new URL(req.url);if(url.origin!==location.origin)return;
  if(req.mode==='navigate'){
    event.respondWith(fetch(req).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put('./index.html',copy));return r;}).catch(()=>caches.match('./index.html')));return;
  }
  if(req.destination==='script'||url.pathname.endsWith('.js')){
    event.respondWith(networkFirst(req));return;
  }
  event.respondWith(caches.match(req).then(cached=>{const network=fetch(req).then(r=>{if(r.ok)caches.open(CACHE).then(c=>c.put(req,r.clone()));return r;}).catch(()=>cached);return cached||network;}));
});
self.addEventListener('sync',event=>{if(event.tag==='super-api-sync')event.waitUntil(Promise.resolve());});
function realmMembers(obj,maxDepth=6){const seen=new Set(),out=[];let p=obj,depth=0;while(p&&depth++<maxDepth){let keys=[];try{keys=Reflect.ownKeys(p)}catch{break}for(const key of keys){const name=typeof key==='symbol'?key.toString():String(key);if(name==='constructor'||seen.has(name))continue;seen.add(name);let d;try{d=Object.getOwnPropertyDescriptor(p,key)}catch{}out.push({name,kind:typeof d?.value==='function'?'method':(d?.get||d?.set?'accessor':'property'),depth:depth-1});}try{p=Object.getPrototypeOf(p)}catch{break}}return out.sort((a,b)=>a.name.localeCompare(b.name));}
self.addEventListener('message',event=>{const port=event.ports?.[0];if(event.data?.type==='super-api-ping'){port?.postMessage({type:'super-api-pong',received:event.data.time,responded:Date.now(),cache:CACHE});return;}if(event.data?.type==='super-api-realm-scan'){port?.postMessage({realm:'ServiceWorkerGlobalScope',constructor:self.constructor?.name||null,cache:CACHE,globals:Object.getOwnPropertyNames(self).sort(),members:realmMembers(self),registration:realmMembers(self.registration),clients:realmMembers(self.clients),navigator:realmMembers(self.navigator),caches:realmMembers(self.caches),crypto:realmMembers(self.crypto),performance:realmMembers(self.performance)});}});
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(ws=>ws[0]?.focus()||clients.openWindow('./')));});
