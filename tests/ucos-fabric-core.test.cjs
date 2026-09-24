'use strict';
const assert=require('node:assert/strict');
const Core=require('../modules/ucos-fabric-core.js');

const caps=Core.createCapabilityRegistry();
caps.register({id:'media.camera',domain:'media',operations:['detect','stream'],source:'fixed',status:'unknown'});
caps.register({id:'media.camera',domain:'media',operations:['execute','stream'],source:'runtime',status:'implemented',tags:['hardware']});
assert.equal(caps.size(),1);
const camera=caps.get('media.camera');
assert.deepEqual(camera.operations.sort(),['detect','execute','stream']);
assert.equal(camera.status,'implemented');
assert(camera.source.includes('fixed')&&camera.source.includes('runtime'));
console.log('UCOS merged capability registry passed');

const providers=Core.createProviderRegistry();
providers.register({id:'slow',priority:100,domains:['media'],execute:async()=>1});
providers.register({id:'fast',priority:10,capabilities:['media.camera'],execute:async()=>2});
assert.deepEqual(providers.resolve(camera,'execute').map(x=>x.id),['fast','slow']);
console.log('UCOS provider resolution passed');

const transports=Core.createTransportRegistry();
transports.register({id:'offline',priority:1,available:()=>false,request:async()=>null});
transports.register({id:'webrtc',priority:10,available:()=>true,request:async()=>null});
assert.deepEqual(transports.resolve({remote:true}).map(x=>x.id),['webrtc']);
console.log('UCOS transport availability passed');

const nodes=Core.createNodeRegistry({id:'local',label:'Laptop',local:true,capabilities:['media.camera']});
nodes.upsert({id:'phone',label:'Phone',online:true,transportId:'webrtc',capabilities:['media.camera','device.geolocation']});
let routes=Core.routeCandidates({capability:camera,nodes:nodes.list(),preferLocal:true});
assert.deepEqual(routes.map(x=>x.node.id),['local','phone']);
routes=Core.routeCandidates({capability:camera,nodes:nodes.list(),preferLocal:false,targetNodeId:'phone'});
assert.deepEqual(routes.map(x=>x.node.id),['phone']);
console.log('UCOS local and remote routing passed');

const ad=Core.advertisement(nodes.get('local'),caps.export());
assert.equal(ad.type,'ucos:advertise');
assert.equal(ad.version,2);
assert.equal(ad.capabilities.length,1);
assert.equal(ad.node.capabilities[0],'media.camera');
console.log('UCOS capability advertisement passed');

const valid=Core.validateRequest({capabilityId:'media.camera',operation:'execute',args:{x:1},mode:'auto'});
assert(valid.valid&&valid.request.id.startsWith('req-'));
const invalid=Core.validateRequest({operation:'execute'});
assert(!invalid.valid&&invalid.errors.includes('capabilityId-required'));
console.log('UCOS request validation passed');

const circular={name:'x'};circular.self=circular;
const env=Core.executionEnvelope({requestId:'r1',capabilityId:'media.camera',operation:'execute',status:'available',result:{big:2n,circular}});
assert.equal(env.ok,true);
assert.equal(env.result.big,'2');
assert.equal(env.result.circular.self,'[Circular]');
console.log('UCOS result envelope serialization passed');

for(let i=0;i<200;i++)assert(Core.id('burst').startsWith('burst-'));
console.log('UCOS burst IDs passed');

console.log(JSON.stringify({status:'UCOS_FABRIC_CORE_PASS',capabilities:caps.summary(),providers:providers.size(),transports:transports.size(),nodes:nodes.size()},null,2));
