(() => {
  'use strict';

  const consent = document.querySelector('#allowRequests');
  const approvalPanel = document.querySelector('#approvalPanel');
  const approveBtn = document.querySelector('#approveBtn');
  const roleText = document.querySelector('#roleText');
  const hostBtn = document.querySelector('#hostBtn');
  const controllerBtn = document.querySelector('#controllerBtn');
  const remoteAction = document.querySelector('#remoteAction');

  if (!consent || !approvalPanel || !approveBtn) return;

  consent.checked = false;

  const labelText = consent.parentElement?.querySelector('span');
  if (labelText) labelText.textContent = 'Authorize this paired peer to run all implemented API actions for this page session';

  const help = consent.parentElement?.nextElementSibling;
  if (help?.classList?.contains('mini')) {
    help.textContent = 'One app-level authorization covers all actions until reload/revocation. Browser/OS permission prompts, provider authentication, device pickers, and APIs requiring transient user activation still follow their own rules.';
  }

  const badge = document.createElement('span');
  badge.id = 'sessionAuthBadge';
  badge.className = 'badge warn';
  badge.textContent = 'session control OFF';
  document.querySelector('header .row')?.prepend(badge);

  const style = document.createElement('style');
  style.textContent = `
    #sessionAuthBadge.active { color: var(--ok); border-color:#347a50; background:#10291b; }
    #approvalPanel.session-forwarding { display:none !important; }
  `;
  document.head.appendChild(style);

  function relabelActions() {
    if (!remoteAction) return;
    for (const option of remoteAction.options) option.textContent = option.textContent.replace(/^APPROVAL\s*•/i, 'SESSION •');
  }

  function updateState() {
    const on = consent.checked;
    badge.textContent = on ? 'session control ON' : 'session control OFF';
    badge.classList.toggle('active', on);
    badge.classList.toggle('warn', !on);
    if (roleText) {
      roleText.textContent = on
        ? 'Single-session control is authorized. Peer requests run immediately where the browser/provider permits them.'
        : 'Controlled peer mode. Enable the single session authorization to allow peer API requests.';
    }
    relabelActions();
  }

  consent.addEventListener('change', updateState);
  hostBtn?.addEventListener('click', updateState);
  updateState();
  relabelActions();

  const observer = new MutationObserver(() => {
    if (!consent.checked || approvalPanel.classList.contains('hidden')) return;
    approvalPanel.classList.add('session-forwarding');
    queueMicrotask(() => {
      try { approveBtn.click(); }
      finally { approvalPanel.classList.remove('session-forwarding'); }
    });
  });
  observer.observe(approvalPanel, { attributes: true, attributeFilter: ['class'] });

  controllerBtn?.addEventListener('click', () => {
    consent.checked = false;
    updateState();
  });

  function loadModule(src, marker, onload) {
    const selector = `script[${marker}]`;
    const existing = document.querySelector(selector);
    if (existing) {
      if (existing.dataset.superApiReady === 'true') queueMicrotask(() => onload?.());
      else if (onload) existing.addEventListener('load', onload, { once: true });
      return existing;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.setAttribute(marker, 'true');
    script.addEventListener('load', () => {
      script.dataset.superApiReady = 'true';
      onload?.();
    }, { once: true });
    script.addEventListener('error', () => console.error(`Super API module failed to load: ${src}`));
    document.head.appendChild(script);
    return script;
  }

  loadModule('./modules/realm-rpc.js', 'data-super-api-realm-rpc', () => {
    if (roleText && consent.checked) {
      roleText.textContent = 'Single-session control is authorized. Window/Worker/Worklet realm RPC is ready where the browser permits it.';
    }
  });

  // Network/signal diagnostics stack. It shares the same page-session authorization.
  loadModule('./modules/network-signal-core.js', 'data-super-api-network-core', () => {
    loadModule('./modules/network-signal.js', 'data-super-api-network-signal');
  });

  // Wireless/radio stack. It inventories every major radio family, runs the
  // browser-exposed surfaces, and labels non-exposed/raw-radio technologies
  // explicitly instead of pretending the browser can access them.
  loadModule('./modules/wireless-radio-core.js', 'data-super-api-wireless-core', () => {
    loadModule('./modules/wireless-radio.js', 'data-super-api-wireless-radio');
  });

  // External/world API stack must load in dependency order.
  loadModule('./modules/universal-core.js', 'data-super-api-universal-core', () => {
    loadModule('./modules/universal-api.js', 'data-super-api-universal-api', () => {
      loadModule('./modules/universal-api-v2.js', 'data-super-api-universal-v2');
    });
  });

  // Existing Universal Capability OS control plane stays intact as the
  // compatibility execution layer for every current action/module.
  loadModule('./modules/capability-os-core.js', 'data-super-api-capability-core', () => {
    loadModule('./modules/capability-os.js', 'data-super-api-capability-os', () => {
      // UCOS Fabric v2 is additive: it mirrors the existing registry, adds
      // provider/transport/node abstractions and a user-facing shell, while the
      // original Super API Lab and ext:* action bus remain available.
      loadModule('./modules/ucos-fabric-core.js', 'data-super-api-ucos-fabric-core', () => {
        loadModule('./modules/ucos-storage.js', 'data-super-api-ucos-storage', () => {
          loadModule('./modules/ucos-fabric.js', 'data-super-api-ucos-fabric', () => {
            loadModule('./modules/ucos-shell.js', 'data-super-api-ucos-shell');
          });
        });
      });
    });
  });
})();
