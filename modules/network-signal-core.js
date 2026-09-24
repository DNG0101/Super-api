(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  if(root) root.SuperApiNetworkCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const n=v=>Number.isFinite(Number(v))?Number(v):null;
  const round=(v,d=2)=>v==null?null:Number(Number(v).toFixed(d));

  function classifyAddress(address=''){
    const a=String(address||'').trim().toLowerCase().replace(/^\[|\]$/g,'');
    if(!a)return 'unknown';
    if(a==='localhost'||a.endsWith('.localhost'))return 'loopback';
    if(a.endsWith('.local'))return 'local-name';
    if(a==='::1'||a==='0:0:0:0:0:0:0:1')return 'loopback';
    if(a.startsWith('fe8')||a.startsWith('fe9')||a.startsWith('fea')||a.startsWith('feb'))return 'link-local';
    if(a.startsWith('fc')||a.startsWith('fd'))return 'private';
    const m=a.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if(m){
      const [x,y,z,w]=m.slice(1).map(Number); if([x,y,z,w].some(v=>v>255))return 'invalid';
      if(x===127)return 'loopback';
      if(x===10||(x===172&&y>=16&&y<=31)||(x===192&&y===168))return 'private';
      if(x===169&&y===254)return 'link-local';
      if(x===100&&y>=64&&y<=127)return 'carrier-grade-nat';
      if(x===0)return 'this-network';
      if(x>=224&&x<=239)return 'multicast';
      if(x>=240)return 'reserved';
      return 'public';
    }
    if(a.includes(':'))return 'public-or-global-ipv6';
    return 'hostname';
  }

  function redactAddress(address=''){
    const kind=classifyAddress(address);
    if(kind==='hostname'||kind==='local-name')return {kind,value:'[hostname redacted]'};
    if(String(address).includes(':'))return {kind,value:'[IPv6 redacted]'};
    const m=String(address).match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    return {kind,value:m?`${m[1]}.${m[2]}.x.x`:'[redacted]'};
  }

  function connectionSnapshot(c){
    if(!c)return {supported:false};
    const keys=['type','effectiveType','downlink','downlinkMax','rtt','saveData'];
    const out={supported:true};
    for(const k of keys)if(k in c)out[k]=c[k];
    return out;
  }

  function timingMetrics(e={}){
    const diff=(end,start)=>{const a=n(e[end]),b=n(e[start]);return a!=null&&b!=null&&a>=b?round(a-b):null};
    const tlsStart=n(e.secureConnectionStart), connectEnd=n(e.connectEnd);
    return {
      name:e.name||null,entryType:e.entryType||null,initiatorType:e.initiatorType||null,
      nextHopProtocol:e.nextHopProtocol||null,deliveryType:e.deliveryType||null,responseStatus:n(e.responseStatus),
      dnsMs:diff('domainLookupEnd','domainLookupStart'),tcpMs:diff('connectEnd','connectStart'),
      tlsMs:tlsStart&&connectEnd!=null&&connectEnd>=tlsStart?round(connectEnd-tlsStart):null,
      requestMs:diff('responseStart','requestStart'),ttfbMs:diff('responseStart','startTime'),
      downloadMs:diff('responseEnd','responseStart'),totalMs:diff('responseEnd','startTime'),
      workerMs:diff('fetchStart','workerStart'),transferSize:n(e.transferSize),encodedBodySize:n(e.encodedBodySize),decodedBodySize:n(e.decodedBodySize),
      cacheLikely:n(e.transferSize)===0&&n(e.decodedBodySize)>0
    };
  }

  function resourceSummary(entries=[]){
    const rows=entries.map(timingMetrics), protocols={}, initiators={};
    let transfer=0,encoded=0,decoded=0,cacheHits=0;
    const vals={dns:[],tcp:[],tls:[],ttfb:[],total:[]};
    for(const r of rows){
      if(r.nextHopProtocol)protocols[r.nextHopProtocol]=(protocols[r.nextHopProtocol]||0)+1;
      if(r.initiatorType)initiators[r.initiatorType]=(initiators[r.initiatorType]||0)+1;
      transfer+=r.transferSize||0;encoded+=r.encodedBodySize||0;decoded+=r.decodedBodySize||0;if(r.cacheLikely)cacheHits++;
      for(const [k,p] of [['dns','dnsMs'],['tcp','tcpMs'],['tls','tlsMs'],['ttfb','ttfbMs'],['total','totalMs']])if(r[p]!=null)vals[k].push(r[p]);
    }
    const avg=a=>a.length?round(a.reduce((x,y)=>x+y,0)/a.length):null;
    return {count:rows.length,protocols,initiators,bytes:{transfer,encoded,decoded},cacheHits,averagesMs:{dns:avg(vals.dns),tcp:avg(vals.tcp),tls:avg(vals.tls),ttfb:avg(vals.ttfb),total:avg(vals.total)},rows};
  }

  function candidateSummary(s={}){
    return {
      id:s.id||null,type:s.type||null,candidateType:s.candidateType||null,protocol:s.protocol||null,relayProtocol:s.relayProtocol||null,tcpType:s.tcpType||null,
      port:n(s.port),priority:n(s.priority),url:s.url?'[ICE server URL present]':null,address:redactAddress(s.address||s.ip||'')
    };
  }

  function summarizeRtcStats(input=[]){
    const rows=input instanceof Map?[...input.values()]:Array.isArray(input)?input:typeof input?.forEach==='function'?(()=>{const a=[];input.forEach(x=>a.push(x));return a})():[];
    const byId=new Map(rows.map(x=>[x.id,x]));
    const pairRows=rows.filter(x=>x.type==='candidate-pair');
    const selected=pairRows.find(x=>x.selected)||pairRows.find(x=>x.nominated&&x.state==='succeeded')||pairRows.find(x=>x.state==='succeeded')||null;
    const local=selected?byId.get(selected.localCandidateId):null, remote=selected?byId.get(selected.remoteCandidateId):null;
    const inbound=rows.filter(x=>x.type==='inbound-rtp'), outbound=rows.filter(x=>x.type==='outbound-rtp'), remoteInbound=rows.filter(x=>x.type==='remote-inbound-rtp');
    const sum=(arr,key)=>arr.reduce((a,x)=>a+(n(x[key])||0),0);
    const jitterVals=inbound.map(x=>n(x.jitter)).filter(x=>x!=null).map(x=>x*1000);
    const loss=sum(inbound,'packetsLost'), received=sum(inbound,'packetsReceived'), sent=sum(outbound,'packetsSent');
    const lossPct=(loss+received)>0?round(loss/(loss+received)*100):null;
    const remoteLoss=sum(remoteInbound,'packetsLost'), remoteReceived=sum(remoteInbound,'packetsReceived');
    return {
      reports:rows.length,connection:{state:selected?.state||null,nominated:Boolean(selected?.nominated),rttMs:n(selected?.currentRoundTripTime)!=null?round(n(selected.currentRoundTripTime)*1000):null,
        availableOutgoingBitrate:n(selected?.availableOutgoingBitrate),availableIncomingBitrate:n(selected?.availableIncomingBitrate),bytesSent:n(selected?.bytesSent),bytesReceived:n(selected?.bytesReceived),requestsSent:n(selected?.requestsSent),responsesReceived:n(selected?.responsesReceived)},
      localCandidate:local?candidateSummary(local):null,remoteCandidate:remote?candidateSummary(remote):null,
      media:{inboundStreams:inbound.length,outboundStreams:outbound.length,bytesReceived:sum(inbound,'bytesReceived'),bytesSent:sum(outbound,'bytesSent'),packetsReceived:received,packetsSent:sent,packetsLost:loss,packetLossPct:lossPct,
        jitterMs:jitterVals.length?round(jitterVals.reduce((a,b)=>a+b,0)/jitterVals.length):null,remotePacketLossPct:(remoteLoss+remoteReceived)>0?round(remoteLoss/(remoteLoss+remoteReceived)*100):null},
      dataChannels:rows.filter(x=>x.type==='data-channel').map(x=>({label:x.label||null,state:x.state||null,messagesSent:n(x.messagesSent),messagesReceived:n(x.messagesReceived),bytesSent:n(x.bytesSent),bytesReceived:n(x.bytesReceived)})),
      transports:rows.filter(x=>x.type==='transport').map(x=>({dtlsState:x.dtlsState||null,iceRole:x.iceRole||null,bytesSent:n(x.bytesSent),bytesReceived:n(x.bytesReceived),selectedCandidatePairId:x.selectedCandidatePairId||null}))
    };
  }

  function deriveQuality({rttMs,downlinkMbps,lossPct,jitterMs}={}){
    const metrics={rttMs:n(rttMs),downlinkMbps:n(downlinkMbps),lossPct:n(lossPct),jitterMs:n(jitterMs)};
    const known=Object.values(metrics).filter(v=>v!=null);if(!known.length)return {grade:'unknown',score:null,metrics};
    let score=100;
    if(metrics.rttMs!=null)score-=metrics.rttMs<=50?0:metrics.rttMs<=100?8:metrics.rttMs<=200?18:metrics.rttMs<=400?35:55;
    if(metrics.downlinkMbps!=null)score-=metrics.downlinkMbps>=25?0:metrics.downlinkMbps>=10?5:metrics.downlinkMbps>=3?15:metrics.downlinkMbps>=1?30:50;
    if(metrics.lossPct!=null)score-=metrics.lossPct<=0.5?0:metrics.lossPct<=1?8:metrics.lossPct<=3?20:metrics.lossPct<=8?40:60;
    if(metrics.jitterMs!=null)score-=metrics.jitterMs<=10?0:metrics.jitterMs<=20?5:metrics.jitterMs<=40?15:metrics.jitterMs<=80?30:50;
    score=Math.max(0,Math.min(100,score));
    const grade=score>=90?'excellent':score>=75?'good':score>=55?'fair':score>=35?'poor':'very-poor';
    return {grade,score,metrics};
  }

  function deltaRate(prev={},curr={},seconds){
    const s=n(seconds);if(!s||s<=0)return null;const d=(key)=>Math.max(0,(n(curr[key])||0)-(n(prev[key])||0));
    return {seconds:s,sendBps:round(d('bytesSent')*8/s),receiveBps:round(d('bytesReceived')*8/s),sentPacketsPerSec:round(d('packetsSent')/s),receivedPacketsPerSec:round(d('packetsReceived')/s)};
  }

  const NETWORK_SURFACES=[
    'navigator.onLine','online/offline events','navigator.connection / NetworkInformation','WorkerNavigator.connection','fetch/Request/Response/Headers','XMLHttpRequest','navigator.sendBeacon',
    'WebSocket','EventSource/SSE','WebTransport','WebRTC RTCPeerConnection','RTCDataChannel','RTCIceTransport','RTCDtlsTransport','RTCSctpTransport','RTCStatsReport','RTCIceCandidate/Stats','RTCIceCandidatePairStats',
    'PerformanceNavigationTiming','PerformanceResourceTiming','PerformanceObserver','Server-Timing','Resource Timing buffer controls','AbortController/AbortSignal','ServiceWorker fetch','Background Fetch','Background Sync','Periodic Sync','Push',
    'Local Network Access permission/query','Fetch targetAddressSpace','WebSocket targetAddressSpace','WebTransport local-network restrictions','Network Error Logging/Reporting surface','DNS/TCP/TLS timing (Resource Timing when exposed)'
  ];

  return {classifyAddress,redactAddress,connectionSnapshot,timingMetrics,resourceSummary,candidateSummary,summarizeRtcStats,deriveQuality,deltaRate,NETWORK_SURFACES};
});
