import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const url = process.argv[2] || 'http://127.0.0.1:3221/umo';
const origin = new URL(url).origin;
const screenshot = process.argv[3];
const resultPath = process.argv[4];
const mainMenuTimeoutMs = Number(process.env.UMO_PWA_MAIN_MENU_TIMEOUT_MS || 24_000);
if (!Number.isFinite(mainMenuTimeoutMs) || mainMenuTimeoutMs < 5_000 || mainMenuTimeoutMs > 180_000) {
  throw new Error('invalid_UMO_PWA_MAIN_MENU_TIMEOUT_MS');
}
const chromePath = process.env.COCOS_CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function cdpClient(ws) {
  let nextId = 0;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id !== undefined && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  });
  return {
    send(method, params = {}) {
      const id = ++nextId;
      return new Promise((resolve) => {
        pending.set(id, resolve);
        ws.send(JSON.stringify({ id, method, params }));
      });
    },
  };
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression: `(async () => JSON.stringify(await (${expression})))()`,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.result.exceptionDetails) throw new Error(result.result.exceptionDetails.text);
  return JSON.parse(result.result.result.value);
}

async function waitForMainMenu(cdp) {
  return evaluate(cdp, `(async () => {
    const startedAt = performance.now();
    for (let attempt = 0; attempt < ${Math.ceil(mainMenuTimeoutMs / 100)}; attempt += 1) {
      const frame = document.querySelector('iframe');
      const gameWindow = frame?.contentWindow;
      const canvas = frame?.contentDocument?.querySelector('canvas');
      const scene = gameWindow?.cc?.director?.getScene?.()?.name || null;
      if (canvas && scene === 'MainMenu') {
        return {
          pagePath: location.pathname,
          framePath: new URL(frame.src).pathname,
          canvas: true,
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          cocos: true,
          scene,
          mainMenuRoot: Boolean(gameWindow.cc.director.getScene().getChildByName('Canvas')?.getChildByName('MainMenuRoot')),
          loadingOverlayVisible: [...document.querySelectorAll('div')]
            .some((node) => node.textContent === '正在加载 UMO…' && getComputedStyle(node).display !== 'none'),
          serviceWorkerControlled: Boolean(navigator.serviceWorker.controller),
          readyMs: Math.round(performance.now() - startedAt),
        };
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return { pagePath: location.pathname, canvas: false, scene: null, timeoutMs: ${mainMenuTimeoutMs} };
  })()`);
}

async function mainMenuAudioState(cdp) {
  return evaluate(cdp, `(() => {
    const gameWindow = document.querySelector('iframe')?.contentWindow;
    const root = gameWindow?.cc?.director?.getScene?.()?.getChildByName('Canvas')?.getChildByName('MainMenuRoot');
    return root?.getComponent('MainMenuController')?.getAudioAcceptanceState?.() ?? null;
  })()`);
}

async function trustedClick(cdp, x, y) {
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  await sleep(250);
}

async function toggleAudioUntil(cdp, expectedMuted) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await trustedClick(cdp, 425, 38);
    const state = await mainMenuAudioState(cdp);
    if (state?.muted === expectedMuted) return state;
  }
  return mainMenuAudioState(cdp);
}

const profile = await mkdtemp(join(tmpdir(), 'umo-pwa-'));
const chrome = spawn(chromePath, [
  '--headless=new',
  '--remote-debugging-port=0',
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--disable-extensions',
  '--mute-audio',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--window-size=520,953',
], { stdio: ['ignore', 'ignore', 'pipe'] });

try {
  let port;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    await sleep(100);
    try {
      port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]);
      if (port) break;
    } catch { /* Chrome is still starting. */ }
  }
  if (!port) throw new Error('chrome_debug_port_unavailable');
  // Start from a neutral document. Creating the target at `url` and then
  // calling Page.navigate below double-navigates; on a cold public connection
  // the second navigation can abort Cocos while its first module graph loads.
  const target = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' })
    .then((response) => response.json());
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  const cdp = cdpClient(ws);
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Network.enable');
  await cdp.send('Page.navigate', { url });
  const firstLoad = await waitForMainMenu(cdp);
  const registered = await evaluate(cdp, `(async () => {
    await navigator.serviceWorker.ready;
    for (let attempt = 0; attempt < 100 && !navigator.serviceWorker.controller; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return Boolean(navigator.serviceWorker.controller);
  })()`);
  if (!registered) throw new Error('service_worker_did_not_control_page');

  await cdp.send('Page.navigate', { url });
  const online = await waitForMainMenu(cdp);
  const audioBefore = await mainMenuAudioState(cdp);
  const audioMuted = await toggleAudioUntil(cdp, true);
  const audioUnmuted = await toggleAudioUntil(cdp, false);
  const audio = { before: audioBefore, muted: audioMuted, unmuted: audioUnmuted };
  const cache = await evaluate(cdp, `(async () => {
    const names = await caches.keys();
    const assets = await caches.open('game-box-assets-v46');
    const shell = await caches.open('game-box-shell-v46');
    const assetKeys = (await assets.keys()).map((request) => new URL(request.url).pathname);
    const shellKeys = (await shell.keys()).map((request) => new URL(request.url).pathname);
    return {
      names,
      umoAssetCount: assetKeys.filter((path) => path.startsWith('/umo/game/')).length,
      cachedGameIndex: shellKeys.includes('/umo/game/index.html'),
      cachedSettings: assetKeys.some((path) => path.includes('/umo/game/') && path.endsWith('/settings.json')),
      cachedMainBundle: assetKeys.includes('/umo/game/assets/main/index.js'),
      cachedRoute: shellKeys.includes('/umo') || shellKeys.includes('/umo/'),
    };
  })()`);
  const exit = await evaluate(cdp, `(async () => {
    const gameWindow = document.querySelector('iframe')?.contentWindow;
    const actions = gameWindow?.cc?.director?.getScene?.()
      ?.getChildByName('Canvas')?.getChildByName('MainMenuRoot')?.getChildByName('Actions');
    const back = actions?.getChildByName('BackHit');
    back?.emit('touch-end');
    for (let attempt = 0; attempt < 50 && location.pathname !== '/'; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return {
      controlFound: Boolean(back),
      pagePath: location.pathname,
    };
  })()`);
  await cdp.send('Page.navigate', { url });
  const afterExit = await waitForMainMenu(cdp);

  await cdp.send('Page.navigate', { url: `${origin}/offline` });
  await sleep(1_000);
  await cdp.send('Network.emulateNetworkConditions', {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0,
  });
  await cdp.send('Page.navigate', { url });
  const offline = await waitForMainMenu(cdp);
  if (screenshot) {
    await mkdir(dirname(screenshot), { recursive: true });
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(screenshot, Buffer.from(shot.result.data, 'base64'));
  }
  ws.close();

  const accepted = firstLoad.canvas
    && online.canvas
    && online.mainMenuRoot
    && cache.cachedGameIndex
    && cache.cachedSettings
    && cache.cachedMainBundle
    && cache.cachedRoute
    && cache.umoAssetCount > 0
    && audio.before?.muted === false
    && audio.muted?.muted === true
    && audio.unmuted?.muted === false
    && audio.unmuted?.contextState === 'running'
    && exit.controlFound
    && exit.pagePath === '/'
    && afterExit.canvas
    && offline.canvas
    && offline.cocos
    && offline.scene === 'MainMenu'
    && offline.mainMenuRoot
    && !offline.loadingOverlayVisible;
  const report = { feature: 'UMO PWA navigation, online, trusted audio and offline replay', firstLoad, online, audio, cache, exit, afterExit, offline, accepted };
  if (resultPath) {
    await mkdir(dirname(resultPath), { recursive: true });
    await writeFile(resultPath, `${JSON.stringify(report, null, 2)}\n`);
  }
  console.log(JSON.stringify(report, null, 2));
  if (!accepted) process.exitCode = 1;
} finally {
  chrome.kill('SIGKILL');
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
