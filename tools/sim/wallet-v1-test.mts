import assert from 'node:assert/strict';
import { getSql } from '../../src/lib/db';
import { ensureWalletSnapshot, exchangeDiamondsForThirteenChips } from '../../src/lib/wallet';

const sql = getSql();
const username = `wallet-test-${Date.now()}`;
const rows = (await sql`
  insert into users (uid, username, password_hash, avatar)
  select candidate, ${username}, 'test-only', '🧪'
  from generate_series(900000, 999999) candidate
  where not exists (select 1 from users where uid = candidate)
  order by candidate desc
  limit 1
  returning id, uid
`) as Array<{ id: string; uid: number }>;
const userId = Number(rows[0]?.id);
assert.ok(Number.isSafeInteger(userId));

try {
  assert.deepEqual(await ensureWalletSnapshot(userId), {
    diamonds: 10_000, chips: 10_000, reserved: 0, totalChips: 10_000,
  });
  const first = await exchangeDiamondsForThirteenChips(userId, 10, 'wallet-v1-idempotency');
  assert.deepEqual(first, {
    diamonds: 9_990, chips: 11_000, reserved: 0, totalChips: 11_000,
    spentDiamonds: 10, receivedChips: 1_000, replayed: false,
  });
  const replay = await exchangeDiamondsForThirteenChips(userId, 10, 'wallet-v1-idempotency');
  assert.equal(replay.replayed, true);
  assert.equal(replay.diamonds, 9_990);
  assert.equal(replay.chips, 11_000);
  const transactions = (await sql`
    select kind, available_delta from wallet_transactions where user_id = ${userId} order by id
  `) as Array<{ kind: string; available_delta: string }>;
  assert.deepEqual(transactions.map((row) => [row.kind, Number(row.available_delta)]), [
    ['grant', 10_000], ['grant', 10_000], ['exchange_debit', -10], ['exchange_credit', 1_000],
  ]);
  console.log(JSON.stringify({ accepted: true, uid: rows[0].uid, transactionCount: transactions.length }));
} finally {
  await sql`delete from users where id = ${userId}`;
  await sql.end();
}
