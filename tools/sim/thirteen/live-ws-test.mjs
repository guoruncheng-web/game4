import postgres from 'postgres';
import WebSocket from 'ws';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createSessionToken, hashPassword } from '../../../src/lib/auth.ts';
import { RULES_VERSION, legalPlays } from '../../../server/thirteen/assets/game/scripts/core/match.ts';

const url = process.argv[2] || 'ws://127.0.0.1:7012/ws';
const resultPath = process.argv[3];
const gameCount = Number(process.argv[4] || 1);
const healthUrl = new URL('/ws/health', url.replace(/^ws/, 'http')).href;
const sql = postgres(process.env.DATABASE_URL, {
  ssl: process.env.DATABASE_URL?.includes('sslmode=require') ? 'require' : false,
  max: 2,
});

class TestClient {
  constructor(user, token) {
    this.user = user;
    this.messages = [];
    this.waiters = [];
    this.ws = new WebSocket(url, { headers: { cookie: `gb_session=${token}` } });
    this.ws.on('message', (raw) => {
      const message = JSON.parse(raw.toString());
      this.messages.push(message);
      for (const waiter of [...this.waiters]) waiter();
    });
  }

  async open() {
    if (this.ws.readyState === WebSocket.OPEN) return;
    await new Promise((resolve, reject) => {
      this.ws.once('open', resolve);
      this.ws.once('error', reject);
      this.ws.once('unexpected-response', (_request, response) => reject(
        new Error(`websocket_upgrade_${response.statusCode}`),
      ));
    });
  }

  send(message) {
    this.ws.send(JSON.stringify(message));
  }

  async next(type, predicate = () => true, timeoutMs = 5000) {
    const find = () => {
      const index = this.messages.findIndex((message) => message.t === type && predicate(message));
      return index >= 0 ? this.messages.splice(index, 1)[0] : null;
    };
    const existing = find();
    if (existing) return existing;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.waiters = this.waiters.filter((item) => item !== check);
        const recent = this.messages.slice(-8).map((message) => ({
          t: message.t,
          revision: message.revision ?? message.snapshot?.revision,
          code: message.code,
        }));
        reject(new Error(`timeout_waiting_for_${type}_${this.user.username}_${JSON.stringify(recent)}`));
      }, timeoutMs);
      const check = () => {
        const message = find();
        if (!message) return;
        clearTimeout(timeout);
        this.waiters = this.waiters.filter((item) => item !== check);
        resolve(message);
      };
      this.waiters.push(check);
    });
  }

  close() {
    this.ws.close();
  }
}

function assert(value, message) {
  if (!value) throw new Error(message);
}

let clients = [];
try {
  await sql`delete from users where username like 'test-thirteen-%'`;
  const passwordHash = hashPassword('Testpass123');
  const users = await sql`
    insert into users (username, password_hash, last_login_at)
    values
      ('test-thirteen-1', ${passwordHash}, now()),
      ('test-thirteen-2', ${passwordHash}, now()),
      ('test-thirteen-3', ${passwordHash}, now()),
      ('test-thirteen-4', ${passwordHash}, now())
    returning id, username, avatar, token_version
  `;
  clients = users.map((user) => new TestClient(user, createSessionToken(Number(user.id), user.token_version)));
  await Promise.all(clients.map((client) => client.open()));
  await Promise.all(clients.map((client) => client.next('ready')));
  for (const client of clients) client.send({ t: 'thirteen:hello', v: 2 });
  await Promise.all(clients.map((client) => client.next('thirteen:ready')));

  let totalActions = 0;
  let maximumActions = 0;
  let liveRematchStarted = false;
  for (let game = 0; game < gameCount; game += 1) {
    const sequences = [0, 0, 0, 0];
    clients[0].send({ t: 'thirteen:create-private', v: 2, stake: 500 });
    const created = await clients[0].next('thirteen:room', (message) => Boolean(message.room?.code));
    const code = created.room.code;
    const roomId = created.room.roomId;
    for (let index = 1; index < clients.length; index += 1) {
      clients[index].send({ t: 'thirteen:join-private', v: 2, code });
      await clients[index].next('thirteen:room', (message) => message.room?.roomId === roomId);
    }

    for (const client of clients) client.send({ t: 'thirteen:ready', v: 2, ready: true });

    let snapshots = await Promise.all(clients.map((client) => (
      client.next('thirteen:snapshot', (message) => (
        message.snapshot?.roomId === roomId && message.snapshot.revision === 1
      ))
    )));
    const roomIds = new Set(snapshots.map((message) => message.snapshot.roomId));
    const seats = new Set(snapshots.map((message) => message.snapshot.seat));
    assert(roomIds.size === 1, 'clients_received_different_rooms');
    assert(seats.size === 4, 'clients_did_not_receive_four_distinct_seats');
    for (const { snapshot } of snapshots) {
      assert(snapshot.ownHand.length === 13, 'own_hand_not_thirteen_cards');
      assert(snapshot.opponentCounts.length === 4, 'opponent_counts_missing');
      assert(snapshot.tableStake === 500, 'practice_chip_stake_not_authoritative');
      assert(snapshot.wallet.balance === 9_500 && snapshot.wallet.reserved === 500, 'practice_chip_reservation_missing');
      assert(snapshot.presence.every((seat) => seat.displayName.startsWith('test-thirteen-')), 'real_account_profile_missing');
      assert(!('hands' in snapshot) && !('seed' in snapshot) && !('actions' in snapshot), 'private_server_state_leaked');
    }

    let actions = 0;
    while (snapshots[0].snapshot.winner === null && actions < 200) {
      const revision = snapshots[0].snapshot.revision;
      const currentSeat = snapshots[0].snapshot.currentSeat;
      const currentIndex = snapshots.findIndex((message) => message.snapshot.seat === currentSeat);
      const own = snapshots[currentIndex].snapshot;
      const hands = [[], [], [], []];
      hands[currentSeat] = own.ownHand;
      const state = {
        rulesVersion: RULES_VERSION,
        hands,
        currentSeat,
        firstPlayPending: own.firstPlayPending,
        lastPlay: own.lastPlay,
        passed: own.passed,
        hasPlayed: [true, true, true, true],
        winner: own.winner,
        turn: own.turn,
      };
      const candidate = legalPlays(state, currentSeat)[0];
      sequences[currentIndex] += 1;
      clients[currentIndex].send({
        t: 'thirteen:command',
        v: 2,
        command: {
          protocolVersion: 2,
          clientSequence: sequences[currentIndex],
          action: candidate
            ? { type: 'play', cardIds: candidate.cards.map((card) => card.id) }
            : { type: 'pass' },
        },
      });
      const ack = await clients[currentIndex].next('thirteen:ack', (message) => message.revision === revision + 1);
      assert(ack.ok === true && ack.duplicate === false, 'authoritative_action_not_accepted');
      snapshots = await Promise.all(clients.map((client) => (
        client.next('thirteen:snapshot', (message) => message.snapshot?.revision === revision + 1)
      )));
      assert(snapshots.every((message) => (
        message.snapshot.currentSeat === snapshots[0].snapshot.currentSeat
        && message.snapshot.winner === snapshots[0].snapshot.winner
        && message.snapshot.turn === snapshots[0].snapshot.turn
      )), 'public_snapshots_diverged');
      actions += 1;
    }
    assert(snapshots[0].snapshot.winner !== null, 'live_match_did_not_terminate');
    const wagerDeltas = snapshots[0].snapshot.publicResult.entries.map((entry) => entry.wagerDelta).sort((a, b) => a - b);
    assert(JSON.stringify(wagerDeltas) === JSON.stringify([-500, -500, -500, 1_500]), 'practice_chip_settlement_not_zero_sum');
    assert(snapshots.every(({ snapshot }) => snapshot.wallet.reserved === 0), 'practice_chip_reservation_not_released');
    totalActions += actions;
    maximumActions = Math.max(maximumActions, actions);

    if (game === gameCount - 1) {
      const finalRevision = snapshots[0].snapshot.revision;
      for (const client of clients) client.send({ t: 'thirteen:rematch', v: 2 });
      await Promise.all(clients.map((client) => (
        client.next('thirteen:rematch', (message) => message.started === true)
      )));
      const rematchSnapshots = await Promise.all(clients.map((client) => (
        client.next('thirteen:snapshot', (message) => (
          message.snapshot?.matchNumber === 2 && message.snapshot.revision > finalRevision
        ))
      )));
      const nextSeat = rematchSnapshots[0].snapshot.currentSeat;
      const nextIndex = rematchSnapshots.findIndex((message) => message.snapshot.seat === nextSeat);
      const own = rematchSnapshots[nextIndex].snapshot;
      const hands = [[], [], [], []];
      hands[nextSeat] = own.ownHand;
      const candidate = legalPlays({
        rulesVersion: RULES_VERSION,
        hands,
        currentSeat: nextSeat,
        firstPlayPending: own.firstPlayPending,
        lastPlay: own.lastPlay,
        passed: own.passed,
        hasPlayed: [true, true, true, true],
        winner: own.winner,
        turn: own.turn,
      }, nextSeat)[0];
      clients[nextIndex].send({
        t: 'thirteen:command', v: 2,
        command: {
          protocolVersion: 2,
          clientSequence: 1,
          action: candidate
            ? { type: 'play', cardIds: candidate.cards.map((card) => card.id) }
            : { type: 'pass' },
        },
      });
      const rematchAck = await clients[nextIndex].next(
        'thirteen:ack', (message) => message.revision === own.revision + 1,
      );
      assert(rematchAck.ok === true, 'rematch_first_sequence_not_accepted');
      liveRematchStarted = true;
    }

    const liveHealth = await fetch(healthUrl).then((response) => response.json());
    assert(liveHealth.online === 4 && liveHealth.thirteenRooms === 1, 'live_health_did_not_report_four_clients_one_room');
    for (const client of clients) {
      client.send({ t: 'thirteen:leave', v: 2 });
      await client.next('thirteen:left');
    }
    let leftHealth = await fetch(healthUrl).then((response) => response.json());
    for (let wait = 0; leftHealth.thirteenRooms !== 0 && wait < 50; wait += 1) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      leftHealth = await fetch(healthUrl).then((response) => response.json());
    }
    assert(leftHealth.thirteenRooms === 0, 'room_not_released_after_four_explicit_leaves');
    for (const client of clients) {
      client.messages = client.messages.filter((message) => ![
        'thirteen:room', 'thirteen:snapshot', 'thirteen:ack',
      ].includes(message.t));
    }
  }

  const report = {
    feature: 'game4 authenticated four-client Thirteen websocket integration',
    protocolVersion: 2,
    authenticatedClients: 4,
    privateRoomCode: true,
    completedMatches: gameCount,
    privacyScopedHands: true,
    realAccountProfiles: true,
    explicitReady: true,
    practiceChipStake: 500,
    zeroSumSettlement: true,
    totalActions,
    maximumActions,
    liveRematchStarted,
    rematchFirstSequenceAccepted: liveRematchStarted,
    roomReleasedAfterEveryMatch: true,
    accepted: true,
  };
  if (resultPath) {
    await mkdir(dirname(resultPath), { recursive: true });
    await writeFile(resultPath, `${JSON.stringify(report, null, 2)}\n`);
  }
  console.log(JSON.stringify(report, null, 2));
} finally {
  for (const client of clients) client.close();
  await sql`delete from users where username like 'test-thirteen-%'`;
  await sql.end({ timeout: 2 });
}
