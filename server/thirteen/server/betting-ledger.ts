export const DEFAULT_VIRTUAL_BALANCE = 10_000;
export const ALLOWED_TABLE_STAKES = [100, 200, 300, 400, 500, 600] as const;

export type TableStake = typeof ALLOWED_TABLE_STAKES[number];

export interface WalletView {
  readonly balance: number;
  readonly reserved: number;
  readonly total: number;
  readonly currency: 'chip';
}

export interface LedgerEntry {
  readonly id: string;
  readonly kind: 'reserve' | 'refund' | 'settle';
  readonly userId: string;
  readonly roomId: string;
  readonly matchNumber: number;
  readonly availableDelta: number;
  readonly reservedDelta: number;
  readonly createdAt: number;
}

interface WalletRecord {
  balance: number;
  reserved: number;
}

export interface BettingLedgerSnapshot {
  readonly version: 1;
  readonly wallets: readonly {
    readonly userId: string;
    readonly balance: number;
    readonly reserved: number;
  }[];
  readonly entries: readonly LedgerEntry[];
  readonly settlements: readonly string[];
}

function assertMoney(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`invalid_${label}`);
}

export function isAllowedTableStake(value: unknown): value is TableStake {
  return Number.isSafeInteger(value) && ALLOWED_TABLE_STAKES.includes(value as TableStake);
}

export class BettingLedger {
  private readonly now: () => number;
  private readonly wallets = new Map<string, WalletRecord>();
  private readonly entries = new Map<string, LedgerEntry>();
  private readonly settlements = new Set<string>();

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  ensureWallet(userId: string): WalletView {
    if (!this.wallets.has(userId)) {
      this.wallets.set(userId, { balance: DEFAULT_VIRTUAL_BALANCE, reserved: 0 });
    }
    return this.view(userId);
  }

  view(userId: string): WalletView {
    const wallet = this.wallets.get(userId);
    if (!wallet) return this.ensureWallet(userId);
    return {
      balance: wallet.balance,
      reserved: wallet.reserved,
      total: wallet.balance + wallet.reserved,
      currency: 'chip',
    };
  }

  /** Reconciles the runtime cache from the authenticated Postgres wallet. */
  syncWallet(userId: string, balance: number, reserved: number): WalletView {
    assertMoney(balance, 'wallet_balance');
    assertMoney(reserved, 'wallet_reserved');
    this.wallets.set(userId, { balance, reserved });
    return this.view(userId);
  }

  reserve(userId: string, roomId: string, matchNumber: number, stake: TableStake): LedgerEntry {
    const active = this.activeReservationEntry(userId, roomId, matchNumber);
    if (active) return active;
    const wallet = this.wallet(userId);
    if (wallet.balance < stake) throw new Error('insufficient_chips');
    wallet.balance -= stake;
    wallet.reserved += stake;
    const cycle = this.reservationCycles(userId, roomId, matchNumber) + 1;
    const id = this.reserveId(userId, roomId, matchNumber, cycle);
    return this.record({
      id, kind: 'reserve', userId, roomId, matchNumber,
      availableDelta: -stake, reservedDelta: stake,
    });
  }

  refund(userId: string, roomId: string, matchNumber: number, stake: TableStake): LedgerEntry {
    const active = this.activeReservationEntry(userId, roomId, matchNumber);
    if (!active) {
      const duplicate = this.latestEntry('refund', userId, roomId, matchNumber);
      if (duplicate) return duplicate;
      throw new Error('practice_chip_reservation_missing');
    }
    if (this.settlements.has(this.settlementId(roomId, matchNumber))) {
      throw new Error('practice_chip_round_already_settled');
    }
    const wallet = this.wallet(userId);
    if (wallet.reserved < stake) throw new Error('practice_chip_reservation_corrupt');
    wallet.balance += stake;
    wallet.reserved -= stake;
    const id = this.refundId(userId, roomId, matchNumber, this.reservationCycles(userId, roomId, matchNumber));
    return this.record({
      id, kind: 'refund', userId, roomId, matchNumber,
      availableDelta: stake, reservedDelta: -stake,
    });
  }

  settle(
    roomId: string,
    matchNumber: number,
    stake: TableStake,
    userIds: readonly string[],
    winnerUserId: string,
  ): readonly LedgerEntry[] {
    const settlementId = this.settlementId(roomId, matchNumber);
    if (this.settlements.has(settlementId)) {
      return userIds.flatMap((userId) => {
        const entry = this.entries.get(this.settleEntryId(userId, roomId, matchNumber));
        return entry ? [entry] : [];
      });
    }
    if (userIds.length !== 4 || new Set(userIds).size !== 4 || !userIds.includes(winnerUserId)) {
      throw new Error('invalid_practice_chip_settlement_members');
    }
    for (const userId of userIds) {
      if (!this.hasReservation(userId, roomId, matchNumber)) {
        throw new Error('practice_chip_reservation_missing');
      }
      if (this.wallet(userId).reserved < stake) throw new Error('practice_chip_reservation_corrupt');
    }

    const created: LedgerEntry[] = [];
    for (const userId of userIds) {
      const wallet = this.wallet(userId);
      const prize = userId === winnerUserId ? stake * userIds.length : 0;
      wallet.reserved -= stake;
      wallet.balance += prize;
      created.push(this.record({
        id: this.settleEntryId(userId, roomId, matchNumber),
        kind: 'settle', userId, roomId, matchNumber,
        availableDelta: prize, reservedDelta: -stake,
      }));
    }
    this.settlements.add(settlementId);
    return created;
  }

  netDelta(userId: string, roomId: string, matchNumber: number): number | null {
    const entry = this.entries.get(this.settleEntryId(userId, roomId, matchNumber));
    if (!entry) return null;
    return Array.from(this.entries.values())
      .filter((candidate) => candidate.userId === userId
        && candidate.roomId === roomId && candidate.matchNumber === matchNumber)
      .reduce((sum, candidate) => sum + candidate.availableDelta, 0);
  }

  hasReservation(userId: string, roomId: string, matchNumber: number): boolean {
    return Array.from(this.entries.values())
      .filter((entry) => entry.userId === userId
        && entry.roomId === roomId && entry.matchNumber === matchNumber)
      .reduce((sum, entry) => sum + entry.reservedDelta, 0) > 0;
  }

  snapshot(): BettingLedgerSnapshot {
    return {
      version: 1,
      wallets: Array.from(this.wallets, ([userId, wallet]) => ({ userId, ...wallet })),
      entries: Array.from(this.entries.values()),
      settlements: Array.from(this.settlements),
    };
  }

  static restore(snapshot: BettingLedgerSnapshot, now: () => number = Date.now): BettingLedger {
    if (snapshot?.version !== 1 || !Array.isArray(snapshot.wallets)
      || !Array.isArray(snapshot.entries) || !Array.isArray(snapshot.settlements)) {
      throw new Error('invalid_betting_ledger_snapshot');
    }
    const ledger = new BettingLedger(now);
    for (const record of snapshot.wallets) {
      assertMoney(record.balance, 'wallet_balance');
      assertMoney(record.reserved, 'wallet_reserved');
      ledger.wallets.set(record.userId, { balance: record.balance, reserved: record.reserved });
    }
    for (const entry of snapshot.entries) ledger.entries.set(entry.id, { ...entry });
    for (const settlement of snapshot.settlements) ledger.settlements.add(settlement);
    return ledger;
  }

  private wallet(userId: string): WalletRecord {
    this.ensureWallet(userId);
    return this.wallets.get(userId)!;
  }

  private record(input: Omit<LedgerEntry, 'createdAt'>): LedgerEntry {
    const entry = { ...input, createdAt: this.now() };
    this.entries.set(entry.id, entry);
    return entry;
  }

  private reservationCycles(userId: string, roomId: string, matchNumber: number): number {
    return Array.from(this.entries.values()).filter((entry) => entry.kind === 'reserve'
      && entry.userId === userId && entry.roomId === roomId && entry.matchNumber === matchNumber).length;
  }

  private activeReservationEntry(userId: string, roomId: string, matchNumber: number): LedgerEntry | null {
    if (!this.hasReservation(userId, roomId, matchNumber)) return null;
    return this.latestEntry('reserve', userId, roomId, matchNumber);
  }

  private latestEntry(
    kind: LedgerEntry['kind'],
    userId: string,
    roomId: string,
    matchNumber: number,
  ): LedgerEntry | null {
    return Array.from(this.entries.values()).filter((entry) => entry.kind === kind
      && entry.userId === userId && entry.roomId === roomId && entry.matchNumber === matchNumber).at(-1) ?? null;
  }

  private reserveId(userId: string, roomId: string, matchNumber: number, cycle: number): string {
    return `reserve:${roomId}:${matchNumber}:${userId}:${cycle}`;
  }

  private refundId(userId: string, roomId: string, matchNumber: number, cycle: number): string {
    return `refund:${roomId}:${matchNumber}:${userId}:${cycle}`;
  }

  private settleEntryId(userId: string, roomId: string, matchNumber: number): string {
    return `settle:${roomId}:${matchNumber}:${userId}`;
  }

  private settlementId(roomId: string, matchNumber: number): string {
    return `settlement:${roomId}:${matchNumber}`;
  }
}
