import postgres from 'postgres';
import WebSocket from 'ws';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createSessionToken, hashPassword } from '../../../src/lib/auth.ts';

const url = process.argv[2] || 'ws://127.0.0.1:7012/ws';
const resultPath = process.argv[3];
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

  async next(type, predicate = () => true, timeoutMs = 3000) {
    const find = () => {
      const index = this.messages.findIndex((message) => message.t === type && predicate(message));
      return index >= 0 ? this.messages.splice(index, 1)[0] : null;
    };
    const existing = find();
    if (existing) return existing;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.waiters = this.waiters.filter((item) => item !== check);
        reject(new Error(`timeout_waiting_for_${type}`));
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
    returning id, username, token_version
  `;
  clients = users.map((user) => new TestClient(user, createSessionToken(Number(user.id), user.token_version)));
  await Promise.all(clients.map((client) => client.open()));
  await Promise.all(clients.map((client) => client.next('ready')));
  for (const client of clients) client.send({ t: 'thirteen:hello', v: 1 });
  await Promise.all(clients.map((client) => client.next('thirteen:ready')));

  clients[0].send({ t: 'thirteen:create-private', v: 1 });
  const created = await clients[0].next('thirteen:room', (message) => Boolean(message.room?.code));
  const code = created.room.code;
  for (let index = 1; index < clients.length; index += 1) {
    clients[index].send({ t: 'thirteen:join-private', v: 1, code });
    await clients[index].next('thirteen:room');
  }

  const snapshots = await Promise.all(clients.map((client) => (
    client.next('thirteen:snapshot', (message) => message.snapshot?.revision === 1)
  )));
  const roomIds = new Set(snapshots.map((message) => message.snapshot.roomId));
  const seats = new Set(snapshots.map((message) => message.snapshot.seat));
  assert(roomIds.size === 1, 'clients_received_different_rooms');
  assert(seats.size === 4, 'clients_did_not_receive_four_distinct_seats');
  for (const { snapshot } of snapshots) {
    assert(snapshot.ownHand.length === 13, 'own_hand_not_thirteen_cards');
    assert(snapshot.opponentCounts.length === 4, 'opponent_counts_missing');
    assert(!('hands' in snapshot) && !('seed' in snapshot) && !('actions' in snapshot), 'private_server_state_leaked');
  }

  const currentSeat = snapshots[0].snapshot.currentSeat;
  const currentIndex = snapshots.findIndex((message) => message.snapshot.seat === currentSeat);
  const openingCard = snapshots[currentIndex].snapshot.ownHand.find((card) => card.id === '3-spade');
  assert(openingCard, 'opening_player_does_not_hold_three_of_spades');
  clients[currentIndex].send({
    t: 'thirteen:command',
    v: 1,
    command: { protocolVersion: 1, clientSequence: 1, action: { type: 'play', cardIds: [openingCard.id] } },
  });
  const ack = await clients[currentIndex].next('thirteen:ack', (message) => message.revision === 2);
  assert(ack.ok === true && ack.duplicate === false, 'opening_command_not_accepted');
  const revised = await Promise.all(clients.map((client) => (
    client.next('thirteen:snapshot', (message) => message.snapshot?.revision === 2)
  )));
  assert(revised.every((message) => message.snapshot.ownHand.length === (message.snapshot.seat === currentSeat ? 12 : 13)), 'revised_hand_counts_diverged');

  const liveHealth = await fetch(healthUrl).then((response) => response.json());
  assert(liveHealth.online === 4 && liveHealth.thirteenRooms === 1, 'live_health_did_not_report_four_clients_one_room');
  for (const client of clients) {
    client.send({ t: 'thirteen:leave', v: 1 });
    await client.next('thirteen:left');
  }
  const leftHealth = await fetch(healthUrl).then((response) => response.json());
  assert(leftHealth.thirteenRooms === 0, 'room_not_released_after_four_explicit_leaves');

  const report = {
    feature: 'game4 authenticated four-client Thirteen websocket integration',
    protocolVersion: 1,
    authenticatedClients: 4,
    privateRoomCode: true,
    distinctSeats: seats.size,
    privacyScopedHands: true,
    acceptedOpeningRevision: ack.revision,
    roomReleasedAfterLeave: leftHealth.thirteenRooms === 0,
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
