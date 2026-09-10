import { execFileSync } from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const shaPattern = /^[a-f0-9]{40}$/;
const git = (repo, args) => execFileSync('git', args, {cwd:repo,encoding:'utf8',stdio:['ignore','pipe','pipe']});
const flags = ['thirteen', 'thirteen_pwa', 'umo_pwa', 'voice'];
const sorted = value => Array.isArray(value) ? value.map(sorted) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort().map(([k,v])=>[k,sorted(v)])) : value;
const canonical = object => JSON.stringify(sorted(object));
function withoutRtcDependency(text) {
 const p=JSON.parse(text);
 for(const section of ['dependencies','devDependencies']) {
  if(p[section]) { delete p[section]['agora-rtc-sdk-ng'];p[section]=Object.fromEntries(Object.entries(p[section]).sort()); }
 }
 if(p.pnpm?.patchedDependencies) {
  delete p.pnpm.patchedDependencies['agora-rtc-sdk-ng@4.24.8'];
  if(!Object.keys(p.pnpm.patchedDependencies).length) delete p.pnpm.patchedDependencies;
  if(!Object.keys(p.pnpm).length) delete p.pnpm;
 }
 return canonical(p);
}
// pnpm lockfile 的旧解析记录必须逐项保持原样；只允许额外加入 RTC 依赖树。
export function additiveRtcLock(before, after) {
 function sections(text) {
  const header=text.replace(/^patchedDependencies:\n  agora-rtc-sdk-ng@4\.24\.8:\n    hash: [a-f0-9]+\n    path: patches\/agora-rtc-sdk-ng@4\.24\.8\.patch\n\n/m,'').split('\npackages:\n')[0].replace(/^      agora-rtc-sdk-ng:\n        specifier: [^\n]+\n        version: [^\n]+\n/m,'');
  const blocks=new Map();let section='';let key=null;let lines=[];
  const flush=()=>{if(key){const id=section+':'+key;if(blocks.has(id))throw Error('duplicate lock entry');blocks.set(id,lines.join('\n').trim());}};
  for(const line of text.split('\n')) {
   if(/^(packages|snapshots):$/.test(line)){flush();key=null;section=line;continue;}
   if(!section)continue;
   if(/^  \S.*:(?: \{\})?$/.test(line)){flush();key=line;lines=[];}else if(key)lines.push(line);
  }
  flush();return {header,blocks};
 }
 try {const a=sections(before),b=sections(after);return a.header===b.header && a.blocks.size>0 && [...a.blocks].every(([key,value])=>b.blocks.get(key)===value);}catch{return false;}
}

export function classify({frontendPaths,backendPaths,readFrontend,forceFull=false,baselineValid=true}) {
 const plan={deploy:false,thirteen:false,thirteen_pwa:false,umo_pwa:false,voice:false,reasons:[]};
 const mark=(reason,...keys)=>{plan.deploy=true;for(const key of keys)plan[key]=true;plan.reasons.push(reason);};
 const full=reason=>mark(reason,...flags);
 if(forceFull||!baselineValid){full(forceFull?'manual-full':'baseline-unavailable');return plan;}
 const documentation=path=>/^(docs|evidence|design)\//.test(path)||/\.(md|png\.md)$/.test(path);
 let rtcOnlyPackage=false;
 try{rtcOnlyPackage=withoutRtcDependency(readFrontend('package.json',true))===withoutRtcDependency(readFrontend('package.json',false));}catch{}
 for(const p of frontendPaths){
  if(documentation(p))continue;
  if(p==='public/sw.js'){
   const strip=s=>s.replace(/const VERSION = 'v\d+';/,"const VERSION = 'VERSION';");
   if(strip(readFrontend(p,true))===strip(readFrontend(p,false)))mark('cache-version-only');
   else mark('service-worker-behavior','thirteen_pwa','umo_pwa','voice');
  } else if(/^src\/(components\/Voice|lib\/voice|app\/voice)|^test\/voice\//.test(p))mark('voice:'+p,'voice');
  else if(/^public\/thirteen\/|^src\/(app\/thirteen\/|components\/Thirteen)/.test(p))mark('thirteen:'+p,'thirteen','thirteen_pwa');
  else if(/^public\/umo\/|^src\/(app\/umo\/|components\/Umo)/.test(p))mark('umo:'+p,'umo_pwa');
  else if(p==='deploy/backend-revision.txt')plan.reasons.push('backend-pin:classify-actual-backend-diff');
  else if(p==='patches/agora-rtc-sdk-ng@4.24.8.patch')mark('rtc-sdk-patch','voice');
  else if(p==='package.json'&&rtcOnlyPackage)mark('rtc-sdk-dependency','voice');
  else if(p==='pnpm-lock.yaml'&&rtcOnlyPackage&&additiveRtcLock(readFrontend(p,true),readFrontend(p,false)))mark('additive-rtc-lock','voice');
  else if(/^src\/app\/(layout\.tsx|globals\.css)|^src\/components\/PwaProvider\.tsx$/.test(p))mark('shared-shell:'+p,'thirteen_pwa','umo_pwa','voice');
  else if(p==='.github/workflows/deploy.yml'||p==='deploy/acceptance-plan.mjs'||/^test\/deploy\//.test(p))mark('deployment-planner:'+p);
  else full('shared-or-unclassified-frontend:'+p);
 }
 for(const p of backendPaths){
  if(documentation(p))continue;
  if(/^apps\/voice\/|^tools\/sim\/voice\//.test(p))mark('voice-backend:'+p,'voice');
  else if(/^apps\/thirteen\/|^test\/thirteen\/|^tools\/sim\/thirteen\//.test(p))mark('thirteen-backend:'+p,'thirteen','thirteen_pwa');
  else if(/^tools\/sim\/umo\//.test(p))mark('umo-backend:'+p,'umo_pwa');
  else full('shared-or-unclassified-backend:'+p);
 }
 return plan;
}

export function buildPlan(frontend,backend,baselineFront,baselineBack,forceFull=false){
 let frontendPaths=[],backendPaths=[];let baselineValid=shaPattern.test(baselineFront)&&shaPattern.test(baselineBack);
 try{
  if(baselineValid){
   frontendPaths=git(frontend,['diff','--name-only',baselineFront,'HEAD']).trim().split('\n').filter(Boolean);
   backendPaths=git(backend,['diff','--name-only',baselineBack,'HEAD']).trim().split('\n').filter(Boolean);
  }
 }catch{baselineValid=false;}
 const readFrontend=(path,old)=>{try{return git(frontend,['show',(old?baselineFront:'HEAD')+':'+path]);}catch{return '';}};
 return {...classify({frontendPaths,backendPaths,readFrontend,forceFull,baselineValid}),baselineFront,baselineBack,frontendPaths,backendPaths};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [frontend,backend,baselineFront='',baselineBack='',output='acceptance-plan.json']=process.argv.slice(2);
 const plan=buildPlan(frontend,backend,baselineFront,baselineBack,process.env.FULL_ACCEPTANCE==='true');
 writeFileSync(output,JSON.stringify(plan,null,2)+'\n');
 if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,['deploy',...flags].map(k=>`${k}=${plan[k]}`).join('\n')+'\n');
 console.log(JSON.stringify(plan,null,2));
}
