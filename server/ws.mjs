/**
 * 联机 WebSocket 服务。
 *
 * 独立进程,不塞进 Next:
 * - `next start` 保持原样,部署和 systemd 不用为它改动;
 * - 它崩了不会把网站一起带崩。
 *
 * nginx 把 `/ws` 反代到这里。**同域名下浏览器会自动带上会话 cookie**,
 * 所以鉴权直接复用现有账号体系,不需要另发一套票据。
 *
 * 承担四件事,全部是内存态:
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
import { createHmac, timingSafeEqual } from 'node:crypto';
import { WebSocketServer } from 'ws';
import postgres from 'postgres';

const PORT = Number(process.env.WS_PORT || 7011);
const SESSION_COOKIE = 'gb_session';

/** 心跳。超过这个时间没有任何往来就断开,防止半开连接一直占着在线名额 */
const PING_INTERVAL_MS = 30_000;

const sql = postgres(process.env.DATABASE_URL, {
  ssl: process.env.DATABASE_URL?.includes('sslmode=require') ? 'require' : false,
  max: 4,
});

// ---------------------------------------------------------------- 会话

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error('AUTH_SECRET 未配置');
  return value;
}

/**
 * 校验会话 token。和 src/lib/auth.ts 的 readSessionToken 是同一套格式:
 * `用户id.版本号.过期时间.签名`。
 *
 * **必须连库比对 token_version** —— 登出和改密码是靠把库里的版本号 +1 来作废
 * 已经发出去的 token 的,只验签名的话,登出的人照样能连上来。
 * 数据库现在和应用同机,这次查询是 1ms 级,不心疼。
 */
async function resolveUser(cookieHeader) {
  const raw = cookieHeader || '';
  let token;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === SESSION_COOKIE) token = part.slice(i + 1).trim();
  }
  if (!token) return null;

  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [rawId, rawVersion, rawExpires, signature] = parts;
  const payload = `${rawId}.${rawVersion}.${rawExpires}`;
  const expected = createHmac('sha256', secret()).update(payload).digest('base64url');
  if (signature.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  if (Number(rawExpires) * 1000 < Date.now()) return null;

  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) return null;
  const rows = await sql`select id, username, token_version from users where id = ${id} limit 1`;
  const row = rows[0];
  if (!row || row.token_version !== Number(rawVersion)) return null;
  return { id: Number(row.id), username: row.username };
}

// ---------------------------------------------------------------- 状态

/** userId → 连接。**同一个人只保留最后一条连接** —— 多开标签页时前面的会被顶掉 */
const clients = new Map();
/** roomId → { id, game, hostId, guestId, started } */
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

/** 可邀请的人:在线、且不在房间里 */
function invitableList(exceptId) {
  const out = [];
  for (const [id, c] of clients) {
    if (id !== exceptId && !c.roomId) out.push({ id, username: c.username });
  }
  return out.slice(0, 50);
}

/** 在线名单变了就推给所有空闲的人,免得他们看着一份过期的列表点邀请 */
function broadcastOnline() {
  for (const [id, c] of clients) {
    if (!c.roomId) send(c.ws, { t: 'online', users: invitableList(id) });
  }
}

function roomView(room) {
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
  sendTo(room.hostId, { t: 'room', room: view });
  if (room.guestId) sendTo(room.guestId, { t: 'room', room: view });
}

/** 解散房间。**必须两边都通知到**,否则留在匹配页的那个人会一直等一个不会来的人 */
function closeRoom(roomId, reason) {
  const room = rooms.get(roomId);
  if (!room) return;
  rooms.delete(roomId);
  for (const id of [room.hostId, room.guestId]) {
    if (!id) continue;
    const c = clients.get(id);
    if (c && c.roomId === roomId) c.roomId = null;
    sendTo(id, { t: 'roomClosed', reason });
  }
  broadcastOnline();
}

/** 房间里的另一个人 */
function peerOf(room, userId) {
  return room.hostId === userId ? room.guestId : room.hostId;
}

// ---------------------------------------------------------------- 消息

function handle(client, msg) {
  const me = client.userId;
  switch (msg.t) {
    case 'hello':
      send(client.ws, { t: 'online', users: invitableList(me) });
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

    case 'leave':
      if (client.roomId) closeRoom(client.roomId, 'left');
      break;

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
    return res.end(JSON.stringify({ ok: true, online: clients.size, rooms: rooms.size }));
  }
  res.writeHead(426).end('Expected WebSocket');
});

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', async (req, socket, head) => {
  try {
    const user = await resolveUser(req.headers.cookie);
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
      const client = { ws, userId: user.id, username: user.username, roomId: old?.roomId ?? null, alive: true };
      clients.set(user.id, client);

      send(ws, { t: 'ready', me: { id: user.id, username: user.username } });
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
        if (client.roomId) closeRoom(client.roomId, 'peer-left');
        broadcastOnline();
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

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[ws] 监听 127.0.0.1:${PORT}`);
});
