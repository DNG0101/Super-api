(() => {
  'use strict';

  const $ = selector => document.querySelector(selector);
  const WEBREF_INDEX = 'https://raw.githubusercontent.com/w3c/webref/curated/ed/idlnames.json';
  const WEBREF_PARSED_BASE = 'https://raw.githubusercontent.com/w3c/webref/curated/ed/';
  const logBox = $('#log');
  const normalize = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const safe = value => {
    const seen = new WeakSet();
    try {
      return JSON.stringify(value, (_key, item) => {
        if (typeof item === 'bigint') return String(item);
        if (typeof item === 'function') return `[Function ${item.name || 'anonymous'}]`;
        if (item && typeof item === 'object') {
          if (seen.has(item)) return '[Circular]';
          seen.add(item);
          if (typeof Node !== 'undefined' && item instanceof Node) return `[${item.nodeName}]`;
          if (item instanceof Blob) return { blob: true, size: item.size, type: item.type };
          if (item instanceof ArrayBuffer) return { arrayBuffer: true, byteLength: item.byteLength };
          if (ArrayBuffer.isView(item)) return { typedArray: item.constructor?.name, byteLength: item.byteLength };
          if (item instanceof Response) return { response: true, status: item.status, type: item.type, url: item.url };
        }
        return item;
      }, 2);
    } catch {
      return String(value);
    }
  };
  const log = (...items) => {
    if (!logBox) return;
    const text = items.map(item => typeof item === 'string' ? item : safe(item)).join(' ');
    logBox.textContent = `[${new Date().toLocaleTimeString()}] ${text}\n${logBox.textContent}`;
  };

  const INSTANCE_PATHS = {
    Navigator: 'navigator',
    NavigatorUAData: 'navigator.userAgentData',
    Document: 'document',
    Screen: 'screen',
    History: 'history',
    Location: 'location',
    Performance: 'performance',
    Crypto: 'crypto',
    SubtleCrypto: 'crypto.subtle',
    StorageManager: 'navigator.storage',
    Permissions: 'navigator.permissions',
    MediaDevices: 'navigator.mediaDevices',
    ServiceWorkerContainer: 'navigator.serviceWorker',
    LockManager: 'navigator.locks',
    CredentialsContainer: 'navigator.credentials',
    Clipboard: 'navigator.clipboard',
    GPU: 'navigator.gpu',
    XRSystem: 'navigator.xr',
    USB: 'navigator.usb',
    HID: 'navigator.hid',
    Serial: 'navigator.serial',
    Bluetooth: 'navigator.bluetooth',
    MediaCapabilities: 'navigator.mediaCapabilities',
    MediaSession: 'navigator.mediaSession',
    WakeLock: 'navigator.wakeLock',
    Keyboard: 'navigator.keyboard',
    VirtualKeyboard: 'navigator.virtualKeyboard',
    Ink: 'navigator.ink',
    DevicePosture: 'navigator.devicePosture',
    AudioSession: 'navigator.audioSession',
    WindowControlsOverlay: 'navigator.windowControlsOverlay',
    CacheStorage: 'caches',
    IDBFactory: 'indexedDB',
    CookieStore: 'cookieStore',
    SpeechSynthesis: 'speechSynthesis',
    Navigation: 'navigation',
    Scheduler: 'scheduler',
    VisualViewport: 'visualViewport',
    DocumentPictureInPicture: 'documentPictureInPicture',
    ScreenOrientation: 'screen.orientation',
    Storage: 'localStorage'
  };

  let definitions = [];
  let selectedDefinition = null;
  let selectedParsed = null;
  let selectedRuntime = null;

  function resolvePath(path) {
    const parts = String(path || '').trim().split('.').filter(Boolean);
    if (!parts.length) return null;
    let current = globalThis;
    for (const part of parts) {
      if (current == null || !(part in current)) throw new Error(`Path segment not found: ${part}`);
      current = current[part];
    }
    return current;
  }

  function ownAndPrototypeMembers(object, maxDepth = 8) {
    const seen = new Set();
    const result = [];
    let current = object;
    let depth = 0;
    while (current && depth++ < maxDepth) {
      let keys = [];
      try { keys = Reflect.ownKeys(current); } catch { break; }
      for (const key of keys) {
        const name = typeof key === 'symbol' ? key.toString() : String(key);
        if (name === 'constructor' || seen.has(name)) continue;
        seen.add(name);
        let descriptor = null;
        try { descriptor = Object.getOwnPropertyDescriptor(current, key); } catch {}
        result.push({
          name,
          kind: typeof descriptor?.value === 'function' ? 'method' : (descriptor?.get || descriptor?.set ? 'accessor' : 'property'),
          depth: depth - 1,
          getter: !!descriptor?.get,
          setter: !!descriptor?.set,
          writable: !!descriptor?.writable
        });
      }
      try { current = Object.getPrototypeOf(current); } catch { break; }
    }
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }

  function findRuntime(name) {
    const globalValue = name in globalThis ? globalThis[name] : null;
    let instancePath = INSTANCE_PATHS[name] || null;
    let instance = null;
    if (instancePath) {
      try { instance = resolvePath(instancePath); } catch { instancePath = null; }
    }
    if (!instance) {
      const candidates = ['navigator', 'document', 'screen', 'performance', 'crypto', 'history', 'location', 'caches', 'indexedDB', 'cookieStore', 'speechSynthesis', 'navigation', 'scheduler', 'visualViewport', 'documentPictureInPicture'];
      for (const candidate of candidates) {
        try {
          const value = resolvePath(candidate);
          if (value?.constructor?.name === name) {
            instance = value;
            instancePath = candidate;
            break;
          }
        } catch {}
      }
    }

    const staticMembers = globalValue && (typeof globalValue === 'function' || typeof globalValue === 'object')
      ? ownAndPrototypeMembers(globalValue, 2)
      : [];
    const prototypeMembers = typeof globalValue === 'function' && globalValue.prototype
      ? ownAndPrototypeMembers(globalValue.prototype, 8)
      : (instance ? ownAndPrototypeMembers(instance, 8) : []);
    let constructable = false;
    if (typeof globalValue === 'function') {
      try { Reflect.construct(String, [], globalValue); constructable = true; } catch {}
    }
    return {
      name,
      global: !!globalValue,
      globalType: globalValue ? typeof globalValue : null,
      instance: !!instance,
      instancePath,
      constructorName: globalValue?.constructor?.name || instance?.constructor?.name || null,
      constructable,
      staticMembers,
      prototypeMembers
    };
  }

  async function fetchJson(url) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
    return response.json();
  }

  function fragmentsFrom(parsed) {
    const fragments = [];
    if (parsed?.defined?.fragment) fragments.push({ source: 'defined', spec: parsed.defined.spec, href: parsed.defined.href || null, fragment: parsed.defined.fragment });
    for (const item of parsed?.extended || []) {
      if (item?.fragment) fragments.push({ source: 'extended', spec: item.spec, href: item.href || null, fragment: item.fragment });
    }
    return fragments;
  }

  function unique(values) {
    return [...new Set(values.filter(Boolean))];
  }

  function parseIdl(parsed) {
    const fragments = fragmentsFrom(parsed);
    const text = fragments.map(item => item.fragment).join('\n');
    const exposures = [];
    for (const match of text.matchAll(/\bExposed\s*=\s*(\*|\([^\)]*\)|[A-Za-z0-9_,-]+)/g)) {
      const raw = match[1].replace(/[()]/g, '');
      exposures.push(...raw.split(',').map(value => value.trim()).filter(Boolean));
    }
    const attributes = [];
    for (const match of text.matchAll(/\b(?:readonly\s+)?attribute\s+[^;]+?\s+([A-Za-z_][A-Za-z0-9_]*)\s*;/g)) attributes.push(match[1]);
    const constructors = [];
    for (const match of text.matchAll(/\bconstructor\s*\(([^\)]*)\)/g)) constructors.push(match[1].trim());
    const operations = [];
    const operationPattern = /(?:^|[;\n}])\s*(?:\[[^\]]*\]\s*)*(?:static\s+)?(?:getter\s+|setter\s+|deleter\s+|stringifier\s+)?[^;{}=]+?\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^;{}]*)\)\s*;/gm;
    for (const match of text.matchAll(operationPattern)) {
      if (match[1] !== 'constructor') operations.push(match[1]);
    }
    const includes = [];
    for (const match of text.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\s+includes\s+([A-Za-z_][A-Za-z0-9_]*)\s*;/g)) includes.push(`${match[1]} includes ${match[2]}`);
    const iterable = unique([...text.matchAll(/\b(iterable|async iterable|maplike|setlike)\s*</g)].map(match => match[1]));
    const specs = unique(fragments.map(item => item.spec?.title));
    const specUrls = unique(fragments.map(item => item.spec?.url));
    return {
      fragments,
      exposures: unique(exposures),
      secureContext: /\bSecureContext\b/.test(text),
      attributes: unique(attributes),
      operations: unique(operations),
      constructors,
      includes: unique(includes),
      iterable,
      specs,
      specUrls
    };
  }

  function runtimeComparison(parsedInfo, runtime) {
    const runtimeMembers = new Map([...runtime.staticMembers, ...runtime.prototypeMembers].map(member => [normalize(member.name), member.name]));
    const idlMembers = unique([...parsedInfo.attributes, ...parsedInfo.operations]);
    return {
      idlMembers,
      matched: idlMembers.filter(name => runtimeMembers.has(normalize(name))).map(name => ({ idl: name, runtime: runtimeMembers.get(normalize(name)) })),
      missingFromRuntime: idlMembers.filter(name => !runtimeMembers.has(normalize(name))),
      runtimeOnly: unique([...runtime.staticMembers, ...runtime.prototypeMembers].map(member => member.name)).filter(name => !idlMembers.some(idl => normalize(idl) === normalize(name)))
    };
  }

  function summary() {
    const counts = {};
    for (const definition of definitions) counts[definition.type] = (counts[definition.type] || 0) + 1;
    const runtimeGlobals = definitions.filter(definition => definition.runtime.global).length;
    const runtimeInstances = definitions.filter(definition => definition.runtime.instance).length;
    const callableDefinitions = definitions.filter(definition => definition.runtime.global || definition.runtime.instance).length;
    return {
      source: 'w3c/webref curated ed/idlnames.json',
      webIdlNames: definitions.length,
      definitionTypes: counts,
      runtimeGlobals,
      runtimeInstances,
      callableOrInspectableRuntimeDefinitions: callableDefinitions,
      specificationOnlyDefinitions: definitions.length - callableDefinitions,
      note: 'WebIDL inventory includes interfaces, interface mixins, dictionaries, enums, callbacks, namespaces, typedefs and other IDL names. Dictionaries/enums/callback signatures are definitions, not JavaScript device APIs by themselves.'
    };
  }

  function refreshTypeOptions() {
    const select = $('#idlType');
    if (!select) return;
    const current = select.value;
    const types = unique(definitions.map(definition => definition.type)).sort();
    select.innerHTML = '<option value="">All WebIDL types</option>';
    for (const type of types) {
      const option = document.createElement('option');
      option.value = type;
      option.textContent = type;
      select.appendChild(option);
    }
    if (types.includes(current)) select.value = current;
  }

  async function loadInventory() {
    $('#ifaceStatus').textContent = 'Loading W3C Webref WebIDL master index…';
    const index = await fetchJson(WEBREF_INDEX);
    definitions = Object.entries(index).map(([name, meta]) => ({
      name,
      type: meta.type || 'unknown',
      parsed: meta.parsed || null,
      fragment: meta.fragment || null,
      runtime: findRuntime(name)
    })).sort((a, b) => a.name.localeCompare(b.name));
    refreshTypeOptions();
    renderDefinitions();
    const result = summary();
    $('#ifaceStatus').textContent = safe(result);
    log('WebIDL inventory loaded:', result);
    return result;
  }

  function filteredDefinitions() {
    const query = ($('#ifaceFilter')?.value || '').trim().toLowerCase();
    const type = $('#idlType')?.value || '';
    const mode = $('#ifaceMode')?.value || '';
    return definitions.filter(definition => {
      if (query && !`${definition.name} ${definition.type}`.toLowerCase().includes(query)) return false;
      if (type && definition.type !== type) return false;
      if (mode === 'global' && !definition.runtime.global) return false;
      if (mode === 'instance' && !definition.runtime.instance) return false;
      if (mode === 'runtime' && !(definition.runtime.global || definition.runtime.instance)) return false;
      if (mode === 'spec-only' && (definition.runtime.global || definition.runtime.instance)) return false;
      return true;
    });
  }

  function renderDefinitions() {
    const root = $('#ifaceResults');
    if (!root) return;
    const rows = filteredDefinitions();
    root.innerHTML = '';
    for (const definition of rows.slice(0, 1200)) {
      const card = document.createElement('article');
      card.className = 'cap';
      card.innerHTML = '<div class="category">W3C Webref WebIDL</div><h3></h3><div class="meta"></div><div class="line"><span class="status"></span><span class="policy safe"></span></div>';
      card.querySelector('h3').textContent = definition.name;
      const runtime = definition.runtime;
      card.querySelector('.meta').textContent = `${definition.type} • ${runtime.global ? 'Window/global exposed' : runtime.instance ? `instance @ ${runtime.instancePath}` : 'not exposed in this Window realm'}`;
      const status = card.querySelector('.status');
      status.textContent = runtime.global || runtime.instance ? '● runtime mapped' : '○ spec definition';
      status.classList.add(runtime.global || runtime.instance ? 'ok' : 'warn');
      card.querySelector('.policy').textContent = runtime.global || runtime.instance ? 'INSPECT/CALL LOCAL' : 'SPEC';
      const button = document.createElement('button');
      button.textContent = 'Inspect WebIDL';
      button.onclick = () => inspectDefinition(definition).catch(error => {
        $('#ifaceSelected').textContent = `${error.name}: ${error.message}`;
        log('WebIDL inspect error:', error.message);
      });
      card.appendChild(button);
      root.appendChild(card);
    }
    if (rows.length > 1200) {
      const note = document.createElement('p');
      note.className = 'mini';
      note.textContent = `Showing 1200 of ${rows.length}. Use search/type/runtime filters to narrow the standards inventory.`;
      root.appendChild(note);
    }
    $('#ifaceStatus').textContent = safe({ ...summary(), filteredDefinitions: rows.length });
  }

  function populateRuntimeControls(runtime) {
    const methodSelect = $('#ifaceMethod');
    const propertySelect = $('#ifaceProperty');
    if (methodSelect) methodSelect.innerHTML = '';
    if (propertySelect) propertySelect.innerHTML = '';
    if (!runtime) return;
    for (const member of runtime.staticMembers.filter(member => member.kind === 'method')) {
      const option = document.createElement('option');
      option.value = `static:${member.name}`;
      option.textContent = `static • ${member.name}`;
      methodSelect?.appendChild(option);
    }
    for (const member of runtime.prototypeMembers.filter(member => member.kind === 'method')) {
      const option = document.createElement('option');
      option.value = `instance:${member.name}`;
      option.textContent = `instance • ${member.name}`;
      methodSelect?.appendChild(option);
    }
    for (const member of unique([...runtime.staticMembers, ...runtime.prototypeMembers].filter(member => member.kind !== 'method').map(member => member.name))) {
      const option = document.createElement('option');
      option.value = member;
      option.textContent = member;
      propertySelect?.appendChild(option);
    }
  }

  async function inspectDefinition(definition) {
    selectedDefinition = definition;
    selectedRuntime = findRuntime(definition.name);
    let parsed = null;
    if (definition.parsed) parsed = await fetchJson(`${WEBREF_PARSED_BASE}${definition.parsed}`);
    selectedParsed = parsed;
    const idlInfo = parsed ? parseIdl(parsed) : { fragments: [], exposures: [], secureContext: false, attributes: [], operations: [], constructors: [], includes: [], iterable: [], specs: [], specUrls: [] };
    const comparison = runtimeComparison(idlInfo, selectedRuntime);
    const sourcePath = selectedRuntime.instancePath || '';
    $('#ifaceGlobal').value = selectedRuntime.global ? definition.name : '';
    $('#ifaceInstancePath').value = sourcePath;
    populateRuntimeControls(selectedRuntime);
    $('#ifaceSelected').textContent = safe({
      definition: { name: definition.name, type: definition.type, parsed: definition.parsed, fragment: definition.fragment },
      webidl: {
        exposed: idlInfo.exposures,
        secureContext: idlInfo.secureContext,
        constructors: idlInfo.constructors,
        attributes: idlInfo.attributes,
        operations: idlInfo.operations,
        includes: idlInfo.includes,
        iterable: idlInfo.iterable,
        specs: idlInfo.specs,
        specUrls: idlInfo.specUrls
      },
      runtime: selectedRuntime,
      comparison,
      rawFragments: idlInfo.fragments
    });
    $('#ifaceCallResult').textContent = `Selected ${definition.name}. ${comparison.missingFromRuntime.length} WebIDL member(s) are not exposed on the mapped runtime object in this browser.`;
    log('WebIDL definition inspected:', definition.name, { type: definition.type, exposures: idlInfo.exposures, missingFromRuntime: comparison.missingFromRuntime.length });
  }

  function runtimeTarget(scope) {
    if (!selectedDefinition || !selectedRuntime) throw new Error('Inspect a WebIDL definition first.');
    if (scope === 'static') {
      if (!(selectedDefinition.name in globalThis)) throw new Error(`${selectedDefinition.name} is not a runtime global.`);
      return globalThis[selectedDefinition.name];
    }
    const override = ($('#ifaceInstancePath')?.value || '').trim();
    if (override) return resolvePath(override);
    if (selectedRuntime.instancePath) return resolvePath(selectedRuntime.instancePath);
    throw new Error('No runtime instance is mapped. Enter an existing instance path or use a dedicated API test that creates the required object.');
  }

  async function callSelectedMethod() {
    const value = $('#ifaceMethod')?.value;
    if (!value) throw new Error('No runtime method is available for this selected definition.');
    const args = JSON.parse($('#ifaceArgs')?.value || '[]');
    if (!Array.isArray(args)) throw new Error('Arguments must be a JSON array.');
    const [scope, method] = value.split(':');
    const target = runtimeTarget(scope);
    if (typeof target?.[method] !== 'function') throw new Error(`${method} is not callable on the selected runtime target.`);
    let result = target[method](...args);
    if (result && typeof result.then === 'function') result = await result;
    $('#ifaceCallResult').textContent = safe(result);
    log('Local WebIDL runtime call:', `${selectedDefinition.name}.${method}`, result);
    return result;
  }

  function readSelectedProperty() {
    const property = $('#ifaceProperty')?.value;
    if (!property) throw new Error('No readable runtime property is available for this definition.');
    let target = null;
    const override = ($('#ifaceInstancePath')?.value || '').trim();
    if (override) target = resolvePath(override);
    else if (selectedRuntime?.instancePath) target = resolvePath(selectedRuntime.instancePath);
    else if (selectedDefinition?.name in globalThis) target = globalThis[selectedDefinition.name];
    if (!target) throw new Error('No runtime target is available.');
    const value = target[property];
    $('#ifaceCallResult').textContent = safe({ property, value });
    log('Local WebIDL property read:', `${selectedDefinition.name}.${property}`, value);
    return value;
  }

  function constructSelected() {
    if (!selectedDefinition) throw new Error('Inspect a WebIDL definition first.');
    const Constructor = globalThis[selectedDefinition.name];
    if (typeof Constructor !== 'function') throw new Error(`${selectedDefinition.name} is not a constructor function in this browser.`);
    const args = JSON.parse($('#ifaceArgs')?.value || '[]');
    if (!Array.isArray(args)) throw new Error('Arguments must be a JSON array.');
    let instance;
    try { instance = Reflect.construct(Constructor, args); }
    catch (error) { throw new Error(`Construction failed: ${error.name}: ${error.message}`); }
    const result = { constructor: instance?.constructor?.name || selectedDefinition.name, members: ownAndPrototypeMembers(instance, 6) };
    $('#ifaceCallResult').textContent = safe(result);
    log('Local WebIDL construction:', selectedDefinition.name, result);
    return instance;
  }

  function exportInventory() {
    const compact = definitions.map(definition => ({
      name: definition.name,
      type: definition.type,
      parsed: definition.parsed,
      fragment: definition.fragment,
      runtimeGlobal: definition.runtime.global,
      runtimeInstance: definition.runtime.instance,
      instancePath: definition.runtime.instancePath
    }));
    const blob = new Blob([JSON.stringify({ summary: summary(), definitions: compact }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `super-api-webidl-${Date.now()}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function buildPanel() {
    if ($('#interfaceHarnessPanel')) return;
    const panel = document.createElement('section');
    panel.id = 'interfaceHarnessPanel';
    panel.className = 'panel';
    panel.innerHTML = `
      <h2>Standards WebIDL inventory</h2>
      <p class="mini">Loads W3C Webref's generated WebIDL master index, which includes interfaces, partial-interface targets, mixins, dictionaries, enums, callbacks, namespaces and typedefs even when MDN does not have a separate page. It then maps definitions to the actual runtime objects exposed by this browser.</p>
      <div class="row">
        <button id="ifaceLoad" class="primary">Load complete WebIDL index</button>
        <button id="ifaceExport">Export inventory JSON</button>
        <input id="ifaceFilter" class="grow" placeholder="Search WebIDL name/type…">
        <select id="idlType"><option value="">All WebIDL types</option></select>
        <select id="ifaceMode">
          <option value="">All definitions</option>
          <option value="runtime">Runtime mapped</option>
          <option value="global">Window/global exposed</option>
          <option value="instance">Known instance mapped</option>
          <option value="spec-only">Specification only in this realm</option>
        </select>
      </div>
      <pre id="ifaceStatus">Not loaded.</pre>
      <details open>
        <summary>Selected WebIDL definition + local runtime runner</summary>
        <div class="grid">
          <label>Selected global<input id="ifaceGlobal" class="grow" readonly></label>
          <label>Runtime method<select id="ifaceMethod" class="grow"></select></label>
          <label>Runtime property<select id="ifaceProperty" class="grow"></select></label>
          <label>Existing instance path<input id="ifaceInstancePath" class="grow" placeholder="navigator.storage / document / ..."></label>
          <label>Arguments JSON array<input id="ifaceArgs" class="grow" value="[]"></label>
        </div>
        <div class="row" style="margin-top:8px">
          <button id="ifaceCall" class="primary">Call method locally</button>
          <button id="ifaceRead">Read property locally</button>
          <button id="ifaceConstruct">Construct locally</button>
        </div>
        <p class="mini">Generic invocation remains local. The paired peer receives explicit test actions and standards/runtime summaries after the single session authorization; this does not bypass browser/OS permission or trusted-user-activation rules.</p>
        <pre id="ifaceSelected">No WebIDL definition selected.</pre>
        <pre id="ifaceCallResult">No call yet.</pre>
      </details>
      <div id="ifaceResults" class="cap-grid"></div>`;
    const mdn = $('#mdnLivePanel');
    const realms = $('#realmScannerPanel');
    const runtime = $('#runtimeSurfacePanel');
    const media = $('#localVideo')?.closest('section.panel');
    if (mdn) mdn.before(panel);
    else if (realms) realms.before(panel);
    else if (runtime) runtime.before(panel);
    else if (media) media.before(panel);
    else document.querySelector('main')?.append(panel);

    $('#ifaceLoad').onclick = () => loadInventory().catch(error => {
      $('#ifaceStatus').textContent = `${error.name}: ${error.message}`;
      log('WebIDL inventory error:', error.message);
    });
    $('#ifaceExport').onclick = exportInventory;
    $('#ifaceFilter').addEventListener('input', renderDefinitions);
    $('#idlType').addEventListener('change', renderDefinitions);
    $('#ifaceMode').addEventListener('change', renderDefinitions);
    $('#ifaceCall').onclick = () => callSelectedMethod().catch(error => {
      $('#ifaceCallResult').textContent = `${error.name}: ${error.message}`;
      log('Local WebIDL call error:', error.message);
    });
    $('#ifaceRead').onclick = () => {
      try { readSelectedProperty(); }
      catch (error) { $('#ifaceCallResult').textContent = `${error.name}: ${error.message}`; log('Local WebIDL property error:', error.message); }
    };
    $('#ifaceConstruct').onclick = () => {
      try { constructSelected(); }
      catch (error) { $('#ifaceCallResult').textContent = `${error.name}: ${error.message}`; log('Local WebIDL construction error:', error.message); }
    };
  }

  function installPeerSummary() {
    const previous = window.SUPER_API_EXT_HANDLE;
    window.SUPER_API_EXT_HANDLE = async (channel, message) => {
      if (message?.action !== 'ext:interface-harness-summary') return typeof previous === 'function' ? previous(channel, message) : undefined;
      const send = payload => {
        try { if (channel?.readyState === 'open') channel.send(JSON.stringify(payload)); } catch {}
      };
      const host = $('#hostBtn')?.classList.contains('primary') && !$('#controllerBtn')?.classList.contains('primary');
      if (!host) return send({ type: 'error', action: message.action, id: message.id, error: 'This peer is not in Controlled peer mode.' });
      if (!$('#allowRequests')?.checked) return send({ type: 'error', action: message.action, id: message.id, error: 'Single session authorization is OFF on the controlled peer.' });
      try {
        if (!definitions.length) await loadInventory();
        send({ type: 'result', action: message.action, id: message.id, result: summary() });
      } catch (error) {
        send({ type: 'error', action: message.action, id: message.id, error: `${error.name}: ${error.message}` });
      }
    };
    const select = $('#remoteAction');
    if (select && ![...select.options].some(option => option.value === 'ext:interface-harness-summary')) {
      const option = document.createElement('option');
      option.value = 'ext:interface-harness-summary';
      option.textContent = 'SESSION • WebIDL standards coverage summary';
      select.appendChild(option);
    }
  }

  buildPanel();
  installPeerSummary();
  setTimeout(installPeerSummary, 500);
})();