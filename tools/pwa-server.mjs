import next from 'next';
import http from 'node:http';
import https from 'node:https';

// Next 自定义宿主仅负责传输；所有鉴权和游戏业务仍在独立 Nest 网关。
const dev = process.argv.includes('--dev');
const port = Number(process.env.PORT ?? 3000);
const app = next({ dev, port, hostname: process.env.HOST ?? 'localhost' });
await app.prepare();
const handler = app.getRequestHandler();
const server = http.createServer((req, res) => { void handler(req, res); });
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
server.listen(port, process.env.HOST ?? '0.0.0.0', () => console.log(`PWA ready on port ${port}`));
let closing = false;
async function close() {
  if (closing) return; closing = true;
  for (const socket of upgraded) socket.destroy();
  server.closeAllConnections(); server.close(); await app.close();
}
process.on('SIGTERM', () => { void close(); });
process.on('SIGINT', () => { void close(); });
