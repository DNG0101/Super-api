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

const engine=Core.createEngine({executeCapability:async req=>({result:Number(req.args.value)*2})});
(async()=>{
 const result=await engine.run(flow,{input:{}});assert.equal(result.vars.n,2);assert.equal(result.steps.b.result.result,4);assert.equal(result.steps.c.result.passed,true);assert.equal(result.vars.done,true);
 console.log('UCOS workflow data binding and capability step passed');
 const cycle={id:'cycle',steps:[{id:'a',type:'set',dependsOn:['b']},{id:'b',type:'set',dependsOn:['a']}]};assert.throws(()=>Core.order(cycle),/dependency-cycle/);
 const ctl=new AbortController();ctl.abort();await assert.rejects(()=>engine.run({id:'abort',steps:[{id:'x',type:'delay',ms:100}]},{signal:ctl.signal}));
 console.log('UCOS workflow cycle and cancellation passed');
 console.log(JSON.stringify({status:'UCOS_WORKFLOW_CORE_PASS',steps:Object.keys(result.steps).length},null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
