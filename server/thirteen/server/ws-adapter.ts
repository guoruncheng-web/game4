import {
  ROOM_PROTOCOL_VERSION,
  type PlayerIdentity,
} from './authoritative-room';
import { FREE_ECONOMY_MODE, RoomDirectory, type WaitingRoomView } from './room-directory';
import { parseThirteenClientMessage } from './ws-protocol';

export type SendToUser = (userId: string, message: unknown) => void;

export class ThirteenWsAdapter {
  private readonly directory: RoomDirectory;
  private readonly send: SendToUser;
  private readonly onChanged: (() => void) | null;

  constructor(directory: RoomDirectory, send: SendToUser, onChanged: (() => void) | null = null) {
    this.directory = directory;
    this.send = send;
    this.onChanged = onChanged;
  }

  handle(identityInput: string | PlayerIdentity, raw: unknown): void {
    const userId = typeof identityInput === 'string' ? identityInput : identityInput.userId;
    // Internal callers may only have the stable user id. Never let that fallback
    // downgrade a profile that was already authenticated with a real display name.
    if (typeof identityInput !== 'string') this.directory.registerPlayer(identityInput);
    const message = parseThirteenClientMessage(raw);
    if (!message) {
      this.error(userId, 'invalid_thirteen_message');
      this.onChanged?.();
      return;
    }
    try {
      switch (message.t) {
        case 'thirteen:hello': {
          this.sendWallet(userId);
          const existing = this.directory.assignmentFor(userId);
          if (!existing) {
            this.send(userId, { t: 'thirteen:ready', v: ROOM_PROTOCOL_VERSION });
            return;
          }
          const assignment = this.directory.reconnect(userId);
          this.send(userId, { t: 'thirteen:room', v: ROOM_PROTOCOL_VERSION, ...assignment });
          if (assignment.room.started) this.broadcastSnapshots(assignment.room.roomId);
          else this.broadcastRoom(assignment.room);
          return;
        }
        case 'thirteen:create-private': {
          const assignment = this.directory.createPrivate(userId, message.stake);
          this.send(userId, { t: 'thirteen:room', v: ROOM_PROTOCOL_VERSION, ...assignment });
          this.sendWallet(userId);
          return;
        }
        case 'thirteen:join-private': {
          const assignment = this.directory.joinPrivate(userId, message.code);
          this.broadcastRoom(assignment.room);
          this.sendWallet(userId);
          return;
        }
        case 'thirteen:matchmake': {
          const assignment = this.directory.enqueueMatch(userId, message.stake);
          const current = assignment ?? this.directory.assignmentFor(userId);
          if (!current) throw new Error('matchmaking_assignment_missing');
          if (!assignment) {
            this.broadcastMatchmaking(current.room);
            this.sendWallet(userId);
            return;
          }
          this.broadcastRoom(assignment.room);
          this.broadcastWallets(assignment.room.roomId);
          this.broadcastSnapshots(assignment.room.roomId);
          return;
        }
        case 'thirteen:ready': {
          const result = this.directory.setReady(userId, message.ready);
          this.broadcastRoom(result.room);
          this.broadcastWallets(result.room.roomId);
          if (result.started) this.broadcastSnapshots(result.room.roomId);
          return;
        }
        case 'thirteen:wallet':
          this.sendWallet(userId);
          return;
        case 'thirteen:leave': {
          const previous = this.directory.assignmentFor(userId);
          const result = this.directory.leave(userId);
          this.send(userId, { t: 'thirteen:left', v: ROOM_PROTOCOL_VERSION });
          this.sendWallet(userId);
          if (previous && !result.deleted) {
            const remaining = this.directory.members(previous.room.roomId)[0];
            const updated = remaining ? this.directory.assignmentFor(remaining)?.room : null;
            if (updated) {
              if (updated.mode === 'matchmaking') this.broadcastMatchmaking(updated);
              else this.broadcastRoom(updated);
              this.broadcastWallets(updated.roomId);
            }
          }
          return;
        }
        case 'thirteen:rematch': {
          const result = this.directory.requestRematch(userId);
          for (const member of this.directory.members(result.room.roomId)) {
            this.send(member, {
              t: 'thirteen:rematch',
              v: ROOM_PROTOCOL_VERSION,
              votes: result.votes,
              required: result.required,
              voted: result.voters.includes(member),
              started: result.started,
            });
          }
          this.broadcastWallets(result.room.roomId);
          if (result.started) this.broadcastSnapshots(result.room.roomId);
          return;
        }
        case 'thirteen:snapshot':
          this.sendSnapshot(userId);
          return;
        case 'thirteen:command': {
          const result = this.directory.receive(userId, message.command);
          this.send(userId, { t: 'thirteen:ack', v: ROOM_PROTOCOL_VERSION, ...result });
          if (result.ok && !result.duplicate) {
            const assignment = this.directory.assignmentFor(userId);
            if (assignment) {
              this.broadcastSnapshots(assignment.room.roomId);
              this.broadcastWallets(assignment.room.roomId);
            }
          }
          return;
        }
      }
    } catch (error) {
      this.error(userId, error instanceof Error ? error.message : 'thirteen_server_error');
    } finally {
      this.onChanged?.();
    }
  }

  disconnect(userId: string): void {
    const assignment = this.directory.assignmentFor(userId);
    this.directory.disconnect(userId);
    if (!assignment) return;
    if (assignment.room.started) {
      this.broadcastSnapshots(assignment.room.roomId);
    } else if (assignment.room.mode === 'matchmaking') {
      this.broadcastMatchmaking(assignment.room);
    } else {
      const remaining = this.directory.members(assignment.room.roomId)[0];
      const updated = remaining ? this.directory.assignmentFor(remaining)?.room : null;
      if (updated) this.broadcastRoom(updated);
    }
    this.onChanged?.();
  }

  tick(at?: number): number {
    const actions = this.directory.tick(at);
    if (actions > 0) {
      for (const roomId of this.directory.roomIds()) {
        this.broadcastSnapshots(roomId);
        this.broadcastWallets(roomId);
      }
      this.onChanged?.();
    }
    return actions;
  }

  private broadcastRoom(room: WaitingRoomView): void {
    for (const member of this.directory.members(room.roomId)) {
      const assignment = this.directory.assignmentFor(member);
      if (assignment) this.send(member, { t: 'thirteen:room', v: ROOM_PROTOCOL_VERSION, ...assignment });
    }
  }

  private broadcastMatchmaking(room: WaitingRoomView): void {
    for (const member of this.directory.members(room.roomId)) {
      this.send(member, {
        t: 'thirteen:matchmaking',
        v: ROOM_PROTOCOL_VERSION,
        queued: true,
        playerCount: room.playerCount,
        economyMode: room.economyMode,
        stake: room.stake,
      });
    }
  }

  private broadcastSnapshots(roomId: string): void {
    for (const member of this.directory.members(roomId)) this.sendSnapshot(member);
  }

  private broadcastWallets(roomId: string): void {
    for (const member of this.directory.members(roomId)) this.sendWallet(member);
  }

  private sendSnapshot(userId: string): void {
    this.send(userId, {
      t: 'thirteen:snapshot',
      v: ROOM_PROTOCOL_VERSION,
      snapshot: this.directory.snapshotFor(userId),
    });
  }

  private sendWallet(userId: string): void {
    this.send(userId, {
      t: 'thirteen:wallet',
      v: ROOM_PROTOCOL_VERSION,
      economyMode: this.directory.assignmentFor(userId)?.room.economyMode ?? FREE_ECONOMY_MODE,
      wallet: this.directory.legacyWalletFor(userId),
    });
  }

  private error(userId: string, code: string): void {
    this.send(userId, { t: 'thirteen:error', v: ROOM_PROTOCOL_VERSION, code });
  }
}
