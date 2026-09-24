'use strict';
const assert=require('node:assert/strict');
const C=require('../modules/network-signal-core.js');
let tests=0;const t=(name,fn)=>{fn();tests++;console.log('ok -',name)};

t('address classification matrix',()=>{
 const cases={
  '127.0.0.1':'loopback','10.2.3.4':'private','172.16.1.1':'private','172.31.9.9':'private','192.168.1.5':'private','169.254.1.1':'link-local','100.64.0.1':'carrier-grade-nat','8.8.8.8':'public','::1':'loopback','fe80::1':'link-local','fd00::1':'private','example.com':'hostname','router.local':'local-name'
 };
 for(const [x,y] of Object.entries(cases))assert.equal(C.classifyAddress(x),y,x);
});

t('connection snapshot',()=>{assert.deepEqual(C.connectionSnapshot({effectiveType:'4g',downlink:12.5,rtt:50,saveData:false}),{supported:true,effectiveType:'4g',downlink:12.5,rtt:50,saveData:false});assert.deepEqual(C.connectionSnapshot(null),{supported:false})});

t('resource timing calculations',()=>{const x=C.timingMetrics({name:'x',entryType:'resource',startTime:1,domainLookupStart:2,domainLookupEnd:7,connectStart:7,secureConnectionStart:9,connectEnd:17,requestStart:18,responseStart:30,responseEnd:50,transferSize:100,encodedBodySize:80,decodedBodySize:120,nextHopProtocol:'h3'});assert.equal(x.dnsMs,5);assert.equal(x.tcpMs,10);assert.equal(x.tlsMs,8);assert.equal(x.requestMs,12);assert.equal(x.ttfbMs,29);assert.equal(x.downloadMs,20);assert.equal(x.nextHopProtocol,'h3')});

t('resource summary protocols/cache',()=>{const x=C.resourceSummary([{entryType:'resource',name:'a',startTime:0,responseEnd:10,transferSize:0,decodedBodySize:20,nextHopProtocol:'h2',initiatorType:'fetch'},{entryType:'resource',name:'b',startTime:0,responseEnd:20,transferSize:50,decodedBodySize:40,nextHopProtocol:'h3',initiatorType:'script'}]);assert.equal(x.count,2);assert.equal(x.cacheHits,1);assert.equal(x.protocols.h2,1);assert.equal(x.protocols.h3,1);assert.equal(x.bytes.transfer,50)});

t('rtc candidate pair/media summary',()=>{const rows=[
{id:'l',type:'local-candidate',candidateType:'srflx',protocol:'udp',address:'192.168.1.2',port:5000},
{id:'r',type:'remote-candidate',candidateType:'relay',protocol:'udp',address:'203.0.113.9',port:6000},
{id:'p',type:'candidate-pair',state:'succeeded',nominated:true,localCandidateId:'l',remoteCandidateId:'r',currentRoundTripTime:.045,availableOutgoingBitrate:1500000,bytesSent:1000,bytesReceived:2000},
{id:'i',type:'inbound-rtp',bytesReceived:10000,packetsReceived:100,packetsLost:2,jitter:.012},
{id:'o',type:'outbound-rtp',bytesSent:20000,packetsSent:120},
{id:'d',type:'data-channel',label:'x',state:'open',messagesSent:3,messagesReceived:4,bytesSent:100,bytesReceived:200}
];const x=C.summarizeRtcStats(rows);assert.equal(x.connection.rttMs,45);assert.equal(x.media.packetLossPct,1.96);assert.equal(x.media.jitterMs,12);assert.equal(x.localCandidate.address.kind,'private');assert.equal(x.localCandidate.address.value,'192.168.x.x');assert.equal(x.dataChannels[0].state,'open')});

t('quality matrix',()=>{assert.equal(C.deriveQuality({rttMs:30,downlinkMbps:50,lossPct:.1,jitterMs:5}).grade,'excellent');assert.equal(C.deriveQuality({rttMs:500,downlinkMbps:.5,lossPct:10,jitterMs:100}).grade,'very-poor');assert.equal(C.deriveQuality({}).grade,'unknown')});

t('delta rates',()=>{const x=C.deltaRate({bytesSent:100,bytesReceived:200,packetsSent:10,packetsReceived:20},{bytesSent:1100,bytesReceived:2200,packetsSent:30,packetsReceived:50},2);assert.equal(x.sendBps,4000);assert.equal(x.receiveBps,8000);assert.equal(x.sentPacketsPerSec,10);assert.equal(x.receivedPacketsPerSec,15)});

t('network surface registry breadth',()=>{for(const k of ['WebTransport','RTCStatsReport','PerformanceResourceTiming','Local Network Access permission/query'])assert.ok(C.NETWORK_SURFACES.some(x=>x.includes(k)),k)});

console.log(`PASS ${tests} network/signal groups`);
