/**
 * 深海捕鱼的服务端房间适配层。
 *
 * 这一层**只做粘合**:把 WebSocket 的 userId 映射成座位号、驱动 tick、
 * 把 FishRoom 吐出来的消息按座位投递回去。真正的玩法权威在
 * `src/games/fish-hunter/sim/room.ts` 里,和浏览器跑的是同一份代码
 * (见那款游戏的 DESIGN.md §3.5)。
 *
 * 之所以不把这些直接写进 ws.mjs:ws.mjs 对其它游戏是「只转发不解析」的
 * 哑管道(霓虹突击就靠这个),捕鱼是唯一需要服务端跑玩法的游戏。
 * 把它隔在单独一个文件里,ws.mjs 的改动就能压到最小,哑管道那条路一行没动。
 */

import { FishRoom } from '../src/games/fish-hunter/sim/room.ts';
import { MAX_SEATS, START_BALANCE, TICK_MS } from '../src/games/fish-hunter/config.ts';

export const FISH_GAME = 'fish-hunter';

/**
 * 余额。**现在是进程内存,进程重启就回到初始值。**
 *
 * DESIGN.md §8 第 4 步会把它换成 Postgres 的 wallets 表(批量落盘)。
 * 在那之前这里是唯一的账本 —— 别在别处再存一份,两份账本对不上比没有账本更糟。
 */
const wallets = new Map();

export function createFishAdapter({ send }) {
  /** userId → seat */
  const bySeat = new Map();
  /** seat → { userId, username } */
  const seats = new Array(MAX_SEATS).fill(null);

  const room = new FishRoom({
    seed: (Math.random() * 0xffffffff) >>> 0,
    emit: (seat, msg) => {
      if (seat === null) {
        for (const s of seats) if (s) send(s.userId, msg);
        return;
      }
      const target = seats[seat];
      if (target) send(target.userId, msg);
    },
    onWallet: (seat, balance) => {
      const s = seats[seat];
      if (s) wallets.set(s.userId, balance);
    },
  });

  let last = Date.now();
  const timer = setInterval(() => {
    const now = Date.now();
    // 夹住 dt:进程被 SIGSTOP、机器休眠之类会让这里一次跳过好几秒,
    // 原样喂进去炮弹会瞬移穿过整个池子
    const dt = Math.min(200, now - last);
    last = now;
    try { room.tick(now, dt); } catch (error) { console.error('[fish] tick 出错', error); }
  }, TICK_MS);
  timer.unref?.();

  return {
    /** 占座。满了返回 null */
    join(userId, username) {
      if (bySeat.has(userId)) return bySeat.get(userId);
      const seat = seats.indexOf(null);
      if (seat < 0) return null;
      seats[seat] = { userId, username };
      bySeat.set(userId, seat);
      room.join(seat, username, Date.now(), wallets.get(userId) ?? START_BALANCE);
      return seat;
    },

    leave(userId) {
      const seat = bySeat.get(userId);
      if (seat === undefined) return;
      // 先把余额记下来再退座 —— 退了就读不到了,那等于每次离场都丢账
      wallets.set(userId, room.balanceOf(seat));
      bySeat.delete(userId);
      seats[seat] = null;
      room.leave(seat);
    },

    /** 客户端的局内消息 */
    input(userId, data) {
      const seat = bySeat.get(userId);
      if (seat === undefined || !data || typeof data !== 'object') return;
      // 时钟对齐(DESIGN §3.2)。它不属于玩法,不进 FishRoom
      if (data.t === 'ping') return send(userId, { t: 'pong', id: data.id, now: Date.now() });
      room.input(seat, data, Date.now());
    },

    seatViews() {
      return seats
        .map((s, seat) => (s ? { seat, id: s.userId, username: s.username } : null))
        .filter(Boolean);
    },

    get size() {
      return bySeat.size;
    },

    destroy() {
      clearInterval(timer);
      for (const userId of [...bySeat.keys()]) this.leave(userId);
    },
  };
}
