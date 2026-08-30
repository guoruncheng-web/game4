import { ROOM_PROTOCOL_VERSION } from './authoritative-room';
import { RoomDirectory, type WaitingRoomView } from './room-directory';
import { parseThirteenClientMessage } from './ws-protocol';

export type SendToUser = (userId: string, message: unknown) => void;

export class ThirteenWsAdapter {
  private readonly directory: RoomDirectory;
  private readonly send: SendToUser;

  constructor(directory: RoomDirectory, send: SendToUser) {
    this.directory = directory;
    this.send = send;
  }

  handle(userId: string, raw: unknown): void {
    const message = parseThirteenClientMessage(raw);
    if (!message) {
      this.error(userId, 'invalid_thirteen_message');
      return;
    }
    try {
      switch (message.t) {
        case 'thirteen:hello': {
          const existing = this.directory.assignmentFor(userId);
          if (!existing) {
            this.send(userId, { t: 'thirteen:ready', v: ROOM_PROTOCOL_VERSION });
            return;
          }
          const assignment = this.directory.reconnect(userId);
          if (assignment.room.started) {
            this.send(userId, { t: 'thirteen:room', v: ROOM_PROTOCOL_VERSION, ...assignment });
            this.broadcastSnapshots(assignment.room.roomId);
          } else this.broadcastRoom(assignment.room);
          return;
        }
        case 'thirteen:create-private': {
          const assignment = this.directory.createPrivate(userId);
          this.send(userId, { t: 'thirteen:room', v: ROOM_PROTOCOL_VERSION, ...assignment });
          return;
        }
        case 'thirteen:join-private': {
          const assignment = this.directory.joinPrivate(userId, message.code);
          this.broadcastRoom(assignment.room);
          if (assignment.room.started) this.broadcastSnapshots(assignment.room.roomId);
          return;
        }
        case 'thirteen:matchmake': {
          const assignment = this.directory.enqueueMatch(userId);
          if (!assignment) {
            this.send(userId, { t: 'thirteen:matchmaking', v: ROOM_PROTOCOL_VERSION, queued: true });
            return;
          }
          this.broadcastRoom(assignment.room);
          this.broadcastSnapshots(assignment.room.roomId);
          return;
        }
        case 'thirteen:leave': {
          const previous = this.directory.assignmentFor(userId);
          const result = this.directory.leave(userId);
          this.send(userId, { t: 'thirteen:left', v: ROOM_PROTOCOL_VERSION });
          if (previous && !result.deleted) {
            const remaining = this.directory.members(previous.room.roomId)[0];
            const updated = remaining ? this.directory.assignmentFor(remaining)?.room : null;
            if (updated) this.broadcastRoom(updated);
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
            if (assignment) this.broadcastSnapshots(assignment.room.roomId);
          }
          return;
        }
      }
    } catch (error) {
      this.error(userId, error instanceof Error ? error.message : 'thirteen_server_error');
    }
  }

  disconnect(userId: string): void {
    const assignment = this.directory.assignmentFor(userId);
    this.directory.disconnect(userId);
    if (!assignment) return;
    if (assignment.room.started) {
      this.broadcastSnapshots(assignment.room.roomId);
      return;
    }
    const remaining = this.directory.members(assignment.room.roomId)[0];
    const updated = remaining ? this.directory.assignmentFor(remaining)?.room : null;
    if (updated) this.broadcastRoom(updated);
  }

  tick(at?: number): number {
    const actions = this.directory.tick(at);
    if (actions > 0) {
      for (const roomId of this.directory.roomIds()) this.broadcastSnapshots(roomId);
    }
    return actions;
  }

  private broadcastRoom(room: WaitingRoomView): void {
    for (const member of this.directory.members(room.roomId)) {
      const assignment = this.directory.assignmentFor(member);
      if (assignment) this.send(member, { t: 'thirteen:room', v: ROOM_PROTOCOL_VERSION, ...assignment });
    }
  }

  private broadcastSnapshots(roomId: string): void {
    for (const member of this.directory.members(roomId)) this.sendSnapshot(member);
  }

  private sendSnapshot(userId: string): void {
    this.send(userId, {
      t: 'thirteen:snapshot',
      v: ROOM_PROTOCOL_VERSION,
      snapshot: this.directory.snapshotFor(userId),
    });
  }

  private error(userId: string, code: string): void {
    this.send(userId, { t: 'thirteen:error', v: ROOM_PROTOCOL_VERSION, code });
  }
}
