import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { startChrome } from './chrome-session.mjs';

const [origin = 'http://127.0.0.1:3198', out = 'evidence/private-test-login-20261108/browser'] = process.argv.slice(2);
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname), 'Use a local candidate');
await mkdir(out, { recursive: true });
const report = { passed: false, origin, apiFixture: true, checks: [], exceptions: [], registrationRequests: 0 };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let browser, socket;
try {
  browser = await startChrome({ out });
  const target = await (await fetch(`http://127.0.0.1:${browser.port}/json/new?about:blank`, { method: 'PUT' })).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let id = 0, submitted = false;
  const pending = new Map();
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const requestId = ++id;
    const timer = setTimeout(() => { pending.delete(requestId); reject(Error(method + ' timed out')); }, 30000);
    pending.set(requestId, message => {
      clearTimeout(timer);
      if (message.error) reject(Error(message.error.message));
      else resolve(message.result);
    });
    socket.send(JSON.stringify({ id: requestId, method, params }));
  });
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) { pending.get(message.id)?.(message); pending.delete(message.id); }
    if (message.method === 'Runtime.exceptionThrown') report.exceptions.push(message.params.exceptionDetails.text);
    if (message.method === 'Network.requestWillBeSent' && message.params.request.url.includes('/api/auth/register')) report.registrationRequests++;
    if (message.method === 'Fetch.requestPaused') {
      const { request, requestId } = message.params;
      let body = JSON.stringify({ user: null });
      let responseCode = 200, contentType = 'application/json';
      if (request.url.includes('/api/auth/login')) {
        const value = JSON.parse(request.postData);
        submitted = value.uid === '123456' && value.password === 'fixture-password';
        body = JSON.stringify({ error: '账号或密码不对', requireCaptcha: true });
        responseCode = 401;
      } else if (request.url.includes('/api/auth/captcha')) {
        // Only field visibility is tested here; captcha verification is covered by backend auth tests.
        body = null;
        contentType = 'image/png';
      }
      const bytes = body === null ? readFile('public/icons/qubaowan-icon-192-v1.png') : Promise.resolve(Buffer.from(body));
      void bytes.then(data => send('Fetch.fulfillRequest', {
        requestId, responseCode, responseHeaders: [{ name: 'content-type', value: contentType }], body: data.toString('base64'),
      })).catch(error => report.exceptions.push(error.message));
    }
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw Error(result.exceptionDetails.text);
    return result.result.value;
  };
  const wait = async expression => {
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) {
      if (await evaluate(expression).catch(() => false)) return;
      await pause(150);
    }
    throw Error('UI timed out: ' + expression);
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 1, mobile: true });
  await send('Fetch.enable', { patterns: [{ urlPattern: '*api/auth/me*' }, { urlPattern: '*api/auth/login*' }, { urlPattern: '*api/auth/captcha*' }] });
  for (const mode of ['login', 'register', 'account']) {
    await send('Page.navigate', { url: origin + '/auth?mode=' + mode + '&next=%2Fludo' });
    await wait('!!document.querySelector("input[autocomplete=username]")');
    const state = await evaluate(`({
      text: document.body.innerText,
      registrationLinks: [...document.querySelectorAll('a')].filter(a => a.href.includes('mode=register')).length,
      password: !!document.querySelector('input[autocomplete="current-password"]'),
      login: !!document.querySelector('.gb-auth-primary-button'),
    })`);
    assert.ok(state.password && state.login);
    assert.equal(state.registrationLinks, 0);
    assert.doesNotMatch(state.text, /创建账号|一键注册/);
    assert.match(state.text, /测试账号登录/);
    report.checks.push(mode + ' URL renders login without registration');
    if (mode === 'login') {
      const screenshot = await send('Page.captureScreenshot', { format: 'png' });
      await writeFile(join(out, 'login.png'), Buffer.from(screenshot.data, 'base64'));
    }
  }
  await evaluate('document.querySelector("input[autocomplete=username]").focus()');
  await send('Input.insertText', { text: '123456' });
  await evaluate('document.querySelector("input[autocomplete=current-password]").focus()');
  await send('Input.insertText', { text: 'fixture-password' });
  await wait('!document.querySelector(".gb-auth-primary-button").disabled');
  await evaluate('document.querySelector(".gb-auth-primary-button").click()');
  await wait('!!document.querySelector(".gb-auth-captcha-input")');
  assert.ok(submitted, 'UID/password protocol is preserved');
  assert.match(await evaluate('document.body.innerText'), /账号或密码不对/);
  report.checks.push('UID/password submission and required login captcha remain functional');
  assert.equal(report.registrationRequests, 0);
  assert.deepEqual(report.exceptions, []);
  report.passed = true;
} catch (error) {
  report.error = error.stack;
  process.exitCode = 1;
} finally {
  socket?.close();
  if (browser) await browser.close();
  await writeFile(join(out, 'result.json'), JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify(report));
