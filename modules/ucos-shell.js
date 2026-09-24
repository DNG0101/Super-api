(()=>{
'use strict';
const UCOS=globalThis.SuperApiUCOS;
if(!UCOS||document.querySelector('#ucosFabricShell'))return;
const style=document.createElement('style');
style.textContent=`
#ucosFabricShell{border:1px solid #31527b;background:linear-gradient(135deg,#0d1725,#0a1018 55%,#101c2c);border-radius:20px;padding:18px;box-shadow:0 20px 70px #0006;overflow:hidden}
#ucosFabricShell .ucos-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap}
#ucosFabricShell .ucos-title{display:flex;align-items:center;gap:12px}
#ucosFabricShell .ucos-logo{width:42px;height:42px;border-radius:13px;display:grid;place-items:center;background:#17345f;border:1px solid #4d7db8;font-weight:800}
#ucosFabricShell .ucos-title h2{margin:0;font-size:22px}#ucosFabricShell .ucos-sub{font-size:12px;color:var(--muted);margin-top:3px}
#ucosFabricShell .ucos-grid{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(280px,.75fr);gap:14px;margin-top:15px}
#ucosFabricShell .ucos-card{border:1px solid var(--line);border-radius:15px;padding:14px;background:#08111bd9}
#ucosFabricShell .ucos-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin:12px 0}
#ucosFabricShell .ucos-stat{padding:10px;border:1px solid #20364f;border-radius:12px;background:#0b1622}#ucosFabricShell .ucos-stat b{display:block;font-size:21px}
#ucosFabricShell .ucos-actions{display:flex;gap:8px;flex-wrap:wrap}#ucosFabricShell .ucos-actions button{font-size:12px}
#ucosFabricShell .ucos-node{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:9px 0;border-bottom:1px solid #18283a}#ucosFabricShell .ucos-node:last-child{border-bottom:0}
#ucosFabricShell .ucos-node-name{font-weight:650}#ucosFabricShell .ucos-node-meta{font-size:11px;color:var(--muted);margin-top:2px}
#ucosFabricShell .ucos-dot{width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:6px;background:#64748b}.ucos-dot.live{background:var(--ok);box-shadow:0 0 0 4px #46d7841f}
#ucosFabricShell .ucos-domain-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:7px;margin-top:10px}.ucos-domain{border:1px solid #1d3148;border-radius:10px;padding:8px;background:#0b1520;font-size:11px}.ucos-domain b{display:block;font-size:17px}
#ucosFabricShell .ucos-runner{display:grid;gap:8px}#ucosFabricShell .ucos-runner select,#ucosFabricShell .ucos-runner textarea{width:100%}#ucosFabricShell .ucos-runner textarea{min-height:80px}
#ucosFabricShell .ucos-output{max-height:240px;margin:0}.ucos-chip{display:inline-flex;border:1px solid #29435f;border-radius:999px;padding:4px 8px;font-size:11px;color:#b8cae0}
#ucosFabricShell .ucos-search{display:flex;gap:8px;margin-top:10px}#ucosFabricShell .ucos-search input{flex:1}
#ucosFabricShell .ucos-cap-list{max-height:210px;overflow:auto;margin-top:8px;border:1px solid #1d3148;border-radius:11px}.ucos-cap-row{padding:8px 10px;border-bottom:1px solid #152638;cursor:pointer}.ucos-cap-row:last-child{border-bottom:0}.ucos-cap-row:hover{background:#102033}.ucos-cap-row b{font-size:12px}.ucos-cap-row span{display:block;color:var(--muted);font-size:10px;margin-top:2px}
@media(max-width:900px){#ucosFabricShell .ucos-grid{grid-template-columns:1fr}#ucosFabricShell .ucos-stats{grid-template-columns:repeat(2,1fr)}}
@media(max-width:520px){#ucosFabricShell{padding:12px;border-radius:14px}#ucosFabricShell .ucos-stats{grid-template-columns:1fr 1fr}.ucos-hide-mobile{display:none}}
`;
document.head.appendChild(style);
const shell=document.createElement('section');shell.id='ucosFabricShell';shell.innerHTML=`
<div class="ucos-head">
 <div class="ucos-title"><div class="ucos-logo">U</div><div><h2>Super API Universal Capability Fabric</h2><div class="ucos-sub">Additive UCOS runtime • existing Super API Lab remains fully available below</div></div></div>
 <div class="ucos-actions"><span id="ucosSecure" class="ucos-chip">secure context</span><span id="ucosPeer" class="ucos-chip">peer</span><button id="ucosRefresh">Refresh fabric</button><button id="ucosAdvertise">Advertise capabilities</button><button id="ucosLab">Developer Lab ↓</button></div>
</div>
<div class="ucos-stats"><div class="ucos-stat"><b id="ucosCapabilityCount">0</b><span class="mini">capabilities</span></div><div class="ucos-stat"><b id="ucosProviderCount">0</b><span class="mini">providers</span></div><div class="ucos-stat"><b id="ucosTransportCount">0</b><span class="mini">transports</span></div><div class="ucos-stat"><b id="ucosNodeCount">0</b><span class="mini">fabric nodes</span></div></div>
<div class="ucos-grid">
 <div class="ucos-card">
   <div class="row"><h3 class="grow">Capability Center</h3><span id="ucosSession" class="ucos-chip">session</span></div>
   <div id="ucosDomains" class="ucos-domain-grid"></div>
   <div class="ucos-search"><input id="ucosCapabilitySearch" placeholder="Search capabilities, domains, actions…"><button id="ucosSearchClear">Clear</button></div>
   <div id="ucosCapabilityList" class="ucos-cap-list"></div>
 </div>
 <div class="ucos-card">
   <h3>Capability Nodes</h3><div class="mini">This browser and discovered/paired peers. Remote execution still uses the existing tested WebRTC command path for maximum compatibility.</div>
   <div id="ucosNodes" style="margin-top:7px"></div>
   <div class="ucos-actions" style="margin-top:10px"><button id="ucosPing">Ping paired peer</button></div>
 </div>
 <div class="ucos-card">
   <h3>Unified Executor</h3>
   <div class="ucos-runner"><select id="ucosCapability"></select><div class="row"><select id="ucosMode" class="grow"><option value="auto">Auto route</option><option value="local">This device</option><option value="peer">Paired peer</option></select><select id="ucosOperation"><option value="execute">execute</option><option value="test">test</option><option value="inspect">inspect</option><option value="read">read</option><option value="write">write</option><option value="connect">connect</option><option value="stream">stream</option></select></div><textarea id="ucosArgs" class="code" spellcheck="false">{}</textarea><button id="ucosExecute" class="primary">Execute through UCOS Fabric</button></div>
 </div>
 <div class="ucos-card">
   <div class="row"><h3 class="grow">Execution / Health</h3><button id="ucosHealth">Health</button></div><pre id="ucosOut" class="ucos-output">UCOS fabric ready.</pre>
 </div>
</div>`;
const main=document.querySelector('main');if(!main)return;main.prepend(shell);
const $=s=>shell.querySelector(s);
function fmt(v){try{return JSON.stringify(v,(_k,x)=>typeof x==='bigint'?String(x):x,2)}catch{return String(v)}}
function capabilityRows(query=''){return UCOS.capabilities.list({query}).slice(0,500)}
function renderCapabilities(){
 const query=$('#ucosCapabilitySearch').value||'',rows=capabilityRows(query),select=$('#ucosCapability'),list=$('#ucosCapabilityList'),prev=select.value;
 select.innerHTML='';list.innerHTML='';
 for(const c of rows){const o=document.createElement('option');o.value=c.id;o.textContent=`${c.domain.toUpperCase()} • ${c.label}`;select.appendChild(o);const row=document.createElement('div');row.className='ucos-cap-row';row.innerHTML=`<b></b><span></span>`;row.querySelector('b').textContent=c.label;row.querySelector('span').textContent=`${c.id} • ${c.domain} • ${c.operations.join(', ')||'execute'}`;row.onclick=()=>{select.value=c.id;$('#ucosOut').textContent=fmt(c)};list.appendChild(row)}
 if(prev&&[...select.options].some(o=>o.value===prev))select.value=prev;
}
function render(){
 const h=UCOS.health();$('#ucosCapabilityCount').textContent=h.capabilities.total;$('#ucosProviderCount').textContent=h.providers.length;$('#ucosTransportCount').textContent=h.transports.length;$('#ucosNodeCount').textContent=h.nodes.length;
 $('#ucosSecure').textContent=h.secureContext?'HTTPS / secure ✓':'secure context unavailable';$('#ucosPeer').textContent=h.peerConnected?'peer connected':'peer offline';$('#ucosSession').textContent=h.sessionAuthorized?'session control ON':'session control OFF';
 const domains=$('#ucosDomains');domains.innerHTML='';for(const [name,count] of Object.entries(h.capabilities.byDomain||{}).sort((a,b)=>b[1]-a[1])){const d=document.createElement('div');d.className='ucos-domain';d.innerHTML=`<b>${count}</b>${name}`;domains.appendChild(d)}
 const nodes=$('#ucosNodes');nodes.innerHTML='';for(const n of h.nodes){const d=document.createElement('div');d.className='ucos-node';const count=n.capabilities?.length||n.capabilityDetails?.length||0;d.innerHTML=`<div><div class="ucos-node-name"><span class="ucos-dot ${n.online?'live':''}"></span></div><div class="ucos-node-meta"></div></div><span class="ucos-chip"></span>`;d.querySelector('.ucos-node-name').append(document.createTextNode(n.label||n.id));d.querySelector('.ucos-node-meta').textContent=`${n.local?'local':'remote'} • ${n.transportId||'browser'} • ${count} advertised capabilities`;d.querySelector('.ucos-chip').textContent=n.online?'ready':'offline';nodes.appendChild(d)}
 renderCapabilities();
}
$('#ucosRefresh').onclick=()=>{const h=UCOS.refresh();render();$('#ucosOut').textContent=fmt(h)};
$('#ucosAdvertise').onclick=()=>{$('#ucosOut').textContent=UCOS.sendAdvertisement()?'Capability advertisement sent.':'No open peer channel; local registry refreshed.';render()};
$('#ucosLab').onclick=()=>{const target=[...main.children].find(x=>x!==shell);target?.scrollIntoView({behavior:'smooth',block:'start'})};
$('#ucosCapabilitySearch').oninput=renderCapabilities;$('#ucosSearchClear').onclick=()=>{$('#ucosCapabilitySearch').value='';renderCapabilities()};
$('#ucosHealth').onclick=()=>{$('#ucosOut').textContent=fmt(UCOS.health())};
$('#ucosPing').onclick=async()=>{try{$('#ucosOut').textContent='Pinging…';$('#ucosOut').textContent=fmt(await UCOS.ping())}catch(e){$('#ucosOut').textContent=`${e.name}: ${e.message}`}finally{render()}};
$('#ucosExecute').onclick=async()=>{const out=$('#ucosOut');try{let args={};const raw=$('#ucosArgs').value.trim();if(raw)args=JSON.parse(raw);out.textContent='Executing…';const env=await UCOS.execute({capabilityId:$('#ucosCapability').value,operation:$('#ucosOperation').value,args,mode:$('#ucosMode').value});out.textContent=fmt(env)}catch(e){out.textContent=e.envelope?fmt(e.envelope):`${e.name}: ${e.message}`}finally{render()}};
UCOS.events.addEventListener('nodes',render);UCOS.events.addEventListener('capabilities',()=>{renderCapabilities()});
render();
})();
