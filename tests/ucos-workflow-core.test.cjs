'use strict';
const assert=require('node:assert/strict');
const Core=require('../modules/ucos-workflow-core.js');

const flow={id:'demo',steps:[
 {id:'a',type:'set',key:'n',value:2},
 {id:'b',type:'capability',dependsOn:['a'],request:{capabilityId:'math.double',args:{value:'${vars.n}'}}},
 {id:'c',type:'condition',dependsOn:['b'],left:'${steps.b.result.result}',operator:'eq',right:4,stopOnFalse:true},
 {id:'d',type:'set',dependsOn:['c'],key:'done',value:true}
]};
assert.equal(Core.validate(flow).valid,true);
assert.deepEqual(Core.order(flow).map(x=>x.id),['a','b','c','d']);
console.log('UCOS workflow validation and ordering passed');

let calls=0,emitted=[];
const engine=Core.createEngine({executeCapability:async req=>{calls++;if(req.capabilityId==='flaky'&&calls===1)throw new Error('transient');return{result:Number(req.args?.value??1)*2}},emit:async(event,detail)=>emitted.push({event,detail}),sleep:async()=>{}});
(async()=>{
 const result=await engine.run(flow,{input:{}});assert.equal(result.vars.n,2);assert.equal(result.steps.b.result.result,4);assert.equal(result.steps.c.result.passed,true);assert.equal(result.vars.done,true);
 console.log('UCOS workflow data binding and capability step passed');
 const cycle={id:'cycle',steps:[{id:'a',type:'set',dependsOn:['b']},{id:'b',type:'set',dependsOn:['a']}]};assert.throws(()=>Core.order(cycle),/dependency-cycle/);
 const ctl=new AbortController();ctl.abort();await assert.rejects(()=>engine.run({id:'abort',steps:[{id:'x',type:'delay',ms:100}]},{signal:ctl.signal}));
 console.log('UCOS workflow cycle and cancellation passed');
 calls=0;const advanced={id:'advanced',steps:[
  {id:'retry',type:'capability',retry:1,retryDelayMs:1,request:{capabilityId:'flaky',args:{value:3}}},
  {id:'loop',type:'loop',dependsOn:['retry'],items:[1,2,3],body:[{id:'copy',type:'set',key:'last',value:'${loop.item}'}]},
  {id:'event',type:'emit',dependsOn:['loop'],event:'demo.done',detail:{last:'${vars.last}'}},
  {id:'skip',type:'set',dependsOn:['event'],when:false,key:'never',value:true}
 ]};
 const adv=await engine.run(advanced);assert.equal(calls,2);assert.equal(adv.vars.last,3);assert.equal(adv.steps.loop.result.iterations,3);assert.equal(emitted[0].event,'demo.done');assert.equal(emitted[0].detail.last,3);assert.equal(adv.steps.skip.status,'skipped');
 assert.equal(Core.validate({id:'bad',steps:[{id:'x',type:'loop',items:[]}]}).valid,false);
 assert.equal(Core.validate({id:'bad-limit',steps:[{id:'x',type:'loop',items:[1],maxIterations:0,body:[{id:'y',type:'set',value:1}]}]}).valid,false);
 assert.equal(Core.validate({id:'bad-big-limit',steps:[{id:'x',type:'loop',items:[1],maxIterations:Core.MAX_LOOP_ITERATIONS+1,body:[{id:'y',type:'set',value:1}]}]}).valid,false);
 let nested={id:'leaf',type:'set',value:1};for(let i=0;i<=Core.MAX_LOOP_DEPTH;i++)nested={id:`l${i}`,type:'loop',items:[1],body:[nested]};assert.equal(Core.validate({id:'deep',steps:[nested]}).valid,false);
 console.log('UCOS workflow retry loop emit and conditional-step matrix passed');
 const nestedOrder={id:'nested-order',steps:[{id:'loop',type:'loop',items:[1],body:[{id:'second',type:'set',dependsOn:['first'],key:'ordered',value:'yes'},{id:'first',type:'set',key:'first',value:true}]}]};assert.equal(Core.validate(nestedOrder).valid,true);const nestedRun=await engine.run(nestedOrder);assert.equal(nestedRun.vars.first,true);assert.equal(nestedRun.vars.ordered,'yes');assert.deepEqual(Object.keys(nestedRun.steps.loop.result.results[0]),['first','second']);
 const missingNested={id:'nested-missing',steps:[{id:'loop',type:'loop',items:[1],body:[{id:'a',type:'set',dependsOn:['missing'],value:1}]}]};assert.equal(Core.validate(missingNested).valid,false);assert(Core.validate(missingNested).errors.some(x=>x.includes('missing-dependency:loop.a:missing')));
 const cycleNested={id:'nested-cycle',steps:[{id:'loop',type:'loop',items:[1],body:[{id:'a',type:'set',dependsOn:['b'],value:1},{id:'b',type:'set',dependsOn:['a'],value:2}]}]};assert.equal(Core.validate(cycleNested).valid,false);assert(Core.validate(cycleNested).errors.some(x=>x.includes('dependency-cycle:loop.')));
 console.log('UCOS nested workflow dependency ordering passed');
 let abortCalls=0;const blocking=Core.createEngine({executeCapability:()=>{abortCalls++;return new Promise(()=>{})}}),abortCtl=new AbortController();const blocked=blocking.run({id:'blocked',steps:[{id:'cap',type:'capability',retry:5,request:{capabilityId:'slow'}}]},{signal:abortCtl.signal});setTimeout(()=>abortCtl.abort(new DOMException('stop','AbortError')),10);await assert.rejects(()=>blocked,e=>e?.name==='AbortError');assert.equal(abortCalls,1);
 console.log('UCOS workflow prompt abort without retry passed');
 console.log(JSON.stringify({status:'UCOS_WORKFLOW_CORE_PASS',steps:Object.keys(result.steps).length,advancedSteps:Object.keys(adv.steps).length},null,2));
})().catch(e=>{console.error(e);process.exitCode=1});