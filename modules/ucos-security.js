(()=>{
'use strict';
if(globalThis.SuperApiUCOSSecurity)return;
const Core=globalThis.SuperApiUCOSSecurityCore,Storage=globalThis.SuperApiUCOSStorage;
if(!Core){console.error('UCOS security requires ucos-security-core');return}
const tokens=Core.createTokenService({defaultTtlMs:30000,maxTtlMs:3600000});
const quotas=Core.createQuotaManager({windowMs:60000,defaultLimit:120});
const replay=Core.createReplayGuard({windowMs:120000,maxEntries:10000});
const audit=Core.createAuditLog({limit:1200});
const events=new EventTarget();
const TRUST_NS='security-trust',AUDIT_NS='security-audit',AUDIT_KEY='events';
const peerSeen=new Map();
let identityPromise=null,persistTimer=null;
function emit(type,detail){events.dispatchEvent(new CustomEvent(type,{detail:Core.clone(detail)}))}
function b64u(bytes){let s='';for(const b of new Uint8Array(bytes))s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function unb64u(s){s=String(s||'').replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';const raw=atob(s),out=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out}
function utf8(s){return new TextEncoder().encode(String(s))}
function openDb(){return new Promise((resolve,reject)=>{const r=indexedDB.open('super-api-ucos-security-v1',1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('identity'))r.result.createObjectStore('identity')};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function dbGet(key){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction('identity','readonly'),r=tx.objectStore('identity').get(key);r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error)})}
async function dbPut(key,value){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction('identity','readwrite');tx.objectStore('identity').put(value,key);tx.oncomplete=()=>resolve(true);tx.onerror=()=>reject(tx.error)})}
async function digestId(publicJwk){const d=await crypto.subtle.digest('SHA-256',utf8(Core.stable(publicJwk)));return`dev-${b64u(d).slice(0,32)}`}
async function createIdentity(){
 const generated=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 const publicJwk=await crypto.subtle.exportKey('jwk',generated.publicKey),privateJwk=await crypto.subtle.exportKey('jwk',generated.privateKey);
 const privateKey=await crypto.subtle.importKey('jwk',privateJwk,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
 const publicKey=await crypto.subtle.importKey('jwk',publicJwk,{name:'ECDSA',namedCurve:'P-256'},true,['verify']);
 const deviceId=await digestId(publicJwk),createdAt=Date.now();
 await dbPut('current',{deviceId,publicJwk,privateKey,publicKey,createdAt});
 return{deviceId,publicJwk,privateKey,publicKey,createdAt}
}
async function identity(){
 if(identityPromise)return identityPromise;
 identityPromise=(async()=>{try{const row=await dbGet('current');if(row?.privateKey&&row?.publicJwk&&row?.deviceId)return row}catch{}return createIdentity()})();
 return identityPromise
}
async function rotateIdentity(){identityPromise=createIdentity();const x=await identityPromise;auditEvent('identity-rotated',{deviceId:x.deviceId},'warn');emit('identity',publicIdentity(x));return publicIdentity(x)}
function publicIdentity(x){return{deviceId:x.deviceId,publicJwk:Core.clone(x.publicJwk),createdAt:x.createdAt}}
async function sign(payload){const x=await identity(),data=utf8(Core.stable(payload)),sig=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},x.privateKey,data);return b64u(sig)}
async function verify(payload,signature,publicJwk){try{const key=await crypto.subtle.importKey('jwk',publicJwk,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);return crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,unb64u(signature),utf8(Core.stable(payload)))}catch{return false}}
async function trusted(){try{return await Storage?.get?.(TRUST_NS,'peers',{preferred:['indexeddb','local','memory']})||{}}catch{return{}}}
async function trustPeer({deviceId,publicJwk,label='',nodeId=''}={}){if(!deviceId||!publicJwk)throw new Error('peer-identity-required');if(await digestId(publicJwk)!==deviceId)throw new Error('peer-identity-mismatch');const peers=await trusted();peers[deviceId]={deviceId,publicJwk:Core.clone(publicJwk),label:String(label||deviceId),nodeId:String(nodeId||''),trustedAt:Date.now(),lastSeen:Date.now()};await Storage?.set?.(TRUST_NS,'peers',peers,{preferred:['indexeddb','local','memory']});auditEvent('peer-trusted',{deviceId,label,nodeId},'warn');emit('trust-changed',await listTrusted());return Core.clone(peers[deviceId])}
async function revokePeer(deviceId){const peers=await trusted();if(!peers[deviceId])return false;delete peers[deviceId];await Storage?.set?.(TRUST_NS,'peers',peers,{preferred:['indexeddb','local','memory']});auditEvent('peer-revoked',{deviceId},'warn');emit('trust-changed',await listTrusted());return true}
async function getTrusted(deviceId){const p=(await trusted())[deviceId]||null;return Core.clone(p)}
async function isTrusted(deviceId,publicJwk=null){const p=(await trusted())[deviceId];if(!p)return false;if(publicJwk&&await digestId(publicJwk)!==deviceId)return false;return true}
async function listTrusted(){return Object.values(await trusted()).map(Core.clone)}
function notePeerSeen(info){if(!info?.deviceId)return;peerSeen.set(info.deviceId,{...Core.clone(info),lastSeen:Date.now()});emit('peer-seen',peerSeen.get(info.deviceId))}
function seenPeers(){return[...peerSeen.values()].map(Core.clone)}
function schedulePersist(){if(persistTimer)return;persistTimer=setTimeout(async()=>{persistTimer=null;try{await Storage?.set?.(AUDIT_NS,AUDIT_KEY,audit.export().slice(0,500),{preferred:['indexeddb','local','memory']})}catch{}},250)}
function auditEvent(type,data={},severity='info'){const row=audit.append(type,data,severity);schedulePersist();emit('audit',row);return row}
async function restoreAudit(){try{const rows=await Storage?.get?.(AUDIT_NS,AUDIT_KEY,{preferred:['indexeddb','local','memory']})||[];audit.restore(rows)}catch{}}
function authorize({appId,capabilityId,operation='execute',nodeId='*',ttlMs=30000,uses=1}={}){const q=quotas.consume(`${appId}:${capabilityId}`,{context:{appId,capabilityId,operation,nodeId}});if(!q.allowed){auditEvent('quota-denied',{appId,capabilityId,operation,nodeId,retryAfterMs:q.retryAfterMs},'warn');throw Object.assign(new Error('capability-rate-limited'),{retryAfterMs:q.retryAfterMs})}const token=tokens.mint({appId,capabilityId,operation,nodeId,ttlMs,uses});auditEvent('capability-lease-issued',{appId,capabilityId,operation,nodeId,tokenId:token.id,expiresAt:token.expiresAt});return token}
function consumeToken(tokenId,ctx){const result=tokens.consume(tokenId,ctx);auditEvent(result.valid?'capability-lease-consumed':'capability-lease-rejected',{...ctx,tokenId,reason:result.reason},result.valid?'info':'warn');return result}
function health(){return{version:6,identityReady:Boolean(identityPromise),tokens:tokens.size(),quotaBuckets:quotas.size(),replayEntries:replay.size(),auditEvents:audit.size(),seenPeers:peerSeen.size}}
const ready=(async()=>{await restoreAudit();const x=await identity();emit('identity',publicIdentity(x));auditEvent('security-ready',{deviceId:x.deviceId});return publicIdentity(x)})();
const api=Object.freeze({core:Core,tokens,quotas,replay,audit,events,ready,identity:async()=>publicIdentity(await identity()),rotateIdentity,sign,verify,trustPeer,revokePeer,getTrusted,isTrusted,listTrusted,notePeerSeen,seenPeers,authorize,consumeToken,auditEvent,health});
globalThis.SuperApiUCOSSecurity=api;
})();