'use strict';
const assert=require('node:assert/strict');
const Core=require('../modules/ucos-runtime-core.js');

const v=Core.validateManifest({id:'demo.app',name:'Demo',version:'1.2.3',runtime:'sandbox',entry:'./demo.js',capabilities:['media.camera','media.camera'],lifecycle:{autoRestart:true}});
assert.equal(v.valid,true);assert.deepEqual(v.manifest.capabilities,['media.camera']);assert.equal(v.manifest.schemaVersion,2);assert.equal(v.manifest.lifecycle.autoRestart,true);
assert.equal(Core.validateManifest({id:'x',runtime:'sandbox'}).valid,false);assert.equal(Core.validateManifest({id:'bad.version',version:'x',runtime:'sandbox',entry:'./x.js'}).valid,false);
console.log('UCOS manifest validation passed');

const manifests=Core.createManifestRegistry();
manifests.register({id:'system.files',name:'Files',runtime:'system',system:true,capabilities:['storage.read']});
manifests.register({id:'third.demo',name:'Third',runtime:'sandbox',entry:'./third.js',capabilities:['media.camera']});
assert.equal(manifests.size(),2);
console.log('UCOS manifest registry passed');

const grants=Core.createGrantStore();
(async()=>{
 await grants.set('third.demo','media.camera',{state:'granted',scope:'once'});
 assert.equal((await grants.check('third.demo','media.camera')).state,'granted');
 const resources=Core.createResourceManager();let cleaned=0;const rid=resources.own('p1',{x:1},{type:'test',cleanup:()=>cleaned++});assert.equal(resources.list('p1')[0].id,rid);resources.touch('p1',rid,{active:true});assert.equal(resources.list('p1')[0].metadata.active,true);await resources.releaseOwner('p1');assert.equal(cleaned,1);assert.equal(resources.summary().total,0);
 console.log('UCOS resource ownership passed');

 const processes=Core.createProcessManager(resources);const p=processes.spawn('system.files',{state:'starting'});assert.equal(processes.get(p.pid).state,'starting');assert.equal(processes.suspend(p.pid,'test').state,'suspended');assert.equal(processes.resume(p.pid).state,'running');assert.equal(processes.crash(p.pid,'boom').state,'crashed');assert.equal(processes.resume(p.pid),null);assert.equal(processes.suspend(p.pid),null);processes.heartbeat(p.pid,{tick:1});assert.equal(processes.get(p.pid).metadata.tick,1);await processes.terminate(p.pid);assert.equal(processes.size(),0);assert.equal(processes.history().length,1);assert.equal(processes.resume(p.pid),null);
 console.log('UCOS process lifecycle transition guard and crash history passed');

 let calls=0,issued=0,finalized=0,audited=0,promptMeta=null;const broker=Core.createCapabilityBroker({manifests,grants,execute:async c=>{calls++;return c},prompt:async req=>{promptMeta=req.meta;return{state:'granted',scope:'once'}},authorize:async()=>{issued++;return{id:'lease-1'}},finalize:async()=>{finalized++},audit:()=>audited++});
 const r=await broker.request({appId:'third.demo',capabilityId:'media.camera',operation:'execute',args:{x:1},meta:{pid:'proc-1'}});assert.equal(r.capabilityId,'media.camera');assert.equal(r.meta.capabilityLeaseId,'lease-1');assert.equal(calls,1);assert.equal(issued,1);assert.equal(finalized,1);assert(audited>=1);assert.equal((await grants.check('third.demo','media.camera')).state,'prompt');
 assert.equal(promptMeta.pid,'proc-1');
 await assert.rejects(()=>broker.request({appId:'third.demo',capabilityId:'storage.read'}),/capability-not-declared/);
 const sys=await broker.request({appId:'system.files',capabilityId:'storage.read'});assert.equal(sys.capabilityId,'storage.read');
 console.log('UCOS per-app capability broker security hooks passed');
 console.log(JSON.stringify({status:'UCOS_RUNTIME_CORE_PASS',apps:manifests.size(),calls},null,2));
})().catch(e=>{console.error(e);process.exitCode=1});