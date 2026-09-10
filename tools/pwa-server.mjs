import next from 'next';
import http from 'node:http';
import https from 'node:https';
import { hostname } from 'node:os';
import { createHash } from 'node:crypto';

// Next 自定义宿主仅负责传输；所有鉴权和游戏业务仍在独立 Nest 网关。
const dev = process.argv.includes('--dev');
// 共享源码的 Mac/Linux 不能同时读写同一份 Next 开发产物。
if (dev && !process.env.NEXT_DIST_DIR) {
  const hostKey = createHash('sha256').update(hostname()).digest('hex').slice(0, 12);
  process.env.NEXT_DIST_DIR = `.next-dev-${process.platform}-${process.arch}-${hostKey}`;
}
const port = Number(process.env.PORT ?? 3000);
const app = next({ dev, port, hostname: process.env.HOST ?? 'localhost' });
await app.prepare();
const handler = app.getRequestHandler();
const server = http.createServer((req, res) => { void handler(req, res); });
// 包括 Next HMR 升级连接；closeAllConnections 不会关闭升级后的 socket。
const connections = new Set();
server.on('connection', socket => {
  connections.add(socket);
  socket.on('close', () => connections.delete(socket));
});
const upgraded = new Set();
server.on('upgrade', (req, socket, head) => {
  const path = new URL(req.url ?? '/', 'http://localhost').pathname;
  if (path !== '/ws' && !path.startsWith('/ws/')) {
    void app.getUpgradeHandler()(req, socket, head); return;
  }
  const gateway = new URL(process.env.BACKEND_GATEWAY_URL ?? 'http://127.0.0.1:7100');
  const transport = gateway.protocol === 'https:' ? https : http;
  const request = transport.request({ hostname: gateway.hostname, port: gateway.port, path: req.url, method: 'GET', headers: { ...req.headers, host: gateway.host } });
  const reject = () => { if (!socket.destroyed) socket.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'); };
  request.setTimeout(6000, () => request.destroy(new Error('gateway_timeout')));
  request.on('error', reject);
  socket.on('error', () => request.destroy());
  socket.on('close', () => request.destroy());
  function responseHead(response) {
    const lines = [`HTTP/1.1 ${response.statusCode} ${response.statusMessage ?? ''}`];
    for (let i = 0; i < response.rawHeaders.length; i += 2) lines.push(`${response.rawHeaders[i]}: ${response.rawHeaders[i + 1]}`);
    return lines.join('\r\n') + '\r\n\r\n';
  }
  // 非 101 响应必须结束下游连接，不能把鉴权失败留成悬挂的握手。
  request.on('response', response => {
    socket.write(responseHead(response));
    response.pipe(socket);
    response.on('error', () => socket.destroy());
  });
  request.on('upgrade', (response, upstream, upstreamHead) => {
    request.setTimeout(0); upgraded.add(socket); upgraded.add(upstream);
    socket.write(responseHead(response));
    if (upstreamHead.length) socket.write(upstreamHead);
    if (head.length) upstream.write(head);
    upstream.on('error', () => socket.destroy());
    socket.on('close', () => { upstream.destroy(); upgraded.delete(socket); });
    upstream.on('close', () => { socket.destroy(); upgraded.delete(upstream); });
    socket.pipe(upstream); upstream.pipe(socket);
  });
  request.end();
});
server.listen(port, process.env.HOST ?? '0.0.0.0', () => {
  console.log(`PWA ready on port ${port}`);
  if (dev) console.log(`[dev] pid=${process.pid} distDir=${process.env.NEXT_DIST_DIR} persistentCache=false`);
});
let closing = false;
async function close() {
  if (closing) {
    if (dev) process.exit(0);
    return;
  }
  closing = true;
  // 开发编译器异常时 close 可能悬挂，给本进程设置有界退出兜底。
  const deadline = dev ? setTimeout(() => process.exit(0), 5000) : null;
  deadline?.unref();
  for (const socket of upgraded) socket.destroy();
  for (const socket of connections) socket.destroy();
  server.closeAllConnections(); server.close();
  try {
    await app.close();
  } finally {
    if (deadline) clearTimeout(deadline);
    if (dev) process.exit(0);
  }
}
process.on('SIGTERM', () => { void close(); });
process.on('SIGINT', () => { void close(); });
