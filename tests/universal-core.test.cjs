'use strict';
const assert=require('node:assert/strict');
const C=require('../modules/universal-core.js');
let tests=0; const t=(name,fn)=>{fn();tests++;console.log('ok -',name)};

t('public URL policy',()=>{
  for(const u of ['https://api.example.com/v1','https://8.8.8.8/test']) assert.equal(C.isPublicUrl(u),true);
  for(const u of ['http://api.example.com','https://localhost/x','https://127.0.0.1/x','https://10.0.0.1/x','https://172.16.0.1/x','https://192.168.1.1/x','https://169.254.1.1/x','https://100.64.0.1/x']) assert.equal(C.isPublicUrl(u),false,u);
});

t('URL path/query combinations',()=>{
  const u=C.buildUrl({base:'https://api.example.com/',path:'/users/{id}',pathParams:{id:'a b'},query:{q:'x y',tag:['a','b'],empty:''}});
  assert.equal(u,'https://api.example.com/users/a%20b?q=x+y&tag=a&tag=b');
});

t('OpenAPI v3 parsing',()=>{
  const x=C.parseOpenApi({openapi:'3.1.0',info:{title:'T',version:'1'},servers:[{url:'https://api.example.com'}],paths:{'/pets/{id}':{parameters:[{in:'path',name:'id'}],get:{operationId:'getPet',responses:{200:{}}},post:{requestBody:{content:{'application/json':{}}},responses:{201:{}}}}}});
  assert.equal(x.base,'https://api.example.com'); assert.equal(x.operations.length,2); assert.equal(x.operations[0].id,'getPet');
});

t('Swagger v2 parsing',()=>{
  const x=C.parseOpenApi({swagger:'2.0',host:'api.example.com',schemes:['https'],basePath:'/v1',paths:{'/x':{get:{responses:{200:{}}}}}});
  assert.equal(x.base,'https://api.example.com/v1'); assert.equal(x.operations.length,1);
});

t('Postman nested collection parsing',()=>{
  const x=C.parsePostman({info:{name:'P'},variable:[{key:'base',value:'https://api.example.com'}],item:[{name:'Folder',item:[{name:'One',request:{method:'POST',url:'{{base}}/x',header:[{key:'X-A',value:'1'}],body:{mode:'raw',raw:'{}'}}}]}]});
  assert.equal(x.operations[0].url,'https://api.example.com/x');assert.deepEqual(x.operations[0].folder,['Folder']);
});

t('HAR parsing',()=>{const x=C.parseHar({log:{entries:[{request:{method:'GET',url:'https://example.com',headers:[{name:'A',value:'b'}],queryString:[{name:'q',value:'1'}]}}]}});assert.equal(x.operations[0].query.q,'1')});

t('AsyncAPI parsing',()=>{const x=C.parseAsyncApi({asyncapi:'2.6.0',info:{title:'A'},servers:{s:{url:'wss://example.com',protocol:'ws'}},channels:{foo:{publish:{operationId:'p'},subscribe:{operationId:'s'}}}});assert.equal(x.operations.length,2)});

t('OpenRPC parsing',()=>{const x=C.parseOpenRpc({openrpc:'1.3.2',methods:[{name:'subtract',params:[],result:{}}]});assert.equal(x.operations[0].method,'subtract')});

t('document detection',()=>{assert.equal(C.detectDocument({openapi:'3.0',paths:{}}),'openapi');assert.equal(C.detectDocument({log:{entries:[]}}),'har');assert.equal(C.detectDocument({openrpc:'1.3.2',methods:[]}), 'openrpc')});

t('gRPC-Web framing round trip',()=>{const frame=C.grpcWebFrame(Uint8Array.of(1,2,3));assert.deepEqual([...frame],[0,0,0,0,3,1,2,3]);const parsed=C.parseGrpcWebFrames(frame);assert.equal(parsed.length,1);assert.deepEqual([...parsed[0].payload],[1,2,3])});

t('gRPC-Web trailer frame',()=>{const frame=C.grpcWebFrame('grpc-status: 0\r\n',{trailer:true});assert.equal(C.parseGrpcWebFrames(frame)[0].trailer,true)});

t('MQTT remaining length boundaries',()=>{assert.deepEqual([...C.mqttRemainingLength(0)],[0]);assert.deepEqual([...C.mqttRemainingLength(127)],[127]);assert.deepEqual([...C.mqttRemainingLength(128)],[128,1]);assert.deepEqual([...C.mqttRemainingLength(16384)],[128,128,1])});

t('MQTT packets',()=>{assert.equal(C.mqttConnect({clientId:'x'})[0],0x10);assert.equal(C.mqttPublish('a','b')[0]>>4,3);assert.equal(C.mqttSubscribe('a')[0],0x82)});

t('STOMP escaping/frame',()=>{const s=C.stompFrame('send',{destination:'/a:b','x':'a\nb'},'hi');assert.ok(s.startsWith('SEND\n'));assert.ok(s.endsWith('\0'));assert.ok(s.includes('destination:/a\\cb'))});

t('SSE parser',()=>{const e=C.parseSse('id: 1\nevent: ping\ndata: a\ndata: b\n\n');assert.deepEqual(e,[{event:'ping',data:'a\nb',id:'1',retry:undefined}])});

t('cartesian combinational matrix',()=>{const rows=C.cartesian({method:['GET','POST'],auth:['none','bearer'],body:['empty','json']});assert.equal(rows.length,8)});

for(const method of C.REQUEST_METHODS){assert.equal(typeof method,'string');tests++;}
console.log(`PASS ${tests} assertions/groups`);
