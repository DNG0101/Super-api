const targetUrl = process.argv[2] || 'http://127.0.0.1:8765/index.html';
const port = Number(process.argv[3] || 9222);
const deadline = ms => new Promise((_, reject) => setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms));

async function getTarget() {
  for (let i = 0; i < 40; i++) {
    try {
      const rows = await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json());
      const page = rows.find(x => x.type === 'page');
      if (page?.webSocketDebuggerUrl) return page;
    } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('Chrome DevTools target was not available');
}

const target = await getTarget();
const ws = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
const exceptions = [];
const network = new Map();
let seq = 0;

function failPending(error) {
  for (const {reject, timer} of pending.values()) {
    clearTimeout(timer);
    reject(error);
  }
  pending.clear();
}

ws.addEventListener('close', () => failPending(new Error('CDP socket closed')));
ws.addEventListener('error', () => failPending(new Error('CDP socket error')));
ws.addEventListener('message', event => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const item = pending.get(msg.id);
    pending.delete(msg.id);
    clearTimeout(item.timer);
    if (msg.error) item.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
    else item.resolve(msg.result);
    return;
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params?.exceptionDetails;
    exceptions.push({
      text: d?.text || 'Runtime exception',
      url: d?.url || '',
      line: d?.lineNumber ?? null,
      column: d?.columnNumber ?? null,
      description: d?.exception?.description || d?.exception?.value || ''
    });
    return;
  }
  if (msg.method === 'Network.requestWillBeSent') {
    const p = msg.params;
    network.set(p.requestId, {url:p.request?.url || '', type:p.type || '', started:true, finished:false, failed:false});
    return;
  }
  if (msg.method === 'Network.loadingFinished') {
    const item = network.get(msg.params?.requestId);
    if (item) item.finished = true;
    return;
  }
  if (msg.method === 'Network.loadingFailed') {
    const item = network.get(msg.params?.requestId);
    if (item) { item.finished = true; item.failed = true; item.errorText = msg.params?.errorText || ''; }
  }
});

await Promise.race([
  new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, {once:true});
    ws.addEventListener('error', () => reject(new Error('Could not open CDP socket')), {once:true});
  }),
  deadline(5000)
]);

function send(method, params = {}, timeout = 5000) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`${method} did not respond within ${timeout}ms`));
    }, timeout);
    pending.set(id, {resolve, reject, timer});
    ws.send(JSON.stringify({id, method, params}));
  });
}

async function evaluate(expression, {awaitPromise = false, timeout = 5000} = {}) {
  const response = await send('Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true,
    userGesture: false
  }, timeout);
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text || 'Evaluation failed');
  return response.result?.value;
}

try {
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  network.clear();
  await send('Page.navigate', {url: targetUrl});

  let state = null;
  const started = Date.now();
  while (Date.now() - started < 12000) {
    try {
      state = await evaluate(`(() => ({
        readyState: document.readyState,
        title: document.title,
        bodyChildren: document.body?.children?.length || 0,
        allowRequests: !!document.querySelector('#allowRequests'),
        catalog: !!document.querySelector('#catalog'),
        extensionPanel: !!document.querySelector('#extPanel'),
        sessionBootstrap: !!document.querySelector('#sessionBootstrapPanel'),
        runtimeSurface: !!document.querySelector('#runtimeSurfacePanel'),
        emergingApis: !!document.querySelector('#emergingApisPanel'),
        realmScanner: !!document.querySelector('#realmScannerPanel'),
        mdnLive: !!document.querySelector('#mdnLivePanel'),
        interfaceHarness: !!document.querySelector('#interfaceHarnessPanel'),
        latestPlatform: !!document.querySelector('#latestPlatformPanel'),
        capabilityOs: !!document.querySelector('#capabilityOsPanel'),
        activityLog: document.querySelector('#log')?.textContent?.slice(0, 120) || '',
        scripts: document.scripts.length
      }))()`, {timeout: 2000});
      const required = state && ['allowRequests','catalog','extensionPanel','sessionBootstrap','runtimeSurface','emergingApis','realmScanner','mdnLive','interfaceHarness','latestPlatform','capabilityOs'].every(k => state[k]);
      if (required && (state.readyState === 'interactive' || state.readyState === 'complete')) break;
    } catch {}
    await new Promise(r => setTimeout(r, 200));
  }

  if (!state) throw new Error('Production page never became queryable');
  for (const key of ['allowRequests','catalog','extensionPanel','sessionBootstrap','runtimeSurface','emergingApis','realmScanner','mdnLive','interfaceHarness','latestPlatform','capabilityOs']) {
    if (!state[key]) throw new Error(`Required production UI missing: ${key}; state=${JSON.stringify(state)}`);
  }
  if (!['interactive','complete'].includes(state.readyState)) throw new Error(`Document did not become usable: ${state.readyState}`);

  const pong = await evaluate(`new Promise(resolve => setTimeout(() => resolve({pong:true, now:performance.now(), hidden:document.hidden}), 50))`, {awaitPromise:true, timeout:3000});
  if (!pong?.pong) throw new Error('Main thread responsiveness probe failed');

  const capability = await evaluate(`(() => ({
    os: !!window.SuperApiCapabilityOS,
    health: window.SuperApiCapabilityOS?.health?.() || null,
    remoteActions: document.querySelector('#remoteAction')?.options?.length || 0,
    catalogCards: document.querySelectorAll('#catalog .cap').length,
    runtimeAutoScanned: document.querySelector('#runtimeSummary')?.textContent?.includes('Not scanned') === false
  }))()`, {timeout:3000});
  if (!capability?.os) throw new Error('Capability OS global did not initialize');
  if (!capability.health?.eventDriven) throw new Error('Capability OS is not using the event-driven runtime');
  if (capability.runtimeAutoScanned) throw new Error('Exhaustive runtime reflection still ran automatically during startup');

  if (exceptions.length) throw new Error(`Uncaught runtime exception(s): ${JSON.stringify(exceptions.slice(0,5))}`);

  const pendingNetwork = [...network.values()].filter(x => !x.finished).map(({url,type}) => ({url,type}));
  const failedNetwork = [...network.values()].filter(x => x.failed).map(({url,type,errorText}) => ({url,type,errorText}));
  const output = {
    status: 'PRODUCTION_BROWSER_PASS',
    targetUrl,
    state,
    responsiveness: pong,
    capability,
    exceptions: exceptions.length,
    pendingNetwork,
    failedNetwork
  };
  console.log(JSON.stringify(output, null, 2));
} finally {
  try { ws.close(); } catch {}
}
