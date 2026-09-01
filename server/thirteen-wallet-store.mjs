const GAME_SLUG = 'thirteen';
const WELCOME_DIAMONDS = 10_000;
const WELCOME_CHIPS = 10_000;

function integer(value, label) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`THIRTEEN_${label}_INVALID`);
  return parsed;
}

function changedWallets(before, after, entryUserIds) {
  const previous = new Map(before.wallets.map((wallet) => [wallet.userId, wallet]));
  return after.wallets.filter((wallet) => {
    if (!entryUserIds.has(wallet.userId)) return false;
    const old = previous.get(wallet.userId);
    return !old || old.balance !== wallet.balance || old.reserved !== wallet.reserved;
  });
}

/** PostgreSQL is the durable authority; the in-memory ledger is a reconciled gameplay cache. */
export function createThirteenWalletStore(sql) {
  async function ensureUsers(rawUserIds) {
    const userIds = [...new Set(rawUserIds.map(Number).filter(Number.isSafeInteger))];
    if (userIds.length === 0) return new Map();
    await sql.begin(async (transaction) => {
      for (const userId of userIds) {
        await transaction`
          insert into platform_wallets (user_id, diamonds_available)
          values (${userId}, 0) on conflict (user_id) do nothing
        `;
        await transaction`
          insert into game_wallets (user_id, game_slug, balance, reserved)
          values (${userId}, ${GAME_SLUG}, 0, 0)
          on conflict (user_id, game_slug) do nothing
        `;
        const diamondGrant = await transaction`
          insert into wallet_transactions
            (idempotency_key, user_id, scope, game_slug, currency, kind, available_delta, metadata)
          values (
            ${`welcome:platform:${userId}`}, ${userId}, 'platform', null, 'diamond', 'grant',
            ${WELCOME_DIAMONDS}, ${transaction.json({ reason: 'registration_welcome_v1' })}
          )
          on conflict (idempotency_key) do nothing returning id
        `;
        if (diamondGrant[0]) {
          await transaction`
            update platform_wallets set diamonds_available = diamonds_available + ${WELCOME_DIAMONDS}, updated_at = now()
            where user_id = ${userId}
          `;
        }
        const chipGrant = await transaction`
          insert into wallet_transactions
            (idempotency_key, user_id, scope, game_slug, currency, kind, available_delta, metadata)
          values (
            ${`welcome:thirteen:${userId}`}, ${userId}, 'game', ${GAME_SLUG}, 'chip', 'grant',
            ${WELCOME_CHIPS}, ${transaction.json({ reason: 'first_entry_welcome_v1' })}
          )
          on conflict (idempotency_key) do nothing returning id
        `;
        if (chipGrant[0]) {
          await transaction`
            update game_wallets set balance = balance + ${WELCOME_CHIPS}, updated_at = now()
            where user_id = ${userId} and game_slug = ${GAME_SLUG}
          `;
        }
      }
    });
    const rows = await sql`
      select user_id, balance, reserved
      from game_wallets
      where game_slug = ${GAME_SLUG} and user_id in ${sql(userIds)}
    `;
    return new Map(rows.map((row) => [String(row.user_id), {
      balance: integer(row.balance, 'BALANCE'),
      reserved: integer(row.reserved, 'RESERVED'),
    }]));
  }

  async function hydrate(directory, userIds) {
    const wallets = await ensureUsers(userIds);
    for (const [userId, wallet] of wallets) directory.syncWallet(userId, wallet.balance, wallet.reserved);
  }

  async function persistLedgerDiff(before, after) {
    const previousIds = new Set(before.entries.map((entry) => entry.id));
    const createdEntries = after.entries.filter((entry) => !previousIds.has(entry.id));
    if (createdEntries.length === 0) return;
    const entryUserIds = new Set(createdEntries.map((entry) => entry.userId));
    const wallets = changedWallets(before, after, entryUserIds);
    await sql.begin(async (transaction) => {
      for (const entry of createdEntries) {
        await transaction`
          insert into wallet_transactions
            (idempotency_key, user_id, scope, game_slug, currency, kind, available_delta, reserved_delta, metadata)
          values (
            ${`thirteen:${entry.id}`}, ${Number(entry.userId)}, 'game', ${GAME_SLUG}, 'chip', ${entry.kind},
            ${entry.availableDelta}, ${entry.reservedDelta},
            ${transaction.json({ roomId: entry.roomId, matchNumber: entry.matchNumber, ledgerEntryId: entry.id })}
          )
          on conflict (idempotency_key) do nothing
        `;
      }
      for (const wallet of wallets) {
        await transaction`
          update game_wallets
          set balance = ${wallet.balance}, reserved = ${wallet.reserved}, updated_at = now()
          where user_id = ${Number(wallet.userId)} and game_slug = ${GAME_SLUG}
        `;
      }
    });
  }

  return { ensureUsers, hydrate, persistLedgerDiff };
}
