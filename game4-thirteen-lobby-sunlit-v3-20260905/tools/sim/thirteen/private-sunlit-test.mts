import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import postgres from 'postgres';
import {hashPassword,createSessionToken,createApiAccessToken} from '../../../src/lib/auth';

const origin = process.argv[2] || 'http://127.0.0.1:3000';
const evidenceDirectory = process.argv[3];
const resultPath = process.argv[4];
const chromePath = process.env.COCOS_CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

type CdpMessage = {
  readonly id?: number;
  readonly result?: {
    readonly exceptionDetails?: { readonly text?: string };
    readonly result?: { readonly value?: string };
    readonly success?: boolean;
    readonly data?: string;
  };
};

function cdpClient(ws: WebSocket) {
  let nextId = 0;
  const pending = new Map<number, (message: CdpMessage) => void>();
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id === undefined || !pending.has(message.id)) return;
    pending.get(message.id)?.(message);
    pending.delete(message.id);
  });
  return {
    send(method: string, params: Record<string, unknown> = {}) {
      const id = ++nextId;
      return new Promise<CdpMessage>((resolve) => {
        pending.set(id, resolve);
        ws.send(JSON.stringify({ id, method, params }));
      });
    },
  };
}

async function evaluate(cdp: ReturnType<typeof cdpClient>, expression: string) {
  const response = await cdp.send('Runtime.evaluate', {
    expression: `(async () => JSON.stringify(await (${expression})))()`,
    awaitPromise: true,
    returnByValue: true,
  });
  if (response.result?.exceptionDetails) throw new Error(response.result.exceptionDetails.text ?? 'runtime_evaluation_failed');
  const value = response.result?.result?.value;
  if (typeof value !== 'string') throw new Error('runtime_evaluation_missing_value');
  return JSON.parse(value);
}

async function waitFor(
  cdp: ReturnType<typeof cdpClient>, expression: string, timeoutMs = 180_000,
) {
  const deadline = Date.now() + timeoutMs;
  let value;
  while (Date.now() < deadline) {
    value = await evaluate(cdp, expression);
    if (value?.accepted) return value;
    await sleep(100);
  }
  throw new Error(`browser_timeout:${JSON.stringify(value)}`);
}

type BrowserClient = {label:string;profile:string;chrome:ReturnType<typeof spawn>;ws:WebSocket;cdp:ReturnType<typeof cdpClient>};
async function launch(sessionToken: string, label: string): Promise<BrowserClient> {
  const profile = await mkdtemp(join(tmpdir(), `thirteen-live-${label}-`));
  const chrome = spawn(chromePath, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--disable-extensions', '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader', '--window-size=956,440',
  ], { stdio: 'ignore' });
  let port = 0;
  for (let attempt = 0; attempt < 100 && !port; attempt += 1) {
    await sleep(100);
    try { port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); } catch { /* starting */ }
  }
  if (!port) throw new Error('chrome_debug_port_unavailable');
  const target = await fetch(
    `http://127.0.0.1:${port}/json/new?${encodeURIComponent('about:blank')}`,
    { method: 'PUT' },
  ).then((response) => response.json()) as { webSocketDebuggerUrl: string };
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise<void>((resolve, reject) => {
    ws.addEventListener('open', () => resolve(), { once: true });
    ws.addEventListener('error', () => reject(new Error('cdp_connection_failed')), { once: true });
  });
  const cdp = cdpClient(ws);
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Network.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 956, height: 440, deviceScaleFactor: 1, mobile: false,
  });
  const cookie = await cdp.send('Network.setCookie', {
    name: 'gb_session', value: sessionToken, url: origin,
    httpOnly: true, secure: origin.startsWith('https:'), sameSite: 'Lax',
  });
  assert.equal(cookie.result?.success, true, `${label}_session_cookie_failed`);
  const installedCookies = await cdp.send('Network.getCookies', { urls: [origin] }) as CdpMessage & {
    result?: { cookies?: Array<{ name?: string }> };
  };
  assert.equal(
    installedCookies.result?.cookies?.some((installed) => installed.name === 'gb_session'),
    true,
    `${label}_session_cookie_missing_after_install`,
  );
  browsers.push({ label, profile, chrome, ws, cdp });
  await cdp.send('Page.navigate', { url: `${origin}/thirteen` });
  await waitFor(cdp, `(() => {
    const frame = document.querySelector('iframe');
    const gameWindow = frame?.contentWindow;
    const scene = gameWindow?.cc?.director?.getScene?.();
    const flow = scene?.getChildByName?.('ThirteenFlow')?.components
      ?.find?.((component) => typeof component.selectLobbyMode === 'function');
    const state = flow?.getAcceptanceState?.();
    return {
      scene: scene?.name || null,
      flowScene: state?.currentScene || null,
      loadingScene: state?.loadingScene || null,
      bootCompleted: state?.bootCompleted === true,
      accepted: scene?.name === 'R02Lobby' && state?.currentScene === 'R02Lobby'
        && state?.loadingScene === null && state?.bootCompleted === true,
    };
  })()`);
  const auth = await evaluate(cdp, `(async () => {
    const response = await fetch('/api/auth/me', { cache: 'no-store' });
    const body = await response.json();
    return {
      status: response.status,
      user: body.user ? { uid: body.user.uid, username: body.user.username } : null,
      hasToken: typeof body.token === 'string' && body.token.length > 0,
    };
  })()`);
  assert.ok(auth.status === 200 && auth.user && auth.hasToken, `${label}_host_auth_failed:${JSON.stringify(auth)}`);
  return { label, profile, chrome, ws, cdp };
}

async function capture(client: Awaited<ReturnType<typeof launch>>, path: string) {
  const shot = await client.cdp.send('Page.captureScreenshot', { format: 'png' });
  assert.equal(typeof shot.result?.data, 'string', 'screenshot_data_missing');
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, Buffer.from(shot.result!.data!, 'base64'));
}

type RawClient = { readonly ws: WebSocket; readonly messages: Array<Record<string, unknown>> };

async function waitForRaw(
  client: RawClient, predicate: (message: Record<string, unknown>) => boolean, timeoutMs = 8_000,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const message = [...client.messages].reverse().find(predicate);
    if (message) return message;
    await sleep(25);
  }
  throw new Error(`raw_message_timeout:${JSON.stringify(client.messages.map((message) => message.t))}`);
}

async function connectRaw(user: { id: number; uid: number; apiToken: string }) {
  const url = new URL(origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/ws';
  url.search = '';
  url.searchParams.set('uid', String(user.uid));
  url.searchParams.set('token', user.apiToken);
  const ws = new WebSocket(url);
  const messages: Array<Record<string, unknown>> = [];
  ws.addEventListener('message', (event) => {
    try { messages.push(JSON.parse(String(event.data))); } catch { /* ignore malformed test noise */ }
  });
  await new Promise<void>((resolve, reject) => {
    ws.addEventListener('open', () => resolve(), { once: true });
    ws.addEventListener('error', () => reject(new Error('raw_websocket_connection_failed')), { once: true });
  });
  const client = { ws, messages };
  ws.send(JSON.stringify({ t: 'thirteen:hello', v: 2 }));
  await waitForRaw(client, (message) => message.t === 'thirteen:ready');
  return client;
}

const publicUsersFile=process.env.THIRTEEN_TEST_USERS_FILE;
const users: Array<{id:number;uid:number;apiToken:string;sessionToken:string;password?:string}>=publicUsersFile?JSON.parse(await readFile(publicUsersFile,'utf8')).map((u: {uid:number;token:string;sessionToken:string;password?:string})=>({...u,id:u.uid,apiToken:u.token})):[];
const sql=publicUsersFile?null:postgres(process.env.DATABASE_URL!,{ssl:process.env.DATABASE_URL?.includes('sslmode=require')?'require':false,max:2});
const browsers: Array<BrowserClient> = [];
const rawClients: RawClient[]=[];
const prefix='test-thirteen-private-sunlit-'+Date.now();
const roomState=`(()=>{const w=document.querySelector('iframe')?.contentWindow;const root=w?.cc?.director?.getScene?.()?.getChildByPath?.('Canvas/R03RoomRoot');return root?.getComponent('R03RoomView')?.getAcceptanceState()||null;})()`;
const roomCondition=(predicate:string)=>`(()=>{const state=${roomState};return {state,accepted:Boolean(state&&(${predicate}))};})()`;
async function enterPrivate(browser:Awaited<ReturnType<typeof launch>>) {
 await evaluate(browser.cdp,`(()=>{const w=document.querySelector('iframe').contentWindow;w.cc.director.getScene().getChildByName('ThirteenFlow').components.find(c=>typeof c.selectLobbyMode==='function').selectLobbyMode('private');return true;})()`);
 await waitFor(browser.cdp,roomCondition("state.state==='private-entry'"));
}
async function click(browser:Awaited<ReturnType<typeof launch>>,path:string) {
 await evaluate(browser.cdp,`(()=>{const w=document.querySelector('iframe').contentWindow;const n=w.cc.director.getScene().getChildByPath('Canvas/R03RoomRoot/${path}');if(!n?.getComponent(w.cc.Button)?.interactable)throw Error('button_not_interactable');n.emit(w.cc.Button.EventType.CLICK);return true;})()`);
}
try {
 if(sql)for(let index=0;index<4;index++){
  const rows=await sql`insert into users(uid,username,password_hash,avatar,last_login_at) select candidate,${prefix+'-'+index},${hashPassword('PrivateTest123')},'🙂',now() from generate_series(699999,600000,-1) candidate where not exists(select 1 from users where uid=candidate) order by candidate desc limit 1 returning id,uid,token_version`;
  const r=rows[0];users.push({id:Number(r.id),uid:Number(r.uid),apiToken:createApiAccessToken(Number(r.id),r.uid,r.token_version),sessionToken:createSessionToken(Number(r.id),r.token_version)});
 }
 assert.equal(users.length,4,'four_test_users_required');
 const host=await launch(users[0].sessionToken,'private-host');await enterPrivate(host);await click(host,'RoomPanel/ReadyButton');
 const created=await waitFor(host.cdp,roomCondition("state.state==='room'&&state.selfIsHost&&state.roomCode.length>=6"));
 const code=created.state.roomCode.replace(/\s/g,'');assert.match(code,/^[A-Z0-9]{6}$/);assert.equal(created.state.readyInteractable,false);
 await click(host,'RoomPanel/RoomCode/CopyButton');
 const guest=await launch(users[1].sessionToken,'private-guest');await enterPrivate(guest);
 const inputPoint=await evaluate(guest.cdp,`(()=>{const iframe=document.querySelector('iframe'),w=iframe.contentWindow,root=w.cc.director.getScene().getChildByPath('Canvas/R03RoomRoot'),n=root.getChildByPath('RoomPanel/RoomCode/EntryEditBox'),ui=n.getComponent('cc.UITransform'),p=ui.convertToWorldSpaceAR(new w.cc.Vec3()),size=root.parent.getComponent('cc.UITransform').contentSize,rect=w.document.querySelector('canvas').getBoundingClientRect(),outer=iframe.getBoundingClientRect();return{x:outer.x+rect.x+p.x/size.width*rect.width,y:outer.y+rect.y+(1-p.y/size.height)*rect.height};})()`);
 for(let i=0;i<2;i++){await guest.cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',x:inputPoint.x,y:inputPoint.y,button:'left',clickCount:1});await guest.cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:inputPoint.x,y:inputPoint.y,button:'left',clickCount:1});await sleep(350);if(await evaluate(guest.cdp,`document.querySelector('iframe').contentDocument.activeElement?.tagName==='INPUT'`))break;}
 await guest.cdp.send('Input.insertText',{text:code});await sleep(150);
 const input=await evaluate(guest.cdp,`(()=>{const w=document.querySelector('iframe').contentWindow,i=w.document.activeElement;return{tag:i.tagName,value:i.value,color:w.getComputedStyle(i).color};})()`);assert.equal(input.tag,'INPUT');assert.equal(input.value,code);assert.ok(!input.color.endsWith(', 0)'),'typed_text_visible');
 if(evidenceDirectory)await capture(guest,join(evidenceDirectory,'private-code-input.png'));
 await click(guest,'RoomPanel/RoomCode/CopyButton');
 const joined=await waitFor(guest.cdp,roomCondition("state.state==='room'&&!state.selfIsHost"));
 await click(guest,'RoomPanel/ReadyButton');const ready=await waitFor(guest.cdp,roomCondition('state.selfReady'));
 await click(guest,'RoomPanel/ReadyButton');await waitFor(guest.cdp,roomCondition('!state.selfReady'));
 await click(guest,'RoomPanel/ReadyButton');await waitFor(guest.cdp,roomCondition('state.selfReady'));
 for(let i=2;i<4;i++){const c=await connectRaw(users[i]);rawClients.push(c);c.ws.send(JSON.stringify({t:'thirteen:join-private',v:2,code}));await waitForRaw(c,m=>m.t==='thirteen:room');c.ws.send(JSON.stringify({t:'thirteen:ready',v:2,ready:true}));}
 const canStart=await waitFor(host.cdp,roomCondition('state.canStart&&state.readyInteractable'));
 if(evidenceDirectory){await capture(host,join(evidenceDirectory,'private-host-ready.png'));await capture(guest,join(evidenceDirectory,'private-guest-ready.png'));}
 await click(host,'RoomPanel/ReadyButton');
 const matches=[];for(const b of [host,guest])matches.push(await waitFor(b.cdp,`(()=>{const w=document.querySelector('iframe').contentWindow;const s=w.cc.director.getScene();return{scene:s?.name,accepted:s?.name==='R04Match'};})()`));
 for(const c of rawClients)await waitForRaw(c,m=>m.t==='thirteen:snapshot');
 const report={feature:'sunlit private room through actual host and guest UI',origin,created:created.state,joined:joined.state,guestReady:ready.state,hostCanStart:canStart.state,matches,guestReadyToggle:true,nativeKeyboardInput:true,copyClicked:true,fourAuthenticatedSeats:true,accepted:true};
 if(resultPath)await writeFile(resultPath,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
} finally {
 for(const b of browsers){await evaluate(b.cdp,`(()=>{const w=document.querySelector('iframe')?.contentWindow;const f=w?.cc?.director?.getScene?.()?.getChildByName?.('ThirteenFlow')?.components?.find(c=>typeof c.leaveOnlineAndShowLobby==='function');f?.leaveOnlineAndShowLobby();return true;})()`).catch(()=>{});}
 for(const c of rawClients){c.ws.send(JSON.stringify({t:'thirteen:leave',v:2}));await waitForRaw(c,m=>m.t==='thirteen:left').catch(()=>{});c.ws.close();}
 await sleep(700);
 for(const b of browsers){b.ws.close();b.chrome.kill('SIGKILL');b.chrome.unref();await rm(b.profile,{recursive:true,force:true}).catch(()=>{});}
 const cleanup=[];
 for(const u of users){if(sql){await sql`delete from users where id=${u.id}`;cleanup.push({deleted:true});}else{const r=await fetch(origin+'/api/account',{method:'DELETE',headers:{'content-type':'application/json','x-game-uid':String(u.uid),authorization:'Bearer '+u.apiToken},body:JSON.stringify({password:u.password,confirmation:'DELETE '+u.uid})});cleanup.push({status:r.status,deleted:r.ok});}}
 if(sql)await sql.end({timeout:2});
 if(resultPath)await writeFile(resultPath.replace('.json','-cleanup.json'),JSON.stringify({accounts:cleanup,accepted:cleanup.every(x=>x.deleted)},null,2)+'\n');
 assert.ok(cleanup.every(x=>x.deleted),'test_account_cleanup_failed');
}
process.exit(0);
