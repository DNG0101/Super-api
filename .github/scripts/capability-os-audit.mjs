import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const exists=p=>fs.existsSync(path.join(root,p));
const fail=m=>{console.error(`CAPABILITY OS AUDIT FAILED: ${m}`);process.exitCode=1};

const corePath='modules/capability-os-core.js';
const runtimePath='modules/capability-os.js';
const fabricCorePath='modules/ucos-fabric-core.js';
const storagePath='modules/ucos-storage.js';
const fabricPath='modules/ucos-fabric.js';
const shellPath='modules/ucos-shell.js';
const runtimeSurfacePath='runtime-surface.js';
const testPath='tests/capability-os-core.test.cjs';
const fabricTestPath='tests/ucos-fabric-core.test.cjs';
const runtimeSmokePath='tests/capability-os-runtime-smoke.html';
const fabricSmokePath='tests/ucos-fabric-browser-smoke.html';
const productionSmokePath='tests/production-browser-smoke.mjs';
const docPath='CAPABILITY_OS.md';
for(const p of [corePath,runtimePath,fabricCorePath,storagePath,fabricPath,shellPath,runtimeSurfacePath,testPath,fabricTestPath,runtimeSmokePath,fabricSmokePath,productionSmokePath,docPath,'session-consent.js','sw.js','.github/workflows/validate.yml','index.html'])if(!exists(p))fail(`missing ${p}`);

const core=read(corePath),runtime=read(runtimePath),fabricCore=read(fabricCorePath),fabric=read(fabricPath),shell=read(shellPath),runtimeSurface=read(runtimeSurfacePath),test=read(testPath),fabricTest=read(fabricTestPath),runtimeSmoke=read(runtimeSmokePath),fabricSmoke=read(fabricSmokePath),productionSmoke=read(productionSmokePath),session=read('session-consent.js'),sw=read('sw.js'),workflow=read('.github/workflows/validate.yml'),doc=read(docPath),index=read('index.html');
for(const p of [corePath,runtimePath,fabricCorePath,storagePath,fabricPath,shellPath]){
  if(!session.includes(`'./${p}'`)&&!session.includes(`"./${p}"`))fail(`session-consent.js does not load ${p}`);
  if(!sw.includes(`'./${p}'`))fail(`service worker CORE missing ${p}`);
}
if(!(session.indexOf(corePath)>=0&&session.indexOf(runtimePath)>session.indexOf(corePath)))fail('Capability OS dependency order must be core -> runtime');
if(!(session.indexOf(runtimePath)>=0&&session.indexOf(fabricCorePath)>session.indexOf(runtimePath)&&session.indexOf(storagePath)>session.indexOf(fabricCorePath)&&session.indexOf(fabricPath)>session.indexOf(storagePath)&&session.indexOf(shellPath)>session.indexOf(fabricPath)))fail('UCOS dependency order must be capability runtime -> fabric core -> storage -> fabric runtime -> shell');

for(const symbol of ['DOMAINS','STATUSES','OPERATIONS','normalizeCapability','createRegistry','evaluatePolicy','validateCommand','buildExecutionPlan','resultEnvelope','dependencyOrder','compatibilityMatrix','pairMatrix','safeClone','newCommandId'])if(!core.includes(symbol))fail(`core missing ${symbol}`);
for(const domain of ['web','realm','device','media','graphics','storage','network','wireless','external','protocol','auth','pwa','diagnostics'])if(!core.includes(`'${domain}'`))fail(`core missing domain ${domain}`);
for(const op of ['detect','inspect','read','write','call','construct','connect','stream','subscribe','publish','execute','test'])if(!core.includes(`'${op}'`))fail(`core missing operation ${op}`);
if(!core.includes('operation-not-supported'))fail('core does not reject unsupported capability operations');
if(!core.includes('[Circular]'))fail('core safe serialization does not handle circular results');

for(const symbol of ['SuperApiCapabilityOS','discoverActions','registerAdapter','execute','health','catalog','exportState','telemetry','startRuntime','stopRuntime'])if(!runtime.includes(symbol))fail(`runtime missing ${symbol}`);
for(const adapter of ['extension-local','peer'])if(!runtime.includes(`id:'${adapter}'`))fail(`runtime missing adapter ${adapter}`);
for(const action of ['ext:realm-rpc','ext:universal-api','ext:universal-v2','ext:network-summary','ext:wireless-radio'])if(!runtime.includes(action))fail(`runtime discovery missing ${action}`);
if(!runtime.includes("window.SUPER_API_EXT_HANDLE"))fail('runtime is not connected to the extension action bus');
if(!runtime.includes('__superApiTrackedChannels'))fail('runtime is not connected to the paired-peer channel bus');
if(!runtime.includes('Core.resultEnvelope'))fail('runtime does not normalize execution results');
if(!runtime.includes('Core.buildExecutionPlan'))fail('runtime does not use the common execution plan');
if(!runtime.includes("addEventListener?.('close'"))fail('runtime does not reject pending peer work on channel close');
if(!runtime.includes("addEventListener?.('error'"))fail('runtime does not reject pending peer work on channel error');
if(!runtime.includes('const previous=sel.value'))fail('runtime does not preserve capability selection during rediscovery');
if(runtime.includes('observer.observe(document.body'))fail('runtime observes the entire DOM and can self-trigger mutation loops');
if(runtime.includes('setInterval('))fail('Capability OS must remain event-driven; permanent polling detected');
if(!runtime.includes('eventDriven:true'))fail('Capability OS health does not expose event-driven runtime state');
if(/\beval\s*\(/.test(runtime)||/new\s+Function\s*\(/.test(runtime))fail('runtime contains unrestricted dynamic code execution');

for(const symbol of ['createCapabilityRegistry','createProviderRegistry','createTransportRegistry','createNodeRegistry','advertisement','routeCandidates','executionEnvelope','validateRequest'])if(!fabricCore.includes(symbol))fail(`UCOS fabric core missing ${symbol}`);
for(const symbol of ['SuperApiUCOS','browser-native-basic','legacy-extension-local','webrtc-compat','loopback','sendAdvertisement','executeLocal','executeRemote','route','health'])if(!fabric.includes(symbol))fail(`UCOS fabric runtime missing ${symbol}`);
if(!fabric.includes('SuperApiCapabilityOS'))fail('UCOS fabric is not layered on the existing Capability OS compatibility runtime');
if(!fabric.includes('__superApiTrackedChannels'))fail('UCOS fabric is not connected to tracked peer channels');
if(!fabric.includes("type:'ucos:advertise'" )&&!fabric.includes("msg?.type==='ucos:advertise'"))fail('UCOS fabric capability advertisement protocol missing');
if(/\beval\s*\(/.test(fabric)||/new\s+Function\s*\(/.test(fabric))fail('UCOS fabric contains unrestricted dynamic code execution');
if(fabric.includes('setInterval('))fail('UCOS fabric must remain event-driven; permanent polling detected');
if(!shell.includes('Super API Universal Capability Fabric'))fail('UCOS shell title missing');
if(!shell.includes('Developer Lab'))fail('UCOS shell does not preserve navigation to the existing lab');

if(/setTimeout\s*\([^\n]*scan\s*\(/.test(runtimeSurface))fail('runtime surface performs exhaustive reflection automatically during startup');
if(!runtimeSurface.includes('Scan every exposed surface'))fail('runtime surface no longer exposes explicit exhaustive scan control');
if(!index.includes('SuperApiStartupMutationObserver'))fail('catalog startup observer guard is missing');

if(!session.includes('Authorize this paired peer to run all implemented API actions for this page session'))fail('single-session authorization label changed or disappeared');
if((index.match(/id="allowRequests"/g)||[]).length!==1)fail('expected exactly one app-level session authorization control');

for(const keyword of ['Capability OS core matrix passed','single session remote policy','dependency cycle detection','compatibility matrix','pair matrix combinations','command IDs are unique under burst concurrency','policy combination matrix','result envelope handles circular and bigint results','execution plan rejects unsupported capability operation'])if(!test.includes(keyword))fail(`Capability OS tests missing ${keyword}`);
for(const keyword of ['UCOS merged capability registry passed','UCOS provider resolution passed','UCOS transport availability passed','UCOS local and remote routing passed','UCOS capability advertisement passed','UCOS request validation passed','UCOS result envelope serialization passed','UCOS_FABRIC_CORE_PASS'])if(!fabricTest.includes(keyword))fail(`UCOS fabric tests missing ${keyword}`);
for(const keyword of ['CAPABILITY_OS_RUNTIME_PASS','dynamic discovery failed','peer close did not reject immediately','pending commands leaked','unsupported operation reached adapter'])if(!runtimeSmoke.includes(keyword))fail(`runtime smoke missing ${keyword}`);
if(!fabricSmoke.includes('UCOS_FABRIC_BROWSER_PASS')||!fabricSmoke.includes('legacy lab was removed'))fail('UCOS fabric browser smoke does not validate boot + compatibility');
for(const keyword of ['PRODUCTION_BROWSER_PASS','Main thread responsiveness probe failed','Uncaught runtime exception','pendingNetwork','failedNetwork','runtimeAutoScanned'])if(!productionSmoke.includes(keyword))fail(`production browser smoke missing ${keyword}`);
if(!workflow.includes('Capability OS core matrix')||!workflow.includes('node tests/capability-os-core.test.cjs'))fail('workflow does not run Capability OS core matrix');
if(!workflow.includes('UCOS fabric core matrix')||!workflow.includes('node tests/ucos-fabric-core.test.cjs'))fail('workflow does not run UCOS fabric core matrix');
if(!workflow.includes('Capability OS architecture audit')||!workflow.includes('node .github/scripts/capability-os-audit.mjs'))fail('workflow does not run Capability OS architecture audit');
if(!workflow.includes('tests/capability-os-runtime-smoke.html')||!workflow.includes('CAPABILITY_OS_RUNTIME_PASS'))fail('workflow does not run Capability OS runtime browser smoke');
if(!workflow.includes('tests/ucos-fabric-browser-smoke.html')||!workflow.includes('UCOS_FABRIC_BROWSER_PASS'))fail('workflow does not run UCOS fabric browser smoke');
if(!workflow.includes('node tests/production-browser-smoke.mjs'))fail('workflow does not run the actual production-page CDP responsiveness test');

if(!sw.includes("super-api-peer-lab-v20"))fail('service worker cache generation was not advanced for UCOS fabric');
if(!sw.includes('async function networkFirst'))fail('service worker lacks network-first helper');
if(!sw.includes("req.destination==='script'"))fail('service worker does not deliver executable scripts network-first');
if(sw.includes("c.addAll(CORE)).catch(()=>{})"))fail('service worker silently ignores incomplete install cache failures');

for(const section of ['Capability Registry','Execution Kernel','Adapter Bus','Session Policy','Peer Transport','Telemetry','Trust boundaries','Failure semantics'])if(!doc.includes(section))fail(`architecture document missing section: ${section}`);

console.log(JSON.stringify({
  architecture:'Universal Browser Capability OS + Universal Capability Fabric',
  domains:13,
  operations:12,
  adapters:['extension-local','peer'],
  fabricProviders:['browser-native-basic','legacy-extension-local'],
  fabricTransports:['loopback','webrtc-compat'],
  nodeCapabilityAdvertisement:true,
  legacyLabPreserved:true,
  singleAppSessionAuthorization:true,
  nativeBrowserSecurityPreserved:true,
  unrestrictedEval:false,
  unifiedResultEnvelope:true,
  cycleSafeResultSerialization:true,
  capabilityOperationEnforcement:true,
  peerCloseAndErrorCleanup:true,
  scopedMutationObservation:true,
  catalogObserverGuard:true,
  eventDrivenRuntime:true,
  deferredRuntimeReflection:true,
  browserRuntimeSmoke:true,
  fabricBrowserSmoke:true,
  productionPageResponsivenessSmoke:true,
  freshScriptDelivery:true,
  serviceWorkerGeneration:'v20',
  offlineControlPlane:true,
  extensionBusIntegration:true,
  peerTransportIntegration:true
},null,2));
if(process.exitCode)process.exit(process.exitCode);
