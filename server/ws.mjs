/**
 * 联机 WebSocket 服务。
 *
 * 独立进程,不塞进 Next:
 * - `next start` 保持原样,部署和 systemd 不用为它改动;
 * - 它崩了不会把网站一起带崩。
 *
 * nginx 把 `/ws` 反代到这里。登录用户必须在握手 URL 中同时携带六位 uid 与
 * 短期 game token；不再把长期 httpOnly 会话 cookie 当作游戏协议凭据。
 *
 * 承担四件事；在线连接是内存态，UMO 与十三张权威房间使用加密恢复快照:
 *   1. 在线状态 —— 谁登录着、在不在游戏里
 *   2. 邀请 —— 转发给目标用户,对方在任何页面都能收到
 *   3. 房间 —— 匹配页的双人状态、谁是房主
 *   4. 局内中转 —— 两个人之间的游戏消息原样转发
 *
 * 为什么这些不再落数据库:在线状态本来就是内存态,之前用表存是被 serverless
 * 逼的(函数没有常驻内存)。现在是自托管的常驻进程,内存就是最合适的地方 ——
 * 进程重启等于所有人重连,而这本来就是重连要处理的场景。
 */

import { createServer } from 'node:http';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { WebSocketServer } from 'ws';
import postgres from 'postgres';
import { createFishAdapter, FISH_GAME } from './fish-room.mjs';
import { AuthoritativeGateway } from './umo/gateway.ts';
import { UmoWsAdapter } from './umo/ws-adapter.ts';
import { RoomDirectory } from './thirteen/server/room-directory.ts';
import { ThirteenWsAdapter } from './thirteen/server/ws-adapter.ts';
import { createThirteenWalletStore } from './thirteen-wallet-store.mjs';
import { readApiAccessToken } from '../src/lib/auth.ts';
import { avatarUrlFor } from '../src/lib/api-contract.ts';

const PORT = Number(process.env.WS_PORT || 7011);

/** 心跳。超过这个时间没有任何往来就断开,防止半开连接一直占着在线名额 */
const PING_INTERVAL_MS = 30_000;

const sql = postgres(process.env.DATABASE_URL, {
  ssl: process.env.DATABASE_URL?.includes('sslmode=require') ? 'require' : false,
  max: 4,
});

// ---------------------------------------------------------------- 会话

/**
 * 校验游戏访问 token。签名解析复用 src/lib/auth.ts，避免 WS 与 REST 出现两套格式。
 *
 * **必须连库比对 token_version** —— 登出和改密码是靠把库里的版本号 +1 来作废
 * 已经发出去的 token 的,只验签名的话,登出的人照样能连上来。
 * 数据库现在和应用同机,这次查询是 1ms 级,不心疼。
 */
async function resolveUser(requestUrl) {
  const rawUid = requestUrl.searchParams.get('uid');
  const uid = Number(rawUid);
  const claims = readApiAccessToken(requestUrl.searchParams.get('token') ?? undefined);
  if (!/^\d{6}$/.test(rawUid ?? '') || !claims || claims.uid !== uid) return null;

  const rows = await sql`
    select id, uid, username, avatar, avatar_version, token_version, suspended_at
    from users where id = ${claims.userId} and uid = ${uid} limit 1
  `;
  const row = rows[0];
  if (!row || row.suspended_at || row.token_version !== claims.tokenVersion) return null;
  return {
    id: Number(row.id), uid: row.uid, username: row.username, avatar: row.avatar,
    // 同源版本化头像地址既供站内 UI，也作为十三张的公开座位头像；
    // 未上传时继续保留 emoji，让各游戏自行使用其美术降级头像。
    avatarUrl: avatarUrlFor(row.uid, row.avatar_version),
  };
}

// ---------------------------------------------------------------- 状态

/** userId → 连接。**同一个人只保留最后一条连接** —— 多开标签页时前面的会被顶掉 */
const clients = new Map();
/**
 * roomId → 房间。两种形态:
 *   - 普通(霓虹突击):{ id, game, hostId, guestId, started },服务端只转发不解析;
 *   - 捕鱼:多带一个 `fish` 适配器,服务端跑玩法权威(见 fish-room.mjs)。
 * 捕鱼房**不用 guestId**,座位在适配器里。
 */
const rooms = new Map();
let nextRoomId = 1;

function send(ws, msg) {
  if (ws?.readyState === 1) {
    try { ws.send(JSON.stringify(msg)); } catch { /* 缓冲满,丢掉即可 */ }
  }
}

function sendTo(userId, msg) {
  send(clients.get(userId)?.ws, msg);
}

// Thirteen is a four-seat authoritative game, isolated from legacy relay rooms.
// Its room snapshots and command sequences use an encrypted recovery file; wallet funds are durable in PostgreSQL.
const thirteenStateFile = process.env.THIRTEEN_STATE_FILE;
const thirteenStateSecret = process.env.THIRTEEN_STATE_KEY;
if (thirteenStateFile && (!thirteenStateSecret || thirteenStateSecret.length < 32)) {
  throw new Error('THIRTEEN_STATE_KEY must contain at least 32 characters when THIRTEEN_STATE_FILE is enabled');
}
let thirteenStateHealthy = true;
let thirteenDirectory = thirteenStateFile && existsSync(thirteenStateFile)
  ? RoomDirectory.restore(
    JSON.parse(decryptThirteenState(readFileSync(thirteenStateFile, 'utf8'), thirteenStateSecret)),
    () => randomBytes(4).readUInt32LE(0),
  )
  : new RoomDirectory(() => randomBytes(4).readUInt32LE(0));
const thirteenWalletStore = createThirteenWalletStore(sql);
let thirteenSendBuffer = null;
let thirteenQueue = Promise.resolve();
let thirteenPendingMutations = 0;
let thirteenTickQueued = false;
const thirteenHydratedUsers = new Set();

function makeThirteenAdapter() {
  return new ThirteenWsAdapter(thirteenDirectory, (userId, message) => {
    if (thirteenSendBuffer) thirteenSendBuffer.push({ userId: Number(userId), message });
    else sendTo(Number(userId), message);
  });
}

let thirteenAdapter = makeThirteenAdapter();

function persistCurrentThirteenState() {
  if (!thirteenStateFile) return;
  persistThirteenAtomically(thirteenStateFile, thirteenDirectory.snapshotJson(), thirteenStateSecret);
}

function queueThirteenMutation(task, failureUserId = null) {
  thirteenPendingMutations += 1;
  thirteenQueue = thirteenQueue.then(async () => {
    const before = thirteenDirectory.snapshot();
    const buffered = [];
    thirteenSendBuffer = buffered;
    try {
      await task();
      const after = thirteenDirectory.snapshot();
      const changed = JSON.stringify(before) !== JSON.stringify(after);
      if (changed) {
        await thirteenWalletStore.persistLedgerDiff(before.ledger, after.ledger);
        persistCurrentThirteenState();
      }
      thirteenStateHealthy = true;
      thirteenSendBuffer = null;
      for (const item of buffered) sendTo(item.userId, item.message);
    } catch (error) {
      thirteenSendBuffer = null;
      thirteenDirectory = RoomDirectory.restore(
        before,
        () => randomBytes(4).readUInt32LE(0),
        Date.now,
        { disconnectAll: false },
      );
      thirteenAdapter = makeThirteenAdapter();
      thirteenStateHealthy = false;
      console.error('[thirteen] authoritative mutation rolled back', error);
      if (failureUserId !== null) {
        sendTo(failureUserId, { t: 'thirteen:error', v: 2, code: 'wallet_persistence_failed' });
      }
    }
  }).catch((error) => console.error('[thirteen] mutation queue failed', error)).finally(() => {
    thirteenPendingMutations = Math.max(0, thirteenPendingMutations - 1);
  });
  return thirteenQueue;
}

async function hydrateThirteenWallets(userId) {
  const assignment = thirteenDirectory.assignmentFor(String(userId));
  const members = assignment ? thirteenDirectory.members(assignment.room.roomId) : [];
  await thirteenWalletStore.hydrate(thirteenDirectory, [String(userId), ...members]);
}

function persistThirteenAtomically(path, snapshotJson, secret) {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  writeFileSync(temporaryPath, encryptThirteenState(snapshotJson, secret), { encoding: 'utf8', mode: 0o600 });
  renameSync(temporaryPath, path);
}

function encryptThirteenState(snapshotJson, secret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', thirteenStateKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(snapshotJson, 'utf8'), cipher.final()]);
  return ['thirteen-state-v2', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.');
}

function decryptThirteenState(envelope, secret) {
  const [version, encodedIv, encodedTag, encodedCiphertext, ...extra] = envelope.trim().split('.');
  if (version !== 'thirteen-state-v2' || !encodedIv || !encodedTag || !encodedCiphertext || extra.length > 0) {
    throw new Error('THIRTEEN_STATE_ENVELOPE_INVALID');
  }
  const decipher = createDecipheriv('aes-256-gcm', thirteenStateKey(secret), Buffer.from(encodedIv, 'base64url'));
  decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encodedCiphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

function thirteenStateKey(secret) {
  return createHash('sha256').update(secret, 'utf8').digest();
}

if (thirteenStateFile && existsSync(thirteenStateFile)) {
  // Persist the restore-time disconnect normalization before accepting sockets.
      persistThirteenAtomically(thirteenStateFile, thirteenDirectory.snapshotJson(), thirteenStateSecret);
}

const umoStateFile = process.env.UMO_STATE_FILE;
const umoStateSecret = process.env.UMO_STATE_KEY;
if (umoStateFile && (!umoStateSecret || umoStateSecret.length < 32)) {
  throw new Error('UMO_STATE_KEY must contain at least 32 characters when UMO_STATE_FILE is enabled');
}
const umoGateway = umoStateFile && existsSync(umoStateFile)
  ? AuthoritativeGateway.restore(decryptUmoState(readFileSync(umoStateFile, 'utf8'), umoStateSecret))
  : new AuthoritativeGateway();
const umoAdapter = new UmoWsAdapter(umoGateway, {
  ...(umoStateFile ? {
    onGatewayChanged: (snapshotJson) => persistUmoAtomically(umoStateFile, snapshotJson, umoStateSecret),
  } : {}),
});

function persistUmoAtomically(path, snapshotJson, secret) {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  writeFileSync(temporaryPath, encryptUmoState(snapshotJson, secret), { encoding: 'utf8', mode: 0o600 });
  renameSync(temporaryPath, path);
}

function encryptUmoState(snapshotJson, secret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', umoStateKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(snapshotJson, 'utf8'), cipher.final()]);
  return ['umo-state-v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ciphertext.toString('base64url')].join('.');
}

function decryptUmoState(envelope, secret) {
  const [version, encodedIv, encodedTag, encodedCiphertext, ...extra] = envelope.trim().split('.');
  if (version !== 'umo-state-v1' || !encodedIv || !encodedTag || !encodedCiphertext || extra.length > 0) {
    throw new Error('UMO_STATE_ENVELOPE_INVALID');
  }
  const decipher = createDecipheriv('aes-256-gcm', umoStateKey(secret), Buffer.from(encodedIv, 'base64url'));
  decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encodedCiphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

function umoStateKey(secret) {
  return createHash('sha256').update(secret, 'utf8').digest();
}
/** 可邀请的人:在线、且不在房间里 */
function invitableList(exceptId) {
  const out = [];
  for (const [id, c] of clients) {
    if (id !== exceptId && !c.roomId && !thirteenDirectory.assignmentFor(String(id))) {
      out.push({ id, uid: c.uid, username: c.username });
    }
  }
  return out.slice(0, 50);
}

/** 在线名单变了就推给所有空闲的人,免得他们看着一份过期的列表点邀请 */
function broadcastOnline() {
  for (const [id, c] of clients) {
    if (!c.roomId && !thirteenDirectory.assignmentFor(String(id))) {
      send(c.ws, { t: 'online', users: invitableList(id) });
    }
  }
}

function roomView(room) {
  if (room.fish) {
    // 捕鱼房没有 host/guest 之分,只有座位。hostId 保留只是为了"谁建的房"
    return {
      id: room.id,
      game: room.game,
      hostId: room.hostId,
      started: true, // 捕鱼没有"开局"这一刻:房建好鱼就在游,人随进随打
      players: room.fish.seatViews().map((s) => ({ id: s.id, username: s.username, host: s.id === room.hostId, seat: s.seat })),
    };
  }
  const host = clients.get(room.hostId);
  const guest = room.guestId ? clients.get(room.guestId) : null;
  return {
    id: room.id,
    game: room.game,
    hostId: room.hostId,
    started: room.started,
    players: [
      { id: room.hostId, username: host?.username ?? '(已离开)', host: true },
      ...(room.guestId ? [{ id: room.guestId, username: guest?.username ?? '(已离开)', host: false }] : []),
    ],
  };
}

function pushRoom(room) {
  const view = roomView(room);
  for (const id of memberIds(room)) sendTo(id, { t: 'room', room: view });
}

/** 房间里现在有哪些人 */
function memberIds(room) {
  if (room.fish) return room.fish.seatViews().map((s) => s.id);
  return [room.hostId, room.guestId].filter(Boolean);
}

/** 可加入的捕鱼房。大厅列表(DESIGN §4.2:开放房列表,不是定向邀请) */
function fishRoomList() {
  const out = [];
  for (const room of rooms.values()) {
    if (room.game !== FISH_GAME || !room.fish) continue;
    const players = room.fish.seatViews();
    out.push({
      id: room.id,
      count: players.length,
      max: 4,
      names: players.map((p) => p.username),
    });
  }
  return out.slice(0, 30);
}

/** 房列表变了就推给所有没在房里的人 */
function broadcastFishRooms() {
  const list = fishRoomList();
  for (const c of clients.values()) if (!c.roomId) send(c.ws, { t: 'rooms', game: FISH_GAME, rooms: list });
}

/**
 * 离开捕鱼房。**不是「一个人走全房散」** —— 这是它和霓虹突击最大的区别:
 * 走的人腾出座位,剩下的人继续打,房间只在座位全空时销毁。
 */
function leaveFishRoom(room, userId) {
  room.fish.leave(userId);
  const client = clients.get(userId);
  if (client && client.roomId === room.id) client.roomId = null;
  sendTo(userId, { t: 'roomClosed', reason: 'left' });

  if (room.fish.size === 0) {
    room.fish.destroy();
    rooms.delete(room.id);
  } else {
    // 建房的人走了就把"房主"转给还在的第一个人,免得列表里显示一个不存在的人
    if (room.hostId === userId) room.hostId = room.fish.seatViews()[0].id;
    pushRoom(room);
  }
  broadcastOnline();
  broadcastFishRooms();
}

/**
 * 解散房间。**必须每个人都通知到**,否则留在匹配页的人会一直等一个不会来的人。
 *
 * byName 是离开者的名字:前端要在导航栏下方显示「谁谁离开了游戏」,
 * 没有名字就只能笼统地说「队友」。走的人自己不需要看这条提示。
 */
function closeRoom(roomId, reason, byName) {
  const room = rooms.get(roomId);
  if (!room) return;
  if (room.fish) room.fish.destroy();
  rooms.delete(roomId);
  for (const id of memberIds(room)) {
    if (!id) continue;
    const c = clients.get(id);
    if (c && c.roomId === roomId) c.roomId = null;
    sendTo(id, { t: 'roomClosed', reason, by: byName && c?.username !== byName ? byName : null });
  }
  broadcastOnline();
  broadcastFishRooms();
}

/**
 * 把「你现在在哪个房间」补发给某个连接。
 *
 * **新连接必须补这一条。** 连接可能是重连来的(严格模式双挂载、切网、页面导航),
 * 而新连接只会收到 ready 和 online —— 偏偏 broadcastOnline 又刻意跳过在房间里的人。
 * 不补的话,这个人在服务端"在房间里",在浏览器里却 room 为空、在线列表也是空,
 * 页面上就是**什么都看不到**,而另一个人却看得见他。
 */
function pushCurrentRoom(client) {
  const room = client.roomId ? rooms.get(client.roomId) : null;
  if (room) send(client.ws, { t: 'room', room: roomView(room) });
}

/** 房间里的另一个人 */
function peerOf(room, userId) {
  return room.hostId === userId ? room.guestId : room.hostId;
}

// ---------------------------------------------------------------- 消息

function handle(client, msg) {
  const me = client.userId;
  if (typeof msg?.t === 'string' && msg.t.startsWith('thirteen:')) {
    if (client.roomId && ['thirteen:create-private', 'thirteen:join-private', 'thirteen:matchmake'].includes(msg.t)) {
      send(client.ws, { t: 'thirteen:error', v: 2, code: 'user_already_in_other_game' });
      return;
    }
    queueThirteenMutation(async () => {
      // PostgreSQL is authoritative at session entry and after a REST exchange.
      // Between those boundaries the serialized room directory already contains
      // the latest persisted balance, so rehydrating on every card action only
      // adds latency and lets scheduler ticks pile up behind a database round trip.
      if (!thirteenHydratedUsers.has(me) || msg.t === 'thirteen:hello' || msg.t === 'thirteen:wallet') {
        await hydrateThirteenWallets(me);
        thirteenHydratedUsers.add(me);
      }
      thirteenAdapter.handle({
        userId: String(me),
        displayName: client.username,
        avatar: client.avatarUrl ?? client.avatar,
      }, msg);
    }, me);
    return;
  }
  if (thirteenDirectory.assignmentFor(String(me)) && msg?.t !== 'hello') {
    send(client.ws, { t: 'error', message: '你正在十三张房间中' });
    return;
  }
  switch (msg.t) {
    case 'hello':
      send(client.ws, { t: 'online', users: invitableList(me) });
      // 顺带补一次房间状态,理由同 pushCurrentRoom
      pushCurrentRoom(client);
      if (!client.roomId) send(client.ws, { t: 'rooms', game: FISH_GAME, rooms: fishRoomList() });
      break;

    /** 邀请。对方在任何页面都能收到 —— 这正是要独立 WebSocket 而不是轮询的原因 */
    case 'invite': {
      const target = Number(msg.userId);
      const targetClient = clients.get(target);
      if (!targetClient) return send(client.ws, { t: 'error', message: '对方已经离线了' });
      if (targetClient.roomId) return send(client.ws, { t: 'error', message: '对方正在游戏中' });
      if (client.roomId) return send(client.ws, { t: 'error', message: '你已经在一个房间里了' });

      const room = { id: nextRoomId++, game: String(msg.game || 'neon-strike-2d'), hostId: me, guestId: null, started: false };
      rooms.set(room.id, room);
      client.roomId = room.id;
      client.pendingInvite = target;
      sendTo(target, { t: 'invited', roomId: room.id, game: room.game, from: client.username });
      send(client.ws, { t: 'room', room: roomView(room) });
      broadcastOnline();
      break;
    }

    /**
     * 建一个捕鱼房。和邀请制不同:建完就自己坐下开打,不等人。
     * 房间会出现在大厅列表里,别人随时能补座(DESIGN §4.2)。
     */
    case 'create': {
      if (client.roomId) return send(client.ws, { t: 'error', message: '你已经在一个房间里了' });
      const room = { id: nextRoomId++, game: FISH_GAME, hostId: me, guestId: null, started: true };
      room.fish = createFishAdapter({ send: (userId, data) => sendTo(userId, { t: 'game', data }) });
      rooms.set(room.id, room);
      room.fish.join(me, client.username);
      client.roomId = room.id;
      send(client.ws, { t: 'room', room: roomView(room) });
      broadcastOnline();
      broadcastFishRooms();
      break;
    }

    /** 占一个空座 */
    case 'join': {
      if (client.roomId) return send(client.ws, { t: 'error', message: '你已经在一个房间里了' });
      const room = rooms.get(Number(msg.roomId));
      if (!room || !room.fish) return send(client.ws, { t: 'error', message: '这个房间已经没了' });
      const seat = room.fish.join(me, client.username);
      if (seat === null) return send(client.ws, { t: 'error', message: '这个房间坐满了' });
      client.roomId = room.id;
      pushRoom(room);
      broadcastOnline();
      broadcastFishRooms();
      break;
    }

    /** 主动拉一次房列表 */
    case 'rooms':
      send(client.ws, { t: 'rooms', game: FISH_GAME, rooms: fishRoomList() });
      break;

    case 'accept': {
      const room = rooms.get(Number(msg.roomId));
      if (!room || room.guestId) return send(client.ws, { t: 'error', message: '这个邀请已经失效了' });
      room.guestId = me;
      client.roomId = room.id;
      pushRoom(room);
      broadcastOnline();
      break;
    }

    case 'decline': {
      const room = rooms.get(Number(msg.roomId));
      if (room) closeRoom(room.id, 'declined');
      break;
    }

    case 'leave': {
      const room = client.roomId ? rooms.get(client.roomId) : null;
      if (!room) return;
      // 捕鱼房只腾座位,不解散;其它游戏仍是「一个人走全房散」
      if (room.fish) leaveFishRoom(room, me);
      else closeRoom(room.id, 'left', client.username);
      break;
    }

    /** 开始游戏。**只有房主能开**,而且必须两个人都在 */
    case 'start': {
      const room = rooms.get(client.roomId);
      if (!room || room.hostId !== me) return;
      if (!room.guestId) return send(client.ws, { t: 'error', message: '还没有人加入' });
      room.started = true;
      sendTo(room.hostId, { t: 'start', roomId: room.id, game: room.game, role: 'host' });
      sendTo(room.guestId, { t: 'start', roomId: room.id, game: room.game, role: 'guest' });
      break;
    }

    /**
     * 局内消息。服务端**不解析内容**,原样转发给房间里的另一个人。
     * 玩法协议(见 games/neon-strike-2d/coop/protocol.ts)因此可以随便改,
     * 不需要动这个服务。
     */
    case 'game': {
      const room = rooms.get(client.roomId);
      if (!room) return;
      // 捕鱼是唯一一个服务端要解析局内消息的游戏 —— 因为鱼池和金币是共享的,
      // 裁决权不能交给某个玩家的浏览器(它的 DESIGN.md §1)
      if (room.fish) { room.fish.input(me, msg.data); return; }
      const peer = peerOf(room, me);
      if (peer) sendTo(peer, { t: 'game', data: msg.data });
      break;
    }

    default:
      break;
  }
}

// ---------------------------------------------------------------- 启动

const server = createServer((req, res) => {
  // 给运维一个不需要 WebSocket 就能看的健康检查
  if (req.url === '/ws/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({
      ok: true,
      online: clients.size,
      rooms: rooms.size,
      umoRooms: umoAdapter.roomCount,
      umoConnections: umoAdapter.connectionCount,
      thirteenRooms: thirteenDirectory.roomIds().length,
      thirteenPendingMutations,
      thirteenPersistence: thirteenStateFile ? (thirteenStateHealthy ? 'encrypted-ready' : 'error') : 'memory-only',
    }));
  }
  res.writeHead(426).end('Expected WebSocket');
});

const wss = new WebSocketServer({ noServer: true });
const umoWss = new WebSocketServer({ noServer: true });

server.on('upgrade', async (req, socket, head) => {
  try {
    const requestUrl = new URL(req.url || '/ws', 'http://127.0.0.1');
    if (requestUrl.pathname === '/ws' && requestUrl.searchParams.get('game') === 'umo') {
      const hasIdentity = requestUrl.searchParams.has('uid') || requestUrl.searchParams.has('token');
      if (hasIdentity && !await resolveUser(requestUrl)) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        return socket.destroy();
      }
      umoWss.handleUpgrade(req, socket, head, (ws) => umoAdapter.attach(ws));
      return;
    }
    const user = await resolveUser(requestUrl);
    if (!user) {
      // 没登录直接拒,不要升级成 WebSocket 再断 —— 前端分不清"没登录"和"服务挂了"
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      return socket.destroy();
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      // 同一个人再连时顶掉旧连接,否则多开标签页会让在线列表里出现两个他
      const old = clients.get(user.id);
      if (old && old.ws !== ws) {
        send(old.ws, { t: 'replaced' });
        try { old.ws.close(); } catch { /* 已经关了 */ }
      }
      const client = {
        ws, userId: user.id, uid: user.uid, username: user.username, avatar: user.avatar,
        avatarUrl: user.avatarUrl, roomId: old?.roomId ?? null, alive: true,
      };
      clients.set(user.id, client);

      send(ws, { t: 'ready', me: {
        id: user.id, uid: user.uid, username: user.username, avatar: user.avatar,
        avatarUrl: user.avatarUrl,
      } });
      // 继承来的房间已经解散了就把标记清掉,否则这个人会永远"在房间里"、
      // 既收不到在线列表也进不了新房间
      if (client.roomId && !rooms.has(client.roomId)) client.roomId = null;
      pushCurrentRoom(client);
      broadcastOnline();

      ws.on('pong', () => { client.alive = true; });
      ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw.toString()); } catch { return; }
        try { handle(client, msg); } catch (error) { console.error('[ws] 处理消息出错', error); }
      });
      ws.on('close', () => {
        if (clients.get(user.id) !== client) return; // 已经被新连接顶掉了
        clients.delete(user.id);
        queueThirteenMutation(() => thirteenAdapter.disconnect(String(user.id)));
        const room = client.roomId ? rooms.get(client.roomId) : null;
        if (room?.fish) leaveFishRoom(room, user.id);
        else if (room) closeRoom(room.id, 'peer-left', client.username);
        broadcastOnline();
        broadcastFishRooms();
      });
    });
  } catch (error) {
    console.error('[ws] 升级失败', error);
    socket.destroy();
  }
});

// 半开连接(拔网线、切后台被杀)不会触发 close,只能靠心跳发现
setInterval(() => {
  for (const client of clients.values()) {
    if (!client.alive) { try { client.ws.terminate(); } catch { /* 忽略 */ } continue; }
    client.alive = false;
    try { client.ws.ping(); } catch { /* 忽略 */ }
  }
}, PING_INTERVAL_MS).unref();

// Gameplay uses authoritative actions; this lightweight scheduler only handles deadlines and bot takeover.
setInterval(() => {
  if (thirteenTickQueued) return;
  thirteenTickQueued = true;
  queueThirteenMutation(() => thirteenAdapter.tick(Date.now()))
    .finally(() => { thirteenTickQueued = false; });
}, 250).unref();

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[ws] 监听 127.0.0.1:${PORT}`);
});
