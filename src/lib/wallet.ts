import { getSql } from './db';

export const REGISTRATION_DIAMOND_GRANT = 10_000;

export type WalletSnapshot = {
  diamonds: number;
};

type WalletRow = {
  diamonds_available: string | number;
};

function asSafeAmount(value: string | number, label: string): number {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error(`invalid_${label}`);
  return amount;
}

function snapshot(row: WalletRow): WalletSnapshot {
  const diamonds = asSafeAmount(row.diamonds_available, 'diamond_balance');
  return { diamonds };
}

/** Idempotently provisions the platform diamond wallet; games never mint their own currency here. */
export async function ensureWalletSnapshot(userId: number): Promise<WalletSnapshot> {
  const sql = getSql();
  return sql.begin(async (transaction) => {
    await transaction`
      insert into platform_wallets (user_id, diamonds_available)
      values (${userId}, 0)
      on conflict (user_id) do nothing
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
    const rows = (await transaction`
      select diamonds_available
      from platform_wallets
      where user_id = ${userId}
      for update
    `) as WalletRow[];
    if (!rows[0]) throw new Error('wallet_provision_failed');
    return snapshot(rows[0]);
  });
}
