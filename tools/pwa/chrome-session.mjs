import {spawn} from 'node:child_process';
import {mkdtemp,readFile,writeFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {pathToFileURL} from 'node:url';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export async function startChrome({out,executable=process.env.COCOS_CHROME??'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',timeoutMs=30000,spawnBrowser=spawn}={}){
 const profile=await mkdtemp(join(tmpdir(),'social-pwa-'));let stderr='',spawnError;
 const chrome=spawnBrowser(executable,['--headless=new',...(process.platform==='linux'?['--no-sandbox','--disable-dev-shm-usage']:[]),'--remote-debugging-port=0','--user-data-dir='+profile,'--no-first-run','--no-default-browser-check','--disable-extensions','--mute-audio','--use-angle=swiftshader','--enable-unsafe-swiftshader','--window-size=390,780','about:blank'],{detached:true,stdio:['ignore','ignore','pipe']});
 chrome.stderr?.on('data',chunk=>{stderr=(stderr+chunk.toString()).slice(-64000);});
 chrome.on('error',error=>{spawnError=error;});
 const diagnostics=()=>({pid:chrome.pid,exitCode:chrome.exitCode,signalCode:chrome.signalCode,spawnError:spawnError?.message,stderr});
 async function close(){
  // The detached group belongs only to this invocation, including its renderer children.
  if(chrome.pid){try{process.kill(-chrome.pid,'SIGTERM');}catch{}const end=Date.now()+2000;while(chrome.exitCode===null&&chrome.signalCode===null&&Date.now()<end)await sleep(50);try{process.kill(-chrome.pid,'SIGKILL');}catch{}}
  chrome.stderr?.destroy();chrome.unref();
  if(out){await mkdir(out,{recursive:true});await writeFile(join(out,'chrome-startup.json'),JSON.stringify(diagnostics(),null,2));}
  await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:200});
 }
 try{
  const end=Date.now()+timeoutMs;let port;
  while(Date.now()<end){
   if(spawnError)throw Error('CHROME_SPAWN_FAILED: '+spawnError.message);
   if(chrome.exitCode!==null||chrome.signalCode!==null)throw Error(`CHROME_EXITED: ${chrome.exitCode??chrome.signalCode}; ${stderr.slice(-4000)}`);
   try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);if(port){const r=await fetch(`http://127.0.0.1:${port}/json/version`,{signal:AbortSignal.timeout(1000)});if(r.ok&&(await r.json()).webSocketDebuggerUrl)return {chrome,profile,port,close,diagnostics};}}catch{}
   await sleep(100);
  }
  throw Error('CHROME_STARTUP_TIMEOUT: '+stderr.slice(-4000));
 }catch(e){await close();throw e;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const session=await startChrome({out:process.argv[2]});try{console.log(JSON.stringify({browserReady:true,port:session.port}));}finally{await session.close();}
}
