import assert from 'node:assert/strict';
import { getSql } from '../../src/lib/db';
import { ensureWalletSnapshot } from '../../src/lib/wallet';

const sql = getSql();
const username = `wallet-v2-test-${Date.now()}`;
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

try {
  assert.deepEqual(await ensureWalletSnapshot(userId), { diamonds: 10_000 });
  assert.deepEqual(await ensureWalletSnapshot(userId), { diamonds: 10_000 });
  let gameWallets = await sql`
    select balance, reserved from game_wallets where user_id = ${userId} and game_slug = 'thirteen'
  `;
  assert.equal(gameWallets.length, 0);

  const beforeTransactions = await sql`
    select kind, currency, available_delta from wallet_transactions where user_id = ${userId} order by id
  `;
  assert.deepEqual(beforeTransactions.map((row) => [row.kind, row.currency, Number(row.available_delta)]), [
    ['grant', 'diamond', 10_000],
  ]);

  await sql`
    insert into game_wallets (user_id, game_slug, balance, reserved)
    values (${userId}, 'thirteen', 1234, 56)
  `;
  assert.deepEqual(await ensureWalletSnapshot(userId), { diamonds: 10_000 });
  gameWallets = await sql`
    select balance, reserved from game_wallets where user_id = ${userId} and game_slug = 'thirteen'
  `;
  assert.deepEqual(gameWallets.map((row) => [Number(row.balance), Number(row.reserved)]), [[1234, 56]]);
  const finalTransactions = await sql`
    select kind, currency, available_delta from wallet_transactions where user_id = ${userId} order by id
  `;
  assert.deepEqual(finalTransactions, beforeTransactions);
  console.log(JSON.stringify({
    accepted: true,
    uid: rows[0].uid,
    diamonds: 10_000,
    gameWalletProvisioned: false,
  }));
} finally {
  await sql`delete from users where id = ${userId}`;
  await sql.end();
}
