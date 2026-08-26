import assert from 'node:assert/strict';
import {
  RECONNECT_WINDOW_MS,
  ROOM_PROTOCOL_VERSION,
} from '../../../server/thirteen/server/authoritative-room.ts';
import { RoomDirectory } from '../../../server/thirteen/server/room-directory.ts';
import { ThirteenWsAdapter } from '../../../server/thirteen/server/ws-adapter.ts';

let random = 1000;
let clock = 0;
const directory = new RoomDirectory(() => random++, () => clock);
const messages = new Map();
const adapter = new ThirteenWsAdapter(directory, (userId, message) => {
  messages.set(userId, [...(messages.get(userId) ?? []), message]);
});
const envelope = (t, extra = {}) => ({ t, v: ROOM_PROTOCOL_VERSION, ...extra });

adapter.handle('101', envelope('thirteen:create-private'));
const roomMessage = messages.get('101').at(-1);
assert.equal(roomMessage.t, 'thirteen:room');
assert.match(roomMessage.room.code, /^[2-9A-HJ-NP-Z]{6}$/);
for (const id of ['102', '103', '104']) {
  adapter.handle(id, envelope('thirteen:join-private', { code: roomMessage.room.code }));
}

for (const id of ['101', '102', '103', '104']) {
  const snapshots = messages.get(id).filter((message) => message.t === 'thirteen:snapshot');
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].snapshot.ownHand.length, 13);
  assert.equal(snapshots[0].snapshot.opponentCounts.filter((count) => count === 13).length, 3);
}

adapter.handle('103', envelope('thirteen:leave'));
assert.equal(messages.get('103').at(-1).t, 'thirteen:left');
assert.equal(directory.assignmentFor('103'), null);
clock += 3000;
assert.ok(adapter.tick(clock) >= 0);

let expiryClock = 10_000;
const expiryDirectory = new RoomDirectory(() => random++, () => expiryClock);
const expiryRoom = expiryDirectory.createPrivate('201');
for (const id of ['202', '203', '204']) expiryDirectory.joinPrivate(id, expiryRoom.room.code);
expiryDirectory.disconnect('202');
expiryClock += RECONNECT_WINDOW_MS + 1;
expiryDirectory.tick(expiryClock);
const replacement = expiryDirectory.createPrivate('202');
expiryClock += 1000;
expiryDirectory.tick(expiryClock);
assert.equal(expiryDirectory.assignmentFor('202').room.roomId, replacement.room.roomId);

console.log(JSON.stringify({
  game: 'thirteen',
  protocolVersion: ROOM_PROTOCOL_VERSION,
  privateRoom: true,
  fourPrivacySnapshots: true,
  leaveReleasedAssignment: true,
  expiredOldSeatCannotReleaseNewRoom: true,
  copiedRulesVersion: directory.snapshotFor('101').rulesVersion,
  accepted: true,
}, null, 2));
