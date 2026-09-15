import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { startChrome } from './chrome-session.mjs';

const [origin = 'http://127.0.0.1:3347', out = 'evidence/qubaowan-v103/local-brand'] = process.argv.slice(2);
const version = process.env.PWA_CACHE_VERSION;
assert.match(version ?? '', /^v\d+$/);
await mkdir(out, { recursive: true });
const report = { origin, version, passed: false, exceptions: [], icons: [] };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let browser, socket, send;
try {
  const response = await fetch(new URL('/manifest.webmanifest', origin));
  assert.equal(response.status, 200);
  const manifest = await response.json();
  assert.equal(manifest.name, '趣宝玩');
  assert.equal(manifest.short_name, '趣宝玩');
  assert.equal(manifest.id, '/');
  assert.equal(manifest.start_url, '/');
  report.manifest = manifest;
  const paths = [...manifest.icons.map(icon => icon.src), '/icons/qubaowan-apple-touch-icon-v1.png', '/favicon.ico'];
  for (const path of paths) {
    const remote = await fetch(new URL(path, origin));
    assert.equal(remote.status, 200, path);
    const bytes = Buffer.from(await remote.arrayBuffer());
    const local = await readFile(path === '/favicon.ico' ? 'src/app/favicon.ico' : join('public', path));
    assert.deepEqual(bytes, local, path + ' differs from candidate');
    report.icons.push({ path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  browser = await startChrome({ out });
  const target = await (await fetch(`http://127.0.0.1:${browser.port}/json/new?about:blank`, { method: 'PUT' })).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  let seq = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) { pending.get(message.id)?.(message); pending.delete(message.id); }
    if (message.method === 'Runtime.exceptionThrown') report.exceptions.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
  });
  send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => { pending.delete(id); reject(Error('CDP timeout: ' + method)); }, 30000);
    pending.set(id, message => { clearTimeout(timer); if (message.error) reject(Error(JSON.stringify(message.error))); else resolve(message.result); });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw Error(result.exceptionDetails.text);
    return result.result.value;
  };
  const wait = async (expression, timeout = 180000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) { if (await evaluate(expression).catch(() => false)) return; await sleep(200); }
    throw Error('Timed out: ' + expression);
  };
  const shot = async name => {
    const result = await send('Page.captureScreenshot', { format: 'png' });
    await writeFile(join(out, name + '.png'), Buffer.from(result.data, 'base64'));
  };
  for (const method of ['Page.enable', 'Runtime.enable', 'Network.enable']) await send(method);
  await send('Emulation.setDeviceMetricsOverride', { width: 393, height: 852, deviceScaleFactor: 1, mobile: true });
  await send('Page.navigate', { url: origin + '/' });
  await wait(`navigator.serviceWorker.controller && localStorage.getItem('game-box-prepared-version') === ${JSON.stringify(version)}`);
  await wait(`document.querySelector('.gb-home h1')?.textContent.includes('趣宝玩')`);
  report.home = await evaluate(`({title:document.title,apple:document.querySelector('meta[name="apple-mobile-web-app-title"]')?.content,heading:document.querySelector('.gb-home h1').textContent,width:document.documentElement.scrollWidth,viewport:innerWidth,readyMs:Math.round(performance.now())})`);
  assert.equal(report.home.title, '趣宝玩');
  assert.equal(report.home.apple, '趣宝玩');
  assert.ok(report.home.width <= report.home.viewport);
  assert.equal(await evaluate(`!!document.querySelector('img[src="/icons/icon-192.png"]')`), false, 'install banner must use new icon');
  await shot('home');
  report.cache = await evaluate(`(async()=>{const c=await caches.open('game-box-shell-${version}');return {names:await caches.keys(),urls:(await c.keys()).map(r=>new URL(r.url).pathname)}})()`);
  for (const path of manifest.icons.filter(icon => icon.purpose === 'any').map(icon => icon.src)) assert.ok(report.cache.urls.includes(path), path + ' not cached');
  for (const mode of ['login', 'register']) {
    await send('Page.navigate', { url: origin + '/auth?mode=' + mode });
    await wait(`location.search.includes('mode=${mode}') && document.querySelector('.gb-auth-mode-${mode} .gb-auth-v2-brand b')?.textContent === '趣宝玩'`);
    await sleep(500);
    assert.equal(await evaluate(`document.body.innerText.includes('GAME BOX')`), false);
    await shot(mode);
  }
  const { targetInfos } = await send('Target.getTargets');
  for (const worker of targetInfos.filter(t => t.type === 'service_worker' && t.url.startsWith(origin))) {
    const { sessionId } = await send('Target.attachToTarget', { targetId: worker.targetId, flatten: true });
    await send('Network.enable', {}, sessionId);
    await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 }, sessionId);
  }
  await send('Page.navigate', { url: 'about:blank' });
  await wait(`location.href === 'about:blank' && !document.querySelector('.gb-home')`, 10000);
  await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await send('Network.overrideNetworkState', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await send('Page.navigate', { url: origin + '/' });
  await wait(`document.querySelector('.gb-home h1')?.textContent.includes('趣宝玩')`, 30000);
  await send('Network.overrideNetworkState', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  report.networkBlocked = await evaluate(`fetch('/api/qubaowan-offline-check?t='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(5000)}).then(()=>false,()=>true)`);
  assert.equal(report.networkBlocked, true, 'uncached network request must fail offline');
  report.offline = await evaluate(`({title:document.title,controlled:!!navigator.serviceWorker.controller,online:navigator.onLine})`);
  assert.equal(report.offline.title, '趣宝玩');
  assert.equal(report.offline.online, false);
  assert.ok(report.offline.controlled);
  await shot('offline-home');
  assert.deepEqual(report.exceptions, []);
  report.passed = true;
} catch (error) {
  report.error = String(error);
  if (send) try { const shot = await send('Page.captureScreenshot', { format: 'png' }); await writeFile(join(out, 'failure.png'), Buffer.from(shot.data, 'base64')); } catch {}
  process.exitCode = 1;
} finally {
  socket?.close();
  if (browser) await browser.close();
  await writeFile(join(out, 'result.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: report.passed, error: report.error, home: report.home, offline: report.offline }));
}
