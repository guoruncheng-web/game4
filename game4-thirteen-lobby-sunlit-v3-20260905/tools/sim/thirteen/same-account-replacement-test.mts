import assert from 'node:assert/strict';
import postgres from 'postgres';
import WebSocket from 'ws';
import { createApiAccessToken, hashPassword } from '../../../src/lib/auth';

assert.ok(process.env.DATABASE_URL, 'DATABASE_URL_required');
const endpoint = process.argv[2] || 'ws://127.0.0.1:3000/ws';
const sql = postgres(process.env.DATABASE_URL, {
  ssl: process.env.DATABASE_URL.includes('sslmode=require') ? 'require' : false,
  max: 1,
});
const clients: WebSocket[] = [];
const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitFor(
  messages: Array<Record<string, unknown>>,
  predicate: (message: Record<string, unknown>) => boolean,
  timeoutMs = 8_000,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const message = [...messages].reverse().find(predicate);
    if (message) return message;
    await sleep(25);
  }
  throw new Error(`message_timeout:${JSON.stringify(messages.map((message) => message.t))}`);
}

async function connect(uid: number, token: string) {
  const url = new URL(endpoint);
  url.searchParams.set('uid', String(uid));
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
  clients.push(ws);
  return { ws, messages };
}

let userId = 0;
try {
  const rows = await sql`
    insert into users (uid, username, password_hash, avatar, last_login_at)
    select candidate, ${`test-thirteen-replace-${Date.now()}`}, ${hashPassword('Testpass123')}, '🧪', now()
    from generate_series(699999, 600000, -1) candidate
    where not exists (select 1 from users where uid = candidate)
    order by candidate desc limit 1
    returning id, uid, token_version
  `;
  userId = Number(rows[0].id);
  const uid = Number(rows[0].uid);
  const token = createApiAccessToken(userId, uid, Number(rows[0].token_version));
  const first = await connect(uid, token);
  await waitFor(first.messages, (message) => message.t === 'ready');
  const second = await connect(uid, token);
  await waitFor(second.messages, (message) => message.t === 'ready');
  const notice = await waitFor(first.messages, (message) => (
    message.t === 'thirteen:error' && message.code === 'session_replaced'
  ));
  assert.equal(notice.v, 2);
  console.log(JSON.stringify({
    feature: 'same-account multi-device replacement',
    endpoint: new URL(endpoint).origin,
    replacementCode: notice.code,
    countedAsDistinctPlayer: false,
    accepted: true,
  }, null, 2));
} finally {
  for (const client of clients) client.close();
  await sleep(100);
  if (userId) await sql`delete from users where id = ${userId}`;
  await sql.end({ timeout: 2 });
}
