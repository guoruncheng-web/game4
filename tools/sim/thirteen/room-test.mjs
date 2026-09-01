import assert from 'node:assert/strict';
import {
  ROOM_PROTOCOL_VERSION,
  TURN_TIMEOUT_MS,
} from '../../../server/thirteen/server/authoritative-room.ts';
import { RoomDirectory } from '../../../server/thirteen/server/room-directory.ts';
import { ThirteenWsAdapter } from '../../../server/thirteen/server/ws-adapter.ts';

let random = 1_000;
let clock = 10_000;
let changeCount = 0;
const directory = new RoomDirectory(() => random++, () => clock);
const messages = new Map();
const adapter = new ThirteenWsAdapter(
  directory,
  (userId, message) => messages.set(userId, [...(messages.get(userId) ?? []), message]),
  () => { changeCount += 1; },
);
const envelope = (t, extra = {}) => ({ t, v: ROOM_PROTOCOL_VERSION, ...extra });
const identities = [
  { userId: '101', displayName: '阿岚', avatar: '🐯' },
  { userId: '102', displayName: '小明', avatar: '🦊' },
  { userId: '103', displayName: '小武', avatar: '🐼' },
  { userId: '104', displayName: '安娜', avatar: '🐨' },
];

adapter.handle(identities[0], envelope('thirteen:create-private', { stake: 500 }));
const roomMessage = messages.get('101').findLast((message) => message.t === 'thirteen:room');
assert.equal(roomMessage.t, 'thirteen:room');
assert.match(roomMessage.room.code, /^[2-9A-HJ-NP-Z]{6}$/);
assert.equal(roomMessage.room.stake, 500);
for (const identity of identities.slice(1)) {
  adapter.handle(identity, envelope('thirteen:join-private', { code: roomMessage.room.code }));
}
assert.equal(messages.get('101').some((message) => message.t === 'thirteen:snapshot'), false);

// Ready is a real reservation boundary. Cancel/re-ready must lock exactly once.
adapter.handle(identities[1], envelope('thirteen:ready', { ready: true }));
adapter.handle(identities[1], envelope('thirteen:ready', { ready: false }));
adapter.handle(identities[1], envelope('thirteen:ready', { ready: true }));
for (const identity of [identities[0], identities[2], identities[3]]) {
  adapter.handle(identity, envelope('thirteen:ready', { ready: true }));
}

for (const identity of identities) {
  const snapshots = messages.get(identity.userId).filter((message) => message.t === 'thirteen:snapshot');
  assert.equal(snapshots.length, 1);
  const snapshot = snapshots[0].snapshot;
  assert.equal(snapshot.ownHand.length, 13);
  assert.equal(snapshot.opponentCounts.filter((count) => count === 13).length, 3);
  assert.equal(snapshot.tableStake, 500);
  assert.deepEqual(snapshot.presence.map((seat) => seat.displayName), identities.map((entry) => entry.displayName));
  assert.equal(snapshot.wallet.balance, 9_500);
  assert.equal(snapshot.wallet.reserved, 500);
}

for (let guard = 0; directory.snapshotFor('101').winner === null && guard < 240; guard += 1) {
  clock += TURN_TIMEOUT_MS;
  adapter.tick(clock);
}
const finished = identities.map((identity) => directory.snapshotFor(identity.userId));
assert.equal(finished.every((snapshot) => snapshot.winner !== null), true);
const authoritativeResult = JSON.stringify(finished[0].publicResult);
assert.equal(finished.every((snapshot) => JSON.stringify(snapshot.publicResult) === authoritativeResult), true);
assert.deepEqual(
  [...finished[0].publicResult.entries.map((entry) => entry.wagerDelta)].sort((a, b) => a - b),
  [-500, -500, -500, 1_500],
);
assert.equal(identities.reduce((sum, identity) => sum + directory.walletFor(identity.userId).total, 0), 40_000);
assert.equal(finished.every((snapshot) => snapshot.wallet.reserved === 0), true);

// Encrypted host persistence serializes this snapshot. Restore must not settle twice.
const restored = RoomDirectory.restore(JSON.parse(directory.snapshotJson()), () => random++, () => clock);
const restoredTotals = identities.map((identity) => restored.walletFor(identity.userId).total);
assert.deepEqual(restoredTotals, identities.map((identity) => directory.walletFor(identity.userId).total));
assert.equal(restored.assignmentFor('101').room.players.every((player) => player.connected === false), true);
assert.equal(JSON.stringify(restored.snapshotFor('101').publicResult), authoritativeResult);

const restoredMessages = new Map();
const restoredAdapter = new ThirteenWsAdapter(restored, (userId, message) => {
  restoredMessages.set(userId, [...(restoredMessages.get(userId) ?? []), message]);
});
for (const identity of identities) restoredAdapter.handle(identity, envelope('thirteen:hello'));
for (const identity of identities) restoredAdapter.handle(identity, envelope('thirteen:rematch'));
const rematch = restored.snapshotFor('101');
assert.equal(rematch.matchNumber, 2);
assert.equal(rematch.winner, null);
assert.equal(rematch.wallet.reserved, 500);
assert.equal(rematch.nextClientSequence, 1);

console.log(JSON.stringify({
  game: 'thirteen',
  protocolVersion: ROOM_PROTOCOL_VERSION,
  privateRoom: true,
  realProfiles: true,
  fourPrivacySnapshots: true,
  explicitReady: true,
  chipStake: 500,
  zeroSumSettlement: true,
  restartRecovery: true,
  rematchReservation: true,
  persistedChanges: changeCount,
  copiedRulesVersion: finished[0].rulesVersion,
  accepted: true,
}, null, 2));
