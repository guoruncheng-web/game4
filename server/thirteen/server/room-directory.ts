import {
  AuthoritativeRoom,
  type AuthoritativeRoomSnapshot,
  type ClientCommand,
  type CompletedMatchAudit,
  type PlayerIdentity,
  type PlayerSnapshot,
  type PublicMatchResult,
  type RoomResult,
} from './authoritative-room';
import {
  BettingLedger,
  type BettingLedgerSnapshot,
  isAllowedTableStake,
  type TableStake,
  type WalletView,
} from './betting-ledger';

const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const FREE_ECONOMY_MODE = 'free-v1' as const;
export const LEGACY_ECONOMY_MODE = 'legacy-chip-stake' as const;
export type EconomyMode = typeof FREE_ECONOMY_MODE | typeof LEGACY_ECONOMY_MODE;

export interface WaitingRoomView {
  readonly roomId: string;
  readonly code: string | null;
  readonly mode: 'private' | 'matchmaking';
  readonly economyMode: EconomyMode;
  readonly stake: TableStake | null;
  readonly playerCount: number;
  readonly maximumPlayers: 4;
  readonly started: boolean;
  readonly readyCount: number;
  readonly hostSeat: number | null;
  readonly canStart: boolean;
  readonly players: readonly {
    readonly seat: number;
    readonly userId: string;
    readonly displayName: string;
    readonly avatar: string;
    readonly connected: boolean;
    readonly ready: boolean;
    readonly isHost: boolean;
  }[];
}

export interface DirectoryAssignment {
  readonly room: WaitingRoomView;
  readonly seat: number;
}

export interface DirectoryPlayerSnapshot extends PlayerSnapshot {
  readonly economyMode: EconomyMode;
  readonly tableStake: TableStake | null;
  readonly wallet: WalletView | null;
  readonly publicResult: PublicMatchResult | null;
}

export interface DirectoryCompletedMatchAudit extends CompletedMatchAudit {
  readonly economyMode: EconomyMode;
}

interface DirectoryRoom {
  readonly code: string | null;
  readonly mode: 'private' | 'matchmaking';
  economyMode: EconomyMode;
  stake: TableStake | null;
  readonly room: AuthoritativeRoom;
  readonly users: Array<string | null>;
  readonly rematchVotes: Set<string>;
  readonly readyUsers: Set<string>;
}

export interface RematchResult {
  readonly room: WaitingRoomView;
  readonly votes: number;
  readonly required: number;
  readonly voters: readonly string[];
  readonly started: boolean;
}

export interface ReadyResult {
  readonly room: WaitingRoomView;
  readonly started: boolean;
  readonly wallet: WalletView | null;
}

export interface StartResult {
  readonly room: WaitingRoomView;
  readonly started: true;
}

export interface RoomDirectorySnapshot {
  readonly version: 3;
  readonly nextRoomNumber: number;
  readonly rooms: readonly {
    readonly code: string | null;
    readonly mode: 'private' | 'matchmaking';
    readonly economyMode: EconomyMode;
    readonly stake: TableStake | null;
    readonly room: AuthoritativeRoomSnapshot;
    readonly users: readonly (string | null)[];
    readonly rematchVotes: readonly string[];
    readonly readyUsers: readonly string[];
  }[];
  readonly userRooms: readonly (readonly [string, string])[];
  readonly matchmakingRooms: readonly (readonly [string, string])[];
  readonly profiles: readonly PlayerIdentity[];
  readonly ledger: BettingLedgerSnapshot;
}

interface LegacyRoomDirectorySnapshot {
  readonly version: 2;
  readonly nextRoomNumber: number;
  readonly rooms: readonly {
    readonly code: string | null;
    readonly mode: 'private' | 'matchmaking';
    readonly stake: TableStake;
    readonly room: AuthoritativeRoomSnapshot;
    readonly users: readonly (string | null)[];
    readonly rematchVotes: readonly string[];
    readonly readyUsers: readonly string[];
  }[];
  readonly userRooms: readonly (readonly [string, string])[];
  readonly matchmakingRooms: readonly (readonly [TableStake, string])[];
  readonly profiles: readonly PlayerIdentity[];
  readonly ledger: BettingLedgerSnapshot;
}

export class RoomDirectory {
  private readonly randomUint32: () => number;
  private readonly now: () => number;
  private readonly ledger: BettingLedger;
  private readonly rooms = new Map<string, DirectoryRoom>();
  private readonly codes = new Map<string, string>();
  private readonly userRooms = new Map<string, string>();
  private readonly matchmakingRooms = new Map<string, string>();
  private readonly profiles = new Map<string, PlayerIdentity>();
  private nextRoomNumber = 1;

  constructor(
    randomUint32: () => number,
    now: () => number = Date.now,
    ledger: BettingLedger = new BettingLedger(now),
  ) {
    this.randomUint32 = randomUint32;
    this.now = now;
    this.ledger = ledger;
  }

  registerPlayer(identity: PlayerIdentity): void {
    const normalized = {
      userId: identity.userId,
      publicId: identity.publicId?.trim().slice(0, 64) || identity.userId,
      displayName: identity.displayName.trim().slice(0, 32) || identity.userId,
      avatar: identity.avatar.trim().slice(0, 256),
    };
    this.profiles.set(normalized.userId, normalized);
    this.rooms.get(this.userRooms.get(normalized.userId) ?? '')?.room.updateIdentity(normalized);
  }

  legacyWalletFor(userId: string): WalletView | null {
    return this.ledger.viewExisting(userId);
  }

  syncLegacyWallet(userId: string, balance: number, reserved: number): WalletView {
    return this.ledger.syncWallet(userId, balance, reserved);
  }

  createPrivate(userId: string, _legacyStake?: number): DirectoryAssignment {
    void _legacyStake;
    this.assertAvailable(userId);
    const id = this.newRoomId();
    const code = this.newPrivateCode();
    const entry = this.createEntry(id, code, 'private');
    const seat = this.addUser(entry, userId);
    return { room: this.view(entry), seat };
  }

  joinPrivate(userId: string, rawCode: string): DirectoryAssignment {
    this.assertAvailable(userId);
    const code = String(rawCode).trim().toUpperCase();
    const roomId = this.codes.get(code);
    if (!roomId) throw new Error('private_room_not_found');
    const entry = this.rooms.get(roomId)!;
    if (entry.economyMode === LEGACY_ECONOMY_MODE) throw new Error('legacy_room_closed');
    if (entry.room.started) throw new Error('match_already_started');
    const seat = this.addUser(entry, userId);
    return { room: this.view(entry), seat };
  }

  setReady(userId: string, ready: boolean): ReadyResult {
    const entry = this.requireEntry(userId);
    if (entry.room.started) throw new Error('match_already_started');
    if (entry.mode !== 'private') throw new Error('matchmaking_is_auto_ready');
    if (entry.users[0] === userId) throw new Error('room_owner_uses_start');
    const matchNumber = entry.room.currentMatchNumber + 1;
    const alreadyReady = entry.readyUsers.has(userId);
    if (ready && !alreadyReady) {
      if (entry.economyMode === LEGACY_ECONOMY_MODE) {
        this.ledger.reserve(userId, entry.room.roomId, matchNumber, this.requireLegacyStake(entry));
      }
      entry.readyUsers.add(userId);
    } else if (!ready && alreadyReady) {
      if (entry.economyMode === LEGACY_ECONOMY_MODE) {
        this.ledger.refund(userId, entry.room.roomId, matchNumber, this.requireLegacyStake(entry));
      }
      entry.readyUsers.delete(userId);
    }
    return { room: this.view(entry), started: false, wallet: this.legacyWalletFor(userId) };
  }

  startPrivate(userId: string): StartResult {
    const entry = this.requireEntry(userId);
    if (entry.room.started) throw new Error('match_already_started');
    if (entry.mode !== 'private') throw new Error('matchmaking_starts_automatically');
    if (entry.users[0] !== userId) throw new Error('only_room_owner_can_start');
    if (entry.economyMode !== FREE_ECONOMY_MODE) throw new Error('legacy_room_closed');
    if (this.members(entry.room.roomId).length !== 4) throw new Error('match_requires_four_players');
    if (!this.canStart(entry)) throw new Error('players_not_ready');
    entry.room.start();
    return { room: this.view(entry), started: true };
  }

  enqueueMatch(userId: string, _legacyStake?: number): DirectoryAssignment | null {
    void _legacyStake;
    this.assertAvailable(userId);
    let entry = this.matchmakingEntry();
    if (!entry) {
      entry = this.createEntry(this.newRoomId(), null, 'matchmaking');
      this.matchmakingRooms.set(this.matchmakingKey(FREE_ECONOMY_MODE, null), entry.room.roomId);
    }
    try {
      this.addUser(entry, userId);
      entry.readyUsers.add(userId);
    } catch (error) {
      if (entry.users.length === 0) this.deleteEntry(entry);
      throw error;
    }
    if (entry.users.length < 4) return null;
    entry.room.start();
    this.matchmakingRooms.delete(this.matchmakingKey(FREE_ECONOMY_MODE, null));
    return { room: this.view(entry), seat: entry.users.indexOf(userId) };
  }

  assignmentFor(userId: string): DirectoryAssignment | null {
    const roomId = this.userRooms.get(userId);
    if (!roomId) return null;
    const entry = this.rooms.get(roomId);
    if (!entry) return null;
    return { room: this.view(entry), seat: entry.users.indexOf(userId) };
  }

  reconnect(userId: string): DirectoryAssignment {
    const roomId = this.userRooms.get(userId);
    if (!roomId) throw new Error('no_reconnectable_room');
    const entry = this.rooms.get(roomId);
    if (!entry) throw new Error('no_reconnectable_room');
    const seat = entry.room.join(this.profileFor(userId));
    return { room: this.view(entry), seat };
  }

  disconnect(userId: string): void {
    const roomId = this.userRooms.get(userId);
    if (!roomId) return;
    this.rooms.get(roomId)?.room.disconnect(userId);
  }

  leave(userId: string): { readonly roomId: string | null; readonly deleted: boolean } {
    const roomId = this.userRooms.get(userId);
    if (!roomId) return { roomId: null, deleted: false };
    const entry = this.rooms.get(roomId);
    this.userRooms.delete(userId);
    if (!entry) return { roomId, deleted: true };
    const index = entry.users.indexOf(userId);
    entry.readyUsers.delete(userId);
    if (!entry.room.started) {
      this.refundIfReserved(entry, userId, entry.room.currentMatchNumber + 1);
      entry.room.removeWaiting(userId);
      if (index >= 0) entry.users.splice(index, 1);
      if (index === 0) {
        const nextOwner = entry.users[0];
        if (nextOwner && entry.readyUsers.delete(nextOwner)) {
          this.refundIfReserved(entry, nextOwner, entry.room.currentMatchNumber + 1);
        }
      }
    } else {
      if (entry.room.finished && entry.rematchVotes.size > 0) this.refundRematchRound(entry);
      entry.room.disconnect(userId);
      if (index >= 0) entry.users[index] = null;
    }
    const empty = entry.users.every((member) => member === null) || entry.users.length === 0;
    if (empty && (!entry.room.started || entry.room.finished)) {
      this.deleteEntry(entry);
      return { roomId, deleted: true };
    }
    return { roomId, deleted: false };
  }

  requestRematch(userId: string): RematchResult {
    const entry = this.requireEntry(userId);
    if (!entry.room.finished) throw new Error('match_not_finished');
    const members = entry.users.filter((member): member is string => member !== null);
    if (members.length !== 4) throw new Error('rematch_requires_four_players');
    if (!entry.rematchVotes.has(userId)) entry.rematchVotes.add(userId);
    const voters = members.filter((member) => entry.rematchVotes.has(member));
    if (voters.length === members.length) {
      entry.economyMode = FREE_ECONOMY_MODE;
      entry.stake = null;
      entry.room.rematch();
      entry.rematchVotes.clear();
      entry.readyUsers.clear();
      return { room: this.view(entry), votes: 0, required: 4, voters: [], started: true };
    }
    return { room: this.view(entry), votes: voters.length, required: 4, voters, started: false };
  }

  receive(userId: string, command: ClientCommand): RoomResult {
    const entry = this.requireEntry(userId);
    const result = entry.room.receive(userId, command);
    if (result.ok && !result.duplicate) this.settleIfFinished(entry);
    return result;
  }

  snapshotFor(userId: string): DirectoryPlayerSnapshot {
    const entry = this.requireEntry(userId);
    this.settleIfFinished(entry);
    const snapshot = entry.room.snapshotFor(userId);
    const publicResult = !snapshot.publicResult
      ? null
      : entry.economyMode === LEGACY_ECONOMY_MODE ? {
        ...snapshot.publicResult,
        entries: snapshot.publicResult.entries.map((resultEntry) => ({
          ...resultEntry,
          wagerDelta: this.ledger.netDelta(
            entry.users[resultEntry.seat]!,
            entry.room.roomId,
            snapshot.matchNumber,
          ) ?? 0,
        })),
      } : snapshot.publicResult;
    return {
      ...snapshot,
      economyMode: entry.economyMode,
      tableStake: entry.stake,
      wallet: entry.economyMode === LEGACY_ECONOMY_MODE ? this.legacyWalletFor(userId) : null,
      publicResult,
    };
  }

  tick(at: number = this.now()): number {
    let actions = 0;
    const expiredUsers: Array<{ readonly userId: string; readonly roomId: string }> = [];
    const finishedEmptyRooms: DirectoryRoom[] = [];
    for (const entry of this.rooms.values()) {
      actions += entry.room.tick(at);
      this.settleIfFinished(entry);
      if (entry.room.finished && entry.users.every((member) => member === null)) {
        finishedEmptyRooms.push(entry);
      }
      for (const userId of entry.room.expiredDisconnectedUsers(at)) {
        expiredUsers.push({ userId, roomId: entry.room.roomId });
      }
    }
    for (const { userId, roomId } of expiredUsers) {
      if (this.userRooms.get(userId) === roomId) this.leave(userId);
    }
    for (const entry of finishedEmptyRooms) this.deleteEntry(entry);
    return actions + expiredUsers.length + finishedEmptyRooms.length;
  }

  members(roomId: string): readonly string[] {
    return (this.rooms.get(roomId)?.users ?? []).filter((user): user is string => user !== null);
  }

  roomIds(): readonly string[] {
    return Array.from(this.rooms.keys());
  }

  completedMatchAudits(): readonly DirectoryCompletedMatchAudit[] {
    return Array.from(this.rooms.values()).flatMap((entry) => {
      const audit = entry.room.completedMatchAudit();
      return audit ? [{ ...audit, economyMode: entry.economyMode }] : [];
    });
  }

  snapshot(): RoomDirectorySnapshot {
    return {
      version: 3,
      nextRoomNumber: this.nextRoomNumber,
      rooms: Array.from(this.rooms.values(), (entry) => ({
        code: entry.code,
        mode: entry.mode,
        economyMode: entry.economyMode,
        stake: entry.stake,
        room: entry.room.snapshot(),
        users: [...entry.users],
        rematchVotes: Array.from(entry.rematchVotes),
        readyUsers: Array.from(entry.readyUsers),
      })),
      userRooms: Array.from(this.userRooms.entries()),
      matchmakingRooms: Array.from(this.matchmakingRooms.entries()),
      profiles: Array.from(this.profiles.values()),
      ledger: this.ledger.snapshot(),
    };
  }

  snapshotJson(): string {
    return JSON.stringify(this.snapshot());
  }

  static restore(
    snapshot: RoomDirectorySnapshot | LegacyRoomDirectorySnapshot,
    randomUint32: () => number,
    now: () => number = Date.now,
    options: { readonly disconnectAll?: boolean } = {},
  ): RoomDirectory {
    if ((snapshot?.version !== 2 && snapshot?.version !== 3) || !Array.isArray(snapshot.rooms)
      || !Array.isArray(snapshot.userRooms) || !Array.isArray(snapshot.profiles)) {
      throw new Error('invalid_room_directory_snapshot');
    }
    const ledger = BettingLedger.restore(snapshot.ledger, now);
    const directory = new RoomDirectory(randomUint32, now, ledger);
    directory.nextRoomNumber = snapshot.nextRoomNumber;
    for (const profile of snapshot.profiles) directory.profiles.set(profile.userId, { ...profile });
    for (const saved of snapshot.rooms) {
      const economyMode = snapshot.version === 2 ? LEGACY_ECONOMY_MODE : saved.economyMode;
      const stake = snapshot.version === 2 ? directory.requireStake(saved.stake) : saved.stake;
      directory.assertEconomyConfiguration(economyMode, stake);
      const room = AuthoritativeRoom.restore(
        saved.room,
        () => directory.randomUint32() >>> 0,
        now,
      );
      if (options.disconnectAll !== false) room.disconnectAll();
      const entry: DirectoryRoom = {
        code: saved.code,
        mode: saved.mode,
        economyMode,
        stake,
        room,
        users: [...saved.users],
        rematchVotes: new Set(saved.rematchVotes),
        readyUsers: new Set(saved.readyUsers),
      };
      directory.rooms.set(room.roomId, entry);
      if (entry.code) directory.codes.set(entry.code, room.roomId);
    }
    for (const [userId, roomId] of snapshot.userRooms) directory.userRooms.set(userId, roomId);
    for (const [savedKey, roomId] of snapshot.matchmakingRooms) {
      const key = snapshot.version === 2
        ? directory.matchmakingKey(LEGACY_ECONOMY_MODE, directory.requireStake(savedKey))
        : String(savedKey);
      directory.matchmakingRooms.set(key, roomId);
    }
    return directory;
  }

  private createEntry(
    id: string,
    code: string | null,
    mode: DirectoryRoom['mode'],
  ): DirectoryRoom {
    const seed = () => this.randomUint32() >>> 0;
    const entry: DirectoryRoom = {
      code,
      mode,
      economyMode: FREE_ECONOMY_MODE,
      stake: null,
      room: new AuthoritativeRoom(id, seed, this.now),
      users: [],
      rematchVotes: new Set(),
      readyUsers: new Set(),
    };
    this.rooms.set(id, entry);
    if (code) this.codes.set(code, id);
    return entry;
  }

  private addUser(entry: DirectoryRoom, userId: string): number {
    const seat = entry.room.join(this.profileFor(userId));
    entry.users.push(userId);
    this.userRooms.set(userId, entry.room.roomId);
    return seat;
  }

  private assertAvailable(userId: string): void {
    if (this.userRooms.has(userId)) throw new Error('user_already_assigned');
  }

  private requireEntry(userId: string): DirectoryRoom {
    const roomId = this.userRooms.get(userId);
    const entry = roomId ? this.rooms.get(roomId) : null;
    if (!entry) throw new Error('user_not_in_room');
    return entry;
  }

  private profileFor(userId: string): PlayerIdentity {
    const profile = this.profiles.get(userId)
      ?? { userId, displayName: userId, avatar: '' };
    this.registerPlayer(profile);
    return profile;
  }

  private view(entry: DirectoryRoom): WaitingRoomView {
    const hostSeat = entry.mode === 'private' && entry.users.length > 0 ? 0 : null;
    return {
      roomId: entry.room.roomId,
      code: entry.code,
      mode: entry.mode,
      economyMode: entry.economyMode,
      stake: entry.stake,
      playerCount: entry.users.filter((user) => user !== null).length,
      maximumPlayers: 4,
      started: entry.room.started,
      readyCount: entry.mode === 'private'
        ? entry.users.slice(1).filter((user) => user !== null && entry.readyUsers.has(user)).length
        : entry.readyUsers.size,
      hostSeat,
      canStart: this.canStart(entry),
      players: entry.room.presence().flatMap((presence) => (
        entry.users[presence.seat] === null ? [] : [{
          seat: presence.seat,
          userId: presence.userId,
          displayName: presence.displayName,
          avatar: presence.avatar,
          connected: presence.connected,
          ready: entry.readyUsers.has(entry.users[presence.seat]!) || entry.mode === 'matchmaking',
          isHost: hostSeat === presence.seat,
        }]
      )),
    };
  }

  private canStart(entry: DirectoryRoom): boolean {
    if (entry.mode !== 'private' || entry.room.started || entry.economyMode !== FREE_ECONOMY_MODE) return false;
    const members = entry.users.filter((member): member is string => member !== null);
    if (members.length !== 4) return false;
    const presence = entry.room.presence();
    return members.every((member, seat) => (
      presence[seat]?.connected === true && (seat === 0 || entry.readyUsers.has(member))
    ));
  }

  private settleIfFinished(entry: DirectoryRoom): void {
    if (!entry.room.finished || entry.economyMode !== LEGACY_ECONOMY_MODE) return;
    const firstMember = entry.users.find((user): user is string => user !== null);
    if (!firstMember) return;
    const snapshot = entry.room.snapshotFor(firstMember);
    if (!snapshot.publicResult) return;
    const participants = entry.users.filter((user): user is string => user !== null);
    const winner = participants[snapshot.publicResult.winnerSeat];
    this.ledger.settle(
      entry.room.roomId,
      snapshot.matchNumber,
      this.requireLegacyStake(entry),
      participants,
      winner,
    );
  }

  private refundIfReserved(entry: DirectoryRoom, userId: string, matchNumber: number): void {
    if (entry.economyMode !== LEGACY_ECONOMY_MODE) return;
    if (!this.ledger.hasReservation(userId, entry.room.roomId, matchNumber)) return;
    this.ledger.refund(userId, entry.room.roomId, matchNumber, this.requireLegacyStake(entry));
  }

  private refundRematchRound(entry: DirectoryRoom): void {
    const matchNumber = entry.room.currentMatchNumber + 1;
    for (const voter of entry.rematchVotes) this.refundIfReserved(entry, voter, matchNumber);
    entry.rematchVotes.clear();
  }

  private deleteEntry(entry: DirectoryRoom): void {
    this.rooms.delete(entry.room.roomId);
    if (entry.code) this.codes.delete(entry.code);
    for (const [key, roomId] of this.matchmakingRooms) {
      if (roomId === entry.room.roomId) this.matchmakingRooms.delete(key);
    }
  }

  private matchmakingEntry(): DirectoryRoom | null {
    const roomId = this.matchmakingRooms.get(this.matchmakingKey(FREE_ECONOMY_MODE, null));
    return roomId ? this.rooms.get(roomId) ?? null : null;
  }

  private matchmakingKey(economyMode: EconomyMode, stake: TableStake | null): string {
    return `${economyMode}:${stake ?? 'free'}`;
  }

  private assertEconomyConfiguration(economyMode: EconomyMode, stake: TableStake | null): void {
    if (economyMode === FREE_ECONOMY_MODE && stake === null) return;
    if (economyMode === LEGACY_ECONOMY_MODE && isAllowedTableStake(stake)) return;
    throw new Error('invalid_room_economy_configuration');
  }

  private requireLegacyStake(entry: DirectoryRoom): TableStake {
    if (entry.economyMode !== LEGACY_ECONOMY_MODE || !isAllowedTableStake(entry.stake)) {
      throw new Error('invalid_legacy_room_stake');
    }
    return entry.stake;
  }

  private requireStake(value: unknown): TableStake {
    if (!isAllowedTableStake(value)) throw new Error('invalid_table_stake');
    return value;
  }

  private newRoomId(): string {
    const value = `THIRTEEN-${this.nextRoomNumber}`;
    this.nextRoomNumber += 1;
    return value;
  }

  private newPrivateCode(): string {
    for (let attempt = 0; attempt < 64; attempt += 1) {
      let code = '';
      for (let index = 0; index < 6; index += 1) {
        code += CODE_ALPHABET[this.randomUint32() % CODE_ALPHABET.length];
      }
      if (!this.codes.has(code)) return code;
    }
    throw new Error('private_code_exhausted');
  }
}
