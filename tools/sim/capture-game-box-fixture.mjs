import { writeFile } from 'node:fs/promises';

const [url, output, action = 'none', widthText = '435', heightText = '904', portText = '9333'] = process.argv.slice(2);
if (!url || !output) throw new Error('usage: capture-game-box-fixture.mjs <url> <output.png> [none|chat-first] [width] [height] [debug-port]');
const width = Number(widthText);
const height = Number(heightText);
const port = Number(portText);

const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
const target = targets.find((candidate) => candidate.type === 'page');
if (!target?.webSocketDebuggerUrl) throw new Error('no debuggable Chrome page');

const socket = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
let nextId = 1;

function command(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

const friends = [
  { id: 21, uid: 240121, username: '方块小绿', avatar: '🧙', avatarUrl: '/assets/game-box/v3/runtime/cube-mascot.png', lastMessage: '一起开黑吧！', unreadCount: 1 },
  { id: 22, uid: 240122, username: '喵星探险家', avatar: '🐱', avatarUrl: null, lastMessage: '下次一起玩！', unreadCount: 1 },
  { id: 23, uid: 240123, username: '企鹅队长', avatar: '🐧', avatarUrl: null, lastMessage: '新地图真棒！', unreadCount: 1 },
  { id: 24, uid: 240124, username: '草莓兔兔', avatar: '🐰', avatarUrl: null, lastMessage: '好久不见！', unreadCount: 1 },
];
const messages = [
  { id: 1, senderId: 21, recipientId: 1, content: '我们现在出发去继续冒险吧！', createdAt: '2026-09-09T14:24:00Z', mine: false },
  { id: 2, senderId: 21, recipientId: 1, content: '我已经在传送门旁边等你了～', createdAt: '2026-09-09T14:25:00Z', mine: false },
  { id: 3, senderId: 1, recipientId: 21, content: '好的！我马上过去！', createdAt: '2026-09-09T14:26:00Z', mine: true },
  { id: 4, senderId: 21, recipientId: 1, content: '太棒了！这次去解锁新的浮空岛吧！', createdAt: '2026-09-09T14:27:00Z', mine: false },
  { id: 5, senderId: 1, recipientId: 21, content: '没问题！一起出发！', createdAt: '2026-09-09T14:28:00Z', mine: true },
];

function payloadFor(rawUrl) {
  const requestUrl = new URL(rawUrl);
  if (requestUrl.pathname === '/api/auth/me') {
    return { user: { uid: 100861, username: '玩家小盒子', avatar: '🧙', avatarUrl: '/assets/game-box/v3/runtime/cube-mascot.png', isAdmin: true }, token: 'fixture-token' };
  }
  if (requestUrl.pathname === '/api/wallet') return { diamonds: 2480 };
  if (requestUrl.pathname === '/api/friends') return { friends };
  if (requestUrl.pathname === '/api/friend-requests') return { requests: [] };
  if (requestUrl.pathname === '/api/messages') return { messages };
  if (requestUrl.pathname === '/api/games') return { games: [] };
  return null;
}

socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.method === 'Fetch.requestPaused') {
    const payload = payloadFor(message.params.request.url);
    if (payload) {
      void command('Fetch.fulfillRequest', {
        requestId: message.params.requestId,
        responseCode: 200,
        responseHeaders: [{ name: 'Content-Type', value: 'application/json; charset=utf-8' }],
        body: Buffer.from(JSON.stringify(payload)).toString('base64'),
      });
    } else {
      void command('Fetch.continueRequest', { requestId: message.params.requestId });
    }
    return;
  }
  if (!message.id || !pending.has(message.id)) return;
  const waiter = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) waiter.reject(new Error(message.error.message));
  else waiter.resolve(message.result);
});

await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
await command('Page.enable');
await command('Fetch.enable', { patterns: [{ urlPattern: '*://*/api/*', requestStage: 'Request' }] });
await command('Emulation.setDeviceMetricsOverride', {
  width,
  height,
  deviceScaleFactor: 1,
  mobile: true,
  screenWidth: width,
  screenHeight: height,
});
await command('Page.navigate', { url });
await new Promise((resolve) => setTimeout(resolve, 3500));
await command('Runtime.evaluate', {
  expression: `localStorage.setItem('game-box-install-dismissed-at', String(Date.now())); location.reload()`,
});
await new Promise((resolve) => setTimeout(resolve, 3500));
if (action === 'chat-first') {
  const clicked = await command('Runtime.evaluate', {
    expression: `(() => { const button = document.querySelector('.guild-friend-list > button'); if (!button) return false; button.click(); return true; })()`,
    returnByValue: true,
  });
  if (!clicked.result.value) throw new Error('first friend button not found');
  await new Promise((resolve) => setTimeout(resolve, 1800));
}
const metrics = await command('Runtime.evaluate', {
  expression: `JSON.stringify({ innerWidth, innerHeight, scrollWidth: document.documentElement.scrollWidth, activeTab: document.querySelector('[aria-current="page"]')?.textContent?.trim(), conversation: Boolean(document.querySelector('.guild-chat')) })`,
  returnByValue: true,
});
const screenshot = await command('Page.captureScreenshot', { format: 'png', fromSurface: true });
await writeFile(output, Buffer.from(screenshot.data, 'base64'));
console.log(metrics.result.value);
socket.close();
