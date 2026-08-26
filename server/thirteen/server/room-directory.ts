import {
  AuthoritativeRoom,
  type ClientCommand,
  type PlayerSnapshot,
  type RoomResult,
} from './authoritative-room';

const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export interface WaitingRoomView {
  readonly roomId: string;
  readonly code: string | null;
  readonly playerCount: number;
  readonly maximumPlayers: 4;
  readonly started: boolean;
}

export interface DirectoryAssignment {
  readonly room: WaitingRoomView;
  readonly seat: number;
}

interface DirectoryRoom {
  readonly code: string | null;
  readonly room: AuthoritativeRoom;
  readonly users: Array<string | null>;
  readonly rematchVotes: Set<string>;
}

export interface RematchResult {
  readonly room: WaitingRoomView;
  readonly votes: number;
  readonly required: number;
  readonly voters: readonly string[];
  readonly started: boolean;
}

export class RoomDirectory {
  private readonly randomUint32: () => number;
  private readonly now: () => number;
  private readonly rooms = new Map<string, DirectoryRoom>();
  private readonly codes = new Map<string, string>();
  private readonly userRooms = new Map<string, string>();
  private readonly matchmaking: string[] = [];
  private nextRoomNumber = 1;

  constructor(
    randomUint32: () => number,
    now: () => number = Date.now,
  ) {
    this.randomUint32 = randomUint32;
    this.now = now;
  }

  createPrivate(userId: string): DirectoryAssignment {
    this.assertAvailable(userId);
    const id = this.newRoomId();
    const code = this.newPrivateCode();
    const entry = this.createEntry(id, code);
    const seat = this.addUser(entry, userId);
    return { room: this.view(entry), seat };
  }

  joinPrivate(userId: string, rawCode: string): DirectoryAssignment {
    this.assertAvailable(userId);
    const code = String(rawCode).trim().toUpperCase();
    const roomId = this.codes.get(code);
    if (!roomId) throw new Error('private_room_not_found');
    const entry = this.rooms.get(roomId)!;
    const seat = this.addUser(entry, userId);
    if (entry.users.length === 4) entry.room.start();
    return { room: this.view(entry), seat };
  }

  enqueueMatch(userId: string): DirectoryAssignment | null {
    this.assertAvailable(userId);
    if (!this.matchmaking.includes(userId)) this.matchmaking.push(userId);
    if (this.matchmaking.length < 4) return null;
    const users = this.matchmaking.splice(0, 4);
    const entry = this.createEntry(this.newRoomId(), null);
    for (const queuedUser of users) this.addUser(entry, queuedUser);
    entry.room.start();
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
    const seat = entry.room.join(userId);
    return { room: this.view(entry), seat };
  }

  disconnect(userId: string): void {
    const roomId = this.userRooms.get(userId);
    if (!roomId) {
      const queued = this.matchmaking.indexOf(userId);
      if (queued >= 0) this.matchmaking.splice(queued, 1);
      return;
    }
    this.rooms.get(roomId)?.room.disconnect(userId);
  }

  leave(userId: string): { readonly roomId: string | null; readonly deleted: boolean } {
    const queued = this.matchmaking.indexOf(userId);
    if (queued >= 0) {
      this.matchmaking.splice(queued, 1);
      return { roomId: null, deleted: false };
    }
    const roomId = this.userRooms.get(userId);
    if (!roomId) return { roomId: null, deleted: false };
    const entry = this.rooms.get(roomId);
    this.userRooms.delete(userId);
    if (!entry) return { roomId, deleted: true };
    const index = entry.users.indexOf(userId);
    entry.rematchVotes.delete(userId);
    if (entry.room.started) {
      entry.room.disconnect(userId);
      if (index >= 0) entry.users[index] = null;
    } else {
      entry.room.removeWaiting(userId);
      if (index >= 0) entry.users.splice(index, 1);
    }
    if (entry.users.every((member) => member === null) || entry.users.length === 0) {
      this.rooms.delete(roomId);
      if (entry.code) this.codes.delete(entry.code);
      return { roomId, deleted: true };
    }
    return { roomId, deleted: false };
  }

  requestRematch(userId: string): RematchResult {
    const entry = this.requireEntry(userId);
    if (!entry.room.finished) throw new Error('match_not_finished');
    const members = entry.users.filter((member): member is string => member !== null);
    if (members.length !== 4) throw new Error('rematch_requires_four_players');
    entry.rematchVotes.add(userId);
    const voters = members.filter((member) => entry.rematchVotes.has(member));
    if (voters.length === members.length) {
      entry.room.rematch();
      entry.rematchVotes.clear();
      return { room: this.view(entry), votes: 0, required: 4, voters: [], started: true };
    }
    return { room: this.view(entry), votes: voters.length, required: 4, voters, started: false };
  }

  receive(userId: string, command: ClientCommand): RoomResult {
    const entry = this.requireEntry(userId);
    return entry.room.receive(userId, command);
  }

  snapshotFor(userId: string): PlayerSnapshot {
    return this.requireEntry(userId).room.snapshotFor(userId);
  }

  tick(at: number = this.now()): number {
    let actions = 0;
    const expiredUsers: Array<{ readonly userId: string; readonly roomId: string }> = [];
    for (const entry of this.rooms.values()) {
      actions += entry.room.tick(at);
      for (const userId of entry.room.expiredDisconnectedUsers(at)) {
        expiredUsers.push({ userId, roomId: entry.room.roomId });
      }
    }
    for (const { userId, roomId } of expiredUsers) {
      if (this.userRooms.get(userId) === roomId) this.leave(userId);
    }
    return actions;
  }

  members(roomId: string): readonly string[] {
    return (this.rooms.get(roomId)?.users ?? []).filter((user): user is string => user !== null);
  }

  roomIds(): readonly string[] {
    return Array.from(this.rooms.keys());
  }

  private createEntry(id: string, code: string | null): DirectoryRoom {
    const seed = () => this.randomUint32() >>> 0;
    const entry: DirectoryRoom = {
      code, room: new AuthoritativeRoom(id, seed, this.now), users: [], rematchVotes: new Set(),
    };
    this.rooms.set(id, entry);
    if (code) this.codes.set(code, id);
    return entry;
  }

  private addUser(entry: DirectoryRoom, userId: string): number {
    const seat = entry.room.join(userId);
    entry.users.push(userId);
    this.userRooms.set(userId, entry.room.roomId);
    return seat;
  }

  private assertAvailable(userId: string): void {
    if (this.userRooms.has(userId) || this.matchmaking.includes(userId)) {
      throw new Error('user_already_assigned');
    }
  }

  private requireEntry(userId: string): DirectoryRoom {
    const roomId = this.userRooms.get(userId);
    const entry = roomId ? this.rooms.get(roomId) : null;
    if (!entry) throw new Error('user_not_in_room');
    return entry;
  }

  private view(entry: DirectoryRoom): WaitingRoomView {
    return {
      roomId: entry.room.roomId,
      code: entry.code,
      playerCount: entry.room.started ? 4 : entry.users.length,
      maximumPlayers: 4,
      started: entry.room.started,
    };
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
