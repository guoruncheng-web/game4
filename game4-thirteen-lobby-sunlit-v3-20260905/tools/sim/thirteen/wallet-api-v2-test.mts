import assert from 'node:assert/strict';
import { createApiAccessToken } from '../../../src/lib/auth';
import { getSql } from '../../../src/lib/db';

const baseUrl = process.env.GAME4_TEST_ORIGIN ?? 'http://127.0.0.1:3220';
const sql = getSql();
const username = `wallet-api-v2-test-${Date.now()}`;
const rows = (await sql`
  insert into users (uid, username, password_hash, avatar)
  select candidate, ${username}, 'test-only', '🧪'
  from generate_series(900000, 999999) candidate
  where not exists (select 1 from users where uid = candidate)
  order by candidate desc
  limit 1
  returning id, uid, token_version
`) as Array<{ id: string; uid: number; token_version: number }>;
const userId = Number(rows[0]?.id);
assert.ok(Number.isSafeInteger(userId));
const headers = {
  'content-type': 'application/json',
  'x-game-uid': String(rows[0].uid),
  authorization: `Bearer ${createApiAccessToken(userId, rows[0].uid, rows[0].token_version)}`,
};

try {
  const walletResponse = await fetch(`${baseUrl}/api/games/thirteen/wallet`, { headers });
  assert.equal(walletResponse.status, 200);
  assert.deepEqual(await walletResponse.json(), {
    uid: rows[0].uid,
    wallet: { diamonds: 10_000 },
    economyMode: 'free-v1',
    capabilities: { exchange: false, stakes: false, diamondSpending: false },
  });

  const before = await sql`
    select diamonds_available from platform_wallets where user_id = ${userId}
  `;
  const beforeTransactions = await sql`
    select idempotency_key, kind, currency, available_delta
    from wallet_transactions where user_id = ${userId} order by id
  `;
  const exchangeResponse = await fetch(`${baseUrl}/api/games/thirteen/exchange`, {
    method: 'POST', headers,
    body: JSON.stringify({ diamondAmount: 10, idempotencyKey: 'wallet-api-v2-retired' }),
  });
  assert.equal(exchangeResponse.status, 410);
  assert.deepEqual(await exchangeResponse.json(), {
    error: '钻石兑换牌币功能已退役',
    code: 'exchange_retired',
    economyMode: 'free-v1',
  });
  const unauthorized = await fetch(`${baseUrl}/api/games/thirteen/exchange`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  assert.equal(unauthorized.status, 401);

  const after = await sql`
    select diamonds_available from platform_wallets where user_id = ${userId}
  `;
  const afterTransactions = await sql`
    select idempotency_key, kind, currency, available_delta
    from wallet_transactions where user_id = ${userId} order by id
  `;
  const gameWallets = await sql`
    select balance, reserved from game_wallets where user_id = ${userId} and game_slug = 'thirteen'
  `;
  assert.deepEqual(after, before);
  assert.deepEqual(afterTransactions, beforeTransactions);
  assert.equal(gameWallets.length, 0);
  console.log(JSON.stringify({
    accepted: true,
    walletStatus: 200,
    exchangeStatus: 410,
    unauthorizedStatus: 401,
    diamondsUnchanged: true,
    newChipTransactions: 0,
  }));
} finally {
  await sql`delete from users where id = ${userId}`;
  await sql.end();
}
