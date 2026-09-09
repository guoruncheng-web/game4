const [url, selectorsText, portText = '9333'] = process.argv.slice(2);
if (!url || !selectorsText) throw new Error('usage: inspect-game-box-ui.mjs <url> <selector,...> [debug-port]');
const port = Number(portText);
const selectors = selectorsText.split(',');

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
  width: 435,
  height: 904,
  deviceScaleFactor: 1,
  mobile: true,
  screenWidth: 435,
  screenHeight: 904,
});
await command('Page.navigate', { url });
await new Promise((resolve) => setTimeout(resolve, 1800));
const expression = `JSON.stringify(${JSON.stringify(selectors)}.map((selector) => {
  const element = document.querySelector(selector);
  if (!element) return { selector, missing: true };
  const style = getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return {
    selector,
    tag: element.tagName,
    className: element.className,
    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    border: style.border,
    outline: style.outline,
    boxShadow: style.boxShadow,
    background: style.background,
    focused: document.activeElement === element,
  };
}))`;
const result = await command('Runtime.evaluate', { expression, returnByValue: true });
console.log(result.result.value);
socket.close();
