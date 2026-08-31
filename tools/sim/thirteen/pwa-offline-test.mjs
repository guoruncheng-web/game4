import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { mkdir } from 'node:fs/promises';

const url = process.argv[2] || 'http://127.0.0.1:3220/thirteen';
const origin = new URL(url).origin;
const screenshot = process.argv[3];
const resultPath = process.argv[4];
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

async function waitForLobby(cdp, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await evaluate(cdp, `(() => {
      const frame = document.querySelector('iframe');
      const gameWindow = frame?.contentWindow;
      const scene = gameWindow?.cc?.director?.getScene?.();
      const flow = scene?.getChildByName?.('ThirteenFlow')?.components
        ?.find?.((component) => typeof component.getAcceptanceState === 'function');
      return {
        scene: scene?.name || null,
        audio: flow?.getAcceptanceState?.().audio || null,
        settings: flow?.getAcceptanceState?.().settings || null,
      };
    })()`);
    if (state.scene === 'R02Lobby' && state.audio?.loadedClips === 21
      && state.settings?.language === 'zh-CN') return state;
    await sleep(100);
  }
  throw new Error('thirteen_lobby_timeout');
}

const profile = await mkdtemp(join(tmpdir(), 'thirteen-pwa-'));
const chrome = spawn(chromePath, [
  '--headless=new',
  '--remote-debugging-port=0',
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--disable-extensions',
  '--mute-audio',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--window-size=1280,720',
], { stdio: ['ignore', 'ignore', 'pipe'] });
let ws;

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
  // Create a blank target and navigate once after CDP domains are enabled. Opening the
  // destination in /json/new and navigating again can interrupt Cocos module startup.
  const target = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' })
    .then((response) => response.json());
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  const cdp = cdpClient(ws);
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Network.enable');
  await cdp.send('Page.navigate', { url });
  await waitForLobby(cdp);
  const registered = await evaluate(cdp, `(async () => {
    await navigator.serviceWorker.ready;
    for (let attempt = 0; attempt < 100 && !navigator.serviceWorker.controller; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return Boolean(navigator.serviceWorker.controller);
  })()`);
  if (!registered) throw new Error('service_worker_did_not_control_page');

  await cdp.send('Page.navigate', { url: `${origin}/offline` });
  await sleep(2_000);
  await cdp.send('Page.navigate', { url });
  await waitForLobby(cdp);
  const online = await evaluate(cdp, `(async () => {
    const names = await caches.keys();
    const assets = await caches.open('game-box-assets-v44');
    const shell = await caches.open('game-box-shell-v44');
    const assetKeys = (await assets.keys()).map((request) => new URL(request.url).pathname);
    const shellKeys = (await shell.keys()).map((request) => new URL(request.url).pathname);
    const frame = document.querySelector('iframe');
    return {
      names,
      assetCount: assetKeys.length,
      shellKeys,
      cachedGameIndex: assetKeys.includes('/thirteen/game/index.html')
        || shellKeys.includes('/thirteen/game/index.html'),
      cachedSettings: assetKeys.some((path) => path.startsWith('/thirteen/game/src/settings') && path.endsWith('.json')),
      cachedRoute: shellKeys.includes('/thirteen') || shellKeys.includes('/thirteen/'),
      onlineCanvas: Boolean(frame?.contentDocument?.querySelector('canvas')),
      releaseLanguage: frame?.contentWindow?.cc?.director?.getScene?.()?.getChildByName?.('ThirteenFlow')
        ?.components?.find?.((component) => typeof component.getAcceptanceState === 'function')
        ?.getAcceptanceState?.().settings?.language || null,
    };
  })()`);
  const audioBefore = await evaluate(cdp, `(() => {
    const frame = document.querySelector('iframe');
    const flow = frame?.contentWindow?.cc?.director?.getScene?.()?.getChildByName?.('ThirteenFlow')
      ?.components?.find?.((component) => typeof component.getAcceptanceState === 'function');
    return flow?.getAcceptanceState?.().audio || null;
  })()`);
  const clickPoint = await evaluate(cdp, `(() => {
    const frame = document.querySelector('iframe');
    const rect = frame?.getBoundingClientRect?.();
    const gameWindow = frame?.contentWindow;
    const canvas = frame?.contentDocument?.querySelector('canvas');
    if (gameWindow && canvas) {
      gameWindow.__thirteenInputProbe = { mouse: 0, touch: 0, pointer: 0 };
      canvas.addEventListener('mousedown', () => { gameWindow.__thirteenInputProbe.mouse += 1; });
      canvas.addEventListener('touchstart', () => { gameWindow.__thirteenInputProbe.touch += 1; });
      canvas.addEventListener('pointerdown', () => { gameWindow.__thirteenInputProbe.pointer += 1; });
    }
    return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, rect: [rect.left, rect.top, rect.width, rect.height] } : null;
  })()`);
  if (!clickPoint) throw new Error('thirteen_iframe_click_target_missing');
  let audioAfter = audioBefore;
  for (let attempt = 0; attempt < 5 && !audioAfter?.unlocked; attempt += 1) {
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mousePressed', x: clickPoint.x, y: clickPoint.y, button: 'left', clickCount: 1,
    });
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased', x: clickPoint.x, y: clickPoint.y, button: 'left', clickCount: 1,
    });
    await sleep(500);
    audioAfter = await evaluate(cdp, `(() => {
      const frame = document.querySelector('iframe');
      const flow = frame?.contentWindow?.cc?.director?.getScene?.()?.getChildByName?.('ThirteenFlow')
        ?.components?.find?.((component) => typeof component.getAcceptanceState === 'function');
      return flow?.getAcceptanceState?.().audio || null;
    })()`);
  }
  if (!audioAfter?.unlocked) {
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
    for (let attempt = 0; attempt < 3 && !audioAfter?.unlocked; attempt += 1) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: clickPoint.x, y: clickPoint.y, radiusX: 1, radiusY: 1, force: 1, id: 1 }],
      });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await sleep(500);
      audioAfter = await evaluate(cdp, `(() => {
        const frame = document.querySelector('iframe');
        const flow = frame?.contentWindow?.cc?.director?.getScene?.()?.getChildByName?.('ThirteenFlow')
          ?.components?.find?.((component) => typeof component.getAcceptanceState === 'function');
        return flow?.getAcceptanceState?.().audio || null;
      })()`);
    }
  }
  const inputProbe = await evaluate(cdp, `(() => {
    const frame = document.querySelector('iframe');
    return {
      parentActiveElement: document.activeElement?.tagName || null,
      frameActiveElement: frame?.contentDocument?.activeElement?.id || frame?.contentDocument?.activeElement?.tagName || null,
      events: frame?.contentWindow?.__thirteenInputProbe || null,
    };
  })()`);
  online.trustedAudio = { before: audioBefore, after: audioAfter, clickPoint, inputProbe };

  await cdp.send('Page.navigate', { url: `${origin}/offline` });
  await sleep(2_000);
  await cdp.send('Network.emulateNetworkConditions', {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0,
  });
  await cdp.send('Page.navigate', { url });
  await sleep(12_000);
  const offline = await evaluate(cdp, `(() => {
    const frame = document.querySelector('iframe');
    const gameWindow = frame?.contentWindow;
    const canvas = frame?.contentDocument?.querySelector('canvas');
    return {
      pagePath: location.pathname,
      canvas: Boolean(canvas),
      canvasWidth: canvas?.width || 0,
      canvasHeight: canvas?.height || 0,
      cocos: typeof gameWindow?.cc !== 'undefined',
      scene: gameWindow?.cc?.director?.getScene?.()?.name || null,
      releaseLanguage: gameWindow?.cc?.director?.getScene?.()?.getChildByName?.('ThirteenFlow')
        ?.components?.find?.((component) => typeof component.getAcceptanceState === 'function')
        ?.getAcceptanceState?.().settings?.language || null,
      loadingOverlayVisible: [...document.querySelectorAll('div')]
        .some((node) => node.textContent === '正在摆好牌桌…' && getComputedStyle(node).display !== 'none'),
    };
  })()`);
  if (screenshot) {
    await mkdir(dirname(screenshot), { recursive: true });
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    await writeFile(screenshot, Buffer.from(shot.result.data, 'base64'));
  }
  const accepted = online.cachedGameIndex
    && online.cachedSettings
    && online.cachedRoute
    && online.onlineCanvas
    && offline.canvas
    && offline.cocos
    && offline.scene === 'R02Lobby'
    && online.releaseLanguage === 'zh-CN'
    && offline.releaseLanguage === 'zh-CN'
    && !offline.loadingOverlayVisible
    && online.trustedAudio.after?.loadedClips === 21
    && online.trustedAudio.after?.unlocked === true;
  const report = { feature: 'Thirteen PWA offline replay', online, offline, accepted };
  if (resultPath) {
    await mkdir(dirname(resultPath), { recursive: true });
    await writeFile(resultPath, `${JSON.stringify(report, null, 2)}\n`);
  }
  console.log(JSON.stringify(report, null, 2));
  if (!accepted) process.exitCode = 1;
} finally {
  ws?.close();
  const chromeExited = new Promise((resolve) => {
    if (chrome.exitCode !== null || chrome.signalCode !== null) resolve();
    else chrome.once('exit', resolve);
  });
  chrome.kill('SIGKILL');
  await Promise.race([chromeExited, sleep(2_000)]);
  chrome.unref();
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}

// Node's built-in WebSocket can retain an internal handle after the remote
// headless browser is gone. All evidence and cleanup are complete at this point.
process.exit(process.exitCode ?? 0);
