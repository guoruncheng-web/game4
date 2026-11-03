import assert from 'node:assert/strict';
import postgres from 'postgres';
import { BettingLedger } from '../../../server/thirteen/server/betting-ledger.ts';
import { RoomDirectory } from '../../../server/thirteen/server/room-directory.ts';
import { createThirteenWalletStore } from '../../../server/thirteen-wallet-store.mjs';

const url = process.env.DATABASE_URL;
assert.ok(url);
const sql = postgres(url, { ssl: url.includes('sslmode=require') ? 'require' : false });
const username = `thirteen-wallet-v2-test-${Date.now()}`;
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
  const provisioned = await store.hydrate(directory, [userId]);
  assert.deepEqual(provisioned.get(userId), { diamonds: 10_000, legacyWallet: null });
  assert.equal(directory.legacyWalletFor(userId), null);
  let rows = await sql`
    select balance, reserved from game_wallets where user_id = ${Number(userId)} and game_slug = 'thirteen'
  `;
  assert.equal(rows.length, 0);

  // Seed a historical balance exactly as production v1 may contain it. The v2
  // store may close reservations, but must never grant or exchange new chips.
  await sql`
    insert into game_wallets (user_id, game_slug, balance, reserved)
    values (${Number(userId)}, 'thirteen', 10000, 0)
  `;
  await store.hydrate(directory, [userId]);
  assert.deepEqual(directory.legacyWalletFor(userId), {
    balance: 10_000, reserved: 0, total: 10_000, currency: 'chip',
  });

  const ledger = new BettingLedger();
  ledger.syncWallet(userId, 10_000, 0);
  const beforeReserve = ledger.snapshot();
  ledger.reserve(userId, 'LEGACY-ROOM', 1, 600);
  const afterReserve = ledger.snapshot();
  await store.persistLedgerDiff(beforeReserve, afterReserve);
  rows = await sql`
    select balance, reserved from game_wallets where user_id = ${Number(userId)} and game_slug = 'thirteen'
  `;
  assert.deepEqual([Number(rows[0].balance), Number(rows[0].reserved)], [9_400, 600]);

  const beforeRefund = ledger.snapshot();
  ledger.refund(userId, 'LEGACY-ROOM', 1, 600);
  const afterRefund = ledger.snapshot();
  await store.persistLedgerDiff(beforeRefund, afterRefund);
  rows = await sql`
    select balance, reserved from game_wallets where user_id = ${Number(userId)} and game_slug = 'thirteen'
  `;
  assert.deepEqual([Number(rows[0].balance), Number(rows[0].reserved)], [10_000, 0]);
  const entries = await sql`
    select kind, currency, available_delta, reserved_delta from wallet_transactions
    where user_id = ${Number(userId)} order by id
  `;
  assert.deepEqual(entries.map((entry) => [
    entry.kind, entry.currency, Number(entry.available_delta), Number(entry.reserved_delta),
  ]), [
    ['grant', 'diamond', 10_000, 0],
    ['reserve', 'chip', -600, 600],
    ['refund', 'chip', 600, -600],
  ]);
  console.log(JSON.stringify({
    accepted: true,
    diamonds: 10_000,
    newChipGrant: false,
    legacyBalance: 10_000,
    legacyReserved: 0,
  }));
} finally {
  await sql`delete from users where id = ${Number(userId)}`;
  await sql.end();
}
