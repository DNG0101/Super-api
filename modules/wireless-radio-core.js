(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  root.SuperApiWirelessCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const FAMILIES=[
    {id:'wifi',label:'Wi‑Fi',web:'NetworkInformation.type only',direct:false,raw:false,note:'Web pages cannot enumerate SSIDs/BSSIDs/channels/RSSI.'},
    {id:'cellular',label:'Cellular',web:'NetworkInformation.type/effectiveType only',direct:false,raw:false,note:'No IMSI/IMEI/operator/cell-tower/baseband access.'},
    {id:'bluetooth',label:'Bluetooth',web:'Web Bluetooth',direct:true,raw:false,note:'BLE peripherals only; device access is browser-mediated.'},
    {id:'ble',label:'Bluetooth LE advertisements',web:'BluetoothDevice.watchAdvertisements when supported',direct:true,raw:false,note:'Only browser-authorized devices; no unrestricted passive scan.'},
    {id:'nfc',label:'NFC',web:'Web NFC / NDEFReader',direct:true,raw:false,note:'NDEF read/write only; low-level NFC is not exposed.'},
    {id:'gps',label:'GNSS/GPS location',web:'Geolocation',direct:true,raw:false,note:'Location abstraction only; no raw satellite/SNR/pseudorange data.'},
    {id:'webrtc',label:'WebRTC ICE network path',web:'RTCPeerConnection / getStats',direct:true,raw:false,note:'Candidate/path diagnostics; browser may mask local IPs with mDNS.'},
    {id:'cast',label:'Cast / remote display',web:'Presentation / Remote Playback',direct:true,raw:false,note:'Browser selects supported remote display technology.'},
    {id:'airplay',label:'AirPlay-like remote playback',web:'Remote Playback where browser supports it',direct:true,raw:false,note:'No universal raw AirPlay protocol API.'},
    {id:'miracast',label:'Miracast / wireless display',web:'Presentation API when browser/platform supports it',direct:true,raw:false,note:'No direct Miracast radio/control API.'},
    {id:'dlna',label:'DLNA / network media',web:'Presentation/Remote Playback or HTTP app protocols',direct:true,raw:false,note:'No generic low-level DLNA discovery API.'},
    {id:'websocket',label:'WebSocket transport',web:'WebSocket',direct:true,raw:false,note:'Application network transport, not raw radio access.'},
    {id:'webtransport',label:'WebTransport / HTTP3',web:'WebTransport',direct:true,raw:false,note:'Application network transport over QUIC/HTTP3.'},
    {id:'uwb',label:'Ultra‑Wideband',web:'No general Web API',direct:false,raw:false,note:'No generic browser UWB ranging/control surface.'},
    {id:'zigbee',label:'Zigbee',web:'No direct Web API',direct:false,raw:false,note:'Possible only through an authorized USB/Serial/HID bridge.'},
    {id:'thread',label:'Thread / Matter radio',web:'No direct Thread radio API',direct:false,raw:false,note:'Matter may be implemented by native platforms; web has no raw Thread radio access.'},
    {id:'lora',label:'LoRa / LoRaWAN',web:'No direct Web API',direct:false,raw:false,note:'Requires gateway/service or authorized external hardware bridge.'},
    {id:'rf433',label:'315/433/868/915 MHz generic RF',web:'No direct Web API',direct:false,raw:false,note:'Requires SDR/transceiver hardware through an authorized bridge.'},
    {id:'fm',label:'FM radio',web:'No general Web API',direct:false,raw:false,note:'Browser cannot tune arbitrary FM receivers.'},
    {id:'am',label:'AM radio',web:'No general Web API',direct:false,raw:false,note:'Browser cannot tune arbitrary AM receivers.'},
    {id:'sdr',label:'Software-defined radio / raw RF spectrum',web:'No direct Web API',direct:false,raw:false,note:'Requires external SDR hardware and a user-authorized USB/Serial/HID path.'},
    {id:'satellite',label:'Satellite connectivity',web:'Network/Geolocation abstraction only',direct:false,raw:false,note:'No modem/satellite signal-strength or beam-control Web API.'},
    {id:'wifi-direct',label:'Wi‑Fi Direct / Nearby Share',web:'No generic Web API',direct:false,raw:false,note:'No generic browser API for Wi‑Fi Direct peer discovery or Nearby Share.'}
  ];
  function family(id){return FAMILIES.find(x=>x.id===id)||null;}
  function networkSnapshot(c){if(!c)return{supported:false};const keys=['type','effectiveType','downlink','downlinkMax','rtt','saveData'];const out={supported:true};for(const k of keys){try{if(k in c)out[k]=c[k]}catch{}}return out;}
  function parseIceCandidate(input){const raw=String(input||'').replace(/^a=/,'').trim();if(!raw.startsWith('candidate:'))return{valid:false,raw};const p=raw.split(/\s+/),typ=p.indexOf('typ'),tcptype=p.indexOf('tcptype'),raddr=p.indexOf('raddr'),rport=p.indexOf('rport');return{valid:p.length>=8,foundation:(p[0]||'').slice(10),component:p[1]||null,protocol:(p[2]||'').toLowerCase()||null,priority:Number(p[3])||0,address:p[4]||null,port:Number(p[5])||0,type:typ>=0?p[typ+1]||null:null,tcpType:tcptype>=0?p[tcptype+1]||null:null,relatedAddress:raddr>=0?p[raddr+1]||null:null,relatedPort:rport>=0?Number(p[rport+1])||0:null};}
  function redactIce(c){if(!c||typeof c!=='object')return c;const x={...c};if(x.address)x.address='[redacted]';if(x.relatedAddress)x.relatedAddress='[redacted]';delete x.raw;return x;}
  function capabilityMatrix(env={}){const has=k=>!!env[k];return{bluetooth:has('bluetooth'),nfc:has('nfc'),networkInformation:has('networkInformation'),webrtc:has('webrtc'),presentation:has('presentation'),remotePlayback:has('remotePlayback'),webSocket:has('webSocket'),webTransport:has('webTransport'),geolocation:has('geolocation'),usbBridge:has('usb'),hidBridge:has('hid'),serialBridge:has('serial')};}
  function combinations(families=FAMILIES,ops=['detect','inspect','connect']){const out=[];for(const f of families)for(const op of ops)out.push({family:f.id,op,direct:f.direct,raw:f.raw});return out;}
  return Object.freeze({FAMILIES,family,networkSnapshot,parseIceCandidate,redactIce,capabilityMatrix,combinations});
});
