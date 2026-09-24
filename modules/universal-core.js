(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  if(root) root.SuperApiUniversalCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const REQUEST_METHODS=['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS','TRACE','CONNECT','PROPFIND','PROPPATCH','MKCOL','COPY','MOVE','LOCK','UNLOCK','REPORT','MKCALENDAR','SEARCH'];

  function bytes(input){
    if(input instanceof Uint8Array) return input;
    if(input instanceof ArrayBuffer) return new Uint8Array(input);
    if(ArrayBuffer.isView(input)) return new Uint8Array(input.buffer,input.byteOffset,input.byteLength);
    if(Array.isArray(input)) return Uint8Array.from(input);
    if(typeof input==='string') return new TextEncoder().encode(input);
    return new Uint8Array();
  }

  function concat(...parts){
    const arrays=parts.map(bytes), size=arrays.reduce((n,a)=>n+a.length,0), out=new Uint8Array(size);
    let off=0; for(const a of arrays){out.set(a,off);off+=a.length;} return out;
  }

  function base64ToBytes(s=''){
    const str=String(s).replace(/\s+/g,'');
    if(typeof Buffer!=='undefined') return Uint8Array.from(Buffer.from(str,'base64'));
    const raw=atob(str); const out=new Uint8Array(raw.length); for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i); return out;
  }

  function bytesToBase64(input){
    const u=bytes(input);
    if(typeof Buffer!=='undefined') return Buffer.from(u).toString('base64');
    let s=''; for(let i=0;i<u.length;i+=32768)s+=String.fromCharCode(...u.subarray(i,i+32768)); return btoa(s);
  }

  function privateHost(host){
    const h=String(host||'').toLowerCase().replace(/^\[|\]$/g,'');
    if(!h) return true;
    if(h==='localhost'||h.endsWith('.localhost')||h.endsWith('.local')||h.endsWith('.internal')) return true;
    if(h==='::1'||h==='0:0:0:0:0:0:0:1'||h.startsWith('fe80:')||h.startsWith('fc')||h.startsWith('fd')) return true;
    const v4=h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if(v4){
      const [a,b,c,d]=v4.slice(1).map(Number); if([a,b,c,d].some(x=>x>255))return true;
      if(a===0||a===10||a===127||a>=224) return true;
      if(a===169&&b===254) return true;
      if(a===172&&b>=16&&b<=31) return true;
      if(a===192&&b===168) return true;
      if(a===100&&b>=64&&b<=127) return true;
      if(a===198&&(b===18||b===19)) return true;
    }
    return false;
  }

  function isPublicUrl(value,{httpsOnly=true,allowWs=false}={}){
    let u; try{u=new URL(String(value));}catch{return false;}
    const ok=httpsOnly?u.protocol==='https:':['https:','http:',...(allowWs?['wss:','ws:']:[])].includes(u.protocol);
    return ok&&!privateHost(u.hostname);
  }

  function buildUrl({url,base='',path='',pathParams={},query={}}={}){
    if(url) return String(url);
    let p=String(path||'');
    for(const [k,v] of Object.entries(pathParams||{})) p=p.replaceAll(`{${k}}`,encodeURIComponent(v??''));
    const absolute=/^[a-z][a-z0-9+.-]*:\/\//i.test(p);
    const u=new URL(absolute?p:`${String(base).replace(/\/$/,'')}/${p.replace(/^\//,'')}`);
    for(const [k,v] of Object.entries(query||{})){
      if(v===undefined||v===null||v==='') continue;
      for(const x of (Array.isArray(v)?v:[v])) u.searchParams.append(k,String(x));
    }
    return u.toString();
  }

  function parseOpenApi(spec){
    if(!spec||typeof spec!=='object'||!spec.paths) throw new Error('OpenAPI/Swagger paths missing');
    const v3=Boolean(spec.openapi), v2=Boolean(spec.swagger);
    let base='';
    if(v3) base=spec.servers?.[0]?.url||'';
    if(v2&&spec.host) base=`${spec.schemes?.[0]||'https'}://${spec.host}${spec.basePath||''}`;
    const methods=new Set(['get','post','put','patch','delete','head','options','trace']);
    const operations=[];
    for(const [path,item] of Object.entries(spec.paths||{})){
      if(!item||typeof item!=='object') continue;
      for(const [method,op] of Object.entries(item)){
        if(!methods.has(method.toLowerCase())||!op||typeof op!=='object') continue;
        const requestContent=op.requestBody?.content?Object.keys(op.requestBody.content):[];
        const responses=Object.keys(op.responses||{});
        operations.push({
          source:'openapi', method:method.toUpperCase(), path,
          id:op.operationId||`${method.toUpperCase()} ${path}`,
          summary:op.summary||op.description||'', tags:op.tags||[],
          parameters:[...(item.parameters||[]),...(op.parameters||[])],
          requestContent,responses,security:op.security??spec.security??[]
        });
      }
    }
    return {format:v3?`OpenAPI ${spec.openapi}`:v2?`Swagger ${spec.swagger}`:'OpenAPI-like',title:spec.info?.title||'',version:spec.info?.version||'',base,operations,securitySchemes:spec.components?.securitySchemes||spec.securityDefinitions||{}};
  }

  function resolvePostmanUrl(raw,variables){
    let s=typeof raw==='string'?raw:raw?.raw||'';
    for(const [k,v] of Object.entries(variables||{})) s=s.replaceAll(`{{${k}}}`,String(v));
    return s;
  }

  function parsePostman(collection){
    if(!collection||typeof collection!=='object'||!Array.isArray(collection.item)) throw new Error('Invalid Postman collection');
    const vars={}; for(const v of collection.variable||[]) if(v?.key) vars[v.key]=v.value??'';
    const operations=[];
    const walk=(items,folder=[])=>{
      for(const item of items||[]){
        if(Array.isArray(item.item)){walk(item.item,[...folder,item.name||'folder']);continue;}
        const r=item.request; if(!r) continue;
        const method=String(r.method||'GET').toUpperCase();
        const url=resolvePostmanUrl(r.url,vars);
        const headers=Object.fromEntries((r.header||[]).filter(h=>h&&!h.disabled&&h.key).map(h=>[h.key,h.value??'']));
        operations.push({source:'postman',id:item.name||`${method} ${url}`,folder,method,url,headers,body:r.body||null,auth:r.auth||collection.auth||null});
      }
    };
    walk(collection.item);
    return {format:'Postman Collection',title:collection.info?.name||'',operations,variables:vars};
  }

  function parseHar(har){
    const entries=har?.log?.entries; if(!Array.isArray(entries)) throw new Error('Invalid HAR');
    const operations=entries.map((e,i)=>({source:'har',id:`HAR ${i+1}`,method:String(e.request?.method||'GET').toUpperCase(),url:e.request?.url||'',headers:Object.fromEntries((e.request?.headers||[]).map(h=>[h.name,h.value])),query:Object.fromEntries((e.request?.queryString||[]).map(q=>[q.name,q.value])),body:e.request?.postData?.text??null,mimeType:e.request?.postData?.mimeType||''}));
    return {format:'HAR 1.x',title:har.log?.comment||'',operations};
  }

  function parseAsyncApi(spec){
    if(!spec||typeof spec!=='object'||!spec.asyncapi) throw new Error('Invalid AsyncAPI document');
    const servers=Object.entries(spec.servers||{}).map(([name,s])=>({name,url:s.url||'',protocol:s.protocol||'',description:s.description||''}));
    const operations=[];
    for(const [channelName,ch] of Object.entries(spec.channels||{})){
      if(ch?.publish) operations.push({source:'asyncapi',direction:'publish',channel:channelName,id:ch.publish.operationId||`publish ${channelName}`,message:ch.publish.message||null});
      if(ch?.subscribe) operations.push({source:'asyncapi',direction:'subscribe',channel:channelName,id:ch.subscribe.operationId||`subscribe ${channelName}`,message:ch.subscribe.message||null});
      if(ch?.address&&spec.operations){
        for(const [id,op] of Object.entries(spec.operations)) if(op?.channel?.$ref?.endsWith(`/channels/${channelName}`)) operations.push({source:'asyncapi',direction:op.action||'send/receive',channel:ch.address,id});
      }
    }
    return {format:`AsyncAPI ${spec.asyncapi}`,title:spec.info?.title||'',servers,operations};
  }

  function parseOpenRpc(spec){
    if(!spec||typeof spec!=='object'||!spec.openrpc||!Array.isArray(spec.methods)) throw new Error('Invalid OpenRPC document');
    return {format:`OpenRPC ${spec.openrpc}`,title:spec.info?.title||'',operations:spec.methods.map(m=>({source:'openrpc',id:m.name,method:m.name,params:m.params||[],result:m.result||null,errors:m.errors||[]}))};
  }

  function detectDocument(doc){
    if(doc?.openapi||doc?.swagger) return 'openapi';
    if(doc?.info?.schema?.includes?.('getpostman.com')||Array.isArray(doc?.item)) return 'postman';
    if(doc?.log?.entries) return 'har';
    if(doc?.asyncapi) return 'asyncapi';
    if(doc?.openrpc) return 'openrpc';
    if(doc?.data?.__schema||doc?.__schema) return 'graphql-introspection';
    return 'unknown';
  }

  function grpcWebFrame(payload,{trailer=false}={}){
    const p=bytes(payload), out=new Uint8Array(5+p.length); out[0]=trailer?0x80:0x00;
    const n=p.length; out[1]=(n>>>24)&255;out[2]=(n>>>16)&255;out[3]=(n>>>8)&255;out[4]=n&255;out.set(p,5);return out;
  }

  function parseGrpcWebFrames(input){
    const u=bytes(input), frames=[]; let o=0;
    while(o+5<=u.length){const flag=u[o],len=((u[o+1]<<24)>>>0)|(u[o+2]<<16)|(u[o+3]<<8)|u[o+4];if(o+5+len>u.length) throw new Error('Truncated gRPC-Web frame');const payload=u.slice(o+5,o+5+len);frames.push({trailer:Boolean(flag&0x80),compressed:Boolean(flag&1),length:len,payload,base64:bytesToBase64(payload)});o+=5+len;}
    if(o!==u.length) throw new Error('Trailing bytes after gRPC-Web frames');
    return frames;
  }

  function mqttRemainingLength(n){
    if(!Number.isInteger(n)||n<0||n>268435455) throw new Error('Invalid MQTT remaining length');
    const out=[]; do{let d=n%128;n=Math.floor(n/128);if(n>0)d|=128;out.push(d);}while(n>0);return Uint8Array.from(out);
  }
  function mqttString(s){const p=new TextEncoder().encode(String(s));if(p.length>65535)throw new Error('MQTT string too long');return concat(Uint8Array.of((p.length>>>8)&255,p.length&255),p)}
  function mqttConnect({clientId='super-api',keepAlive=30,clean=true,username,password}={}){
    const proto=mqttString('MQTT'), level=Uint8Array.of(4), flags=(clean?2:0)|(username!=null?128:0)|(password!=null?64:0), ka=Uint8Array.of((keepAlive>>>8)&255,keepAlive&255);
    const payload=[mqttString(clientId)]; if(username!=null)payload.push(mqttString(username)); if(password!=null)payload.push(mqttString(password));
    const body=concat(proto,level,Uint8Array.of(flags),ka,...payload); return concat(Uint8Array.of(0x10),mqttRemainingLength(body.length),body);
  }
  function mqttPublish(topic,payload,{qos=0,retain=false,packetId=1}={}){
    if(qos<0||qos>2)throw new Error('Invalid QoS'); const variable=[mqttString(topic)]; if(qos>0)variable.push(Uint8Array.of((packetId>>>8)&255,packetId&255)); const body=concat(...variable,bytes(payload));const header=0x30|(retain?1:0)|(qos<<1);return concat(Uint8Array.of(header),mqttRemainingLength(body.length),body);
  }
  function mqttSubscribe(topic,{qos=0,packetId=1}={}){const body=concat(Uint8Array.of((packetId>>>8)&255,packetId&255),mqttString(topic),Uint8Array.of(qos));return concat(Uint8Array.of(0x82),mqttRemainingLength(body.length),body)}

  function stompFrame(command,headers={},body=''){
    const lines=[String(command).toUpperCase(),...Object.entries(headers).map(([k,v])=>`${k}:${String(v).replace(/\\/g,'\\\\').replace(/\r/g,'\\r').replace(/\n/g,'\\n').replace(/:/g,'\\c')}`),'',String(body)];return `${lines.join('\n')}\0`;
  }

  function parseSse(text){
    const events=[]; let data=[],event='message',id='',retry;
    const flush=()=>{if(!data.length&&event==='message'&&!id&&retry===undefined)return;events.push({event,data:data.join('\n'),id,retry});data=[];event='message';id='';retry=undefined;};
    for(const raw of String(text).replace(/\r\n?/g,'\n').split('\n')){if(raw===''){flush();continue;}if(raw.startsWith(':'))continue;const i=raw.indexOf(':'),field=i<0?raw:raw.slice(0,i),value=i<0?'':raw.slice(i+1).replace(/^ /,'');if(field==='data')data.push(value);else if(field==='event')event=value||'message';else if(field==='id')id=value;else if(field==='retry'&&/^\d+$/.test(value))retry=Number(value);}flush();return events;
  }

  function cartesian(matrix){
    const keys=Object.keys(matrix||{}); if(!keys.length)return [{}]; return keys.reduce((acc,k)=>acc.flatMap(x=>(matrix[k]||[]).map(v=>({...x,[k]:v}))),[{}]);
  }

  return {REQUEST_METHODS,bytes,concat,base64ToBytes,bytesToBase64,privateHost,isPublicUrl,buildUrl,parseOpenApi,parsePostman,parseHar,parseAsyncApi,parseOpenRpc,detectDocument,grpcWebFrame,parseGrpcWebFrames,mqttRemainingLength,mqttString,mqttConnect,mqttPublish,mqttSubscribe,stompFrame,parseSse,cartesian};
});
