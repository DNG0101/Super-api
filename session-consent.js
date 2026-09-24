(() => {
  'use strict';
  const consent=document.querySelector('#allowRequests'),approvalPanel=document.querySelector('#approvalPanel'),approveBtn=document.querySelector('#approveBtn'),roleText=document.querySelector('#roleText'),hostBtn=document.querySelector('#hostBtn'),controllerBtn=document.querySelector('#controllerBtn'),remoteAction=document.querySelector('#remoteAction');
  if(!consent||!approvalPanel||!approveBtn)return;
  if(!document.querySelector('meta[data-ucos-host-csp]')){const meta=document.createElement('meta');meta.httpEquiv='Content-Security-Policy';meta.dataset.ucosHostCsp='v63';meta.content="default-src 'self'; script-src 'self' 'unsafe-inline' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self' data:; connect-src 'self' https: wss:; worker-src 'self' blob:; child-src 'self' blob:; frame-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'";document.head.prepend(meta)}
  consent.checked=false;
  const labelText=consent.parentElement?.querySelector('span');if(labelText)labelText.textContent='Authorize this paired peer to run all implemented API actions for this page session';
  const help=consent.parentElement?.nextElementSibling;if(help?.classList?.contains('mini'))help.textContent='One app-level authorization covers all actions until reload/revocation. Browser/OS permission prompts, provider authentication, device pickers, and APIs requiring transient user activation still follow their own rules.';
  const badge=document.createElement('span');badge.id='sessionAuthBadge';badge.className='badge warn';badge.textContent='session control OFF';document.querySelector('header .row')?.prepend(badge);
  const style=document.createElement('style');style.textContent=`#sessionAuthBadge.active{color:var(--ok);border-color:#347a50;background:#10291b}#approvalPanel.session-forwarding{display:none!important}`;document.head.appendChild(style);
  function relabelActions(){if(!remoteAction)return;for(const option of remoteAction.options)option.textContent=option.textContent.replace(/^APPROVAL\s*•/i,'SESSION •')}
  function updateState(){const on=consent.checked;badge.textContent=on?'session control ON':'session control OFF';badge.classList.toggle('active',on);badge.classList.toggle('warn',!on);if(roleText)roleText.textContent=on?'Single-session control is authorized. Peer requests run immediately where the browser/provider permits them.':'Controlled peer mode. Enable the single session authorization to allow peer API requests.';relabelActions()}
  consent.addEventListener('change',updateState);hostBtn?.addEventListener('click',updateState);updateState();relabelActions();
  const observer=new MutationObserver(()=>{if(!consent.checked||approvalPanel.classList.contains('hidden'))return;approvalPanel.classList.add('session-forwarding');queueMicrotask(()=>{try{approveBtn.click()}finally{approvalPanel.classList.remove('session-forwarding')}})});observer.observe(approvalPanel,{attributes:true,attributeFilter:['class']});
  controllerBtn?.addEventListener('click',()=>{consent.checked=false;updateState()});
  function loadModule(src,marker,onload){const selector=`script[${marker}]`,existing=document.querySelector(selector);if(existing){if(existing.dataset.superApiReady==='true')queueMicrotask(()=>onload?.());else if(onload)existing.addEventListener('load',onload,{once:true});return existing}const script=document.createElement('script');script.src=src;script.async=false;script.setAttribute(marker,'true');script.addEventListener('load',()=>{script.dataset.superApiReady='true';onload?.()},{once:true});script.addEventListener('error',()=>console.error(`Super API module failed to load: ${src}`));document.head.appendChild(script);return script}
  loadModule('./modules/realm-rpc.js','data-super-api-realm-rpc',()=>{if(roleText&&consent.checked)roleText.textContent='Single-session control is authorized. Window/Worker/Worklet realm RPC is ready where the browser permits it.'});
  loadModule('./modules/network-signal-core.js','data-super-api-network-core',()=>loadModule('./modules/network-signal.js','data-super-api-network-signal'));
  loadModule('./modules/wireless-radio-core.js','data-super-api-wireless-core',()=>loadModule('./modules/wireless-radio.js','data-super-api-wireless-radio'));
  loadModule('./modules/universal-core.js','data-super-api-universal-core',()=>loadModule('./modules/universal-api.js','data-super-api-universal-api',()=>loadModule('./modules/universal-api-v2.js','data-super-api-universal-v2')));
  loadModule('./modules/capability-os-core.js','data-super-api-capability-core',()=>{
    loadModule('./modules/capability-os.js','data-super-api-capability-os',()=>{
      loadModule('./modules/ucos-fabric-core.js','data-super-api-ucos-fabric-core',()=>{
        loadModule('./modules/ucos-storage.js','data-super-api-ucos-storage',()=>{
          loadModule('./modules/ucos-fabric.js','data-super-api-ucos-fabric',()=>{
            loadModule('./modules/ucos-lifecycle.js','data-super-api-ucos-lifecycle',()=>{
              loadModule('./modules/ucos-security-core.js','data-super-api-ucos-security-core',()=>{
                loadModule('./modules/ucos-security.js','data-super-api-ucos-security',()=>{
                  loadModule('./modules/ucos-vault.js','data-super-api-ucos-vault',()=>{
                    loadModule('./modules/ucos-secure-peer.js','data-super-api-ucos-secure-peer',()=>{
                      loadModule('./modules/ucos-runtime-core.js','data-super-api-ucos-runtime-core',()=>{
                        loadModule('./modules/ucos-vfs.js','data-super-api-ucos-vfs',()=>{
                          loadModule('./modules/ucos-package-core.js','data-super-api-ucos-package-core',()=>{
                            loadModule('./modules/ucos-packages.js','data-super-api-ucos-packages',()=>{
                              loadModule('./modules/ucos-workflow-core.js','data-super-api-ucos-workflow-core',()=>{
                                loadModule('./modules/ucos-workflows.js','data-super-api-ucos-workflows',()=>{
                                  loadModule('./modules/ucos-runtime.js','data-super-api-ucos-runtime',()=>{
                                    loadModule('./modules/ucos-shell.js','data-super-api-ucos-shell',()=>{
                                      loadModule('./modules/ucos-v4-integration.js','data-super-api-ucos-v4',()=>{
                                        loadModule('./modules/ucos-update.js','data-super-api-ucos-update',()=>{
                                          loadModule('./modules/ucos-v5-integration.js','data-super-api-ucos-v5',()=>{
                                            loadModule('./modules/ucos-v6-integration.js','data-super-api-ucos-v6');
                                          });
                                        });
                                      });
                                    });
                                  });
                                });
                              });
                            });
                          });
                        });
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  });
})();