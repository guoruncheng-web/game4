const GAME_SLUG = 'thirteen';
const WELCOME_DIAMONDS = 10_000;

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

/**
 * Platform diamonds are the only active currency. Legacy chip rows remain readable
 * solely so an already-started v2 room can settle or refund its existing reserve.
 */
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
      }
    });
    const rows = await sql`
      select p.user_id, p.diamonds_available, g.balance, g.reserved
      from platform_wallets p
      left join game_wallets g on g.user_id = p.user_id and g.game_slug = ${GAME_SLUG}
      where p.user_id in ${sql(userIds)}
    `;
    return new Map(rows.map((row) => [String(row.user_id), {
      diamonds: integer(row.diamonds_available, 'DIAMONDS'),
      legacyWallet: row.balance === null || row.balance === undefined ? null : {
        balance: integer(row.balance, 'BALANCE'),
        reserved: integer(row.reserved, 'RESERVED'),
      },
    }]));
  }

  async function hydrate(directory, userIds) {
    const wallets = await ensureUsers(userIds);
    for (const [userId, wallet] of wallets) {
      if (wallet.legacyWallet) {
        directory.syncLegacyWallet(userId, wallet.legacyWallet.balance, wallet.legacyWallet.reserved);
      }
    }
    return wallets;
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
