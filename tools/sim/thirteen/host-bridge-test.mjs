import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const origin = process.argv[2] || 'http://127.0.0.1:3220';
const portraitScreenshot = process.argv[3];
const lobbyScreenshot = process.argv[4];
const resultPath = process.argv[5];
const chromePath = process.env.COCOS_CHROME
  || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function cdpClient(ws) {
  let nextId = 0;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id === undefined || !pending.has(message.id)) return;
    pending.get(message.id)(message);
    pending.delete(message.id);
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
  const response = await cdp.send('Runtime.evaluate', {
    expression: `(async () => JSON.stringify(await (${expression})))()`,
    awaitPromise: true,
    returnByValue: true,
  });
  if (response.result.exceptionDetails) throw new Error(response.result.exceptionDetails.text);
  return JSON.parse(response.result.result.value);
}

async function waitFor(cdp, expression, timeoutMs = 60_000, observe) {
  const deadline = Date.now() + timeoutMs;
  let value;
  while (Date.now() < deadline) {
    value = await evaluate(cdp, expression);
    observe?.(value);
    if (value?.accepted) return value;
    await sleep(100);
  }
  throw new Error(`timeout: ${JSON.stringify(value)}`);
}

async function capture(cdp, path) {
  if (!path) return;
  await mkdir(dirname(path), { recursive: true });
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  await writeFile(path, Buffer.from(shot.result.data, 'base64'));
}

const profile = await mkdtemp(join(tmpdir(), 'thirteen-host-exit-'));
const chrome = spawn(chromePath, [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--no-first-run', '--disable-extensions', '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader', '--window-size=440,956',
], { stdio: ['ignore', 'ignore', 'pipe'] });
let ws;

try {
  let port = 0;
  for (let attempt = 0; attempt < 100 && !port; attempt += 1) {
    await sleep(100);
    try {
      port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]);
    } catch { /* Chrome is still starting. */ }
  }
  if (!port) throw new Error('chrome_debug_port_unavailable');
  const target = await fetch(
    `http://127.0.0.1:${port}/json/new?${encodeURIComponent('about:blank')}`,
    { method: 'PUT' },
  ).then((response) => response.json());
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  const cdp = cdpClient(ws);
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 440, height: 956, deviceScaleFactor: 1, mobile: false,
  });
  await cdp.send('Page.navigate', { url: `${origin}/thirteen` });

  let hostControlSeenBeforeInteractive = false;
  const portrait = await waitFor(cdp, `(() => {
    const frame = document.querySelector('iframe');
    const gameWindow = frame?.contentWindow;
    const scene = gameWindow?.cc?.director?.getScene?.();
    const back = scene?.getChildByPath?.('Canvas/O02RotateGuard/OrientationBack');
    const label = back?.getChildByName?.('Label')?.components
      ?.find?.((component) => typeof component.string === 'string')?.string || null;
    const visible = gameWindow?.cc?.view?.getVisibleSize?.();
    const rect = frame?.getBoundingClientRect?.();
    const world = back?.worldPosition;
    return {
      scene: scene?.name || null,
      label,
      hostControl: Boolean(document.querySelector('[data-game-ready-control="home"]')),
      clickPoint: visible && rect && world ? {
        x: rect.left + (world.x / visible.width) * rect.width,
        y: rect.top + (1 - world.y / visible.height) * rect.height,
      } : null,
      accepted: scene?.name === 'O02RotateGuard' && label === '返回' && Boolean(world),
    };
  })()`, 60_000, (value) => {
    if (value?.scene !== 'R02Lobby' && value?.hostControl) hostControlSeenBeforeInteractive = true;
  });
  if (hostControlSeenBeforeInteractive || portrait.hostControl) {
    throw new Error('host_home_control_visible_before_interactive_lobby');
  }
  await capture(cdp, portraitScreenshot);

  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mousePressed', x: portrait.clickPoint.x, y: portrait.clickPoint.y,
    button: 'left', clickCount: 1,
  });
  await cdp.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased', x: portrait.clickPoint.x, y: portrait.clickPoint.y,
    button: 'left', clickCount: 1,
  });
  const exit = await waitFor(cdp, `(() => ({
    pagePath: location.pathname,
    iframe: Boolean(document.querySelector('iframe')),
    accepted: location.pathname === '/' && !document.querySelector('iframe'),
  }))()`, 10_000);

  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 956, height: 440, deviceScaleFactor: 1, mobile: false,
  });
  await cdp.send('Page.navigate', { url: `${origin}/thirteen` });
  const lobby = await waitFor(cdp, `(() => {
    const frame = document.querySelector('iframe');
    const scene = frame?.contentWindow?.cc?.director?.getScene?.()?.name || null;
    const hostControl = Boolean(document.querySelector('[data-game-ready-control="home"]'));
    return { scene, hostControl, accepted: scene === 'R02Lobby' && hostControl };
  })()`);
  await capture(cdp, lobbyScreenshot);

  await evaluate(cdp, `(() => {
    const frame = document.querySelector('iframe');
    const scene = frame?.contentWindow?.cc?.director?.getScene?.();
    const flow = scene?.getChildByName?.('ThirteenFlow')?.components
      ?.find?.((component) => typeof component.selectLobbyMode === 'function');
    flow?.selectLobbyMode?.('quick');
    return Boolean(flow);
  })()`);
  const quickMatch = await waitFor(cdp, `(() => {
    const frame = document.querySelector('iframe');
    const gameWindow = frame?.contentWindow;
    const scene = gameWindow?.cc?.director?.getScene?.();
    const root = scene?.getChildByPath?.('Canvas/R03RoomRoot');
    const hostControl = Boolean(document.querySelector('[data-game-ready-control="home"]'));
    const backVisible = root?.getChildByName?.('BackButton')?.active === true;
    const quickPanelVisible = root?.getChildByPath?.('RoomPanel/QuickMatchPanel')?.active === true;
    return {
      scene: scene?.name || null, hostControl, backVisible, quickPanelVisible,
      accepted: scene?.name === 'R03Room' && !hostControl && backVisible && quickPanelVisible,
    };
  })()`, 60_000);
  if (resultPath) await capture(cdp, join(dirname(resultPath), 'quick-match.png'));

  await evaluate(cdp, `(() => {
    const frame = document.querySelector('iframe');
    const scene = frame?.contentWindow?.cc?.director?.getScene?.();
    const flow = scene?.getChildByName?.('ThirteenFlow')?.components
      ?.find?.((component) => typeof component.startSolo === 'function');
    flow?.startSolo?.();
    return Boolean(flow);
  })()`);
  const match = await waitFor(cdp, `(() => {
    const frame = document.querySelector('iframe');
    const gameWindow = frame?.contentWindow;
    const scene = gameWindow?.cc?.director?.getScene?.();
    const root = scene?.getChildByPath?.('Canvas/R04MatchRoot');
    const hostControl = Boolean(document.querySelector('[data-game-ready-control="home"]'));
    const homeVisible = root?.getChildByName?.('HomeButton')?.active === true;
    const utilitiesHidden = ['ChatButton', 'SettingsButton', 'MenuButton']
      .every((name) => root?.getChildByName?.(name)?.active === false);
    return {
      scene: scene?.name || null, hostControl, homeVisible, utilitiesHidden,
      accepted: scene?.name === 'R04Match' && !hostControl && homeVisible && utilitiesHidden,
    };
  })()`, 60_000);
  if (resultPath) await capture(cdp, join(dirname(resultPath), 'match.png'));

  const report = {
    feature: 'Cocos host controls follow the active Thirteen scene',
    portrait, hostControlSeenBeforeInteractive, exit, lobby, quickMatch, match, accepted: true,
  };
  if (resultPath) {
    await mkdir(dirname(resultPath), { recursive: true });
    await writeFile(resultPath, `${JSON.stringify(report, null, 2)}\n`);
  }
  console.log(JSON.stringify(report, null, 2));
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

process.exit(process.exitCode ?? 0);
