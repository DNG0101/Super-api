(() => {
  'use strict';

  const consent = document.querySelector('#allowRequests');
  const approvalPanel = document.querySelector('#approvalPanel');
  const approveBtn = document.querySelector('#approveBtn');
  const roleText = document.querySelector('#roleText');

  if (!consent || !approvalPanel || !approveBtn) return;

  // One explicit app-level authorization applies to every peer action for the
  // lifetime of this page. It is deliberately not persisted across reloads.
  consent.checked = false;

  const labelText = consent.parentElement?.querySelector('span');
  if (labelText) {
    labelText.textContent = 'Authorize this paired peer to run all implemented API actions for this page session';
  }

  const help = consent.parentElement?.nextElementSibling;
  if (help?.classList?.contains('mini')) {
    help.textContent = 'One app-level authorization covers all actions until reload/revocation. Browser/OS permission prompts, device pickers, and APIs requiring transient user activation still follow browser rules.';
  }

  const badge = document.createElement('span');
  badge.id = 'sessionAuthBadge';
  badge.className = 'badge warn';
  badge.textContent = 'session control OFF';
  const headerRow = document.querySelector('header .row');
  headerRow?.prepend(badge);

  const style = document.createElement('style');
  style.textContent = `
    #sessionAuthBadge.active { color: var(--ok); border-color:#347a50; background:#10291b; }
    #approvalPanel.session-forwarding { display:none !important; }
  `;
  document.head.appendChild(style);

  function updateState() {
    const on = consent.checked;
    badge.textContent = on ? 'session control ON' : 'session control OFF';
    badge.classList.toggle('active', on);
    badge.classList.toggle('warn', !on);
    if (roleText && on) {
      roleText.textContent = 'Single-session control is authorized. Peer requests run immediately where the browser permits them.';
    }
  }

  consent.addEventListener('change', updateState);
  updateState();

  // app.js still classifies sensitive capabilities so the UI can show their
  // risk. When one-session authorization is ON, automatically consume the
  // app-level per-action gate. This does not and cannot manufacture browser
  // user activation or bypass browser/OS permission UI.
  const observer = new MutationObserver(() => {
    if (!consent.checked) return;
    if (approvalPanel.classList.contains('hidden')) return;

    approvalPanel.classList.add('session-forwarding');
    queueMicrotask(() => {
      try { approveBtn.click(); }
      finally { approvalPanel.classList.remove('session-forwarding'); }
    });
  });

  observer.observe(approvalPanel, { attributes: true, attributeFilter: ['class'] });

  // Revoke app-level authorization when the user explicitly switches away
  // from Controlled-peer mode. It remains active through normal tab changes.
  document.querySelector('#controllerBtn')?.addEventListener('click', () => {
    consent.checked = false;
    updateState();
  });
})();
