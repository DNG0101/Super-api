'use strict';
const assert=require('node:assert/strict');
const Core=require('../modules/ucos-runtime-core.js');

const v=Core.validateManifest({id:'demo.app',name:'Demo',runtime:'sandbox',entry:'./demo.js',capabilities:['media.camera','media.camera']});
assert.equal(v.valid,true);assert.deepEqual(v.manifest.capabilities,['media.camera']);
assert.equal(Core.validateManifest({id:'x',runtime:'sandbox'}).valid,false);
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
 const resources=Core.createResourceManager();let cleaned=0;const rid=resources.own('p1',{x:1},{type:'test',cleanup:()=>cleaned++});assert.equal(resources.list('p1')[0].id,rid);await resources.releaseOwner('p1');assert.equal(cleaned,1);assert.equal(resources.summary().total,0);
 console.log('UCOS resource ownership passed');

 const processes=Core.createProcessManager(resources);const p=processes.spawn('system.files');assert.equal(processes.get(p.pid).state,'running');await processes.terminate(p.pid);assert.equal(processes.size(),0);
 console.log('UCOS process lifecycle passed');

 let calls=0;const broker=Core.createCapabilityBroker({manifests,grants,execute:async c=>{calls++;return c},prompt:async()=>({state:'granted',scope:'once'})});
 const r=await broker.request({appId:'third.demo',capabilityId:'media.camera',operation:'execute',args:{x:1}});assert.equal(r.capabilityId,'media.camera');assert.equal(calls,1);assert.equal((await grants.check('third.demo','media.camera')).state,'prompt');
 await assert.rejects(()=>broker.request({appId:'third.demo',capabilityId:'storage.read'}),/capability-not-declared/);
 const sys=await broker.request({appId:'system.files',capabilityId:'storage.read'});assert.equal(sys.capabilityId,'storage.read');
 console.log('UCOS per-app capability broker passed');
 console.log(JSON.stringify({status:'UCOS_RUNTIME_CORE_PASS',apps:manifests.size(),calls},null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
