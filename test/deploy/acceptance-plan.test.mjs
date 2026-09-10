import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { classify, additiveRtcLock, buildPlan } from '../../deploy/acceptance-plan.mjs';
const oldPackage=JSON.stringify({dependencies:{next:'16.3.0',react:'19.2.8'}});
const newPackage=JSON.stringify({dependencies:{next:'16.3.0',react:'19.2.8','agora-rtc-sdk-ng':'4.24.8'}});
const oldLock='lockfileVersion: 9\n\npackages:\n\n  next@16.3.0:\n    resolution: x\n\nsnapshots:\n\n  next@16.3.0:\n    dependencies: {}\n';
const newLock=oldLock.replace('  next@16.3.0:', '  agora@4:\n    resolution: y\n\n  next@16.3.0:');
const classifyPaths=(frontendPaths=[],backendPaths=[],readFrontend=(p,old)=>p==='package.json'?(old?oldPackage:newPackage):p==='pnpm-lock.yaml'?(old?oldLock:newLock):`const VERSION = 'v${old?84:85}';\nfetch(event.request);`)=>classify({frontendPaths,backendPaths,readFrontend});
test('voice changes and additive SDK dependency do not request unrelated games',()=>{
 const p=classifyPaths(['src/components/VoiceAudioPanel.tsx','src/lib/voice/rtc-session.ts','src/app/voice-layout.css','package.json','pnpm-lock.yaml','public/sw.js','deploy/backend-revision.txt'],['apps/voice/src/agora-token.service.ts']);
 assert.equal(p.deploy,true);assert.equal(p.voice,true);assert.equal(p.thirteen,false);assert.equal(p.thirteen_pwa,false);assert.equal(p.umo_pwa,false);
});
test('an existing framework version or transitive lock resolution change requests all tests',()=>{
 assert.equal(additiveRtcLock(oldLock,oldLock.replace('resolution: x','resolution: unsafe')),false);
 const p=classifyPaths(['package.json'],[],(_,old)=>old?oldPackage:newPackage.replace('16.3.0','16.4.0'));
 assert.equal(p.thirteen,true);assert.equal(p.umo_pwa,true);
});
test('SW version alone differs from a caching behavior change',()=>{
 assert.equal(classifyPaths(['public/sw.js']).thirteen_pwa,false);
 const p=classifyPaths(['public/sw.js'],[],(_,old)=>old?'cacheFirst()':'networkFirst()');assert.equal(p.thirteen_pwa,true);assert.equal(p.umo_pwa,true);
});
test('thirteen assets select its functional and PWA suites only',()=>{
 const p=classifyPaths(['public/thirteen/game/assets/main/index.js']);assert.equal(p.thirteen,true);assert.equal(p.thirteen_pwa,true);assert.equal(p.umo_pwa,false);
});
test('auth, gateway and unknown runtime paths fail closed to all suites',()=>{
 for(const args of [[['src/components/AuthProvider.tsx'],[]],[[],['apps/gateway/src/access.guard.ts']],[['unknown-runtime.mjs'],[]]]){const p=classifyPaths(...args);assert.ok(p.thirteen&&p.umo_pwa&&p.voice);}
});
test('documentation does not deploy; invalid baseline and manual full override do',()=>{
 assert.equal(classifyPaths(['docs/release.md','evidence/result.json','deploy/backend-revision.txt'],['docs/note.md']).deploy,false);
 for(const opts of [{baselineValid:false},{forceFull:true}]){const p=classify({frontendPaths:[],backendPaths:[],readFrontend:()=>'',...opts});assert.ok(p.deploy&&p.thirteen&&p.umo_pwa&&p.voice);}
});
test('cumulative production diff includes an earlier failed commit, not just HEAD parent',()=>{
 const root=mkdtempSync(join(tmpdir(),'deploy-plan-'));const g=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
 try{g('init');g('config','user.email','fixture@example.invalid');g('config','user.name','Fixture');writeFileSync(join(root,'package.json'),oldPackage);g('add','.');g('commit','-m','production');const baseline=g('rev-parse','HEAD');
 writeFileSync(join(root,'critical-runtime.js'),'changed');g('add','.');g('commit','-m','failed deployment');writeFileSync(join(root,'README.md'),'doc');g('add','.');g('commit','-m','followup');
 const p=buildPlan(root,root,baseline,baseline);assert.ok(p.frontendPaths.includes('critical-runtime.js'));assert.equal(p.thirteen,true);
 }finally{rmSync(root,{recursive:true,force:true});}
});
test('only the pinned RTC patch stays voice-scoped; unrelated dependency patches require all suites',()=>{
 const patched=JSON.stringify({...JSON.parse(newPackage),packageManager:'pnpm@9.15.9',pnpm:{patchedDependencies:{'agora-rtc-sdk-ng@4.24.8':'patches/agora-rtc-sdk-ng@4.24.8.patch'}}});
 const p=classifyPaths(['package.json','patches/agora-rtc-sdk-ng@4.24.8.patch'],[],(_,old)=>old?oldPackage:patched);
 assert.equal(p.voice,true);assert.equal(p.thirteen,false);
 const q=classifyPaths(['package.json'],[],(_,old)=>old?oldPackage:patched.replace('agora-rtc-sdk-ng@4.24.8','next@16.3.0'));
 assert.equal(q.thirteen,true);
 const patchedLock=newLock.replace('packages:', 'patchedDependencies:\n  agora-rtc-sdk-ng@4.24.8:\n    hash: bgqkau4yz5sidsz6t3mmjxizkq\n    path: patches/agora-rtc-sdk-ng@4.24.8.patch\n\npackages:');
 assert.equal(additiveRtcLock(oldLock,patchedLock),true);
 assert.equal(additiveRtcLock(oldLock,patchedLock.replace('agora-rtc-sdk-ng@4.24.8:','next@16.3.0:')),false);
});

test('additive lock snapshots include pnpm inline empty dependency blocks',()=>{
 const before=oldLock+'\n  existing@1: {}\n';
 const after=before+'\n  added@1: {}\n';
 assert.equal(additiveRtcLock(before,after),true);
 assert.equal(additiveRtcLock(before,after.replace('resolution: x','resolution: x\n    deprecated: Registry notice')),true);
 assert.equal(additiveRtcLock(before,after.replace('existing@1: {}','existing@1:\n    dependencies: changed')),false);
});

test('shared page styles retain PWA and RTC checks without game-rule suites',()=>{
 const p=classifyPaths(['src/app/pwa-v5.css','src/app/globals.css','src/app/layout.tsx']);
 assert.ok(p.deploy && p.thirteen_pwa && p.umo_pwa && p.voice);
 assert.equal(p.thirteen,false);
});
