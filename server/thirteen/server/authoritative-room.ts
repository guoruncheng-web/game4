import { createHash, randomBytes } from 'node:crypto';
import type { Card } from '../assets/game/scripts/core/cards';
import {
  RULES_VERSION,
  applyAction,
  createMatch,
  scoreMatch,
  timeoutAction,
  type MatchAction,
  type MatchState,
  type PlayedTrick,
  type ScoreResult,
} from '../assets/game/scripts/core/match';

export const ROOM_PROTOCOL_VERSION = 2;
export const TURN_TIMEOUT_MS = 15_000;
export const DISCONNECT_BOT_DELAY_MS = 3_000;
export const RECONNECT_WINDOW_MS = 60_000;
export const DEAL_COMMITMENT_VERSION = 'thirteen-deal-v1' as const;

export type ClientAction =
  | { readonly type: 'play'; readonly cardIds: readonly string[] }
  | { readonly type: 'pass' };

export interface ClientCommand {
  readonly protocolVersion: typeof ROOM_PROTOCOL_VERSION;
  readonly clientSequence: number;
  readonly action: ClientAction;
}
export interface SeatPresence {
  readonly seat: number;
  readonly userId: string;
  readonly displayName: string;
  readonly avatar: string;
  readonly connected: boolean;
  readonly botControlled: boolean;
}

export interface PlayerIdentity {
  /** Internal authenticated id. This value is never serialized to another player. */
  readonly userId: string;
  /** Public six-digit UID (or a non-sensitive test id outside production). */
  readonly publicId?: string;
  readonly displayName: string;
  readonly avatar: string;
}

export interface PublicResultEntry {
  readonly rank: number;
  readonly seat: number;
  readonly userId: string;
  readonly displayName: string;
  readonly avatar: string;
  readonly remaining: number;
  readonly delta: number;
  readonly wagerDelta?: number;
  readonly cong: boolean;
}

export interface PublicMatchResult {
  readonly winnerSeat: number;
  readonly matchNumber: number;
  readonly entries: readonly PublicResultEntry[];
}

export interface PlayerSnapshot {
  readonly protocolVersion: typeof ROOM_PROTOCOL_VERSION;
  readonly roomId: string;
  readonly rulesVersion: typeof RULES_VERSION;
  readonly revision: number;
  readonly matchNumber: number;
  /** Sequence the authenticated client must use for its next accepted command. */
  readonly nextClientSequence: number;
  readonly seat: number;
  readonly ownHand: readonly Card[];
  readonly opponentCounts: readonly number[];
  readonly currentSeat: number;
  readonly firstPlayPending: boolean;
  readonly lastPlay: PlayedTrick | null;
  readonly passed: readonly boolean[];
  readonly winner: number | null;
  readonly turn: number;
  readonly deadlineAt: number;
  readonly presence: readonly SeatPresence[];
  readonly score: ScoreResult | null;
  /** Complete server-authored result. Clients must never infer ranks from public hand counts. */
  readonly publicResult: PublicMatchResult | null;
  /** Published before the first action so the server cannot silently swap the deal. */
  readonly dealCommitment: string;
  readonly dealCommitmentVersion: typeof DEAL_COMMITMENT_VERSION;
  /** Revealed only after the authoritative match is finished. */
  readonly seedReveal: number | null;
  readonly dealNonceReveal: string | null;
}

export type RoomResult =
  | { readonly ok: true; readonly revision: number; readonly duplicate: boolean }
  | { readonly ok: false; readonly reason: string; readonly revision: number };

interface SeatRecord {
  readonly userId: string;
  readonly publicId: string;
  displayName: string;
  avatar: string;
  connected: boolean;
  botControlled: boolean;
  disconnectedAt: number | null;
  lastClientSequence: number;
}

export interface AuthoritativeRoomSnapshot {
  readonly version: 1;
  readonly roomId: string;
  readonly seats: readonly SeatRecord[];
  readonly state: MatchState | null;
  readonly seed: number | null;
  readonly revision: number;
  readonly matchNumber: number;
  readonly deadlineAt: number;
  readonly previousWinner: number | null;
  readonly actions: readonly MatchAction[];
  readonly dealCommitment?: string | null;
  readonly dealNonce?: string | null;
  readonly completedAt?: number | null;
}

export interface CompletedMatchAudit {
  readonly roomId: string;
  readonly matchNumber: number;
  readonly rulesVersion: typeof RULES_VERSION;
  readonly dealCommitment: string;
  readonly dealCommitmentVersion: typeof DEAL_COMMITMENT_VERSION;
  readonly seedReveal: number;
  readonly dealNonceReveal: string;
  readonly completedAt: number;
  readonly result: PublicMatchResult;
  readonly actions: readonly MatchAction[];
  readonly players: readonly {
    readonly seat: number;
    readonly userId: string;
    readonly publicId: string;
    readonly displayName: string;
    readonly avatar: string;
  }[];
}

function validUserId(userId: string): boolean {
  return /^[A-Za-z0-9_-]{1,64}$/.test(userId);
}

function normalizeIdentity(value: string | PlayerIdentity): PlayerIdentity {
  if (typeof value === 'string') return {
    userId: value, publicId: value, displayName: value, avatar: '',
  };
  return {
    userId: value.userId,
    publicId: value.publicId?.trim().slice(0, 64) || value.userId,
    displayName: value.displayName.trim().slice(0, 32) || value.userId,
    avatar: value.avatar.trim().slice(0, 256),
  };
}

export function computeDealCommitment(
  roomId: string,
  matchNumber: number,
  seed: number,
  nonce: string,
): string {
  return createHash('sha256')
    .update(`${DEAL_COMMITMENT_VERSION}\n${roomId}\n${matchNumber}\n${seed >>> 0}\n${nonce}`, 'utf8')
    .digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isClientCommand(value: unknown): value is ClientCommand {
  if (!isRecord(value) || value.protocolVersion !== ROOM_PROTOCOL_VERSION) return false;
  if (!Number.isInteger(value.clientSequence)) return false;
  if (!isRecord(value.action)) return false;
  if (value.action.type === 'pass') return true;
  return value.action.type === 'play'
    && Array.isArray(value.action.cardIds)
    && value.action.cardIds.every((item) => typeof item === 'string');
}

export class AuthoritativeRoom {
  readonly roomId: string;
  private readonly seedSource: () => number;
  private readonly now: () => number;
  private readonly nonceSource: () => string;
  private readonly seats: SeatRecord[] = [];
  private state: MatchState | null = null;
  private seed: number | null = null;
  private revision = 0;
  private matchNumber = 0;
  private deadlineAt = 0;
  private previousWinner: number | null = null;
  private readonly actions: MatchAction[] = [];
  private dealCommitment: string | null = null;
  private dealNonce: string | null = null;
  private completedAt: number | null = null;

  constructor(
    roomId: string,
    seedSource: () => number,
    now: () => number = Date.now,
    nonceSource: () => string = () => randomBytes(16).toString('hex'),
  ) {
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(roomId)) throw new Error('invalid_room_id');
    this.roomId = roomId;
    this.seedSource = seedSource;
    this.now = now;
    this.nonceSource = nonceSource;
  }

  get size(): number {
    return this.seats.length;
  }

  get started(): boolean {
    return this.state !== null;
  }

  get finished(): boolean {
    return this.state?.winner !== null && this.state?.winner !== undefined;
  }

  get currentMatchNumber(): number {
    return this.matchNumber;
  }

  presence(): readonly SeatPresence[] {
    return this.seats.map((record, seat) => ({
      seat,
      userId: record.publicId,
      displayName: record.displayName,
      avatar: record.avatar,
      connected: record.connected,
      botControlled: record.botControlled,
    }));
  }

  join(identityInput: string | PlayerIdentity): number {
    const identity = normalizeIdentity(identityInput);
    const { userId } = identity;
    if (!validUserId(userId)) throw new Error('invalid_user_id');
    const existing = this.seats.findIndex((seat) => seat.userId === userId);
    if (existing >= 0) {
      const record = this.seats[existing];
      if (
        record.disconnectedAt !== null
        && this.now() - record.disconnectedAt > RECONNECT_WINDOW_MS
      ) throw new Error('reconnect_window_expired');
      record.connected = true;
      record.botControlled = false;
      record.disconnectedAt = null;
      record.displayName = identity.displayName;
      record.avatar = identity.avatar;
      return existing;
    }
    if (this.started) throw new Error('match_already_started');
    if (this.seats.length >= 4) throw new Error('room_full');
    this.seats.push({
      userId,
      publicId: identity.publicId!,
      displayName: identity.displayName,
      avatar: identity.avatar,
      connected: true,
      botControlled: false,
      disconnectedAt: null,
      lastClientSequence: 0,
    });
    return this.seats.length - 1;
  }

  updateIdentity(identityInput: string | PlayerIdentity): void {
    const identity = normalizeIdentity(identityInput);
    const record = this.seats.find((seat) => seat.userId === identity.userId);
    if (!record) return;
    record.displayName = identity.displayName;
    record.avatar = identity.avatar;
  }

  removeWaiting(userId: string): void {
    if (this.started) throw new Error('cannot_remove_started_seat');
    const index = this.seats.findIndex((seat) => seat.userId === userId);
    if (index < 0) throw new Error('not_room_member');
    this.seats.splice(index, 1);
  }

  start(): void {
    if (this.state) throw new Error('match_already_started');
    if (this.seats.length !== 4) throw new Error('match_requires_four_players');
    const seed = this.seedSource() >>> 0;
    const matchNumber = this.matchNumber + 1;
    const dealNonce = this.nonceSource();
    if (!/^[0-9a-f]{32,128}$/.test(dealNonce)) throw new Error('invalid_deal_nonce');
    this.seed = seed;
    this.dealNonce = dealNonce;
    this.dealCommitment = computeDealCommitment(this.roomId, matchNumber, seed, dealNonce);
    this.completedAt = null;
    this.state = createMatch(seed, this.previousWinner);
    this.matchNumber = matchNumber;
    this.revision += 1;
    this.actions.length = 0;
    this.deadlineAt = this.now() + TURN_TIMEOUT_MS;
  }

  disconnect(userId: string): void {
    const record = this.requireSeat(userId);
    if (!record.connected) return;
    record.connected = false;
    record.disconnectedAt = this.now();
  }

  /** A restored process has no live sockets, regardless of the persisted flags. */
  disconnectAll(): void {
    const at = this.now();
    for (const record of this.seats) {
      record.connected = false;
      record.botControlled = false;
      record.disconnectedAt = at;
    }
  }

  expiredDisconnectedUsers(at: number = this.now()): readonly string[] {
    return this.seats
      .filter((record) => (
        !record.connected
        && record.disconnectedAt !== null
        && at - record.disconnectedAt > RECONNECT_WINDOW_MS
      ))
      .map((record) => record.userId);
  }

  receive(userId: string, command: unknown): RoomResult {
    const seat = this.seats.findIndex((record) => record.userId === userId);
    if (seat < 0) return this.failure('not_room_member');
    if (!this.state) return this.failure('match_not_started');
    const record = this.seats[seat];
    if (!record.connected || record.botControlled) return this.failure('seat_not_player_controlled');
    if (!isRecord(command) || command.protocolVersion !== ROOM_PROTOCOL_VERSION) {
      return this.failure('protocol_mismatch');
    }
    if (!isClientCommand(command)) return this.failure('invalid_command');
    if (!Number.isInteger(command.clientSequence) || command.clientSequence <= 0) {
      return this.failure('invalid_client_sequence');
    }
    if (command.clientSequence <= record.lastClientSequence) {
      return { ok: true, revision: this.revision, duplicate: true };
    }
    if (command.clientSequence !== record.lastClientSequence + 1) {
      return this.failure('client_sequence_gap');
    }
    const action: MatchAction = command.action.type === 'play'
      ? { type: 'play', seat, cardIds: command.action.cardIds }
      : { type: 'pass', seat };
    const result = applyAction(this.state, action);
    if (!result.ok) return this.failure(result.reason);
    record.lastClientSequence = command.clientSequence;
    this.applyAcceptedAction(action, result.state);
    return { ok: true, revision: this.revision, duplicate: false };
  }

  tick(at: number = this.now()): number {
    if (!this.state || this.state.winner !== null) return 0;
    let applied = 0;
    while (this.state.winner === null) {
      const seat = this.state.currentSeat;
      const record = this.seats[seat];
      if (
        !record.connected
        && record.disconnectedAt !== null
        && at - record.disconnectedAt >= DISCONNECT_BOT_DELAY_MS
      ) record.botControlled = true;

      const timedOut = at >= this.deadlineAt;
      if (!record.botControlled && !timedOut) break;
      const action = timeoutAction(this.state);
      const result = applyAction(this.state, action);
      if (!result.ok) throw new Error(`server_timeout_action_failed:${result.reason}`);
      this.applyAcceptedAction(action, result.state, at);
      applied += 1;
      if (!record.botControlled || applied >= 256) break;
    }
    if (applied >= 256) throw new Error('server_tick_guard_exceeded');
    return applied;
  }

  snapshotFor(userId: string): PlayerSnapshot {
    const seat = this.seats.findIndex((record) => record.userId === userId);
    if (seat < 0) throw new Error('not_room_member');
    if (!this.state) throw new Error('match_not_started');
    const score = scoreMatch(this.state);
    return {
      protocolVersion: ROOM_PROTOCOL_VERSION,
      roomId: this.roomId,
      rulesVersion: RULES_VERSION,
      revision: this.revision,
      matchNumber: this.matchNumber,
      nextClientSequence: this.seats[seat].lastClientSequence + 1,
      seat,
      ownHand: [...this.state.hands[seat]],
      opponentCounts: this.state.hands.map((hand, index) => index === seat ? 0 : hand.length),
      currentSeat: this.state.currentSeat,
      firstPlayPending: this.state.firstPlayPending,
      lastPlay: this.state.lastPlay,
      passed: [...this.state.passed],
      winner: this.state.winner,
      turn: this.state.turn,
      deadlineAt: this.deadlineAt,
      presence: this.presence(),
      score,
      publicResult: score ? this.buildPublicResult(score) : null,
      dealCommitment: this.requireDealCommitment(),
      dealCommitmentVersion: DEAL_COMMITMENT_VERSION,
      seedReveal: this.finished ? this.seed : null,
      dealNonceReveal: this.finished ? this.dealNonce : null,
    };
  }

  rematch(): void {
    if (!this.state || this.state.winner === null) throw new Error('match_not_finished');
    this.previousWinner = this.state.winner;
    this.state = null;
    for (const record of this.seats) record.lastClientSequence = 0;
    this.start();
  }

  /** Server audit surface; never serialize this object directly to a client. */
  audit(): {
    seed: number | null;
    revision: number;
    state: MatchState | null;
    actions: readonly MatchAction[];
    dealCommitment: string | null;
    dealNonce: string | null;
    completedAt: number | null;
  } {
    return {
      seed: this.seed,
      revision: this.revision,
      state: this.state,
      actions: [...this.actions],
      dealCommitment: this.dealCommitment,
      dealNonce: this.dealNonce,
      completedAt: this.completedAt,
    };
  }

  completedMatchAudit(): CompletedMatchAudit | null {
    if (!this.finished || this.seed === null || this.dealNonce === null || this.completedAt === null) return null;
    const score = scoreMatch(this.state!);
    if (!score) return null;
    return {
      roomId: this.roomId,
      matchNumber: this.matchNumber,
      rulesVersion: RULES_VERSION,
      dealCommitment: this.requireDealCommitment(),
      dealCommitmentVersion: DEAL_COMMITMENT_VERSION,
      seedReveal: this.seed,
      dealNonceReveal: this.dealNonce,
      completedAt: this.completedAt,
      result: this.buildPublicResult(score),
      actions: [...this.actions],
      players: this.seats.map((seat, index) => ({
        seat: index,
        userId: seat.userId,
        publicId: seat.publicId,
        displayName: seat.displayName,
        avatar: seat.avatar,
      })),
    };
  }

  snapshot(): AuthoritativeRoomSnapshot {
    return {
      version: 1,
      roomId: this.roomId,
      seats: this.seats.map((seat) => ({ ...seat })),
      state: this.state,
      seed: this.seed,
      revision: this.revision,
      matchNumber: this.matchNumber,
      deadlineAt: this.deadlineAt,
      previousWinner: this.previousWinner,
      actions: [...this.actions],
      dealCommitment: this.dealCommitment,
      dealNonce: this.dealNonce,
      completedAt: this.completedAt,
    };
  }

  static restore(
    snapshot: AuthoritativeRoomSnapshot,
    seedSource: () => number,
    now: () => number = Date.now,
  ): AuthoritativeRoom {
    if (snapshot?.version !== 1 || !Array.isArray(snapshot.seats)
      || !Array.isArray(snapshot.actions) || typeof snapshot.roomId !== 'string') {
      throw new Error('invalid_authoritative_room_snapshot');
    }
    const room = new AuthoritativeRoom(snapshot.roomId, seedSource, now);
    room.seats.push(...snapshot.seats.map((seat) => ({
      ...seat,
      publicId: typeof seat.publicId === 'string' ? seat.publicId : seat.userId,
    })));
    room.state = snapshot.state;
    room.seed = snapshot.seed;
    room.revision = snapshot.revision;
    room.matchNumber = snapshot.matchNumber;
    room.deadlineAt = snapshot.deadlineAt;
    room.previousWinner = snapshot.previousWinner;
    room.actions.push(...snapshot.actions);
    if (room.seed !== null) {
      room.dealNonce = snapshot.dealNonce ?? room.nonceSource();
      room.dealCommitment = snapshot.dealCommitment
        ?? computeDealCommitment(room.roomId, room.matchNumber, room.seed, room.dealNonce);
      if (room.dealCommitment !== computeDealCommitment(
        room.roomId, room.matchNumber, room.seed, room.dealNonce,
      )) throw new Error('deal_commitment_mismatch');
      room.completedAt = snapshot.completedAt
        ?? (room.finished ? now() : null);
    }
    return room;
  }

  private requireSeat(userId: string): SeatRecord {
    const record = this.seats.find((seat) => seat.userId === userId);
    if (!record) throw new Error('not_room_member');
    return record;
  }

  private failure(reason: string): RoomResult {
    return { ok: false, reason, revision: this.revision };
  }

  private applyAcceptedAction(action: MatchAction, state: MatchState, at: number = this.now()): void {
    this.state = state;
    this.actions.push(action);
    this.revision += 1;
    this.deadlineAt = at + TURN_TIMEOUT_MS;
    if (state.winner !== null && this.completedAt === null) this.completedAt = at;
  }

  private requireDealCommitment(): string {
    if (!this.dealCommitment) throw new Error('deal_commitment_missing');
    return this.dealCommitment;
  }

  private buildPublicResult(score: ScoreResult): PublicMatchResult {
    const losingSeats = [0, 1, 2, 3]
      .filter((seat) => seat !== score.winner)
      .sort((left, right) => (
        score.penalties[left] - score.penalties[right]
        || ((left - score.winner + 4) % 4) - ((right - score.winner + 4) % 4)
      ));
    const orderedSeats = [score.winner, ...losingSeats];
    const winnerDelta = score.penalties.reduce((total, penalty, seat) => (
      seat === score.winner ? total : total + penalty
    ), 0);
    return {
      winnerSeat: score.winner,
      matchNumber: this.matchNumber,
      entries: orderedSeats.map((seat, index) => ({
        rank: index + 1,
        seat,
        userId: this.seats[seat].publicId,
        displayName: this.seats[seat].displayName,
        avatar: this.seats[seat].avatar,
        remaining: this.state!.hands[seat].length,
        delta: seat === score.winner ? winnerDelta : -score.penalties[seat],
        cong: score.cong[seat],
      })),
    };
  }
}
