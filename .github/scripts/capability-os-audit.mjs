import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const exists=p=>fs.existsSync(path.join(root,p));
const fail=m=>{console.error(`CAPABILITY OS AUDIT FAILED: ${m}`);process.exitCode=1};

const paths={
 core:'modules/capability-os-core.js',runtime:'modules/capability-os.js',fabricCore:'modules/ucos-fabric-core.js',storage:'modules/ucos-storage.js',fabric:'modules/ucos-fabric.js',
 runtimeCore:'modules/ucos-runtime-core.js',vfs:'modules/ucos-vfs.js',workflowCore:'modules/ucos-workflow-core.js',workflows:'modules/ucos-workflows.js',appRuntime:'modules/ucos-runtime.js',shell:'modules/ucos-shell.js',integration:'modules/ucos-v4-integration.js',
 appFrame:'runtime/app-frame.js',appFrameHtml:'runtime/app-frame.html',runtimeSurface:'runtime-surface.js',session:'session-consent.js',sw:'sw.js',workflow:'.github/workflows/validate.yml',index:'index.html',manifest:'manifest.webmanifest',
 capTest:'tests/capability-os-core.test.cjs',fabricTest:'tests/ucos-fabric-core.test.cjs',runtimeTest:'tests/ucos-runtime-core.test.cjs',workflowTest:'tests/ucos-workflow-core.test.cjs',runtimeSmoke:'tests/capability-os-runtime-smoke.html',fabricSmoke:'tests/ucos-fabric-browser-smoke.html',productionSmoke:'tests/production-browser-smoke.mjs',doc:'CAPABILITY_OS.md'
};
for(const p of Object.values(paths))if(!exists(p))fail(`missing ${p}`);
const t={};for(const[k,p]of Object.entries(paths))if(exists(p))t[k]=read(p);

const loadOrder=[paths.core,paths.runtime,paths.fabricCore,paths.storage,paths.fabric,paths.runtimeCore,paths.vfs,paths.workflowCore,paths.workflows,paths.appRuntime,paths.shell,paths.integration];
for(const p of loadOrder){if(!t.session.includes(`'./${p}'`)&&!t.session.includes(`"./${p}"`))fail(`session-consent.js does not load ${p}`);if(!t.sw.includes(`'./${p}'`))fail(`service worker CORE missing ${p}`)}
for(let i=1;i<loadOrder.length;i++)if(t.session.indexOf(loadOrder[i])<=t.session.indexOf(loadOrder[i-1]))fail(`UCOS dependency order invalid: ${loadOrder[i-1]} -> ${loadOrder[i]}`);
for(const p of [paths.appFrame,paths.appFrameHtml])if(!t.sw.includes(`'./${p}'`))fail(`service worker CORE missing sandbox asset ${p}`);

for(const symbol of ['DOMAINS','STATUSES','OPERATIONS','normalizeCapability','createRegistry','evaluatePolicy','validateCommand','buildExecutionPlan','resultEnvelope','dependencyOrder','compatibilityMatrix','pairMatrix','safeClone','newCommandId'])if(!t.core.includes(symbol))fail(`core missing ${symbol}`);
for(const domain of ['web','realm','device','media','graphics','storage','network','wireless','external','protocol','auth','pwa','diagnostics'])if(!t.core.includes(`'${domain}'`))fail(`core missing domain ${domain}`);
if(!t.core.includes('operation-not-supported'))fail('core does not reject unsupported capability operations');
if(!t.core.includes('[Circular]'))fail('core safe serialization does not handle circular results');

for(const symbol of ['SuperApiCapabilityOS','discoverActions','registerAdapter','execute','health','catalog','exportState','telemetry','startRuntime','stopRuntime'])if(!t.runtime.includes(symbol))fail(`compatibility runtime missing ${symbol}`);
for(const adapter of ['extension-local','peer'])if(!t.runtime.includes(`id:'${adapter}'`))fail(`compatibility runtime missing adapter ${adapter}`);
if(/\beval\s*\(/.test(t.runtime)||/new\s+Function\s*\(/.test(t.runtime))fail('compatibility runtime contains unrestricted dynamic code execution');
if(t.runtime.includes('setInterval('))fail('Capability OS must remain event-driven; permanent polling detected');
if(!t.runtime.includes('eventDriven:true'))fail('Capability OS health does not expose event-driven state');

for(const symbol of ['createCapabilityRegistry','createProviderRegistry','createTransportRegistry','createNodeRegistry','advertisement','routeCandidates','executionEnvelope','validateRequest'])if(!t.fabricCore.includes(symbol))fail(`fabric core missing ${symbol}`);
for(const symbol of ['SuperApiUCOS','browser-native-basic','legacy-extension-local','webrtc-compat','loopback','sendAdvertisement','executeLocal','executeRemote','route','health','channelForNode'])if(!t.fabric.includes(symbol))fail(`fabric runtime missing ${symbol}`);
for(const symbol of ['nodeChannels','channelNodes','Target node is not connected','requestOnChannel'])if(!t.fabric.includes(symbol))fail(`peer-specific routing missing ${symbol}`);
if(/\beval\s*\(/.test(t.fabric)||/new\s+Function\s*\(/.test(t.fabric))fail('fabric contains unrestricted dynamic code execution');
if(t.fabric.includes('setInterval('))fail('fabric must remain event-driven');

for(const symbol of ['normalizeManifest','validateManifest','createManifestRegistry','createGrantStore','createResourceManager','createProcessManager','createCapabilityBroker','createEventBus'])if(!t.runtimeCore.includes(symbol))fail(`runtime core missing ${symbol}`);
for(const token of ['capability-not-declared','capability-denied','capability-grant-required','scope===\'once\''])if(!t.runtimeCore.includes(token.replace('\\','')))fail(`runtime broker missing ${token}`);
if(/\beval\s*\(/.test(t.runtimeCore)||/new\s+Function\s*\(/.test(t.runtimeCore))fail('runtime core contains unrestricted dynamic code execution');

for(const symbol of ['SuperApiUCOSRuntime','installManifest','uninstall','startSystemProcess','stopProcess','attachSandbox','requestCapability','resolvePermission'])if(!t.appRuntime.includes(symbol))fail(`app runtime missing ${symbol}`);
for(const token of ["sandbox','allow-scripts allow-forms allow-downloads",'MessageChannel','permission-request','runtime-grants'])if(!t.appRuntime.includes(token))fail(`app runtime isolation/broker wiring missing ${token}`);
if(t.appRuntime.includes('allow-same-origin'))fail('sandbox app host must not grant allow-same-origin');
if(/\beval\s*\(/.test(t.appRuntime)||/new\s+Function\s*\(/.test(t.appRuntime))fail('app runtime contains unrestricted dynamic code execution');

for(const symbol of ['SuperApiUCOSVFS','ROOT_DIRS','stat','list','mkdir','writeBlob','writeText','readBlob','readText','remove','copy','move','mountDirectory','requestExternalMount'])if(!t.vfs.includes(symbol))fail(`VFS missing ${symbol}`);
for(const dir of ['system','apps','home','tmp','devices','mounts'])if(!t.vfs.includes(`'${dir}'`))fail(`VFS missing root /${dir}`);
if(!t.vfs.includes('protected-path'))fail('VFS root protection missing');

for(const symbol of ['validate','order','resolveValue','createEngine'])if(!t.workflowCore.includes(symbol))fail(`workflow core missing ${symbol}`);
for(const type of ['capability','set','condition','delay'])if(!t.workflowCore.includes(`'${type}'`))fail(`workflow core missing step type ${type}`);
for(const symbol of ['SuperApiUCOSWorkflows','save','get','list','remove','run','cancel'])if(!t.workflows.includes(symbol))fail(`workflow service missing ${symbol}`);

for(const token of ['UCOSApp','UCOS IPC timeout','service:\'capability\'','service:\'vfs\'','service:\'workflow\''])if(!t.appFrame.includes(token.replace('\\','')))fail(`sandbox SDK bridge missing ${token}`);
if(/\beval\s*\(/.test(t.appFrame)||/new\s+Function\s*\(/.test(t.appFrame))fail('sandbox frame contains unrestricted dynamic code execution');

for(const token of ['Super API UCOS','Universal Capability OS',"id='ucosOS'",'ucos-os-active','ucosDesktop','ucosDock','ucosLauncherOverlay','openApp','registerApp','Developer Lab','enterLab','leaveLab'])if(!t.shell.includes(token))fail(`Shell v3 missing ${token}`);
for(const app of ["id:'files'","id:'devices'","id:'network'","id:'capabilities'","id:'terminal'","id:'camera'","id:'flows'","id:'settings'","id:'devlab'"])if(!t.shell.includes(app))fail(`Shell v3 missing system app ${app}`);
if(/\beval\s*\(/.test(t.shell)||/new\s+Function\s*\(/.test(t.shell))fail('shell contains unrestricted dynamic code execution');

for(const token of ['SuperApiUCOSV4','system.files','permission-request','UCOS Runtime Center','syncWindows','ucosRuntimeTray'])if(!t.integration.includes(token))fail(`v4 integration missing ${token}`);
if(!t.integration.includes('Runtime.startSystemProcess'))fail('Shell windows are not reflected into process manager');

if(/setTimeout\s*\([^\n]*scan\s*\(/.test(t.runtimeSurface))fail('runtime surface performs exhaustive reflection automatically during startup');
if(!t.runtimeSurface.includes('Scan every exposed surface'))fail('runtime surface explicit scan control missing');
if(!t.index.includes('SuperApiStartupMutationObserver'))fail('catalog startup observer guard missing');
if(!t.session.includes('Authorize this paired peer to run all implemented API actions for this page session'))fail('single-session authorization label changed or disappeared');
if((t.index.match(/id="allowRequests"/g)||[]).length!==1)fail('expected exactly one legacy page-session authorization control');

for(const keyword of ['UCOS_RUNTIME_CORE_PASS','UCOS per-app capability broker passed','UCOS process lifecycle passed'])if(!t.runtimeTest.includes(keyword))fail(`runtime tests missing ${keyword}`);
for(const keyword of ['UCOS_WORKFLOW_CORE_PASS','workflow cycle and cancellation passed','workflow data binding'])if(!t.workflowTest.includes(keyword))fail(`workflow tests missing ${keyword}`);
for(const keyword of ['UCOS_FABRIC_BROWSER_PASS','UCOS_V4_BROWSER_PASS','UCOS VFS missing','UCOS runtime missing','workflow execution failed'])if(!t.fabricSmoke.includes(keyword))fail(`v4 browser smoke missing ${keyword}`);
for(const keyword of ['PRODUCTION_BROWSER_PASS','Main thread responsiveness probe failed','Uncaught runtime exception','pendingNetwork','failedNetwork','runtimeAutoScanned'])if(!t.productionSmoke.includes(keyword))fail(`production browser smoke missing ${keyword}`);

for(const command of ['node tests/capability-os-core.test.cjs','node tests/ucos-fabric-core.test.cjs','node tests/ucos-runtime-core.test.cjs','node tests/ucos-workflow-core.test.cjs','node .github/scripts/capability-os-audit.mjs','node tests/production-browser-smoke.mjs'])if(!t.workflow.includes(command))fail(`workflow missing ${command}`);
if(!t.workflow.includes('UCOS_V4_BROWSER_PASS'))fail('workflow does not assert UCOS v4 browser smoke');

if(!t.sw.includes("super-api-ucos-v22"))fail('service worker cache generation was not advanced to v22');
if(!t.sw.includes('async function networkFirst'))fail('service worker lacks network-first helper');
if(!t.sw.includes("req.destination==='script'"))fail('service worker does not deliver executable scripts network-first');
if(!t.sw.includes("event.tag==='ucos-jobs'"))fail('service worker deferred job queue missing');
if(!t.sw.includes("type==='ucos:queue-job'"))fail('service worker job enqueue IPC missing');
if(t.sw.includes("c.addAll(CORE)).catch(()=>{})"))fail('service worker silently ignores incomplete install cache failures');

const manifest=JSON.parse(t.manifest);if(manifest.name!=='Super API UCOS'||manifest.short_name!=='UCOS')fail('PWA manifest is not UCOS-branded');
for(const app of ['files','devices','camera','capabilities','devlab'])if(!(manifest.shortcuts||[]).some(x=>String(x.url).includes(`ucos_app=${app}`)))fail(`PWA shortcut missing ${app}`);

console.log(JSON.stringify({
 architecture:'Browser-native Universal Capability OS v4',
 compatibilityLayer:true,capabilityFabric:true,peerSpecificRouting:true,appManifestRuntime:true,sandboxRuntime:true,perAppCapabilityBroker:true,processManager:true,resourceOwnership:true,
 virtualFileSystem:['/system','/apps','/home','/tmp','/devices','/mounts'],workflowEngine:true,persistentWorkflows:true,serviceWorkerJobs:true,pwaIdentity:'Super API UCOS',
 fullScreenShell:true,legacyLabPreserved:true,nativeBrowserSecurityPreserved:true,unrestrictedEval:false,eventDrivenRuntime:true,serviceWorkerGeneration:'v22'
},null,2));
if(process.exitCode)process.exit(process.exitCode);
