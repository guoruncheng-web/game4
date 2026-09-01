import assert from 'node:assert/strict';
import WebSocket from 'ws';

const origin = process.argv[2] ?? 'http://127.0.0.1:3000';
const wsOrigin = process.argv[3] ?? origin.replace(/^http/, 'ws');

const login = await fetch(`${origin}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'test-e2e-1', password: 'Testpass123' }),
});
assert.equal(login.status, 200);
const identity = await login.json();
assert.match(String(identity.uid), /^\d{6}$/);
assert.match(identity.token, /^gbapi1\./);
const cookie = login.headers.getSetCookie().find((value) => value.startsWith('gb_session='))?.split(';')[0];
assert.ok(cookie);

const directGame = await fetch(`${origin}/thirteen`, {
  headers: { cookie },
  redirect: 'manual',
});
assert.ok([302, 307, 308].includes(directGame.status));
const location = directGame.headers.get('location');
assert.ok(location);
const gameUrl = new URL(location, origin);
assert.equal(gameUrl.searchParams.get('uid'), String(identity.uid));
assert.match(gameUrl.searchParams.get('token') ?? '', /^gbapi1\./);

const tokenOnlyGame = await fetch(gameUrl, { redirect: 'manual' });
assert.equal(tokenOnlyGame.status, 200);
assert.equal(tokenOnlyGame.headers.get('referrer-policy'), 'no-referrer');

const invalidUrl = new URL(gameUrl);
invalidUrl.searchParams.set('uid', '999999');
const invalidGame = await fetch(invalidUrl, { redirect: 'manual' });
assert.ok([302, 307, 308].includes(invalidGame.status));
assert.equal(new URL(invalidGame.headers.get('location'), origin).searchParams.get('reason'), 'invalid-game-token');

const ready = await openAuthenticatedSocket(
  `${wsOrigin}/ws?${new URLSearchParams({ uid: String(identity.uid), token: identity.token })}`,
);
assert.equal(ready.t, 'ready');
assert.equal(ready.me.uid, identity.uid);

await assert.rejects(openAuthenticatedSocket(`${wsOrigin}/ws`), /HTTP_401/);

console.log(JSON.stringify({
  feature: 'PWA UID/token game route, iframe transport and WebSocket authentication',
  uid: identity.uid,
  tokenPrefix: identity.token.split('.')[0],
  routeTokenized: true,
  tokenOnlyNavigation: true,
  invalidPairRejected: true,
  websocketAuthenticated: true,
  accepted: true,
}, null, 2));

function openAuthenticatedSocket(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const timeout = setTimeout(() => {
      socket.terminate();
      reject(new Error('WEBSOCKET_TIMEOUT'));
    }, 5_000);
    socket.once('unexpected-response', (_request, response) => {
      clearTimeout(timeout);
      socket.terminate();
      reject(new Error(`HTTP_${response.statusCode}`));
    });
    socket.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    socket.once('message', (raw) => {
      clearTimeout(timeout);
      const message = JSON.parse(String(raw));
      socket.close();
      resolve(message);
    });
  });
}
