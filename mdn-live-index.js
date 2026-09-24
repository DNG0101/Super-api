(() => {
  'use strict';
  const $=s=>document.querySelector(s);
  const API_URL='https://api.github.com/repos/mdn/content/contents/files/en-us/web/api?ref=main';
  let entries=[];
  const logBox=$('#log');
  const log=(...xs)=>{if(logBox)logBox.textContent=`[${new Date().toLocaleTimeString()}] ${xs.map(x=>typeof x==='string'?x:JSON.stringify(x)).join(' ')}\n`+logBox.textContent;};
  const globalMap=()=>new Map(Object.getOwnPropertyNames(globalThis).map(n=>[n.toLowerCase().replace(/[^a-z0-9]/g,''),n]));
  const normalize=s=>String(s).toLowerCase().replace(/[^a-z0-9]/g,'');
  function classify(item){const gm=globalMap();const key=normalize(item.name);const globalName=gm.get(key)||null;return {...item,globalName,exposed:!!globalName,docsUrl:`https://developer.mozilla.org/en-US/docs/Web/API/${encodeURIComponent(item.name)}`};}
  async function load(){
    $('#mdnLiveStatus').textContent='Loading current MDN Web/API directory from GitHub…';
    const r=await fetch(API_URL,{headers:{Accept:'application/vnd.github+json'},cache:'no-store'});
    if(!r.ok)throw new Error(`GitHub API ${r.status}`);
    const data=await r.json();
    entries=data.filter(x=>x.type==='dir').map(x=>({name:x.name,path:x.path,sha:x.sha})).map(classify).sort((a,b)=>a.name.localeCompare(b.name));
    render();
    const s=summary();$('#mdnLiveStatus').textContent=JSON.stringify(s,null,2);log('Live MDN Web API index loaded:',s);return s;
  }
  function summary(){return {source:'mdn/content main / files/en-us/web/api',loadedAt:new Date().toISOString(),mdnTopLevelPages:entries.length,exactRuntimeGlobalMatches:entries.filter(x=>x.exposed).length,note:'MDN folders include interfaces and API overview pages. Runtime matching is exact-normalized global-name matching; worker-only and instance-only interfaces are covered by the realm scanners.'};}
  function render(){
    const q=($('#mdnLiveFilter')?.value||'').trim().toLowerCase();const mode=$('#mdnLiveMode')?.value||'';const root=$('#mdnLiveResults');if(!root)return;root.innerHTML='';
    let rows=entries;if(q)rows=rows.filter(x=>`${x.name} ${x.globalName||''}`.toLowerCase().includes(q));if(mode==='exposed')rows=rows.filter(x=>x.exposed);if(mode==='not-global')rows=rows.filter(x=>!x.exposed);
    const shown=rows.slice(0,800);
    for(const x of shown){const c=document.createElement('article');c.className='cap';c.innerHTML='<div class="category">MDN live page</div><h3></h3><div class="meta"></div><div class="line"><span class="status"></span><span class="policy safe"></span></div>';c.querySelector('h3').textContent=x.name;c.querySelector('.meta').textContent=x.exposed?`Exact runtime global: ${x.globalName}`:'No exact Window-global match; may be worker-only, instance-only, dictionary, event, overview page, unsupported, or differently named.';const st=c.querySelector('.status');st.textContent=x.exposed?'● global exposed':'○ no exact global';st.classList.add(x.exposed?'ok':'warn');c.querySelector('.policy').textContent=x.exposed?'GLOBAL':'INDEXED';root.appendChild(c);}
    if(rows.length>shown.length){const p=document.createElement('p');p.className='mini';p.textContent=`Showing ${shown.length} of ${rows.length}. Use the filter to narrow results.`;root.appendChild(p);}
    $('#mdnLiveStatus').textContent=JSON.stringify({...summary(),filteredRows:rows.length},null,2);
  }
  function exportIndex(){const blob=new Blob([JSON.stringify({summary:summary(),entries},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`super-api-mdn-live-${Date.now()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function build(){if($('#mdnLivePanel'))return;const panel=document.createElement('section');panel.id='mdnLivePanel';panel.className='panel';panel.innerHTML=`<h2>Live MDN Web/API page index</h2><p class="mini">Loads the current MDN content repository rather than relying only on the 148 fixed specification families. This gives the lab a live inventory of individual interface/object pages and new API pages as MDN adds them.</p><div class="row"><button id="mdnLiveLoad" class="primary">Load current MDN index</button><button id="mdnLiveExport">Export JSON</button><input id="mdnLiveFilter" class="grow" placeholder="Search MDN interface/API page…"><select id="mdnLiveMode"><option value="">All pages</option><option value="exposed">Exact Window globals</option><option value="not-global">Not Window-global</option></select></div><pre id="mdnLiveStatus">Not loaded yet.</pre><div id="mdnLiveResults" class="cap-grid"></div>`;const realms=$('#realmScannerPanel'),runtime=$('#runtimeSurfacePanel'),media=$('#localVideo')?.closest('section.panel');if(realms)realms.before(panel);else if(runtime)runtime.before(panel);else if(media)media.before(panel);else document.querySelector('main')?.append(panel);$('#mdnLiveLoad').onclick=()=>load().catch(e=>{$('#mdnLiveStatus').textContent=`${e.name}: ${e.message}`;log('MDN live index error:',e.message)});$('#mdnLiveExport').onclick=exportIndex;$('#mdnLiveFilter').addEventListener('input',render);$('#mdnLiveMode').addEventListener('change',render);}
  build();
})();
