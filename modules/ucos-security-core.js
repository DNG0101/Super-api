(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.SuperApiUCOSSecurityCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const text=v=>String(v??'').trim();
const clone=v=>{try{return structuredClone(v)}catch{try{return JSON.parse(JSON.stringify(v,(_k,x)=>typeof x==='bigint'?String(x):x))}catch{return String(v)}}};
let seq=0;
function id(prefix='sec'){try{if(globalThis.crypto?.randomUUID)return `${prefix}-${globalThis.crypto.randomUUID()}`}catch{}return `${prefix}-${Date.now().toString(36)}-${(++seq).toString(36)}-${Math.random().toString(36).slice(2,10)}`}
function stable(value){
 if(value===null||typeof value!=='object')return JSON.stringify(value);
 if(Array.isArray(value))return'['+value.map(stable).join(',')+']';
 return'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}'
}
function timingSafeEqual(a,b){a=String(a??'');b=String(b??'');if(a.length!==b.length)return false;let x=0;for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i);return x===0}
function sanitize(input,{redactKeys=['token','secret','password','authorization','cookie','key'],maxDepth=6,maxEntries=100}={}){
 const seen=new WeakSet();
 const walk=(v,d)=>{
  if(d>maxDepth)return'[DepthLimit]';
  if(v===null||typeof v!=='object')return typeof v==='bigint'?String(v):v;
  if(seen.has(v))return'[Circular]';seen.add(v);
  if(Array.isArray(v))return v.slice(0,maxEntries).map(x=>walk(x,d+1));
  const out={};let n=0;for(const[k,val]of Object.entries(v)){if(n++>=maxEntries){out.__truncated=true;break}out[k]=redactKeys.some(r=>k.toLowerCase().includes(r))?'[REDACTED]':walk(val,d+1)}return out
 };
 try{return walk(input,0)}catch{return String(input)}
}
function createTokenService({defaultTtlMs=30000,maxTtlMs=3600000}={}){
 const tokens=new Map();
 function mint({appId='',capabilityId='',operation='*',nodeId='*',scope='lease',ttlMs=defaultTtlMs,uses=1,metadata={}}={}){
  const now=Date.now(),ttl=Math.max(1000,Math.min(maxTtlMs,Number(ttlMs)||defaultTtlMs)),token=id('cap');
  const row={id:token,appId:text(appId),capabilityId:text(capabilityId),operation:text(operation)||'*',nodeId:text(nodeId)||'*',scope:text(scope)||'lease',createdAt:now,expiresAt:now+ttl,usesRemaining:uses===Infinity?Infinity:Math.max(1,Number(uses)||1),revoked:false,metadata:sanitize(metadata)};
  tokens.set(token,row);return clone(row)
 }
 function match(row,ctx={}){if(!row||row.revoked)return{valid:false,reason:'token-revoked-or-unknown'};if(Date.now()>row.expiresAt){tokens.delete(row.id);return{valid:false,reason:'token-expired'}};for(const key of ['appId','capabilityId'])if(ctx[key]&&row[key]&&row[key]!==ctx[key])return{valid:false,reason:`token-${key}-mismatch`};for(const key of ['operation','nodeId'])if(ctx[key]&&row[key]&&row[key]!=='*'&&row[key]!==ctx[key])return{valid:false,reason:`token-${key}-mismatch`};if(row.usesRemaining!==Infinity&&row.usesRemaining<=0)return{valid:false,reason:'token-consumed'};return{valid:true,token:clone(row)}}
 function validate(token,ctx={}){return match(tokens.get(text(token)),ctx)}
 function consume(token,ctx={}){const row=tokens.get(text(token)),check=match(row,ctx);if(!check.valid)return check;if(row.usesRemaining!==Infinity)row.usesRemaining--;if(row.usesRemaining===0)row.revoked=true;return{valid:true,token:clone(row)}}
 function revoke(token){const row=tokens.get(text(token));if(!row)return false;row.revoked=true;return true}
 function revokeApp(appId){let n=0;for(const row of tokens.values())if(row.appId===appId&&!row.revoked){row.revoked=true;n++}return n}
 function sweep(){let n=0,now=Date.now();for(const[k,v]of tokens)if(v.revoked||now>v.expiresAt){tokens.delete(k);n++}return n}
 function list({appId}={}){sweep();return[...tokens.values()].filter(x=>!appId||x.appId===appId).map(x=>({...clone(x),id:`${x.id.slice(0,12)}…`}))}
 return Object.freeze({mint,validate,consume,revoke,revokeApp,sweep,list,size:()=>{sweep();return tokens.size}})
}
function createQuotaManager({windowMs=60000,defaultLimit=120,maxBuckets=5000}={}){
 const buckets=new Map(),rules=[];
 function configure(match,limit){rules.push({match,limit:Math.max(1,Number(limit)||defaultLimit)});return true}
 function limitFor(ctx){for(const r of rules){if(typeof r.match==='function'&&r.match(ctx))return r.limit;if(typeof r.match==='string'&&String(ctx.key||'').startsWith(r.match))return r.limit}return defaultLimit}
 function consume(key,{cost=1,context={}}={}){const now=Date.now(),k=text(key),limit=limitFor({...context,key:k});let b=buckets.get(k);if(!b||now-b.startedAt>=windowMs)b={startedAt:now,count:0};const next=b.count+Math.max(1,Number(cost)||1);b.count=next;buckets.set(k,b);if(buckets.size>maxBuckets){const first=buckets.keys().next().value;if(first)buckets.delete(first)}const remaining=Math.max(0,limit-next),resetAt=b.startedAt+windowMs;return{allowed:next<=limit,limit,remaining,resetAt,retryAfterMs:next<=limit?0:Math.max(0,resetAt-now)}}
 function status(key){const b=buckets.get(text(key));if(!b)return{count:0};if(Date.now()-b.startedAt>=windowMs){buckets.delete(text(key));return{count:0}}return clone(b)}
 return Object.freeze({consume,status,configure,clear:key=>key?buckets.delete(text(key)):buckets.clear(),size:()=>buckets.size})
}
function createReplayGuard({windowMs=120000,maxEntries=10000,maxFutureSkewMs=30000}={}){
 const seen=new Map();
 function sweep(now=Date.now()){for(const[k,t]of seen)if(now-t>windowMs)seen.delete(k);while(seen.size>maxEntries)seen.delete(seen.keys().next().value)}
 function accept({peerId='',nonce='',timestamp=0}={}){const now=Date.now(),ts=Number(timestamp),n=text(nonce),p=text(peerId);sweep(now);if(!n||!p||!Number.isFinite(ts))return{accepted:false,reason:'invalid-envelope'};if(ts<now-windowMs)return{accepted:false,reason:'stale-message'};if(ts>now+maxFutureSkewMs)return{accepted:false,reason:'future-message'};const k=`${p}:${n}`;if(seen.has(k))return{accepted:false,reason:'replay-detected'};seen.set(k,now);return{accepted:true}}
 return Object.freeze({accept,sweep,size:()=>seen.size,clear:()=>seen.clear()})
}
function createAuditLog({limit=1000}={}){
 const rows=[];const listeners=new Set();
 function append(type,data={},severity='info'){const row={id:id('audit'),time:new Date().toISOString(),type:text(type)||'event',severity:text(severity)||'info',data:sanitize(data)};rows.unshift(row);if(rows.length>limit)rows.length=limit;for(const fn of listeners)try{fn(clone(row))}catch{}return clone(row)}
 function query({type,severity,appId,limit:take=100}={}){return rows.filter(r=>(!type||r.type===type)&&(!severity||r.severity===severity)&&(!appId||r.data?.appId===appId)).slice(0,Math.max(1,Math.min(Number(take)||100,limit))).map(clone)}
 function subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn)}
 return Object.freeze({append,query,subscribe,export:()=>rows.map(clone),clear:()=>{rows.length=0},size:()=>rows.length})
}
function createSignedEnvelope(payload,{peerId,nonce=id('nonce'),timestamp=Date.now(),version=5}={}){return{version,type:'ucos:v5-envelope',peerId:text(peerId),nonce:text(nonce),timestamp:Number(timestamp),payload:clone(payload)}}
function validateSignedEnvelope(env,{expectedPeerId='',replayGuard=null}={}){if(!env||env.type!=='ucos:v5-envelope'||env.version!==5)return{valid:false,reason:'invalid-envelope'};if(expectedPeerId&&env.peerId!==expectedPeerId)return{valid:false,reason:'peer-mismatch'};if(!env.nonce||!Number.isFinite(Number(env.timestamp)))return{valid:false,reason:'invalid-envelope'};if(replayGuard){const r=replayGuard.accept({peerId:env.peerId,nonce:env.nonce,timestamp:env.timestamp});if(!r.accepted)return{valid:false,reason:r.reason}}return{valid:true,envelope:clone(env)}}
return{clone,id,stable,timingSafeEqual,sanitize,createTokenService,createQuotaManager,createReplayGuard,createAuditLog,createSignedEnvelope,validateSignedEnvelope};
});
