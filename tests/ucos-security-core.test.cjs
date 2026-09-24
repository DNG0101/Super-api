'use strict';
const assert=require('node:assert/strict');
const Sec=require('../modules/ucos-security-core.js');

const tokens=Sec.createTokenService({defaultTtlMs:5000});
const t=tokens.mint({appId:'demo.app',capabilityId:'media.camera',operation:'execute',nodeId:'local',uses:2});
assert(tokens.validate(t.id,{appId:'demo.app',capabilityId:'media.camera',operation:'execute',nodeId:'local'}).valid);
assert.equal(tokens.validate(t.id,{appId:'other.app'}).valid,false);
assert(tokens.consume(t.id,{appId:'demo.app',capabilityId:'media.camera',operation:'execute',nodeId:'local'}).valid);
assert(tokens.consume(t.id,{appId:'demo.app',capabilityId:'media.camera',operation:'execute',nodeId:'local'}).valid);
assert.equal(tokens.validate(t.id,{appId:'demo.app'}).valid,false);
console.log('UCOS scoped capability leases passed');

const quotas=Sec.createQuotaManager({windowMs:60000,defaultLimit:2});
assert(quotas.consume('app:camera').allowed);assert(quotas.consume('app:camera').allowed);const denied=quotas.consume('app:camera');assert.equal(denied.allowed,false);assert(denied.retryAfterMs>=0);
console.log('UCOS per-app quota enforcement passed');

const replay=Sec.createReplayGuard({windowMs:60000});
const envelope={peerId:'peer-a',nonce:'n-1',timestamp:Date.now()};assert(replay.accept(envelope).accepted);assert.equal(replay.accept(envelope).reason,'replay-detected');assert.equal(replay.accept({peerId:'peer-a',nonce:'old',timestamp:Date.now()-120000}).reason,'stale-message');
console.log('UCOS anti-replay guard passed');

const audit=Sec.createAuditLog({limit:3});audit.append('login',{authorization:'secret-value',nested:{password:'pw'},ok:true});audit.append('b',{});audit.append('c',{});audit.append('d',{});assert.equal(audit.size(),3);const rows=audit.query({limit:3});assert.equal(rows[2].data.authorization,'[REDACTED]');assert.equal(rows[2].data.nested.password,'[REDACTED]');
console.log('UCOS bounded redacted audit log passed');

const canonicalA=Sec.stable({b:2,a:1,n:{z:2,y:1}}),canonicalB=Sec.stable({n:{y:1,z:2},a:1,b:2});assert.equal(canonicalA,canonicalB);
const env=Sec.createSignedEnvelope({command:'x'},{peerId:'peer-a',nonce:'n-2',timestamp:Date.now()});const guard=Sec.createReplayGuard();assert(Sec.validateSignedEnvelope(env,{expectedPeerId:'peer-a',replayGuard:guard}).valid);assert.equal(Sec.validateSignedEnvelope(env,{expectedPeerId:'peer-a',replayGuard:guard}).reason,'replay-detected');
console.log('UCOS signed envelope validation passed');

console.log(JSON.stringify({status:'UCOS_SECURITY_CORE_PASS',tokens:tokens.size(),audit:audit.size()},null,2));
