import { getSql } from './db';

export const THIRTEEN_GAME_SLUG = 'thirteen';
export const REGISTRATION_DIAMOND_GRANT = 10_000;
export const THIRTEEN_WELCOME_CHIP_GRANT = 10_000;
export const THIRTEEN_CHIPS_PER_DIAMOND = 100;

export type WalletSnapshot = {
  diamonds: number;
  chips: number;
  reserved: number;
  totalChips: number;
};

type WalletRow = {
  diamonds_available: string | number;
  balance: string | number;
  reserved: string | number;
};

function asSafeAmount(value: string | number, label: string): number {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error(`invalid_${label}`);
  return amount;
}

function snapshot(row: WalletRow): WalletSnapshot {
  const diamonds = asSafeAmount(row.diamonds_available, 'diamond_balance');
  const chips = asSafeAmount(row.balance, 'chip_balance');
  const reserved = asSafeAmount(row.reserved, 'chip_reserved');
  return { diamonds, chips, reserved, totalChips: chips + reserved };
}

/** Idempotently provisions both welcome grants, including for migrated accounts. */
export async function ensureWalletSnapshot(userId: number): Promise<WalletSnapshot> {
  const sql = getSql();
  return sql.begin(async (transaction) => {
    await transaction`
      insert into platform_wallets (user_id, diamonds_available)
      values (${userId}, 0)
      on conflict (user_id) do nothing
    `;
    await transaction`
      insert into game_wallets (user_id, game_slug, balance, reserved)
      values (${userId}, ${THIRTEEN_GAME_SLUG}, 0, 0)
      on conflict (user_id, game_slug) do nothing
    `;
    const platformGrant = (await transaction`
      insert into wallet_transactions
        (idempotency_key, user_id, scope, game_slug, currency, kind, available_delta, metadata)
      values (
        ${`welcome:platform:${userId}`}, ${userId}, 'platform', null, 'diamond', 'grant',
        ${REGISTRATION_DIAMOND_GRANT}, ${transaction.json({ reason: 'registration_welcome_v1' })}
      )
      on conflict (idempotency_key) do nothing
      returning id
    `) as Array<{ id: string }>;
    if (platformGrant[0]) {
      await transaction`
        update platform_wallets
        set diamonds_available = diamonds_available + ${REGISTRATION_DIAMOND_GRANT}, updated_at = now()
        where user_id = ${userId}
      `;
    }
    const gameGrant = (await transaction`
      insert into wallet_transactions
        (idempotency_key, user_id, scope, game_slug, currency, kind, available_delta, metadata)
      values (
        ${`welcome:thirteen:${userId}`}, ${userId}, 'game', ${THIRTEEN_GAME_SLUG}, 'chip', 'grant',
        ${THIRTEEN_WELCOME_CHIP_GRANT}, ${transaction.json({ reason: 'first_entry_welcome_v1' })}
      )
      on conflict (idempotency_key) do nothing
      returning id
    `) as Array<{ id: string }>;
    if (gameGrant[0]) {
      await transaction`
        update game_wallets
        set balance = balance + ${THIRTEEN_WELCOME_CHIP_GRANT}, updated_at = now()
        where user_id = ${userId} and game_slug = ${THIRTEEN_GAME_SLUG}
      `;
    }
    const rows = (await transaction`
      select p.diamonds_available, g.balance, g.reserved
      from platform_wallets p
      join game_wallets g on g.user_id = p.user_id and g.game_slug = ${THIRTEEN_GAME_SLUG}
      where p.user_id = ${userId}
      for update
    `) as WalletRow[];
    if (!rows[0]) throw new Error('wallet_provision_failed');
    return snapshot(rows[0]);
  });
}

export async function exchangeDiamondsForThirteenChips(
  userId: number,
  diamondAmount: number,
  idempotencyKey: string,
): Promise<WalletSnapshot & { spentDiamonds: number; receivedChips: number; replayed: boolean }> {
  if (!Number.isSafeInteger(diamondAmount) || diamondAmount < 1 || diamondAmount > 10_000) {
    throw new Error('invalid_exchange_amount');
  }
  if (!/^[A-Za-z0-9:_-]{8,96}$/.test(idempotencyKey)) throw new Error('invalid_idempotency_key');
  await ensureWalletSnapshot(userId);
  const chips = diamondAmount * THIRTEEN_CHIPS_PER_DIAMOND;
  const debitKey = `exchange:${userId}:${idempotencyKey}:debit`;
  const creditKey = `exchange:${userId}:${idempotencyKey}:credit`;
  const sql = getSql();
  return sql.begin(async (transaction) => {
    const rows = (await transaction`
      select p.diamonds_available, g.balance, g.reserved
      from platform_wallets p
      join game_wallets g on g.user_id = p.user_id and g.game_slug = ${THIRTEEN_GAME_SLUG}
      where p.user_id = ${userId}
      for update
    `) as WalletRow[];
    if (!rows[0]) throw new Error('wallet_not_found');
    const existing = (await transaction`
      select id from wallet_transactions
      where idempotency_key = ${debitKey} and user_id = ${userId}
      limit 1
    `) as Array<{ id: string }>;
    if (existing[0]) {
      return { ...snapshot(rows[0]), spentDiamonds: diamondAmount, receivedChips: chips, replayed: true };
    }
    if (asSafeAmount(rows[0].diamonds_available, 'diamond_balance') < diamondAmount) {
      throw new Error('insufficient_diamonds');
    }
    await transaction`
      update platform_wallets
      set diamonds_available = diamonds_available - ${diamondAmount}, updated_at = now()
      where user_id = ${userId}
    `;
    await transaction`
      update game_wallets
      set balance = balance + ${chips}, updated_at = now()
      where user_id = ${userId} and game_slug = ${THIRTEEN_GAME_SLUG}
    `;
    const metadata = transaction.json({ rate: THIRTEEN_CHIPS_PER_DIAMOND, exchangeId: idempotencyKey });
    await transaction`
      insert into wallet_transactions
        (idempotency_key, user_id, scope, game_slug, currency, kind, available_delta, metadata)
      values (${debitKey}, ${userId}, 'platform', null, 'diamond', 'exchange_debit', ${-diamondAmount}, ${metadata})
    `;
    await transaction`
      insert into wallet_transactions
        (idempotency_key, user_id, scope, game_slug, currency, kind, available_delta, metadata)
      values (${creditKey}, ${userId}, 'game', ${THIRTEEN_GAME_SLUG}, 'chip', 'exchange_credit', ${chips}, ${metadata})
    `;
    return {
      diamonds: asSafeAmount(rows[0].diamonds_available, 'diamond_balance') - diamondAmount,
      chips: asSafeAmount(rows[0].balance, 'chip_balance') + chips,
      reserved: asSafeAmount(rows[0].reserved, 'chip_reserved'),
      totalChips: asSafeAmount(rows[0].balance, 'chip_balance') + asSafeAmount(rows[0].reserved, 'chip_reserved') + chips,
      spentDiamonds: diamondAmount,
      receivedChips: chips,
      replayed: false,
    };
  });
}
