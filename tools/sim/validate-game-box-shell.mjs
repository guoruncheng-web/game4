const [baseUrl = 'http://127.0.0.1:3000', portText = '9333'] = process.argv.slice(2);
const port = Number(portText);
const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
const target = targets.find((candidate) => candidate.type === 'page');
if (!target?.webSocketDebuggerUrl) throw new Error('no debuggable Chrome page');

const socket = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
let nextId = 1;
const runtimeErrors = [];

function command(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.method === 'Runtime.exceptionThrown') {
    runtimeErrors.push(message.params.exceptionDetails.text);
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
await command('Runtime.enable');
await command('Emulation.setDeviceMetricsOverride', {
  width: 435,
  height: 904,
  deviceScaleFactor: 1,
  mobile: true,
  screenWidth: 435,
  screenHeight: 904,
});

async function navigate(path) {
  await command('Page.navigate', { url: new URL(path, baseUrl).toString() });
  await new Promise((resolve) => setTimeout(resolve, 1800));
}

async function evaluate(expression) {
  const result = await command('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

function assert(value, message) {
  if (!value) throw new Error(message);
}

await navigate('/auth?mode=register');
let state = JSON.parse(await evaluate(`JSON.stringify({
  main: Boolean(document.querySelector('[role="main"].auth-mode-register')),
  dialog: Boolean(document.querySelector('[role="dialog"]')),
  captchaInput: Boolean(document.querySelector('.auth-captcha-input')),
  submit: Boolean(document.querySelector('.auth-primary-button')),
  overflow: document.documentElement.scrollWidth > innerWidth
})`));
assert(state.main && !state.dialog, 'registration must be an independent page');
assert(state.captchaInput && state.submit, 'registration dynamic controls are missing');
assert(!state.overflow, 'registration has horizontal overflow');

await evaluate(`document.querySelectorAll('.auth-tabs button')[1].click()`);
await new Promise((resolve) => setTimeout(resolve, 250));
state = JSON.parse(await evaluate(`JSON.stringify({
  login: Boolean(document.querySelector('.auth-mode-login')),
  fields: document.querySelectorAll('.auth-login-panel input').length,
  overflow: document.documentElement.scrollWidth > innerWidth
})`));
assert(state.login && state.fields === 2, 'login state or dynamic fields are missing');
assert(!state.overflow, 'login has horizontal overflow');

await navigate('/');
state = JSON.parse(await evaluate(`JSON.stringify({
  home: Boolean(document.querySelector('.sky-map')),
  navButtons: document.querySelectorAll('.game-controller-dock button').length,
  overflow: document.documentElement.scrollWidth > innerWidth
})`));
assert(state.home && state.navButtons === 3, 'home world or controller navigation is missing');
assert(!state.overflow, 'home has horizontal overflow');

await evaluate(`document.querySelectorAll('.game-controller-dock button')[1].click()`);
await new Promise((resolve) => setTimeout(resolve, 250));
assert(await evaluate(`Boolean(document.querySelector('.concept-tab--messages'))`), 'messages scene did not open');
await evaluate(`document.querySelectorAll('.game-controller-dock button')[2].click()`);
await new Promise((resolve) => setTimeout(resolve, 250));
assert(await evaluate(`Boolean(document.querySelector('.concept-tab--profile'))`), 'profile scene did not open');
assert(runtimeErrors.length === 0, `runtime errors: ${runtimeErrors.join('; ')}`);

console.log(JSON.stringify({
  passed: true,
  viewport: '435x904',
  routes: ['home', 'messages', 'profile', 'auth-register', 'auth-login'],
  runtimeErrors,
}));
socket.close();
