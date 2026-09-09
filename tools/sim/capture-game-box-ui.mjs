import { writeFile } from 'node:fs/promises';

const [url, output, widthText = '393', heightText = '852', portText = '9333'] = process.argv.slice(2);
if (!url || !output) throw new Error('usage: capture-game-box-ui.mjs <url> <output.png> [width] [height] [debug-port]');
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

socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
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
await command('Emulation.setDeviceMetricsOverride', {
  width,
  height,
  deviceScaleFactor: 1,
  mobile: true,
  screenWidth: width,
  screenHeight: height,
});
await command('Page.navigate', { url });
await new Promise((resolve) => setTimeout(resolve, 1000));
await command('Runtime.evaluate', {
  expression: `localStorage.setItem('game-box-install-dismissed-at', String(Date.now())); location.reload()`,
});
await new Promise((resolve) => setTimeout(resolve, 2500));
const metrics = await command('Runtime.evaluate', {
  expression: 'JSON.stringify({innerWidth,innerHeight,devicePixelRatio,scrollWidth:document.documentElement.scrollWidth})',
  returnByValue: true,
});
const screenshot = await command('Page.captureScreenshot', { format: 'png', fromSurface: true });
await writeFile(output, Buffer.from(screenshot.data, 'base64'));
console.log(metrics.result.value);
socket.close();
