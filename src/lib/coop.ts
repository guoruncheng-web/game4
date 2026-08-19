/**
 * 联机协作的服务端数据访问层(neon-strike-2d)。
 *
 * 职责边界:**只负责「找到人」和「握手」。**
 * 局内同步一个字节都不经过这里 —— 那走 WebRTC DataChannel 直连。
 * 协议全文见 `src/games/neon-strike-2d/COOP.md`。
 *
 * 这一层刻意只暴露"意图"级别的函数(邀请、接受、离开),不暴露裸 SQL:
 * 房间状态和 presence 是一对必须同步改的东西,散在各个路由里迟早会漏。
 */

import { getSql } from './db';

/** 超过这个时间没心跳就当离线。取 20 秒 = 心跳间隔(3 秒)的六倍以上,容得下丢包和切后台 */
export const PRESENCE_TTL_SECONDS = 20;
/** 从发出邀请算起,多久没连上就判失败。连不上时用户唯一的诉求是尽快知道连不上 */
export const HANDSHAKE_TIMEOUT_SECONDS = 30;

export type RoomState = 'pending' | 'accepted' | 'connected' | 'declined' | 'ended';

export type Room = {
  id: number;
  hostId: number;
  guestId: number;
  state: RoomState;
  /** 相对当前用户的角色 */
  role: 'host' | 'guest';
  /** 对方的用户名 */
  peer: string;
  createdAt: string;
};

export type OnlineUser = { id: number; username: string };

type RoomRow = {
  id: string | number;
  host_id: string | number;
  guest_id: string | number;
  state: RoomState;
  created_at: string;
  host_name: string;
  guest_name: string;
};

function toRoom(row: RoomRow, viewerId: number): Room {
  const hostId = Number(row.host_id);
  const guestId = Number(row.guest_id);
  const isHost = hostId === viewerId;
  return {
    id: Number(row.id),
    hostId,
    guestId,
    state: row.state,
    role: isHost ? 'host' : 'guest',
    peer: isHost ? row.guest_name : row.host_name,
    createdAt: row.created_at,
  };
}

// ---------------------------------------------------------------- 在线状态

/** 上报在线。status 只在进出局时变,平时传 idle */
export async function touchPresence(userId: number, status: 'idle' | 'busy' = 'idle') {
  const sql = getSql();
  await sql`
    insert into coop_presence (user_id, last_seen_at, status)
    values (${userId}, now(), ${status})
    on conflict (user_id) do update set last_seen_at = now(), status = ${status}
  `;
}

/**
 * 可邀请的人:在线、idle、不是自己。
 *
 * 上限 50 —— 这个列表是给人点的,不是给人翻的;真到需要分页的规模,
 * 该做的是搜索而不是更长的列表。
 */
export async function listInvitable(userId: number): Promise<OnlineUser[]> {
  const sql = getSql();
  const rows = (await sql`
    select u.id, u.username
    from coop_presence p
    join users u on u.id = p.user_id
    where p.user_id <> ${userId}
      and p.status = 'idle'
      and p.last_seen_at > now() - make_interval(secs => ${PRESENCE_TTL_SECONDS})
    order by p.last_seen_at desc
    limit 50
  `) as Array<{ id: string | number; username: string }>;
  return rows.map((r) => ({ id: Number(r.id), username: r.username }));
}

// ---------------------------------------------------------------- 房间

/**
 * 当前用户所在的活房间。**同时会把超时的房间收掉。**
 *
 * 超时清理放在读路径上而不是定时任务里:这个项目没有常驻进程,
 * 而心跳本来就是每 3 秒一次的高频读 —— 顺手清理是最省事且一定会被执行的位置。
 */
export async function currentRoom(userId: number): Promise<Room | null> {
  const sql = getSql();
  await sql`
    update coop_rooms set state = 'ended', updated_at = now()
    where state in ('pending', 'accepted')
      and created_at < now() - make_interval(secs => ${HANDSHAKE_TIMEOUT_SECONDS})
  `;
  const rows = (await sql`
    select r.id, r.host_id, r.guest_id, r.state, r.created_at,
           h.username as host_name, g.username as guest_name
    from coop_rooms r
    join users h on h.id = r.host_id
    join users g on g.id = r.guest_id
    where (r.host_id = ${userId} or r.guest_id = ${userId})
      and r.state in ('pending', 'accepted', 'connected')
    order by r.id desc
    limit 1
  `) as RoomRow[];
  return rows[0] ? toRoom(rows[0], userId) : null;
}

export type InviteResult =
  | { ok: true; room: Room }
  | { ok: false; reason: 'self' | 'busy' | 'offline' | 'already' };

/** 邀请某人。四种拒绝理由都要分开报,前端才能给出有用的提示 */
export async function invite(hostId: number, guestId: number): Promise<InviteResult> {
  if (hostId === guestId) return { ok: false, reason: 'self' };

  const sql = getSql();
  if (await currentRoom(hostId)) return { ok: false, reason: 'already' };

  const target = (await sql`
    select status, last_seen_at > now() - make_interval(secs => ${PRESENCE_TTL_SECONDS}) as online
    from coop_presence where user_id = ${guestId} limit 1
  `) as Array<{ status: string; online: boolean }>;
  if (!target[0]?.online) return { ok: false, reason: 'offline' };
  if (target[0].status !== 'idle') return { ok: false, reason: 'busy' };
  if (await currentRoom(guestId)) return { ok: false, reason: 'busy' };

  const created = (await sql`
    insert into coop_rooms (host_id, guest_id, state) values (${hostId}, ${guestId}, 'pending')
    returning id, host_id, guest_id, state, created_at,
      (select username from users where id = ${hostId}) as host_name,
      (select username from users where id = ${guestId}) as guest_name
  `) as RoomRow[];
  return { ok: true, room: toRoom(created[0], hostId) };
}

/**
 * 接受 / 拒绝邀请。只有受邀方能调,而且只对 pending 的房间生效 ——
 * 不加这两个条件的话,任何人都能改任何房间的状态。
 */
export async function respond(userId: number, roomId: number, accept: boolean): Promise<Room | null> {
  const sql = getSql();
  const rows = (await sql`
    update coop_rooms set state = ${accept ? 'accepted' : 'declined'}, updated_at = now()
    where id = ${roomId} and guest_id = ${userId} and state = 'pending'
    returning id, host_id, guest_id, state, created_at,
      (select username from users where id = host_id) as host_name,
      (select username from users where id = guest_id) as guest_name
  `) as RoomRow[];
  if (!rows[0]) return null;
  if (accept) {
    await Promise.all([
      touchPresence(Number(rows[0].host_id), 'busy'),
      touchPresence(userId, 'busy'),
    ]);
  }
  return toRoom(rows[0], userId);
}

/** DataChannel 打开后由任一方上报,把房间推进到 connected */
export async function markConnected(userId: number, roomId: number) {
  const sql = getSql();
  await sql`
    update coop_rooms set state = 'connected', updated_at = now()
    where id = ${roomId} and (host_id = ${userId} or guest_id = ${userId}) and state = 'accepted'
  `;
}

/**
 * 退出。**必须把双方的 presence 都置回 idle。**
 * 漏了这一步的表现是「这个人明明没在玩,却一直显示 busy 邀请不了」——
 * 而且他自己完全看不出问题在哪。
 */
export async function leave(userId: number) {
  const sql = getSql();
  const rows = (await sql`
    update coop_rooms set state = 'ended', updated_at = now()
    where (host_id = ${userId} or guest_id = ${userId}) and state in ('pending', 'accepted', 'connected')
    returning host_id, guest_id
  `) as Array<{ host_id: string | number; guest_id: string | number }>;

  const ids = new Set<number>([userId]);
  for (const row of rows) {
    ids.add(Number(row.host_id));
    ids.add(Number(row.guest_id));
  }
  await Promise.all([...ids].map((id) => touchPresence(id, 'idle')));
}

// ---------------------------------------------------------------- 信令

export type Signal = { kind: string; payload: unknown };

export async function pushSignal(roomId: number, fromId: number, kind: string, payload: unknown) {
  const sql = getSql();
  await sql`
    insert into coop_signals (room_id, from_id, kind, payload)
    values (${roomId}, ${fromId}, ${kind}, ${JSON.stringify(payload)})
  `;
}

/**
 * 取走发给我的信令(**取完即删**)。
 *
 * 用 `delete ... returning` 一条语句完成读+删,而不是先 select 再 delete:
 * 两条语句之间如果又插进来一条,就会被 delete 顺手清掉却没人读到 ——
 * 丢一条 ICE candidate 的表现就是"偶尔连不上"。
 */
export async function drainSignals(roomId: number, userId: number): Promise<Signal[]> {
  const sql = getSql();
  const rows = (await sql`
    delete from coop_signals
    where room_id = ${roomId} and from_id <> ${userId}
    returning kind, payload
  `) as Array<{ kind: string; payload: unknown }>;
  return rows.map((r) => ({ kind: r.kind, payload: r.payload }));
}

/** 房间必须属于这个用户 —— 所有信令接口都要先过这一关 */
export async function memberOf(userId: number, roomId: number): Promise<boolean> {
  const sql = getSql();
  // 不用断言成 unknown[]:postgres.js 返回的是只读的 RowList,直接读 length 就行
  const rows = await sql`
    select 1 from coop_rooms
    where id = ${roomId} and (host_id = ${userId} or guest_id = ${userId})
    limit 1
  `;
  return rows.length > 0;
}
