(() => {
  'use strict';

  const $ = s => document.querySelector(s);
  const consent = $('#allowRequests');
  const main = document.querySelector('main');
  if (!consent || !main) return;

  const state = new Map();
  const set = (name, status, detail = '') => {
    state.set(name, { status, detail });
    render();
  };

  const panel = document.createElement('section');
  panel.id = 'sessionBootstrapPanel';
  panel.className = 'panel';
  panel.innerHTML = `
    <h2>Session permission bootstrap + coverage audit</h2>
    <p class="mini">Turning on the single session authorization attempts to prepare reusable browser permissions that can be requested from one user gesture. APIs that require a fresh chooser or transient activation on every call cannot be pre-authorized by a website and are reported separately.</p>
    <div class="row">
      <button id="bootstrapNow" class="primary">Prepare session now</button>
      <button id="auditCoverage">Audit API coverage</button>
    </div>
    <pre id="bootstrapStatus">Not prepared yet.</pre>
    <pre id="coverageStatus">Coverage audit not run yet.</pre>
  `;

  const target = $('#extPanel') || $('#catalog')?.closest('section.panel');
  if (target) target.before(panel); else main.append(panel);

  const reusable = [
    'camera + microphone',
    'geolocation',
    'notifications',
    'device orientation permission',
    'idle detection permission',
    'persistent storage request',
    'permission-state snapshot'
  ];

  const chooserBound = [
    'screen capture / getDisplayMedia',
    'file open/save/directory pickers',
    'Bluetooth device picker',
    'USB device picker',
    'Serial port picker',
    'HID device picker',
    'Contact Picker',
    'EyeDropper',
    'audio output picker',
    'window/screen chooser',
    'Web Share sheet',
    'fullscreen / pointer lock / Picture-in-Picture where user activation is required'
  ];

  function render() {
    const lines = [];
    lines.push(`Single session authorization: ${consent.checked ? 'ON' : 'OFF'}`);
    lines.push('');
    for (const name of reusable) {
      const x = state.get(name);
      lines.push(`${x?.status || 'PENDING'}  ${name}${x?.detail ? ` — ${x.detail}` : ''}`);
    }
    lines.push('');
    lines.push('Browser chooser / fresh-activation APIs (cannot be universally pre-granted):');
    for (const name of chooserBound) lines.push(`BROWSER  ${name}`);
    $('#bootstrapStatus').textContent = lines.join('\n');
  }

  const resultOf = async (name, fn) => {
    set(name, 'REQUESTING');
    try {
      const out = await fn();
      set(name, 'READY', typeof out === 'string' ? out : JSON.stringify(out));
      return out;
    } catch (e) {
      set(name, 'BLOCKED', `${e?.name || 'Error'}: ${e?.message || String(e)}`);
      return null;
    }
  };

  async function bootstrap() {
    if (!consent.checked) {
      set('permission-state snapshot', 'BLOCKED', 'Enable the one session authorization first.');
      return;
    }

    // Start user-activation-sensitive permission requests immediately from the
    // same trusted click/change handler, before awaiting any one of them.
    const mediaPromise = navigator.mediaDevices?.getUserMedia
      ? navigator.mediaDevices.getUserMedia({ audio: true, video: { facingMode: { ideal: 'environment' } } })
      : Promise.reject(new Error('getUserMedia unavailable'));

    const notifyPromise = globalThis.Notification?.requestPermission
      ? Notification.requestPermission()
      : Promise.reject(new Error('Notifications API unavailable'));

    const geoPromise = navigator.geolocation
      ? new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(
          p => resolve({ accuracy: Math.round(p.coords.accuracy || 0) }),
          e => reject(new Error(e.message)),
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
        ))
      : Promise.reject(new Error('Geolocation unavailable'));

    const orientationPromise = typeof globalThis.DeviceOrientationEvent?.requestPermission === 'function'
      ? globalThis.DeviceOrientationEvent.requestPermission()
      : Promise.resolve('not-required-or-unavailable');

    const idlePromise = globalThis.IdleDetector?.requestPermission
      ? globalThis.IdleDetector.requestPermission()
      : Promise.resolve('not-required-or-unavailable');

    await Promise.all([
      resultOf('camera + microphone', async () => {
        const s = await mediaPromise;
        const details = s.getTracks().map(t => `${t.kind}:${t.label || 'granted'}`);
        s.getTracks().forEach(t => t.stop());
        return details.join(', ');
      }),
      resultOf('notifications', async () => `permission=${await notifyPromise}`),
      resultOf('geolocation', async () => geoPromise),
      resultOf('device orientation permission', async () => `permission=${await orientationPromise}`),
      resultOf('idle detection permission', async () => `permission=${await idlePromise}`),
      resultOf('persistent storage request', async () => {
        if (!navigator.storage?.persist) throw new Error('Storage persistence API unavailable');
        return `persisted=${await navigator.storage.persist()}`;
      }),
      resultOf('permission-state snapshot', async () => {
        if (!navigator.permissions?.query) throw new Error('Permissions API unavailable');
        const names = ['camera','microphone','geolocation','notifications','clipboard-read','clipboard-write','midi'];
        const out = {};
        for (const name of names) {
          try { out[name] = (await navigator.permissions.query({ name })).state; }
          catch { out[name] = 'query-unsupported'; }
        }
        return out;
      })
    ]);
  }

  function auditCoverage() {
    const catalogNames = Array.isArray(window.WEB_API_CATALOG) ? window.WEB_API_CATALOG.map(x => x.name) : [];
    const cards = [...document.querySelectorAll('#catalog .cap')];
    const byName = new Map(cards.map(c => [c.querySelector('h3')?.textContent || '', c]));
    const missing = [];
    const runnable = [];
    const detectedOnly = [];

    for (const name of catalogNames) {
      const card = byName.get(name);
      if (!card) { missing.push(name); continue; }
      const buttons = [...card.querySelectorAll('button')];
      const detected = !card.querySelector('.status')?.classList.contains('bad');
      if (buttons.length) runnable.push(name);
      else if (detected) detectedOnly.push(name);
    }

    const extOptions = [...($('#remoteAction')?.options || [])].filter(o => o.value.startsWith('ext:')).length;
    const text = [
      `Catalog entries: ${catalogNames.length}`,
      `Cards rendered: ${cards.length}`,
      `Entries with executable UI call: ${runnable.length}`,
      `Detected but no executable UI call: ${detectedOnly.length}`,
      `Missing rendered cards: ${missing.length}`,
      `Extended peer-call actions: ${extOptions}`,
      '',
      detectedOnly.length ? `Detected-only entries:\n- ${detectedOnly.join('\n- ')}` : 'Detected-only entries: none in current filtered view.',
      '',
      missing.length ? `Missing entries:\n- ${missing.join('\n- ')}` : 'Missing entries: none.'
    ].join('\n');
    $('#coverageStatus').textContent = text;
    return { catalog: catalogNames.length, runnable: runnable.length, detectedOnly, missing, extensionActions: extOptions };
  }

  $('#bootstrapNow').addEventListener('click', bootstrap);
  $('#auditCoverage').addEventListener('click', auditCoverage);

  consent.addEventListener('change', e => {
    if (e.target.checked && e.isTrusted) bootstrap();
    if (!e.target.checked) {
      state.clear();
      render();
    }
  });

  // Re-run the audit after catalog filtering/re-rendering.
  for (const id of ['refreshCaps','filter','categoryFilter','supportFilter']) {
    const el = $(`#${id}`);
    if (el) el.addEventListener(id === 'filter' ? 'input' : 'change', () => setTimeout(auditCoverage, 50));
  }

  render();
  setTimeout(auditCoverage, 250);
})();
