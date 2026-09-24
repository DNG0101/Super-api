(()=>{
'use strict';
if(globalThis.SuperApiUCOSLifecycle)return;
const BOOT='super-api-ucos-v5-boot',CRASHES='super-api-ucos-v5-crashes',SESSION='super-api-ucos-v5-session',CRASH_WINDOW=5*60*1000;
const events=new EventTarget(),now=Date.now();let ready=false,crashed=false;
const readStore=(store,k,fallback=null)=>{try{const v=store?.getItem?.(k);return v?JSON.parse(v):fallback}catch{return fallback}};
const writeStore=(store,k,v)=>{try{store?.setItem?.(k,JSON.stringify(v));return true}catch{return false}};
const delStore=(store,k)=>{try{store?.removeItem?.(k);return true}catch{return false}};
const local=(()=>{try{return localStorage}catch{return null}})(),session=(()=>{try{return sessionStorage}catch{return null}})();
const readLocal=(k,fallback=null)=>readStore(local,k,fallback),writeLocal=(k,v)=>writeStore(local,k,v),delLocal=k=>delStore(local,k);
const readBoot=(fallback=null)=>readStore(session,BOOT,fallback),writeBoot=v=>writeStore(session,BOOT,v);
const currentCrashes=()=>((readLocal(CRASHES,[])||[]).map(Number).filter(t=>Number.isFinite(t)&&Date.now()-t<CRASH_WINDOW));
const previous=readBoot(null),initialCrashes=currentCrashes();
const forced=new URLSearchParams(location.search).get('ucos_safe')==='1';
const interrupted=Boolean(previous?.state==='booting'&&now-Number(previous.time)<10*60*1000);
let safeMode=forced||interrupted||initialCrashes.length>=3;
globalThis.__UCOS_SAFE_MODE=safeMode;
writeBoot({state:'booting',time:now,previous:previous?.state||null});
function emit(type,detail){events.dispatchEvent(new CustomEvent(type,{detail}))}
function markReady(){ready=true;crashed=false;writeBoot({state:safeMode?'safe-mode':'ready',time:Date.now()});emit('ready',{safeMode});return true}
function recordCrash(reason='runtime-crash'){crashed=true;ready=false;const list=currentCrashes();list.push(Date.now());writeLocal(CRASHES,list.slice(-10));if(list.length>=3){safeMode=true;globalThis.__UCOS_SAFE_MODE=true}writeBoot({state:'crashed',time:Date.now(),reason:String(reason)});emit('crash',{reason:String(reason),count:list.length,safeMode});return list.length}
function clearCrashHistory(){delLocal(CRASHES);return true}
function enterSafeMode(reason='manual'){safeMode=true;globalThis.__UCOS_SAFE_MODE=true;writeBoot({state:'safe-mode',time:Date.now(),reason:String(reason)});emit('safe-mode',{enabled:true,reason});return true}
function exitSafeMode(){safeMode=false;crashed=false;ready=true;globalThis.__UCOS_SAFE_MODE=false;clearCrashHistory();writeBoot({state:'ready',time:Date.now(),reason:'safe-mode-exit'});emit('safe-mode',{enabled:false});return true}
function saveSession(snapshot){return writeLocal(SESSION,{version:1,time:Date.now(),snapshot})}
function loadSession({maxAgeMs=7*24*60*60*1000}={}){const row=readLocal(SESSION,null);if(!row||Date.now()-Number(row.time)>maxAgeMs)return null;return row.snapshot||null}
function clearSession(){delLocal(SESSION);return true}
function health(){return{version:6,ready,crashed,safeMode,interruptedBoot:interrupted,recentCrashCount:currentCrashes().length,hasSession:Boolean(loadSession()),bootScope:'tab-session'}}
window.addEventListener('error',e=>recordCrash(e.message||'window-error'),{once:true});
window.addEventListener('unhandledrejection',e=>recordCrash(e.reason?.message||String(e.reason||'unhandled-rejection')),{once:true});
window.addEventListener('pagehide',()=>{if(ready&&!crashed)writeBoot({state:'closed-cleanly',time:Date.now()})});
const api=Object.freeze({events,markReady,recordCrash,clearCrashHistory,enterSafeMode,exitSafeMode,saveSession,loadSession,clearSession,health,get safeMode(){return safeMode}});
globalThis.SuperApiUCOSLifecycle=api;
})();