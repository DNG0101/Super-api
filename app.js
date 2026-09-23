(() => {
'use strict';
const $ = s => document.querySelector(s);
const logBox = $('#log');
const localVideo = $('#localVideo');
const remoteVideo = $('#remoteVideo');
const log = (...xs) => {
  const msg = xs.map(x => typeof x === 'string' ? x : safeStringify(x)).join(' ');
  logBox.textContent = `[${new Date().toLocaleTimeString()}] ${msg}\n` + logBox.textContent;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const safeStringify = v => { try { return JSON.stringify(v, (_k,x)=> typeof x === 'bigint' ? String(x) : x, 2); } catch { return String(v); } };
const timeout = (p, ms, label='Operation') => Promise.race([p, new Promise((_,rej)=>setTimeout(()=>rej(new Error(`${label} timed out`)),ms))]);

$('#secureBadge').textContent = isSecureContext ? 'HTTPS / secure context ✓' : 'Not a secure context';
$('#secureBadge').classList.add(isSecureContext ? 'ok' : 'bad');
$('#secureValue').textContent = isSecureContext ? 'YES' : 'NO';

let role = null;
let pc = null;
let dc = null;
let pendingRemote = null;
let localStreams = [];
let wakeLock = null;
let remoteStream = globalThis.MediaStream ? new MediaStream() : null;
if (remoteStream) remoteVideo.srcObject = remoteStream;

const SENSITIVE = new Set([
  'camera','microphone','screen','torch','geolocation','clipboard-read','clipboard-write',
  'notifications','share','file-open','file-save','directory','fullscreen','pip','pointer-lock',
  'audio-output','contacts','bluetooth','usb','serial','hid','nfc','midi','webauthn','payment',
  'idle-detector','local-fonts','eye-dropper','window-management','sensor-sample','device-orientation',
  'webxr','credentials-info','document-pip','wake-lock','image-capture','media-recorder','keyboard-layout',
  'storage-access','compute-pressure','speech','vibration','badge','ua-hints','insertable-media'
]);

function setRole(next) {
  role = next;
  $('#hostBtn').classList.toggle('primary', next === 'host');
  $('#controllerBtn').classList.toggle('primary', next === 'controller');
  $('#roleText').textContent = next === 'host'
    ? 'This peer receives requests. Sensitive actions still require local approval.'
    : 'This peer sends requests to the controlled peer.';
}
$('#hostBtn').onclick = () => setRole('host');
$('#controllerBtn').onclick = () => setRole('controller');

function peerStatus(text, live=false) {
  $('#peerText').textContent = text;
  $('#peerDot').className = `dot ${live ? 'on' : 'off'}`;
}

function createPC() {
  try { dc?.close(); } catch {}
  try { pc?.close(); } catch {}
  pc = new RTCPeerConnection({
    iceServers: [
      {urls:['stun:stun.l.google.com:19302','stun:stun1.l.google.com:19302']},
      {urls:'stun:stun.cloudflare.com:3478'}
    ]
  });
  pc.onconnectionstatechange = () => peerStatus(`peer ${pc.connectionState}`, pc.connectionState === 'connected');
  pc.oniceconnectionstatechange = () => log('ICE:', pc.iceConnectionState);
  pc.ondatachannel = e => bindChannel(e.channel);
  pc.ontrack = e => {
    const track = e.track;
    if (!remoteStream && globalThis.MediaStream) { remoteStream = new MediaStream(); remoteVideo.srcObject = remoteStream; }
    if (!remoteStream) return;
    if (!remoteStream.getTracks().some(t => t.id === track.id)) remoteStream.addTrack(track);
    track.onended = () => { try { remoteStream.removeTrack(track); } catch {} };
    remoteVideo.play().catch(()=>{});
    log('Remote media track received:', {kind:track.kind,label:track.label});
  };
  return pc;
}

function bindChannel(ch) {
  dc = ch;
  dc.onopen = () => { peerStatus('peer connected', true); log('WebRTC data channel connected.'); };
  dc.onclose = () => peerStatus('peer disconnected', false);
  dc.onerror = e => log('Data channel error:', e?.message || String(e));
  dc.onmessage = e => {
    let m; try { m = JSON.parse(e.data); } catch { return log('Invalid peer message ignored.'); }
    if (m.type === 'request') receiveRemoteRequest(m);
    else if (m.type === 'result') log(`Peer result • ${m.action}:`, m.result);
    else if (m.type === 'error') log(`Peer error • ${m.action}:`, m.error);
    else if (m.type === 'hello') log('Peer:', m.text);
  };
}

async function waitIceComplete(peer, ms=10000) {
  if (peer.iceGatheringState === 'complete') return;
  await timeout(new Promise(resolve => {
    const f = () => {
      if (peer.iceGatheringState === 'complete') {
        peer.removeEventListener('icegatheringstatechange', f); resolve();
      }
    };
    peer.addEventListener('icegatheringstatechange', f);
  }), ms, 'ICE gathering');
}

$('#createOffer').onclick = async () => {
  try {
    if (!role) throw new Error('Choose a peer role first.');
    createPC();
    bindChannel(pc.createDataChannel('super-api-control',{ordered:true}));
    await pc.setLocalDescription(await pc.createOffer());
    await waitIceComplete(pc).catch(()=>log('ICE gathering timeout; using candidates collected so far.'));
    $('#signalBox').value = JSON.stringify(pc.localDescription);
    log('Offer created. Copy it to the other peer.');
  } catch(e) { log('Offer error:', e.message); }
};

$('#makeAnswer').onclick = async () => {
  try {
    if (!role) throw new Error('Choose a peer role first.');
    const offer = JSON.parse($('#signalBox').value.trim());
    createPC();
    await pc.setRemoteDescription(offer);
    await pc.setLocalDescription(await pc.createAnswer());
    await waitIceComplete(pc).catch(()=>log('ICE gathering timeout; using candidates collected so far.'));
    $('#signalBox').value = JSON.stringify(pc.localDescription);
    log('Answer created. Copy it back to the offer peer.');
  } catch(e) { log('Answer error:', e.message); }
};

$('#applyAnswer').onclick = async () => {
  try {
    if (!pc) throw new Error('Create the offer on this peer first.');
    const answer = JSON.parse($('#signalBox').value.trim());
    await pc.setRemoteDescription(answer);
    log('Answer applied; waiting for connection.');
  } catch(e) { log('Apply-answer error:', e.message); }
};

$('#copySignal').onclick = async () => {
  try { await navigator.clipboard.writeText($('#signalBox').value); log('Signal copied.'); }
  catch { $('#signalBox').select(); document.execCommand('copy'); log('Signal copied using fallback.'); }
};
$('#clearSignal').onclick = () => { $('#signalBox').value=''; };
$('#playRemote').onclick = () => remoteVideo.play().catch(e=>log('Remote playback:',e.message));

function send(obj) {
  if (!dc || dc.readyState !== 'open') throw new Error('Peer data channel is not connected.');
  dc.send(JSON.stringify(obj));
}

function actionPolicy(id) { return SENSITIVE.has(id) ? 'sensitive' : 'safe'; }
function actionLabel(id) { return ACTIONS[id]?.label || id; }

async function receiveRemoteRequest(m) {
  try {
    if (role !== 'host') return send({type:'error',action:m.action,error:'This peer is not in Controlled peer mode.'});
    if (!$('#allowRequests').checked) return send({type:'error',action:m.action,error:'Controlled peer has not enabled session requests.'});
    if (!ACTIONS[m.action]) return send({type:'error',action:m.action,error:'Unknown action.'});
    if (SENSITIVE.has(m.action)) {
      if (pendingRemote) return send({type:'error',action:m.action,error:'Another sensitive request is already awaiting local approval.'});
      pendingRemote = m;
      $('#approvalText').textContent = `Paired peer requests “${actionLabel(m.action)}”. Approving may expose local data, activate hardware, open a picker, alter device/UI state, or trigger a browser permission prompt. Approval applies only to this request.`;
      $('#approvalPanel').classList.remove('hidden');
      log('Sensitive peer request waiting for local approval:', m.action);
      return;
    }
    await executeForPeer(m);
  } catch(e) { log('Remote request handling error:',e.message); }
}

async function executeForPeer(m) {
  try {
    const result = await runAction(m.action, true);
    send({type:'result',action:m.action,id:m.id,result:serializable(result)});
  } catch(e) {
    send({type:'error',action:m.action,id:m.id,error:e?.message || String(e)});
  }
}

$('#approveBtn').onclick = async () => {
  const m = pendingRemote; pendingRemote = null; $('#approvalPanel').classList.add('hidden');
  if (m) await executeForPeer(m);
};
$('#rejectBtn').onclick = () => {
  if (pendingRemote) { try { send({type:'error',action:pendingRemote.action,id:pendingRemote.id,error:'Rejected by the controlled peer user.'}); } catch {} }
  pendingRemote = null; $('#approvalPanel').classList.add('hidden');
};

$('#sendRemote').onclick = () => {
  try {
    if (role !== 'controller') log('Tip: set this peer to Controller mode.');
    const action = $('#remoteAction').value;
    send({type:'request',action,id:crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`});
    log('Requested on peer:', `${actionLabel(action)} [${actionPolicy(action).toUpperCase()}]`);
  } catch(e) { log(e.message); }
};

function serializable(v) {
  if (v == null) return v;
  if (v instanceof MediaStream) return {mediaStream:true,tracks:v.getTracks().map(t=>({kind:t.kind,label:t.label,enabled:t.enabled,muted:t.muted,readyState:t.readyState}))};
  if (v instanceof Blob) return {blob:true,type:v.type,size:v.size};
  if (v instanceof Error) return {name:v.name,message:v.message};
  try { return JSON.parse(JSON.stringify(v,(_k,x)=>typeof x==='bigint'?String(x):x)); } catch { return String(v); }
}

async function attachToPeer(stream) {
  if (!pc || pc.connectionState === 'closed') return;
  for (const track of stream.getTracks()) {
    const existing = pc.getSenders().find(s => s.track?.id === track.id);
    if (!existing) pc.addTrack(track, stream);
  }
}

async function addLocalStream(stream, sendToPeer=true) {
  localStreams.push(stream);
  if (stream.getVideoTracks().length) { localVideo.srcObject = stream; localVideo.play().catch(()=>{}); }
  if (sendToPeer) await attachToPeer(stream);
  for (const t of stream.getTracks()) t.addEventListener('ended',()=>{});
  return stream;
}

async function stopAllMedia() {
  for (const s of localStreams) for (const t of s.getTracks()) { try { t.stop(); } catch {} }
  localStreams=[]; localVideo.srcObject=null;
  if (pc) for (const sender of pc.getSenders()) { if (sender.track) { try { pc.removeTrack(sender); } catch {} } }
  if (wakeLock) { try { await wakeLock.release(); } catch {} wakeLock=null; }
  log('Local media/wake-lock resources stopped.');
  return 'Stopped';
}
$('#stopMedia').onclick = stopAllMedia;

async function cameraStream() {
  let s = localStreams.find(x=>x.getVideoTracks().some(t=>t.readyState==='live'));
  if (!s) s = await addLocalStream(await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false}),true);
  return s;
}
async function micStream() { return addLocalStream(await navigator.mediaDevices.getUserMedia({audio:true,video:false}),true); }

const ACTIONS = {};
function action(id,label,fn){ ACTIONS[id]={id,label,fn}; }

// Peer/session helpers.
action('capability-scan','Capability scan (all catalog APIs)',async()=>detectAll().map(x=>({name:x.api.name,category:x.api.category,supported:x.supported,runnable:!!x.api.action})));
action('environment-info','Coarse browser/page environment',async()=>({secureContext:isSecureContext,online:navigator.onLine,language:navigator.language,languages:navigator.languages,platform:navigator.platform,hardwareConcurrency:navigator.hardwareConcurrency,maxTouchPoints:navigator.maxTouchPoints,visibility:document.visibilityState,url:location.href}));
action('stop-media','Stop host media/wake lock',stopAllMedia);
action('microphone','Microphone → paired peer',async()=>micStream());
action('torch','Camera torch toggle ON',async()=>{const s=await cameraStream();const t=s.getVideoTracks()[0];const c=t.getCapabilities?.()||{};if(!c.torch)throw new Error('Torch is not exposed by this camera/browser.');await t.applyConstraints({advanced:[{torch:true}]});return {torch:true,label:t.label};});
action('clipboard-write','Write test text to clipboard',async()=>{await navigator.clipboard.writeText(`Super API test ${new Date().toISOString()}`);return 'Clipboard test text written.';});
action('file-save','Save a test file',async()=>{const text=`Super API test\n${new Date().toISOString()}\n`;if(window.showSaveFilePicker){const h=await showSaveFilePicker({suggestedName:'super-api-test.txt'});const w=await h.createWritable();await w.write(text);await w.close();return {saved:true,name:h.name};}const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'text/plain'}));a.download='super-api-test.txt';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);return {downloadTriggered:true};});
action('directory','Open directory picker',async()=>{if(!window.showDirectoryPicker)throw new Error('Directory picker not available.');const h=await showDirectoryPicker();return {name:h.name,kind:h.kind};});

// API-specific tests.
action('attribution-info','Attribution Reporting surface info',async()=>({anchorAttribution:'attributionSrc' in HTMLAnchorElement.prototype,xhrAttribution:'setAttributionReporting' in XMLHttpRequest.prototype}));
action('audio-output','Select audio output device',async()=>{if(!navigator.mediaDevices?.selectAudioOutput)throw new Error('selectAudioOutput unavailable.');const d=await navigator.mediaDevices.selectAudioOutput();return {deviceId:d.deviceId,label:d.label,kind:d.kind};});
action('audio-session','Audio Session state',async()=>{const a=navigator.audioSession;if(!a)throw new Error('Audio Session API unavailable.');return {type:a.type,state:a.state};});
action('background-sync','Register one-off background sync',async()=>{const r=await ensureSW();if(!r.sync)throw new Error('Background Sync unavailable on registration.');await r.sync.register('super-api-sync');return {registered:'super-api-sync'};});
action('badge','Set then clear app badge',async()=>{if(!navigator.setAppBadge)throw new Error('Badging unavailable.');await navigator.setAppBadge(1);setTimeout(()=>navigator.clearAppBadge?.(),1500);return 'Badge set temporarily.';});
action('barcode-formats','List supported barcode formats',async()=>{if(!globalThis.BarcodeDetector)throw new Error('BarcodeDetector unavailable.');return BarcodeDetector.getSupportedFormats?.() || [];});
action('battery','Battery status',async()=>{const b=await navigator.getBattery();return {charging:b.charging,level:b.level,chargingTime:b.chargingTime,dischargingTime:b.dischargingTime};});
action('bluetooth','Web Bluetooth device picker',async()=>{const d=await navigator.bluetooth.requestDevice({acceptAllDevices:true,optionalServices:[]});return {name:d.name,id:d.id,gattConnected:d.gatt?.connected??false};});
action('beacon','Beacon API call',async()=>({queued:navigator.sendBeacon(`./?beacon=${Date.now()}`,new Blob(['super-api'],{type:'text/plain'}))}));
action('broadcast','BroadcastChannel loopback',async()=>{const name=`super-api-${crypto.randomUUID?.()||Date.now()}`;const a=new BroadcastChannel(name),b=new BroadcastChannel(name);const v=await timeout(new Promise(res=>{b.onmessage=e=>res(e.data);a.postMessage({ok:true,time:Date.now()});}),2000,'BroadcastChannel');a.close();b.close();return v;});
action('camera','Camera → local preview + paired peer',async()=>cameraStream());
action('canvas','Canvas draw/readback',async()=>{const c=document.createElement('canvas');c.width=80;c.height=40;const x=c.getContext('2d');x.fillStyle='#2463eb';x.fillRect(0,0,80,40);x.fillStyle='white';x.fillText('API',20,24);return {width:c.width,height:c.height,dataURLBytes:c.toDataURL('image/png').length};});
action('clipboard-read','Read clipboard text',async()=>navigator.clipboard.readText());
action('compression','Compression + decompression streams',async()=>{const text='Super API '.repeat(100);const blob=await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).blob();const decoded=await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text();return {original:text.length,compressed:blob.size,roundTrip:decoded===text};});
action('compute-pressure','Compute Pressure sample',async()=>{if(!globalThis.PressureObserver)throw new Error('PressureObserver unavailable.');return timeout(new Promise((resolve,reject)=>{const o=new PressureObserver(r=>{o.disconnect();resolve(r.at(-1));},{sampleInterval:500});o.observe('cpu').catch(reject);}),4000,'Compute Pressure');});
action('console','Console API test',async()=>{console.info('Super API console test',Date.now());return {log:true,info:true,warn:true,error:true,table:true};});
action('contacts','Contact Picker',async()=>{if(!navigator.contacts?.select)throw new Error('Contact Picker unavailable.');return navigator.contacts.select(['name','email','tel'],{multiple:false});});
action('cookie-store','Cookie Store round-trip',async()=>{if(!globalThis.cookieStore)throw new Error('Cookie Store unavailable.');const name=`super_api_${Date.now()}`;await cookieStore.set(name,'ok');const c=await cookieStore.get(name);await cookieStore.delete(name);return {name:c?.name,value:c?.value,cleaned:true};});
action('credentials-info','Credential Management surface info',async()=>({credentials:!!navigator.credentials,methods:navigator.credentials?Object.getOwnPropertyNames(Object.getPrototypeOf(navigator.credentials)).filter(x=>typeof navigator.credentials[x]==='function'):[]}));
action('crypto','Web Crypto SHA-256 + RNG',async()=>{const data=new TextEncoder().encode('super-api');const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(b=>b.toString(16).padStart(2,'0')).join('');const rnd=[...crypto.getRandomValues(new Uint32Array(4))];return {sha256:digest,random:rnd};});
action('css-highlight','CSS Custom Highlight test',async()=>{if(!CSS.highlights||!globalThis.Highlight)throw new Error('CSS Highlight unavailable.');const e=document.createElement('span');e.textContent='highlight';e.style.position='fixed';e.style.left='-9999px';document.body.appendChild(e);const r=new Range();r.selectNodeContents(e);const h=new Highlight(r);CSS.highlights.set('super-api-test',h);CSS.highlights.delete('super-api-test');e.remove();return {created:true,removed:true};});
action('css-property','CSS custom property registration',async()=>{if(!CSS.registerProperty)throw new Error('CSS.registerProperty unavailable.');const name=`--super-api-${Date.now()}`;CSS.registerProperty({name,syntax:'<number>',inherits:false,initialValue:'0'});return {registered:name};});
action('css-typed-om','CSS Typed OM',async()=>{if(!globalThis.CSSUnitValue)throw new Error('CSS Typed OM unavailable.');const v=new CSSUnitValue(10,'px');return {value:v.value,unit:v.unit,text:String(v)};});
action('cssom','CSSOM rule test',async()=>{const s=document.createElement('style');document.head.appendChild(s);s.sheet.insertRule('.super-api-cssom{opacity:.99}',0);const out={rules:s.sheet.cssRules.length,selector:s.sheet.cssRules[0].selectorText};s.remove();return out;});
action('cssom-view','CSSOM View geometry',async()=>({viewport:{innerWidth,innerHeight,devicePixelRatio},visualViewport:window.visualViewport?{width:window.visualViewport.width,height:window.visualViewport.height,scale:window.visualViewport.scale}:null,bodyRect:document.body.getBoundingClientRect().toJSON?.()||{width:document.body.getBoundingClientRect().width,height:document.body.getBoundingClientRect().height}}));
action('device-memory','Device Memory value',async()=>({deviceMemory:navigator.deviceMemory ?? null,hardwareConcurrency:navigator.hardwareConcurrency ?? null}));
action('device-orientation','Device orientation/motion sample',async()=>{if(typeof globalThis.DeviceOrientationEvent?.requestPermission==='function'){const p=await globalThis.DeviceOrientationEvent.requestPermission();if(p!=='granted')throw new Error(`Orientation permission: ${p}`);}return timeout(new Promise((resolve)=>{const done=e=>{removeEventListener('deviceorientation',done);resolve({alpha:e.alpha,beta:e.beta,gamma:e.gamma,absolute:e.absolute});};addEventListener('deviceorientation',done,{once:true});}),4000,'Device orientation event');});
action('device-posture','Device posture info',async()=>({type:navigator.devicePosture?.type||null,supported:!!navigator.devicePosture}));
action('document-pip','Document Picture-in-Picture',async()=>{if(!globalThis.documentPictureInPicture)throw new Error('Document Picture-in-Picture unavailable.');const w=await documentPictureInPicture.requestWindow({width:360,height:220});w.document.body.innerHTML='<main style="font-family:system-ui;padding:24px"><h2>Super API</h2><p>Document Picture-in-Picture works.</p></main>';return {opened:true,width:w.innerWidth,height:w.innerHeight};});
action('dom','DOM create/mutate/remove',async()=>{const e=document.createElement('div');e.dataset.superApi='ok';e.textContent='DOM test';document.body.appendChild(e);const out={tag:e.tagName,text:e.textContent,dataset:e.dataset.superApi,connected:e.isConnected};e.remove();out.removed=!e.isConnected;return out;});
action('drag-drop','Drag-and-drop DataTransfer test',async()=>{if(!globalThis.DataTransfer)throw new Error('DataTransfer unavailable.');const d=new DataTransfer();d.setData('text/plain','super-api');return {types:[...d.types],data:d.getData('text/plain')};});
action('edit-context','EditContext constructor test',async()=>{if(!globalThis.EditContext)throw new Error('EditContext unavailable.');const e=new EditContext({text:'Super API'});return {text:e.text,selectionStart:e.selectionStart,selectionEnd:e.selectionEnd};});
action('encoding','Encoding round-trip',async()=>{const s='Super API ✓';const bytes=new TextEncoder().encode(s);return {bytes:[...bytes],decoded:new TextDecoder().decode(bytes)};});
action('eye-dropper','EyeDropper color picker',async()=>{if(!globalThis.EyeDropper)throw new Error('EyeDropper unavailable.');return new EyeDropper().open();});
action('fedcm-info','FedCM surface info',async()=>({IdentityCredential:!!globalThis.IdentityCredential,credentialsGet:!!navigator.credentials?.get,note:'A real FedCM login requires an identity-provider configuration.'}));
action('fetch','Fetch same-origin page',async()=>{const r=await fetch(`./?fetch=${Date.now()}`,{cache:'no-store'});return {ok:r.ok,status:r.status,type:r.type,url:r.url,contentType:r.headers.get('content-type')};});
action('file-api','File/Blob/FileReader round-trip',async()=>{const f=new File(['Super API'],'super-api.txt',{type:'text/plain'});const text=await f.text();return {name:f.name,size:f.size,type:f.type,text};});
action('file-open','Open local file picker',async()=>{if(window.showOpenFilePicker){const [h]=await showOpenFilePicker();const f=await h.getFile();return {name:f.name,size:f.size,type:f.type,lastModified:f.lastModified};}return new Promise((resolve,reject)=>{const i=document.createElement('input');i.type='file';i.onchange=()=>{const f=i.files?.[0];f?resolve({name:f.name,size:f.size,type:f.type,lastModified:f.lastModified}):reject(new Error('No file selected.'));};i.click();});});
action('font-loading','CSS Font Loading status',async()=>({status:document.fonts.status,sansSerif:document.fonts.check('16px sans-serif'),size:document.fonts.size}));
action('fullscreen','Enter fullscreen',async()=>{await document.documentElement.requestFullscreen();return {fullscreen:true,element:document.fullscreenElement?.tagName};});
action('gamepad','Gamepad snapshot',async()=>[...navigator.getGamepads()].filter(Boolean).map(g=>({id:g.id,index:g.index,buttons:g.buttons.length,axes:g.axes.length,connected:g.connected,mapping:g.mapping})));
action('geolocation','Current geolocation',async()=>new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(p=>resolve({latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy,altitude:p.coords.altitude,heading:p.coords.heading,speed:p.coords.speed,timestamp:p.timestamp}),e=>reject(new Error(e.message)),{enableHighAccuracy:true,timeout:15000,maximumAge:0})));
action('geometry','Geometry interfaces',async()=>{const p=new DOMPoint(2,3),r=new DOMRect(1,2,30,40),m=new DOMMatrix().translate(10,20).scale(2);return {point:{x:p.x,y:p.y},rect:{x:r.x,y:r.y,width:r.width,height:r.height},matrix:m.toString()};});
action('hid','WebHID device picker',async()=>{const ds=await navigator.hid.requestDevice({filters:[]});return ds.map(d=>({productName:d.productName,vendorId:d.vendorId,productId:d.productId,opened:d.opened}));});
action('history','History API state test',async()=>{const old={url:location.href,state:history.state,length:history.length};history.pushState({superApi:true},'',`${location.pathname}${location.search}#super-api-history-test`);const mid={url:location.href,state:history.state,length:history.length};history.replaceState(old.state,'',old.url);return {before:old,afterPush:mid,restored:location.href};});
action('html-dom','HTML DOM element test',async()=>{const i=document.createElement('input');i.type='range';i.value='42';return {constructor:i.constructor.name,type:i.type,value:i.value,validity:i.validity.valid};});
action('idle-callback','requestIdleCallback test',async()=>new Promise(resolve=>requestIdleCallback(d=>resolve({didTimeout:d.didTimeout,timeRemaining:d.timeRemaining()}),{timeout:1000})));
action('idle-detector','Idle Detection sample',async()=>{if(!globalThis.IdleDetector)throw new Error('IdleDetector unavailable.');const p=await IdleDetector.requestPermission?.();if(p&&p!=='granted')throw new Error(`Idle permission: ${p}`);const c=new AbortController();const detector=new IdleDetector();const ready=new Promise((resolve,reject)=>{detector.addEventListener('change',()=>resolve({userState:detector.userState,screenState:detector.screenState}),{once:true});detector.start({threshold:60000,signal:c.signal}).catch(reject);});try{return await timeout(ready,4000,'IdleDetector');}finally{c.abort();}});
action('image-capture','ImageCapture capabilities',async()=>{const s=await cameraStream();if(!globalThis.ImageCapture)throw new Error('ImageCapture unavailable.');const i=new ImageCapture(s.getVideoTracks()[0]);return {photoCapabilities:await i.getPhotoCapabilities?.(),photoSettings:await i.getPhotoSettings?.()};});
action('indexeddb','IndexedDB round-trip',async()=>new Promise((resolve,reject)=>{const name=`super-api-${Date.now()}`;const q=indexedDB.open(name,1);q.onupgradeneeded=()=>q.result.createObjectStore('kv');q.onerror=()=>reject(q.error);q.onsuccess=()=>{const db=q.result;const tx=db.transaction('kv','readwrite');const s=tx.objectStore('kv');s.put({ok:true,time:Date.now()},'test');const g=s.get('test');g.onerror=()=>reject(g.error);g.onsuccess=()=>{const value=g.result;tx.oncomplete=()=>{db.close();indexedDB.deleteDatabase(name);resolve(value);};};};}));
action('ink','Ink API surface info',async()=>({available:!!navigator.ink,methods:navigator.ink?Object.getOwnPropertyNames(Object.getPrototypeOf(navigator.ink)).filter(k=>typeof navigator.ink[k]==='function'):[]}));
action('input-capabilities','InputDeviceCapabilities constructor',async()=>{if(!globalThis.InputDeviceCapabilities)throw new Error('InputDeviceCapabilities unavailable.');const x=new InputDeviceCapabilities({firesTouchEvents:true});return {firesTouchEvents:x.firesTouchEvents};});
action('insertable-media','MediaStreamTrack processor test',async()=>{const s=await cameraStream();if(!globalThis.MediaStreamTrackProcessor)throw new Error('MediaStreamTrackProcessor unavailable.');const p=new MediaStreamTrackProcessor({track:s.getVideoTracks()[0]});return {readable:!!p.readable,trackKind:s.getVideoTracks()[0].kind};});
action('intersection','IntersectionObserver sample',async()=>new Promise(resolve=>{const e=document.createElement('div');e.style.cssText='height:1px;width:1px';document.body.appendChild(e);const o=new IntersectionObserver(es=>{o.disconnect();e.remove();resolve({isIntersecting:es[0].isIntersecting,ratio:es[0].intersectionRatio,rootBounds:!!es[0].rootBounds});});o.observe(e);}));
action('keyboard-layout','Keyboard layout map',async()=>{if(!navigator.keyboard?.getLayoutMap)throw new Error('Keyboard layout map unavailable.');const m=await navigator.keyboard.getLayoutMap();const keys=['KeyA','KeyQ','Digit1','Enter'];return Object.fromEntries(keys.map(k=>[k,m.get(k)||null]));});
action('local-fonts','Local Font Access sample',async()=>{if(!globalThis.queryLocalFonts)throw new Error('Local Font Access unavailable.');const fs=await queryLocalFonts();return {count:fs.length,sample:fs.slice(0,10).map(f=>({family:f.family,fullName:f.fullName,postscriptName:f.postscriptName,style:f.style}))};});
action('media-capabilities','Media Capabilities decode query',async()=>{const mc=navigator.mediaCapabilities;if(!mc)throw new Error('Media Capabilities unavailable.');const cfg={type:'file',video:{contentType:'video/webm; codecs="vp8"',width:640,height:360,bitrate:500000,framerate:30}};return mc.decodingInfo(cfg);});
action('media-recorder','Record 1 second of camera',async()=>{const s=await cameraStream();if(!globalThis.MediaRecorder)throw new Error('MediaRecorder unavailable.');const r=new MediaRecorder(s);const chunks=[];r.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};const done=new Promise((resolve,reject)=>{r.onstop=()=>resolve(new Blob(chunks,{type:r.mimeType}));r.onerror=e=>reject(e.error||e);});r.start();await sleep(1000);r.stop();const b=await done;return {mimeType:r.mimeType,size:b.size};});
action('media-session','Media Session metadata test',async()=>{if(!navigator.mediaSession)throw new Error('Media Session unavailable.');const old=navigator.mediaSession.metadata;navigator.mediaSession.metadata=new MediaMetadata({title:'Super API test',artist:'Browser API Lab'});setTimeout(()=>{try{navigator.mediaSession.metadata=old}catch{}},1500);return {playbackState:navigator.mediaSession.playbackState,metadataSet:true};});
action('media-source','MediaSource type support',async()=>{if(!globalThis.MediaSource)throw new Error('MediaSource unavailable.');return {webmVP8:MediaSource.isTypeSupported('video/webm; codecs="vp8"'),mp4H264:MediaSource.isTypeSupported('video/mp4; codecs="avc1.42E01E"')};});
action('message-channel','MessageChannel loopback',async()=>{const c=new MessageChannel();const p=timeout(new Promise(res=>c.port2.onmessage=e=>res(e.data)),1000,'MessageChannel');c.port1.postMessage({hello:'super-api'});const v=await p;c.port1.close();c.port2.close();return v;});
action('midi','Web MIDI device snapshot',async()=>{const m=await navigator.requestMIDIAccess();return {sysexEnabled:m.sysexEnabled,inputs:[...m.inputs.values()].map(x=>({name:x.name,manufacturer:x.manufacturer,state:x.state})),outputs:[...m.outputs.values()].map(x=>({name:x.name,manufacturer:x.manufacturer,state:x.state}))};});
action('navigation','Navigation API snapshot',async()=>{if(!globalThis.navigation)throw new Error('Navigation API unavailable.');return {currentKey:navigation.currentEntry?.key,currentURL:navigation.currentEntry?.url,entries:navigation.entries?.().length,canGoBack:navigation.canGoBack,canGoForward:navigation.canGoForward};});
action('network','Network Information snapshot',async()=>{const c=navigator.connection||navigator.mozConnection||navigator.webkitConnection;return c?{online:navigator.onLine,type:c.type,effectiveType:c.effectiveType,downlink:c.downlink,downlinkMax:c.downlinkMax,rtt:c.rtt,saveData:c.saveData}:{online:navigator.onLine,connectionAPI:false};});
action('nfc','Start a short Web NFC scan',async()=>{if(!globalThis.NDEFReader)throw new Error('Web NFC unavailable.');const c=new AbortController();const r=new NDEFReader();await r.scan({signal:c.signal});setTimeout(()=>c.abort(),5000);return 'NFC scan started for up to 5 seconds.';});
action('notifications','Notification test',async()=>{const p=await Notification.requestPermission();if(p!=='granted')return {permission:p};const r=await ensureSW();await r.showNotification('Super API Peer Lab',{body:'Notifications API test',tag:'super-api-test'});return {permission:p,shown:true};});
action('payment','Payment Request capability check',async()=>{if(!globalThis.PaymentRequest)throw new Error('Payment Request unavailable.');const pr=new PaymentRequest([{supportedMethods:'basic-card'}],{total:{label:'Demo only — no payment opened',amount:{currency:'USD',value:'1.00'}}});return {canMakePayment:await pr.canMakePayment().catch(()=>null),showCalled:false};});
action('performance','Performance snapshot',async()=>{const nav=performance.getEntriesByType('navigation')[0];return {now:performance.now(),timeOrigin:performance.timeOrigin,navigation:nav?{type:nav.type,duration:nav.duration,domComplete:nav.domComplete,transferSize:nav.transferSize}:null,resources:performance.getEntriesByType('resource').length};});
action('permissions','Permissions snapshot',async()=>{if(!navigator.permissions)throw new Error('Permissions API unavailable.');const out={};for(const name of ['geolocation','camera','microphone','notifications','clipboard-read','clipboard-write','midi']){try{out[name]=(await navigator.permissions.query({name})).state}catch{out[name]='query unsupported'}}return out;});
action('pip','Picture-in-Picture with camera preview',async()=>{await cameraStream();if(!document.pictureInPictureEnabled||!localVideo.requestPictureInPicture)throw new Error('Picture-in-Picture unavailable.');const w=await localVideo.requestPictureInPicture();return {width:w.width,height:w.height};});
action('pointer-events','PointerEvent constructor',async()=>{if(!globalThis.PointerEvent)throw new Error('PointerEvent unavailable.');const e=new PointerEvent('pointermove',{pointerId:7,pointerType:'pen',pressure:.5,clientX:10,clientY:20});return {pointerId:e.pointerId,pointerType:e.pointerType,pressure:e.pressure,x:e.clientX,y:e.clientY};});
action('pointer-lock','Pointer Lock test',async()=>{const r=document.body.requestPointerLock();if(r?.then)await r;await sleep(300);const ok=document.pointerLockElement===document.body;document.exitPointerLock?.();return {locked:ok};});
action('popover','Popover API test',async()=>{const e=document.createElement('div');e.popover='manual';e.textContent='Super API popover';document.body.appendChild(e);e.showPopover();await sleep(250);const open=e.matches(':popover-open');e.hidePopover();e.remove();return {opened:open};});
action('prompt-api','Prompt/LanguageModel availability',async()=>{if(globalThis.LanguageModel){return {LanguageModel:true,availability:await LanguageModel.availability?.().catch(()=>null)}}if(globalThis.ai?.languageModel){return {legacyAI:true,capabilities:await globalThis.ai.languageModel.capabilities?.().catch(()=>null)}}throw new Error('Prompt API unavailable.');});
action('reporting','ReportingObserver constructor',async()=>{if(!globalThis.ReportingObserver)throw new Error('ReportingObserver unavailable.');const o=new ReportingObserver(()=>{}, {buffered:true});o.observe();o.disconnect();return {created:true,buffered:true};});
action('resize-observer','ResizeObserver sample',async()=>new Promise(resolve=>{const e=document.createElement('div');e.style.cssText='position:fixed;left:-9999px;width:10px;height:10px';document.body.appendChild(e);const o=new ResizeObserver(es=>{const r=es[0].contentRect;o.disconnect();e.remove();resolve({width:r.width,height:r.height});});o.observe(e);e.style.width='20px';}));
action('sanitizer','HTML Sanitizer surface test',async()=>{if(globalThis.Sanitizer){const s=new Sanitizer();return {constructor:true,methods:Object.getOwnPropertyNames(Sanitizer.prototype)}}if(Element.prototype.setHTML){const e=document.createElement('div');e.setHTML('<b>safe</b><script>bad()</script>');return {setHTML:true,result:e.innerHTML};}throw new Error('Sanitizer API unavailable.');});
action('scheduler','scheduler.postTask test',async()=>{if(!globalThis.scheduler?.postTask)throw new Error('scheduler.postTask unavailable.');return scheduler.postTask(()=>({ran:true,time:performance.now()}),{priority:'user-visible'});});
action('screen','Screen capture → paired peer',async()=>addLocalStream(await navigator.mediaDevices.getDisplayMedia({video:true,audio:true}),true));
action('screen-orientation','Screen orientation snapshot',async()=>({type:screen.orientation?.type,angle:screen.orientation?.angle,width:screen.width,height:screen.height,availWidth:screen.availWidth,availHeight:screen.availHeight}));
action('selection','Selection API test',async()=>{const e=document.createElement('span');e.textContent='Super API selection';document.body.appendChild(e);const r=document.createRange();r.selectNodeContents(e);const s=getSelection();s.removeAllRanges();s.addRange(r);const text=s.toString();s.removeAllRanges();e.remove();return {text};});
action('sensor-sample','Generic Sensor sample',async()=>{const classes=['Accelerometer','Gyroscope','Magnetometer','AbsoluteOrientationSensor','RelativeOrientationSensor','AmbientLightSensor'].filter(k=>globalThis[k]);if(!classes.length)throw new Error('No Generic Sensor class exposed.');const name=classes[0],S=globalThis[name],sensor=new S({frequency:5});try{return await timeout(new Promise((resolve,reject)=>{sensor.addEventListener('reading',()=>resolve({sensor:name,x:sensor.x,y:sensor.y,z:sensor.z,quaternion:sensor.quaternion,illuminance:sensor.illuminance,timestamp:sensor.timestamp}),{once:true});sensor.addEventListener('error',e=>reject(e.error||e),{once:true});sensor.start();}),4000,name);}finally{try{sensor.stop()}catch{}}});
action('serial','Web Serial port picker',async()=>{const p=await navigator.serial.requestPort();return p.getInfo();});
action('service-worker','Register service worker',async()=>{const r=await ensureSW();return {scope:r.scope,active:!!r.active,waiting:!!r.waiting,installing:!!r.installing};});
action('share','Web Share sheet',async()=>{await navigator.share({title:'Super API Peer Lab',text:'Browser Web API test',url:location.href});return 'Share sheet completed/closed.';});
action('speculation','Speculation Rules support',async()=>({supported:HTMLScriptElement.supports?.('speculationrules')===true}));
action('speech','Speech synthesis test',async()=>{speechSynthesis.speak(new SpeechSynthesisUtterance('Super API browser test'));return {queued:true,voices:speechSynthesis.getVoices().length};});
action('storage-access','Storage Access API test',async()=>{const has=await document.hasStorageAccess?.().catch(()=>null);if(!document.requestStorageAccess)return {hasStorageAccess:has,requestAvailable:false};const result=await document.requestStorageAccess();return {hasStorageAccessBefore:has,granted:!!result};});
action('storage-estimate','Storage quota estimate',async()=>{const e=await navigator.storage.estimate();return {usage:e.usage,quota:e.quota,usageDetails:e.usageDetails,persisted:await navigator.storage.persisted?.()};});
action('streams','Streams pipeline test',async()=>{const rs=new ReadableStream({start(c){c.enqueue('super ');c.enqueue('api');c.close();}});const ts=new TransformStream({transform(x,c){c.enqueue(String(x).toUpperCase());}});return {text:await new Response(rs.pipeThrough(ts)).text()};});
action('summarizer-info','Summarizer availability',async()=>{if(globalThis.Summarizer)return {Summarizer:true,availability:await Summarizer.availability?.().catch(()=>null)};if(globalThis.ai?.summarizer)return {legacyAI:true,capabilities:await globalThis.ai.summarizer.capabilities?.().catch(()=>null)};throw new Error('Summarizer API unavailable.');});
action('svg','SVG API test',async()=>{const ns='http://www.w3.org/2000/svg';const s=document.createElementNS(ns,'svg');const c=document.createElementNS(ns,'circle');c.setAttribute('cx','10');c.setAttribute('cy','10');c.setAttribute('r','8');s.append(c);return {svg:s.outerHTML,baseValSupported:!!c.cx?.baseVal};});
action('touch-events','Touch capability snapshot',async()=>({ontouchstart:'ontouchstart' in window,maxTouchPoints:navigator.maxTouchPoints,TouchEvent:!!globalThis.TouchEvent}));
action('translation-info','Translator/LanguageDetector availability',async()=>({Translator:!!globalThis.Translator,LanguageDetector:!!globalThis.LanguageDetector,translatorAvailability:globalThis.Translator?.availability?await Translator.availability({sourceLanguage:'en',targetLanguage:'es'}).catch(()=>null):null,detectorAvailability:globalThis.LanguageDetector?.availability?await LanguageDetector.availability().catch(()=>null):null}));
action('trusted-types','Trusted Types policy test',async()=>{if(!globalThis.trustedTypes)throw new Error('Trusted Types unavailable.');const name=`super-api-${Date.now()}`;const p=trustedTypes.createPolicy(name,{createHTML:s=>s});const v=p.createHTML('<b>Super API</b>');return {policy:name,type:Object.prototype.toString.call(v),text:String(v)};});
action('ua-hints','High-entropy UA Client Hints',async()=>{if(!navigator.userAgentData)throw new Error('UA Client Hints unavailable.');const h=await navigator.userAgentData.getHighEntropyValues(['architecture','bitness','model','platformVersion','uaFullVersion','fullVersionList','wow64']);return {brands:navigator.userAgentData.brands,mobile:navigator.userAgentData.mobile,platform:navigator.userAgentData.platform,...h};});
action('ui-events','UI Events constructors',async()=>{const k=new KeyboardEvent('keydown',{key:'A',code:'KeyA'}),m=new MouseEvent('click',{clientX:12,clientY:34});return {keyboard:{key:k.key,code:k.code},mouse:{x:m.clientX,y:m.clientY,button:m.button}};});
action('url','URL parse/build test',async()=>{const u=new URL('./test?a=1',location.href);u.searchParams.set('b','2');return {href:u.href,origin:u.origin,pathname:u.pathname,params:Object.fromEntries(u.searchParams)};});
action('url-pattern','URLPattern match test',async()=>{if(!globalThis.URLPattern)throw new Error('URLPattern unavailable.');const p=new URLPattern({pathname:'/users/:id'});const r=p.exec('https://example.test/users/42');return {matched:!!r,id:r?.pathname?.groups?.id};});
action('usb','WebUSB device picker',async()=>{const d=await navigator.usb.requestDevice({filters:[]});return {manufacturerName:d.manufacturerName,productName:d.productName,serialNumber:d.serialNumber,vendorId:d.vendorId,productId:d.productId,opened:d.opened};});
action('user-preferences','User preference media queries',async()=>({dark:matchMedia('(prefers-color-scheme: dark)').matches,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,contrastMore:matchMedia('(prefers-contrast: more)').matches,reducedData:matchMedia('(prefers-reduced-data: reduce)').matches,forcedColors:matchMedia('(forced-colors: active)').matches}));
action('vibration','Vibration test',async()=>({accepted:navigator.vibrate([120,70,120])}));
action('view-transition','View Transition API test',async()=>{if(!document.startViewTransition)throw new Error('View Transition unavailable.');const old=document.body.dataset.vt;const t=document.startViewTransition(()=>{document.body.dataset.vt=String(Date.now())});await t.finished;delete document.body.dataset.vt;if(old!==undefined)document.body.dataset.vt=old;return {finished:true};});
action('virtual-keyboard','Virtual Keyboard info',async()=>{if(!navigator.virtualKeyboard)throw new Error('VirtualKeyboard unavailable.');return {overlaysContent:navigator.virtualKeyboard.overlaysContent,boundingRect:navigator.virtualKeyboard.boundingRect?.toJSON?.()||null};});
action('visibility','Page Visibility state',async()=>({hidden:document.hidden,visibilityState:document.visibilityState,hasFocus:document.hasFocus()}));
action('wake-lock','Screen Wake Lock',async()=>{wakeLock=await navigator.wakeLock.request('screen');return {released:wakeLock.released,type:wakeLock.type,note:'Use Stop all local media to release.'};});
action('web-animations','Web Animations test',async()=>{const e=document.createElement('div');document.body.appendChild(e);const a=e.animate([{opacity:.2},{opacity:1}],{duration:120});await a.finished;e.remove();return {playState:a.playState,currentTime:a.currentTime};});
action('web-audio','Web Audio context',async()=>{const C=globalThis.AudioContext||globalThis.webkitAudioContext;if(!C)throw new Error('Web Audio unavailable.');const c=new C();await c.resume();const o={state:c.state,sampleRate:c.sampleRate,baseLatency:c.baseLatency,outputLatency:c.outputLatency};await c.close();return o;});
action('web-components','Custom Elements + Shadow DOM',async()=>{const tag=`x-super-api-${Date.now()}`;class X extends HTMLElement{connectedCallback(){this.attachShadow({mode:'open'}).textContent='ok';}}customElements.define(tag,X);const e=document.createElement(tag);document.body.appendChild(e);await Promise.resolve();const out={tag,shadowText:e.shadowRoot?.textContent};e.remove();return out;});
action('web-locks','Web Locks test',async()=>{if(!navigator.locks)throw new Error('Web Locks unavailable.');const name=`super-api-${Date.now()}`;const result=await navigator.locks.request(name,async lock=>({name:lock.name,mode:lock.mode}));return {lock:result,query:await navigator.locks.query?.()};});
action('web-storage','Web Storage round-trip',async()=>{const k=`super-api-${Date.now()}`;localStorage.setItem(k,'local');sessionStorage.setItem(k,'session');const out={local:localStorage.getItem(k),session:sessionStorage.getItem(k),localLength:localStorage.length,sessionLength:sessionStorage.length};localStorage.removeItem(k);sessionStorage.removeItem(k);return out;});
action('webauthn','WebAuthn capability check',async()=>{if(!globalThis.PublicKeyCredential)throw new Error('WebAuthn unavailable.');return {platformAuthenticator:await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable?.().catch(()=>null),conditionalMediation:await PublicKeyCredential.isConditionalMediationAvailable?.().catch(()=>null),signalAllAcceptedCredentials:typeof PublicKeyCredential.signalAllAcceptedCredentials==='function'};});
action('webcodecs','WebCodecs support query',async()=>{if(!globalThis.VideoDecoder)throw new Error('VideoDecoder unavailable.');const config={codec:'vp8',codedWidth:640,codedHeight:360};return {videoDecoder:await VideoDecoder.isConfigSupported(config).catch(e=>({error:e.message})),audioDecoder:!!globalThis.AudioDecoder,videoEncoder:!!globalThis.VideoEncoder,audioEncoder:!!globalThis.AudioEncoder};});
action('webgl','WebGL context info',async()=>{const c=document.createElement('canvas');const gl=c.getContext('webgl2')||c.getContext('webgl');if(!gl)throw new Error('WebGL unavailable.');return {version:gl.getParameter(gl.VERSION),shading:gl.getParameter(gl.SHADING_LANGUAGE_VERSION),vendor:gl.getParameter(gl.VENDOR),renderer:gl.getParameter(gl.RENDERER),extensions:gl.getSupportedExtensions()?.length};});
action('webgpu','WebGPU adapter',async()=>{if(!navigator.gpu)throw new Error('WebGPU unavailable.');const a=await navigator.gpu.requestAdapter();if(!a)throw new Error('No GPU adapter returned.');return {features:[...a.features],limits:{maxTextureDimension2D:a.limits.maxTextureDimension2D,maxBindGroups:a.limits.maxBindGroups},info:a.info?{vendor:a.info.vendor,architecture:a.info.architecture,device:a.info.device,description:a.info.description}:null};});
action('webotp-info','WebOTP surface info',async()=>({OTPCredential:!!globalThis.OTPCredential,credentialsGet:!!navigator.credentials?.get,note:'Receiving an OTP requires a supported platform and correctly formatted SMS; this test does not wait for an SMS.'}));
action('webrtc-info','WebRTC connection info',async()=>({RTCPeerConnection:!!globalThis.RTCPeerConnection,connectionState:pc?.connectionState||null,iceConnectionState:pc?.iceConnectionState||null,signalingState:pc?.signalingState||null,dataChannel:dc?.readyState||null,senders:pc?.getSenders().map(s=>s.track?.kind||null).filter(Boolean)||[]}));
action('websocket-info','WebSocket surface info',async()=>({WebSocket:!!globalThis.WebSocket,constants:globalThis.WebSocket?{CONNECTING:WebSocket.CONNECTING,OPEN:WebSocket.OPEN,CLOSING:WebSocket.CLOSING,CLOSED:WebSocket.CLOSED}:null,note:'A live WebSocket call needs a server endpoint.'}));
action('webtransport-info','WebTransport surface info',async()=>({WebTransport:!!globalThis.WebTransport,note:'A live WebTransport session needs an HTTP/3 WebTransport server endpoint.'}));
action('webvtt','WebVTT cue test',async()=>{if(!globalThis.VTTCue)throw new Error('VTTCue unavailable.');const c=new VTTCue(0,2,'Super API caption');return {start:c.startTime,end:c.endTime,text:c.text,align:c.align};});
action('webxr','WebXR session support query',async()=>{if(!navigator.xr)throw new Error('WebXR unavailable.');return {immersiveVR:await navigator.xr.isSessionSupported('immersive-vr').catch(()=>false),immersiveAR:await navigator.xr.isSessionSupported('immersive-ar').catch(()=>false),inline:await navigator.xr.isSessionSupported('inline').catch(()=>false)};});
action('window-controls-overlay','Window Controls Overlay info',async()=>{const w=navigator.windowControlsOverlay;if(!w)throw new Error('Window Controls Overlay unavailable.');const r=w.getTitlebarAreaRect?.();return {visible:w.visible,titlebarArea:r?.toJSON?.()||r||null};});
action('window-management','Window/screen details',async()=>{const fn=globalThis.getScreenDetails||window.getScreenDetails;if(!fn)throw new Error('Window Management API unavailable.');const x=await fn();return {current:{label:x.currentScreen?.label,width:x.currentScreen?.width,height:x.currentScreen?.height,isPrimary:x.currentScreen?.isPrimary},screens:[...x.screens].map(s=>({label:s.label,left:s.left,top:s.top,width:s.width,height:s.height,isPrimary:s.isPrimary,isInternal:s.isInternal}))};});
action('worker','Web Worker echo',async()=>{const u=URL.createObjectURL(new Blob([`onmessage=e=>postMessage({echo:e.data,time:Date.now()})`],{type:'text/javascript'}));const w=new Worker(u);try{return await timeout(new Promise((resolve,reject)=>{w.onmessage=e=>resolve(e.data);w.onerror=reject;w.postMessage('super-api');}),2000,'Worker');}finally{w.terminate();URL.revokeObjectURL(u);}});
action('xhr','XMLHttpRequest same-origin call',async()=>new Promise((resolve,reject)=>{const x=new XMLHttpRequest();x.open('GET',`./?xhr=${Date.now()}`);x.onload=()=>resolve({status:x.status,responseURL:x.responseURL,contentType:x.getResponseHeader('content-type')});x.onerror=()=>reject(new Error('XHR network error'));x.send();}));

async function ensureSW(){if(!('serviceWorker' in navigator))throw new Error('Service Worker unavailable.');return navigator.serviceWorker.register('./sw.js');}

async function runAction(id, remote=false) {
  const a=ACTIONS[id]; if(!a) throw new Error(`No runnable test for ${id}.`);
  log(`${remote?'Remote-approved':'Local'} action: ${a.label}`);
  const result=await a.fn();
  log(`${a.label} result:`,serializable(result));
  return result;
}

function detectAll(){return WEB_API_CATALOG.map(api=>{let supported=false;try{supported=!!api.test()}catch{}return{api,supported};});}

function populateActions(){
  const select=$('#remoteAction');select.innerHTML='';
  Object.values(ACTIONS).sort((a,b)=>a.label.localeCompare(b.label)).forEach(a=>{const o=document.createElement('option');o.value=a.id;o.textContent=`${SENSITIVE.has(a.id)?'APPROVAL':'AUTO'} • ${a.label}`;select.appendChild(o);});
}

function renderCatalog(){
  const q=$('#filter').value.trim().toLowerCase(),cat=$('#categoryFilter').value,sf=$('#supportFilter').value;
  const rows=detectAll();
  $('#apiTotal').textContent=rows.length;
  $('#apiSupported').textContent=rows.filter(r=>r.supported).length;
  $('#apiRunnable').textContent=rows.filter(r=>r.api.action&&ACTIONS[r.api.action]).length;
  const root=$('#catalog');root.innerHTML='';
  for(const {api,supported} of rows){
    const runnable=!!api.action&&!!ACTIONS[api.action];
    if(q&&!`${api.name} ${api.category} ${api.note}`.toLowerCase().includes(q))continue;
    if(cat&&api.category!==cat)continue;
    if(sf==='supported'&&!supported)continue;if(sf==='unsupported'&&supported)continue;if(sf==='runnable'&&!runnable)continue;
    const c=document.createElement('article');c.className='cap';
    const risk=runnable?actionPolicy(api.action):null;
    c.innerHTML=`<div class="category"></div><h3></h3><div class="meta"></div><div class="line"><span class="status ${supported?'ok':'bad'}">${supported?'● detected':'○ not detected'}</span><span class="policy ${risk||''}">${risk?risk.toUpperCase():(runnable?'RUNNABLE':'DETECT')}</span></div>`;
    c.querySelector('.category').textContent=api.category;c.querySelector('h3').textContent=api.name;c.querySelector('.meta').textContent=api.note||'Capability surface detection';
    if(runnable){const b=document.createElement('button');b.textContent='Test here';b.disabled=!supported;b.onclick=async()=>{try{await runAction(api.action,false)}catch(e){log(`${api.name} error:`,e.message)}};c.appendChild(b);}
    root.appendChild(c);
  }
}

function initFilters(){const cats=[...new Set(WEB_API_CATALOG.map(x=>x.category))].sort();for(const c of cats){const o=document.createElement('option');o.value=c;o.textContent=c;$('#categoryFilter').appendChild(o);}for(const id of ['filter','categoryFilter','supportFilter'])$('#'+id).addEventListener(id==='filter'?'input':'change',renderCatalog);$('#refreshCaps').onclick=renderCatalog;}

populateActions();initFilters();renderCatalog();

if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').then(r=>log('Service worker ready:',r.scope)).catch(e=>log('Service worker:',e.message));

addEventListener('beforeunload',()=>{for(const s of localStreams)for(const t of s.getTracks())try{t.stop()}catch{}});
})();