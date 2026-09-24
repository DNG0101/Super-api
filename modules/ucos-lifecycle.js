(()=>{
'use strict';
if(globalThis.SuperApiUCOSLifecycle)return;
const BOOT='super-api-ucos-v5-boot',CRASHES='super-api-ucos-v5-crashes',SESSION='super-api-ucos-v5-session',CRASH_WINDOW=5*60*1000;
const events=new EventTarget(),now=Date.now();let ready=false,crashed=false;
const read=(k,fallback=null)=>{try{const v=localStorage.getItem(k);return v?JSON.parse(v):fallback}catch{return fallback}};
const write=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));return true}catch{return false}};
const del=k=>{try{localStorage.removeItem(k);return true}catch{return false}};
const currentCrashes=()=>((read(CRASHES,[])||[]).map(Number).filter(t=>Number.isFinite(t)&&Date.now()-t<CRASH_WINDOW));
const previous=read(BOOT,null),initialCrashes=currentCrashes();
const forced=new URLSearchParams(location.search).get('ucos_safe')==='1';
const interrupted=Boolean(previous?.state==='booting'&&now-Number(previous.time)<10*60*1000);
let safeMode=forced||interrupted||initialCrashes.length>=3;
globalThis.__UCOS_SAFE_MODE=safeMode;
write(BOOT,{state:'booting',time:now,previous:previous?.state||null});
function emit(type,detail){events.dispatchEvent(new CustomEvent(type,{detail}))}
function markReady(){ready=true;crashed=false;write(BOOT,{state:safeMode?'safe-mode':'ready',time:Date.now()});emit('ready',{safeMode});return true}
function recordCrash(reason='runtime-crash'){crashed=true;ready=false;const list=currentCrashes();list.push(Date.now());write(CRASHES,list.slice(-10));if(list.length>=3){safeMode=true;globalThis.__UCOS_SAFE_MODE=true}write(BOOT,{state:'crashed',time:Date.now(),reason:String(reason)});emit('crash',{reason:String(reason),count:list.length,safeMode});return list.length}
function clearCrashHistory(){del(CRASHES);return true}
function enterSafeMode(reason='manual'){safeMode=true;globalThis.__UCOS_SAFE_MODE=true;write(BOOT,{state:'safe-mode',time:Date.now(),reason:String(reason)});emit('safe-mode',{enabled:true,reason});return true}
function exitSafeMode(){safeMode=false;crashed=false;ready=true;globalThis.__UCOS_SAFE_MODE=false;clearCrashHistory();write(BOOT,{state:'ready',time:Date.now(),reason:'safe-mode-exit'});emit('safe-mode',{enabled:false});return true}
function saveSession(snapshot){return write(SESSION,{version:1,time:Date.now(),snapshot})}
function loadSession({maxAgeMs=7*24*60*60*1000}={}){const row=read(SESSION,null);if(!row||Date.now()-Number(row.time)>maxAgeMs)return null;return row.snapshot||null}
function clearSession(){del(SESSION);return true}
function health(){return{version:6,ready,crashed,safeMode,interruptedBoot:interrupted,recentCrashCount:currentCrashes().length,hasSession:Boolean(loadSession())}}
window.addEventListener('error',e=>recordCrash(e.message||'window-error'),{once:true});
window.addEventListener('unhandledrejection',e=>recordCrash(e.reason?.message||String(e.reason||'unhandled-rejection')),{once:true});
window.addEventListener('pagehide',()=>{if(ready&&!crashed)write(BOOT,{state:'closed-cleanly',time:Date.now()})});
const api=Object.freeze({events,markReady,recordCrash,clearCrashHistory,enterSafeMode,exitSafeMode,saveSession,loadSession,clearSession,health,get safeMode(){return safeMode}});
globalThis.SuperApiUCOSLifecycle=api;
})();