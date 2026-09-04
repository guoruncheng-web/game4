import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import postgres from 'postgres';
import { createApiAccessToken, createSessionToken, hashPassword } from '../../../src/lib/auth';

const origin = process.argv[2] || 'http://127.0.0.1:3000';
const evidenceDirectory = process.argv[3];
const resultPath = process.argv[4];
const chromePath = process.env.COCOS_CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
assert.ok(process.env.DATABASE_URL, 'DATABASE_URL_required');
const sql = postgres(process.env.DATABASE_URL, {
  ssl: process.env.DATABASE_URL.includes('sslmode=require') ? 'require' : false,
  max: 2,
});
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
  cdp: ReturnType<typeof cdpClient>, expression: string, timeoutMs = 60_000,
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

async function launch(sessionToken: string, label: string) {
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

async function enterQuick(client: Awaited<ReturnType<typeof launch>>) {
  assert.equal(await evaluate(client.cdp, `(() => {
    const scene = document.querySelector('iframe')?.contentWindow?.cc?.director?.getScene?.();
    const flow = scene?.getChildByName?.('ThirteenFlow')?.components
      ?.find?.((component) => typeof component.selectLobbyMode === 'function');
    flow?.selectLobbyMode?.('quick');
    return Boolean(flow);
  })()`), true);
}

function queueExpression(expected: number) {
  return `(() => {
    const frame = document.querySelector('iframe');
    const scene = frame?.contentWindow?.cc?.director?.getScene?.();
    const root = scene?.getChildByPath?.('Canvas/R03RoomRoot');
    const controller = root?.components?.find?.((component) => typeof component.getAcceptanceState === 'function');
    const flow = scene?.getChildByName?.('ThirteenFlow')?.components
      ?.find?.((component) => component.onlineState && typeof component.selectLobbyMode === 'function');
    const state = controller?.getAcceptanceState?.();
    const progress = state?.quickMatchProgress || null;
    const onlineStatus = flow?.onlineState?.status || null;
    const onlineError = flow?.onlineState?.error || null;
    const queuePlayerCount = flow?.onlineState?.queuePlayerCount ?? null;
    const hostControl = Boolean(document.querySelector('[data-game-ready-control="home"]'));
    return {
      scene: scene?.name || null, progress, onlineStatus, onlineError, queuePlayerCount, hostControl,
      iframeUsesSameOriginWs: frame?.src?.includes('wsPort=') === false,
      accepted: scene?.name === 'R03Room' && progress === '已找到 ${expected} / 4'
        && onlineStatus === 'queued' && queuePlayerCount === ${expected}
        && !hostControl && frame?.src?.includes('wsPort=') === false,
    };
  })()`;
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

async function connectRaw(user: { id: number; uid: number; tokenVersion: number }) {
  const url = new URL(origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/ws';
  url.search = '';
  url.searchParams.set('uid', String(user.uid));
  url.searchParams.set('token', createApiAccessToken(user.id, user.uid, user.tokenVersion));
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

const users: Array<{ id: number; uid: number; tokenVersion: number }> = [];
const browsers: Array<Awaited<ReturnType<typeof launch>>> = [];
const rawClients: RawClient[] = [];
const prefix = `test-thirteen-pwa-live-${Date.now()}`;

try {
  for (let index = 0; index < 2; index += 1) {
    const rows = await sql`
      insert into users (uid, username, password_hash, avatar, last_login_at)
      select candidate, ${`${prefix}-${index}`}, ${hashPassword('Testpass123')}, '🧪', now()
      from generate_series(799999, 700000, -1) candidate
      where not exists (select 1 from users where uid = candidate)
      order by candidate desc limit 1
      returning id, uid, token_version
    `;
    users.push({ id: Number(rows[0].id), uid: Number(rows[0].uid), tokenVersion: Number(rows[0].token_version) });
  }

  const first = await launch(createSessionToken(users[0].id, users[0].tokenVersion), 'first');
  browsers.push(first);
  await enterQuick(first);
  const firstOne = await waitFor(first.cdp, queueExpression(1), 15_000);

  // A raw companion avoids Next dev's cross-client hot-reload noise while still
  // exercising the exact authenticated same-origin WebSocket used by another phone.
  const second = await connectRaw(users[1]);
  rawClients.push(second);
  second.ws.send(JSON.stringify({ t: 'thirteen:matchmake', v: 2 }));
  const [firstTwo, secondTwo] = await Promise.all([
    waitFor(first.cdp, queueExpression(2)),
    waitForRaw(second, (message) => message.t === 'thirteen:matchmaking' && message.playerCount === 2),
  ]);
  if (evidenceDirectory) {
    await capture(first, join(evidenceDirectory, 'quick-match-player-1-2of4.png'));
  }
  const report = {
    feature: 'local PWA live two-player quick matchmaking',
    origin, firstOne, firstTwo, secondTwo,
    distinctAuthenticatedUsers: users[0].id !== users[1].id,
    accepted: true,
  };
  if (resultPath) {
    await mkdir(dirname(resultPath), { recursive: true });
    await writeFile(resultPath, `${JSON.stringify(report, null, 2)}\n`);
  }
  console.log(JSON.stringify(report, null, 2));

  for (const browser of browsers) {
    await evaluate(browser.cdp, `(() => {
      const scene = document.querySelector('iframe')?.contentWindow?.cc?.director?.getScene?.();
      const flow = scene?.getChildByName?.('ThirteenFlow')?.components
        ?.find?.((component) => typeof component.leaveOnlineAndShowLobby === 'function');
      flow?.leaveOnlineAndShowLobby?.();
      return Boolean(flow);
    })()`);
  }
  for (const client of rawClients) {
    client.ws.send(JSON.stringify({ t: 'thirteen:leave', v: 2 }));
    await waitForRaw(client, (message) => message.t === 'thirteen:left');
  }
  await sleep(500);
} finally {
  for (const client of rawClients) client.ws.close();
  for (const browser of browsers) {
    browser.ws.close();
    browser.chrome.kill('SIGKILL');
    browser.chrome.unref();
    await rm(browser.profile, { recursive: true, force: true }).catch(() => {});
  }
  await sleep(1_000);
  for (const user of users) await sql`delete from users where id = ${user.id}`;
  await sql.end({ timeout: 2 });
}
