import assert from 'node:assert/strict';
import postgres from 'postgres';
import WebSocket from 'ws';
import { createApiAccessToken, hashPassword } from '../../../src/lib/auth';

assert.ok(process.env.DATABASE_URL, 'DATABASE_URL_required');
const endpoint = process.argv[2] || 'ws://127.0.0.1:7011/ws';
const sql = postgres(process.env.DATABASE_URL, {
  ssl: process.env.DATABASE_URL.includes('sslmode=require') ? 'require' : false,
  max: 2,
});
const prefix = `test-thirteen-live-${Date.now()}`;
const users: Array<{ id: number; uid: number; tokenVersion: number }> = [];
const clients: Array<{ ws: WebSocket; messages: Array<Record<string, unknown>> }> = [];

const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitFor(
  client: { messages: Array<Record<string, unknown>> },
  predicate: (message: Record<string, unknown>) => boolean,
  timeoutMs = 8_000,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = [...client.messages].reverse().find(predicate);
    if (found) return found;
    await delay(25);
  }
  throw new Error(`message_timeout:${JSON.stringify(client.messages.map((message) => message.t))}`);
}

async function connect(user: { id: number; uid: number; tokenVersion: number }) {
  const token = createApiAccessToken(user.id, user.uid, user.tokenVersion);
  const url = new URL(endpoint);
  url.searchParams.set('uid', String(user.uid));
  url.searchParams.set('token', token);
  const ws = new WebSocket(url);
  const messages: Array<Record<string, unknown>> = [];
  ws.on('message', (raw) => {
    try { messages.push(JSON.parse(raw.toString())); } catch { /* ignore malformed test noise */ }
  });
  await new Promise<void>((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  const client = { ws, messages };
  clients.push(client);
  ws.send(JSON.stringify({ t: 'thirteen:hello', v: 2 }));
  await waitFor(client, (message) => message.t === 'thirteen:ready');
  return client;
}

try {
  for (let index = 0; index < 2; index += 1) {
    const rows = await sql`
      insert into users (uid, username, password_hash, avatar, last_login_at)
      select candidate, ${`${prefix}-${index}`}, ${hashPassword('Testpass123')}, '🧪', now()
      from generate_series(899999, 800000, -1) candidate
      where not exists (select 1 from users where uid = candidate)
      order by candidate desc limit 1
      returning id, uid, token_version
    `;
    users.push({
      id: Number(rows[0].id), uid: Number(rows[0].uid), tokenVersion: Number(rows[0].token_version),
    });
  }

  const first = await connect(users[0]);
  const second = await connect(users[1]);
  first.ws.send(JSON.stringify({ t: 'thirteen:matchmake', v: 2 }));
  const one = await waitFor(first, (message) => (
    message.t === 'thirteen:matchmaking' && message.playerCount === 1
  ));
  second.ws.send(JSON.stringify({ t: 'thirteen:matchmake', v: 2 }));
  const firstTwo = await waitFor(first, (message) => (
    message.t === 'thirteen:matchmaking' && message.playerCount === 2
  ));
  const secondTwo = await waitFor(second, (message) => (
    message.t === 'thirteen:matchmaking' && message.playerCount === 2
  ));
  for (const message of [one, firstTwo, secondTwo]) {
    assert.equal(message.economyMode, 'free-v1');
    assert.equal(message.stake, null);
  }

  console.log(JSON.stringify({
    feature: 'live two-client quick matchmaking queue broadcast',
    endpoint: new URL(endpoint).origin,
    firstClientCounts: [one.playerCount, firstTwo.playerCount],
    secondClientCount: secondTwo.playerCount,
    distinctAuthenticatedUsers: users[0].id !== users[1].id,
    accepted: true,
  }, null, 2));

  first.ws.send(JSON.stringify({ t: 'thirteen:leave', v: 2 }));
  second.ws.send(JSON.stringify({ t: 'thirteen:leave', v: 2 }));
  await Promise.all([
    waitFor(first, (message) => message.t === 'thirteen:left'),
    waitFor(second, (message) => message.t === 'thirteen:left'),
  ]);
} finally {
  for (const client of clients) client.ws.close();
  await delay(100);
  for (const user of users) await sql`delete from users where id = ${user.id}`;
  await sql.end({ timeout: 2 });
}
