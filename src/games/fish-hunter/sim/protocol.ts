/**
 * 局内协议。DESIGN.md §5。**两端共用同一份**。
 *
 * 一条贯穿全表的原则(和霓虹突击那套一样):**能推算的就不同步**。
 * 鱼是时间的纯函数,`spawn` 一次带全参数之后就不再有位置消息;
 * 炮弹是直线 + 侧壁反弹,同理。40 条鱼 × 20Hz 的位置广播直接归零。
 *
 * 与霓虹突击的关键区别:**服务端是权威**,不是某个玩家的浏览器。
 * 因为捕鱼是共享鱼池 + 共享金币经济(DESIGN.md §1)。
 */

import type { FishKindId } from '../config';

export type PathId = 'cross' | 'wave' | 'arc' | 'loiter';

/**
 * 一条鱼的全部参数。**没有速度以外的运行时状态** ——
 * 位置由 fishPos(spawn, t) 求值,两端各算各的,永远一致。
 */
export type FishSpawn = {
  id: number;
  kind: FishKindId;
  path: PathId;
  /** 路径相位。同一批鱼靠它错开,不然一群鱼会严丝合缝叠在一起 */
  seed: number;
  /** 进场时刻(服务端时钟) */
  t0: number;
  /** 在场时长。到点两端各自移除,不需要 despawn 消息 */
  life: number;
  speed: number;
  /** 从右往左游 */
  flip: boolean;
  /** 基准高度 */
  y0: number;
};

export type SeatView = {
  seat: number;
  name: string;
  level: number;
};

export type ServerMsg =
  /** 进房快照 */
  | { t: 'hello'; seat: number; seats: SeatView[]; balance: number; now: number }
  | { t: 'spawn'; fish: FishSpawn[] }
  /** 提前离场(被全屏技清场之类)。正常游出界靠 life 自然消失,不发消息 */
  | { t: 'despawn'; ids: number[] }
  /** 别人开炮了。自己那发不回传 —— bulletId 由客户端生成(见下) */
  | { t: 'fired'; seat: number; id: number; x: number; y: number; angle: number; level: number }
  /** 网炸开。捕没捕到都会有这一条,客户端据此播爆炸 */
  | { t: 'pop'; id: number; x: number; y: number; seat: number; level: number }
  /** 捕获。全房广播,谁抓的写在飘字上 */
  | { t: 'caught'; fish: number; seat: number; gold: number; x: number; y: number }
  /** 余额。**只发给本人,且客户端只认这条**,本地不自增 */
  | { t: 'wallet'; balance: number; grant?: boolean }
  | { t: 'seat'; seat: number; view: SeatView | null }
  /** 开炮被拒 */
  | { t: 'deny'; reason: 'broke' | 'fast' | 'bad' };

export type ClientMsg =
  /**
   * 开炮。
   *
   * `id` 由客户端生成(`seat * 1e6 + 自增`),不是服务端分配的 ——
   * 这样客户端可以**立刻**画出炮弹并在收到 pop/caught 时对上号,
   * 不用等一次往返。id 只是个标签,不承载任何权威:
   * 打没打中、捕没捕到全由服务端复算(DESIGN §3.3)。
   */
  | { t: 'fire'; id: number; angle: number }
  /** 换炮。delta 为 ±1 */
  | { t: 'level'; delta: number }
  /** 炮口朝向。纯表现,丢了不影响任何判定 */
  | { t: 'aim'; angle: number };

/** 瞄准同步频率(毫秒)。8Hz 就够,它只是让别人看到你在往哪儿转炮 */
export const AIM_INTERVAL_MS = 125;
