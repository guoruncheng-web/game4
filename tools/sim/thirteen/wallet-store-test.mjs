import assert from 'node:assert/strict';
import postgres from 'postgres';
import { RoomDirectory } from '../../../server/thirteen/server/room-directory.ts';
import { createThirteenWalletStore } from '../../../server/thirteen-wallet-store.mjs';

const url = process.env.DATABASE_URL;
assert.ok(url);
const sql = postgres(url, { ssl: url.includes('sslmode=require') ? 'require' : false });
const username = `thirteen-wallet-test-${Date.now()}`;
const users = await sql`
  insert into users (uid, username, password_hash, avatar)
  select candidate, ${username}, 'test-only', '🧪'
  from generate_series(900000, 999999) candidate
  where not exists (select 1 from users where uid = candidate)
  order by candidate desc
  limit 1
  returning id, uid
`;
const userId = String(users[0].id);

try {
  const directory = new RoomDirectory(() => 7);
  directory.registerPlayer({ userId, displayName: username, avatar: '🧪' });
  const store = createThirteenWalletStore(sql);
  await store.hydrate(directory, [userId]);
  assert.equal(directory.walletFor(userId).balance, 10_000);

  const beforeReserve = directory.snapshot();
  directory.createPrivate(userId, 600);
  directory.setReady(userId, true);
  const afterReserve = directory.snapshot();
  await store.persistLedgerDiff(beforeReserve.ledger, afterReserve.ledger);
  let rows = await sql`select balance, reserved from game_wallets where user_id = ${Number(userId)} and game_slug = 'thirteen'`;
  assert.deepEqual([Number(rows[0].balance), Number(rows[0].reserved)], [9_400, 600]);

  const beforeRefund = directory.snapshot();
  directory.setReady(userId, false);
  const afterRefund = directory.snapshot();
  await store.persistLedgerDiff(beforeRefund.ledger, afterRefund.ledger);
  rows = await sql`select balance, reserved from game_wallets where user_id = ${Number(userId)} and game_slug = 'thirteen'`;
  assert.deepEqual([Number(rows[0].balance), Number(rows[0].reserved)], [10_000, 0]);
  const entries = await sql`
    select kind, available_delta, reserved_delta from wallet_transactions
    where user_id = ${Number(userId)} order by id
  `;
  assert.deepEqual(entries.map((entry) => [entry.kind, Number(entry.available_delta), Number(entry.reserved_delta)]), [
    ['grant', 10_000, 0], ['grant', 10_000, 0], ['reserve', -600, 600], ['refund', 600, -600],
  ]);
  console.log(JSON.stringify({ accepted: true, stake: 600, balance: 10_000, reserved: 0 }));
} finally {
  await sql`delete from users where id = ${Number(userId)}`;
  await sql.end();
}
