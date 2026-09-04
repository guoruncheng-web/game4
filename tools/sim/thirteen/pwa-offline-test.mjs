import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { mkdir } from 'node:fs/promises';

const url = process.argv[2] || 'http://127.0.0.1:3220/thirteen';
const origin = new URL(url).origin;
const screenshot = process.argv[3];
const resultPath = process.argv[4];
const lobbyTimeoutMs = Number(process.env.THIRTEEN_PWA_LOBBY_TIMEOUT_MS || 30_000);
if (!Number.isFinite(lobbyTimeoutMs) || lobbyTimeoutMs < 5_000 || lobbyTimeoutMs > 180_000) {
  throw new Error('invalid_THIRTEEN_PWA_LOBBY_TIMEOUT_MS');
}
const viewport = process.env.THIRTEEN_PWA_VIEWPORT || '1280,720';
if (!/^\d{3,4},\d{3,4}$/.test(viewport)) throw new Error('invalid_THIRTEEN_PWA_VIEWPORT');
const sessionCookie = process.env.THIRTEEN_PWA_SESSION_COOKIE || '';
const onlineScreenshot = process.env.THIRTEEN_PWA_ONLINE_SCREENSHOT || '';
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
  const startedAt = Date.now();
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
    if (state.scene === 'R02Lobby' && state.audio?.ready === true
      && state.audio?.assignedSources === 6
      && state.settings?.language === 'zh-CN') {
      return { ...state, readyMs: Date.now() - startedAt };
    }
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
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  `--window-size=${viewport}`,
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
  if (sessionCookie) {
    const cookie = await cdp.send('Network.setCookie', {
      url: origin,
      name: 'gb_session',
      value: sessionCookie,
      httpOnly: true,
      secure: origin.startsWith('https:'),
      sameSite: 'Lax',
    });
    if (cookie.result?.success !== true) throw new Error('session_cookie_install_failed');
  }
  await cdp.send('Page.navigate', { url });
  const coldLobby = await waitForLobby(cdp, lobbyTimeoutMs);
  const registered = await evaluate(cdp, `(async () => {
    if (!('serviceWorker' in navigator)) return false;
    const ready = await Promise.race([
      navigator.serviceWorker.ready.then(() => true),
      new Promise((resolve) => setTimeout(() => resolve(false), 10_000)),
    ]);
    if (!ready) return false;
    for (let attempt = 0; attempt < 100 && !navigator.serviceWorker.controller; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return Boolean(navigator.serviceWorker.controller);
  })()`);
  if (!registered) throw new Error('service_worker_did_not_control_page');

  await cdp.send('Page.navigate', { url: `${origin}/offline` });
  await sleep(2_000);
  await cdp.send('Page.navigate', { url });
  const warmLobby = await waitForLobby(cdp, lobbyTimeoutMs);
  const online = await evaluate(cdp, `(async () => {
    const names = await caches.keys();
    const assets = await caches.open('game-box-assets-v60');
    const shell = await caches.open('game-box-shell-v60');
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
      cachedAudioClips: assetKeys.filter((path) => path.startsWith('/thirteen/game/') && path.endsWith('.m4a')).length,
      cachedRoute: shellKeys.includes('/thirteen') || shellKeys.includes('/thirteen/'),
      onlineCanvas: Boolean(frame?.contentDocument?.querySelector('canvas')),
      releaseLanguage: frame?.contentWindow?.cc?.director?.getScene?.()?.getChildByName?.('ThirteenFlow')
        ?.components?.find?.((component) => typeof component.getAcceptanceState === 'function')
        ?.getAcceptanceState?.().settings?.language || null,
    };
  })()`);
  online.startup = { coldReadyMs: coldLobby.readyMs, warmReadyMs: warmLobby.readyMs };
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
  const audioDeadline = Date.now() + lobbyTimeoutMs;
  while (Date.now() < audioDeadline && !(
    audioAfter?.unlocked
    && audioAfter?.loadedClips >= 2
    && audioAfter?.contextState === 'running'
    && audioAfter?.musicPlaying === true
    && audioAfter?.ambiencePlaying === true
  )) {
    await sleep(250);
    audioAfter = await evaluate(cdp, `(() => {
      const frame = document.querySelector('iframe');
      const flow = frame?.contentWindow?.cc?.director?.getScene?.()?.getChildByName?.('ThirteenFlow')
        ?.components?.find?.((component) => typeof component.getAcceptanceState === 'function');
      return flow?.getAcceptanceState?.().audio || null;
    })()`);
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

  if (sessionCookie) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      online.accountIdentity = await evaluate(cdp, `(() => {
        const frame = document.querySelector('iframe');
        const gameWindow = frame?.contentWindow;
        const lobby = gameWindow?.cc?.director?.getScene?.()?.getChildByPath?.('Canvas/R02LobbyRoot');
        const view = lobby?.components?.find?.((component) => typeof component.getAcceptanceState === 'function');
        const state = view?.getAcceptanceState?.() || null;
        const avatar = lobby?.getChildByPath?.('PlayerProfile/Avatar')
          ?.getComponent?.(gameWindow?.cc?.Sprite)?.spriteFrame;
        const frameUuid = avatar?._uuid || avatar?.uuid || '';
        return {
          playerName: state?.playerName || null,
          avatarSource: state?.avatarSource || null,
          runtimeAvatarFrame: Boolean(avatar && !frameUuid),
          textureWidth: avatar?.texture?.width || 0,
        };
      })()`);
      if (/^\/api\/avatar\/\d{6}\?v=\d+$/.test(online.accountIdentity?.avatarSource || '')
        && online.accountIdentity?.runtimeAvatarFrame === true
        && online.accountIdentity?.textureWidth > 0) break;
      await sleep(100);
    }
    if (onlineScreenshot) {
      await mkdir(dirname(onlineScreenshot), { recursive: true });
      const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
      await writeFile(onlineScreenshot, Buffer.from(shot.result.data, 'base64'));
    }
    online.accountRooms = await evaluate(cdp, `(async () => {
      const frame = document.querySelector('iframe');
      const gameWindow = frame?.contentWindow;
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const flow = () => gameWindow?.cc?.director?.getScene?.()?.getChildByName?.('ThirteenFlow')
        ?.components?.find?.((component) => typeof component.getAcceptanceState === 'function');
      const sceneName = () => gameWindow?.cc?.director?.getScene?.()?.name || null;
      const roomState = () => {
        const room = gameWindow?.cc?.director?.getScene?.()?.getChildByPath?.('Canvas/R03RoomRoot');
        const view = room?.components?.find?.((component) => typeof component.getAcceptanceState === 'function');
        return { root: room, state: view?.getAcceptanceState?.() || null };
      };
      const waitUntil = async (read, accepted, label, timeoutMs = 10_000) => {
        const deadline = Date.now() + timeoutMs;
        let value = null;
        while (Date.now() < deadline) {
          value = read();
          if (accepted(value)) return value;
          await wait(50);
        }
        throw new Error(label + ':' + JSON.stringify(value));
      };
      const identity = flow()?.hostBridge?.current?.().user || {};
      const selfName = identity.displayName || '当前玩家';
      const selfAvatar = identity.avatar || '';
      class AccountRoomSocket {
        constructor() {
          this.readyState = 0;
          this.onopen = null;
          this.onmessage = null;
          this.onclose = null;
          this.onerror = null;
          setTimeout(() => {
            this.readyState = 1;
            this.onopen?.();
          }, 0);
        }
        emit(message) {
          setTimeout(() => this.onmessage?.({ data: JSON.stringify(message) }), 0);
        }
        send(serialized) {
          const message = JSON.parse(serialized);
          if (message.t === 'thirteen:hello') {
            this.emit({ t: 'thirteen:ready', v: 2 });
          } else if (message.t === 'thirteen:create-private') {
            this.emit({
              t: 'thirteen:room', v: 2, seat: 0,
              room: {
                code: 'A1B2C3', started: false, stake: null, economyMode: 'free-v1',
                readyCount: 0, playerCount: 2, hostSeat: 0, canStart: false,
                players: [
                  { seat: 0, userId: 'account-self', displayName: selfName, avatar: selfAvatar, connected: true, ready: false, isHost: true },
                  { seat: 1, userId: 'account-peer', displayName: '真实对手', avatar: selfAvatar, connected: true, ready: false, isHost: false },
                ],
              },
            });
          } else if (message.t === 'thirteen:matchmake') {
            this.emit({ t: 'thirteen:matchmaking', v: 2, queued: true, playerCount: 2, stake: null, economyMode: 'free-v1' });
          } else if (message.t === 'thirteen:leave') {
            this.emit({ t: 'thirteen:left', v: 2 });
          }
        }
        close() {
          this.readyState = 3;
          this.onclose?.();
        }
      }
      gameWindow.WebSocket = AccountRoomSocket;

      flow()?.selectLobbyMode?.('room');
      const privateRouteScene = await waitUntil(
        sceneName, (value) => value === 'R03Room', 'private_room_scene_timeout',
      );
      const privateEntry = await waitUntil(
        () => roomState().state,
        (value) => value?.state === 'private-entry',
        'private_entry_timeout',
      );
      roomState().root?.emit?.('r03-create-private');
      const privateRoom = await waitUntil(
        () => roomState().state,
        (value) => value?.state === 'room' && value?.roomCode === 'A1B 2C3',
        'private_room_timeout',
      );

      flow()?.leaveOnlineAndShowLobby?.();
      await waitUntil(sceneName, (value) => value === 'R02Lobby', 'private_leave_timeout');
      flow()?.selectLobbyMode?.('quick');
      const quickRouteScene = await waitUntil(
        sceneName, (value) => value === 'R03Room', 'quick_room_scene_timeout',
      );
      const quickQueue = await waitUntil(
        () => roomState().state,
        (value) => value?.state === 'queueing' && value?.seatNames?.[0] === selfName,
        'quick_queue_timeout',
      );
      flow()?.leaveOnlineAndShowLobby?.();
      await waitUntil(sceneName, (value) => value === 'R02Lobby', 'quick_leave_timeout');
      return { selfName, selfAvatar, privateRouteScene, quickRouteScene, privateEntry, privateRoom, quickQueue };
    })()`);
    online.authenticatedEconomy = await evaluate(cdp, `(async () => {
      const frame = document.querySelector('iframe');
      const gameWindow = frame?.contentWindow;
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const flow = () => gameWindow?.cc?.director?.getScene?.()?.getChildByName?.('ThirteenFlow')?.components
        ?.find?.((component) => typeof component.getAcceptanceState === 'function');
      const sceneName = () => gameWindow?.cc?.director?.getScene?.()?.name || null;
      const waitUntil = async (read, accepted, label, timeoutMs = 12_000) => {
        const deadline = Date.now() + timeoutMs;
        let value = null;
        while (Date.now() < deadline) {
          value = read();
          if (accepted(value)) return value;
          await wait(50);
        }
        throw new Error(label + ':' + JSON.stringify(value));
      };
      window.__thirteenWalletBridgeProbe = [];
      gameWindow.__thirteenEconomyFetchProbe = [];
      const originalFetch = gameWindow.fetch.bind(gameWindow);
      gameWindow.fetch = async (input, init) => {
        const response = await originalFetch(input, init);
        const requestUrl = new URL(typeof input === 'string' ? input : input.url, gameWindow.location.href);
        if (requestUrl.pathname.startsWith('/api/games/thirteen/')) {
          const headers = new Headers(init?.headers);
          gameWindow.__thirteenEconomyFetchProbe.push({
            path: requestUrl.pathname,
            method: init?.method || 'GET',
            status: response.status,
            uidHeader: /^\\d{6}$/.test(headers.get('x-game-uid') || ''),
            bearerHeader: Boolean(headers.get('authorization')),
          });
        }
        return response;
      };
      window.addEventListener('game4:wallet-updated', (event) => {
        window.__thirteenWalletBridgeProbe.push(event.detail);
      });
      await flow()?.refreshEconomyWallet?.();
      await waitUntil(
        () => ({
          wallet: flow()?.getAcceptanceState?.().online?.economyWallet || null,
          bridge: window.__thirteenWalletBridgeProbe?.at?.(-1) || null,
        }),
        (value) => value.wallet?.diamonds === 10000 && value.bridge?.diamonds === 10000,
        'single_diamond_wallet_timeout',
      );
      const lobby = gameWindow?.cc?.director?.getScene?.()?.getChildByPath?.('Canvas/R02LobbyRoot');
      const exchangeButton = lobby?.getChildByPath?.('WalletEntry/ExchangeButton');
      const exchangeOverlay = lobby?.getChildByName?.('O04ExchangeOverlay');
      const walletLabel = lobby?.getChildByPath?.('WalletEntry/WalletLabel')
        ?.getComponent?.(gameWindow.cc.Label)?.string || null;
      const walletValue = lobby?.getChildByPath?.('WalletEntry/WalletValue')
        ?.getComponent?.(gameWindow.cc.Label)?.string || null;

      flow()?.showHistory?.();
      await waitUntil(sceneName, (value) => value === 'O05History', 'history_scene_timeout');
      const historyRoot = gameWindow.cc.director.getScene()?.getChildByPath?.('Canvas/O05HistoryRoot');
      const historyView = historyRoot?.components?.find?.((component) =>
        typeof component.getAcceptanceState === 'function');
      const history = await waitUntil(
        () => historyView?.getAcceptanceState?.() || null,
        (value) => value?.loading === false,
        'history_load_timeout',
      );
      historyRoot?.emit?.('o05-back');
      await waitUntil(sceneName, (value) => value === 'R02Lobby', 'history_return_timeout');

      flow()?.showSettings?.('R02Lobby', 'account');
      await waitUntil(sceneName, (value) => value === 'R06Settings', 'account_scene_timeout');
      const settingsRoot = gameWindow.cc.director.getScene()?.getChildByPath?.('Canvas/R06SettingsRoot');
      const settingsView = settingsRoot?.components?.find?.((component) =>
        typeof component.getAcceptanceState === 'function');
      const account = await waitUntil(
        () => settingsView?.getAcceptanceState?.() || null,
        (value) => value?.category === 'account' && value?.diamondBalance === 10000,
        'account_state_timeout',
      );
      settingsView?.saveAndReturn?.();
      await waitUntil(sceneName, (value) => value === 'R02Lobby', 'account_return_timeout');

      const frameUrl = new URL(frame?.src || location.href);
      const wallet = flow()?.getAcceptanceState?.().online?.economyWallet || null;
      const bridge = window.__thirteenWalletBridgeProbe?.at?.(-1) || null;
      return {
        iframeHasUid: /^\\d{6}$/.test(frameUrl.searchParams.get('uid') || ''),
        iframeHasToken: Boolean(frameUrl.searchParams.get('token')),
        wallet,
        bridge,
        walletLabel,
        walletValue,
        economyAuthenticated: Boolean(flow()?.economy?.authenticated),
        exchangeHidden: exchangeButton?.active === false && exchangeOverlay?.active === false,
        history,
        account,
        fetchProbe: gameWindow.__thirteenEconomyFetchProbe,
      };
    })()`);
  }

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
    && online.cachedAudioClips >= 2
    && online.cachedRoute
    && online.onlineCanvas
    && offline.canvas
    && offline.cocos
    && offline.scene === 'R02Lobby'
    && online.releaseLanguage === 'zh-CN'
    && offline.releaseLanguage === 'zh-CN'
    && !offline.loadingOverlayVisible
    && online.trustedAudio.after?.loadedClips >= 2
    && online.trustedAudio.after?.unlocked === true
    && online.trustedAudio.after?.architecture === 'scene-mounted-six-bus'
    && online.trustedAudio.after?.assignedSources === 6
    && online.trustedAudio.after?.missingSources?.length === 0
    && online.trustedAudio.after?.contextState === 'running'
    && online.trustedAudio.after?.musicPlaying === true
    && online.trustedAudio.after?.ambiencePlaying === true
    && (!sessionCookie || (
      /^\/api\/avatar\/\d{6}\?v=\d+$/.test(online.accountIdentity?.avatarSource || '')
      && online.accountIdentity?.runtimeAvatarFrame === true
      && online.accountIdentity?.textureWidth > 0
      && online.accountRooms?.privateEntry?.roomCode === ''
      && online.accountRooms?.privateRouteScene === 'R03Room'
      && online.accountRooms?.quickRouteScene === 'R03Room'
      && online.accountRooms?.privateEntry?.seatNames?.[0] === online.accountRooms?.selfName
      && online.accountRooms?.privateEntry?.economyMode === 'free-v1'
      && online.accountRooms?.privateRoom?.roomCode === 'A1B 2C3'
      && online.accountRooms?.privateRoom?.seatNames?.[0] === online.accountRooms?.selfName
      && online.accountRooms?.privateRoom?.seatNames?.[1] === '真实对手'
      && online.accountRooms?.privateRoom?.avatarSources?.[0] === online.accountRooms?.selfAvatar
      && online.accountRooms?.privateRoom?.economyMode === 'free-v1'
      && online.accountRooms?.quickQueue?.roomCode === ''
      && online.accountRooms?.quickQueue?.seatNames?.[0] === online.accountRooms?.selfName
      && online.accountRooms?.quickQueue?.seatNames?.[1] === '玩家已匹配'
      && online.accountRooms?.quickQueue?.economyMode === 'free-v1'
      && !JSON.stringify(online.accountRooms).includes('836 214')
      && !['小武', '阿明', '小美'].some((name) => JSON.stringify(online.accountRooms).includes(name))
      && online.authenticatedEconomy?.iframeHasUid === true
      && online.authenticatedEconomy?.iframeHasToken === true
      && online.authenticatedEconomy?.wallet?.diamonds === 10_000
      && !Object.hasOwn(online.authenticatedEconomy?.wallet || {}, 'chips')
      && online.authenticatedEconomy?.bridge?.diamonds === 10_000
      && !Object.hasOwn(online.authenticatedEconomy?.bridge || {}, 'chips')
      && online.authenticatedEconomy?.walletLabel === '钻石'
      && online.authenticatedEconomy?.walletValue === '10,000'
      && online.authenticatedEconomy?.economyAuthenticated === true
      && online.authenticatedEconomy?.exchangeHidden === true
      && online.authenticatedEconomy?.history?.loading === false
      && online.authenticatedEconomy?.history?.error === null
      && online.authenticatedEconomy?.history?.diamondBalance === 10_000
      && online.authenticatedEconomy?.account?.category === 'account'
      && online.authenticatedEconomy?.account?.diamondBalance === 10_000
      && online.authenticatedEconomy?.fetchProbe?.some((request) => request.path === '/api/games/thirteen/wallet'
        && request.status === 200 && request.uidHeader === true && request.bearerHeader === true)
      && online.authenticatedEconomy?.fetchProbe?.some((request) => request.path === '/api/games/thirteen/history'
        && request.status === 200 && request.uidHeader === true && request.bearerHeader === true)
      && online.authenticatedEconomy?.fetchProbe?.some((request) => request.path === '/api/games/thirteen/version'
        && request.status === 200)
    ));
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
