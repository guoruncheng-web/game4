/**
 * 一个鱼池房间的权威模拟。DESIGN.md §3。
 *
 * **同一个类,联机时跑在 Node 里,单机时跑在浏览器同一个 tab 里**(§3.6)。
 * 所以这里不许出现任何环境相关的东西:
 * 不碰 window、不碰 setInterval(由外面驱动 tick)、不碰 Date.now
 * (时间一律由调用方传进来 —— 服务端传自己的时钟,单机传本地时钟)。
 *
 * 它负责的全部事情,就是 §3.1 那张权威划分表里属于服务端的那几行:
 * 投鱼、算炮弹、判捕获、动钱包。视觉和音效一概不在这里。
 */

import {
  BOSS_INTERVAL_MS, BOSS_LIFE_MS, BULLET_LIFE_MS, BULLET_SPEED, catchChance,
  FIRE_COOLDOWN_MS, FISH_KINDS, FISH_MAX, FISH_TARGET, GAME_HEIGHT, GAME_WIDTH,
  GRANT_AMOUNT, GRANT_COOLDOWN_MS, MAX_LEVEL, MAX_SEATS, MIN_LEVEL, netRadius,
  POOL_BOTTOM, POOL_TOP, SEATS, SPAWNABLE, START_BALANCE,
} from '../config';
import type { FishKindId } from '../config';
import { fishPos, isGone, makeFish } from './fish';
import type { ClientMsg, FishSpawn, SeatView, ServerMsg } from './protocol';
import { makeRng, weighted } from './rng';
import type { Rng } from './rng';

/** 发消息。seat 为 null 表示广播给房里所有人 */
export type Emit = (seat: number | null, msg: ServerMsg) => void;

type SeatState = {
  name: string;
  level: number;
  balance: number;
  lastFireAt: number;
  lastGrantAt: number;
  /** 客户端报上来的炮口朝向。纯表现,不参与任何判定 */
  aim: number;
};

type Bullet = {
  id: number;
  seat: number;
  x: number; y: number;
  vx: number; vy: number;
  level: number;
  born: number;
};

export type RoomOptions = {
  seed: number;
  emit: Emit;
  /** 余额变动。联机时批量落库,单机时写 localStorage(DESIGN §8 第 4 步) */
  onWallet?: (seat: number, balance: number) => void;
};

export class FishRoom {
  private readonly rng: Rng;
  private readonly emit: Emit;
  private readonly onWallet?: (seat: number, balance: number) => void;

  private readonly seats: Array<SeatState | null> = new Array(MAX_SEATS).fill(null);
  private fish: FishSpawn[] = [];
  private bullets: Bullet[] = [];

  private nextFishId = 1;
  private nextSpawnAt = 0;
  private nextBossAt = 0;
  private started = false;

  constructor(opts: RoomOptions) {
    this.rng = makeRng(opts.seed);
    this.emit = opts.emit;
    this.onWallet = opts.onWallet;
  }

  // -------------------------------------------------------------- 座位

  /** 占座。balance 传上一次存下来的余额,不传就用初始值 */
  join(seat: number, name: string, now: number, balance?: number, level?: number): void {
    if (seat < 0 || seat >= MAX_SEATS || this.seats[seat]) return;
    this.seats[seat] = {
      name,
      level: clampLevel(level ?? MIN_LEVEL),
      balance: Math.max(0, Math.floor(balance ?? START_BALANCE)),
      lastFireAt: 0,
      lastGrantAt: 0,
      aim: SEATS[seat].up ? -Math.PI / 2 : Math.PI / 2,
    };

    if (!this.started) {
      // 第一个人进来才开始投鱼。空房不投 —— 没人看的鱼白算
      this.started = true;
      this.nextSpawnAt = now;
      this.nextBossAt = now + BOSS_INTERVAL_MS;
    }

    const state = this.seats[seat]!;
    this.emit(seat, { t: 'hello', seat, seats: this.views(), balance: state.balance, now });
    // 进房时把在场的鱼一次性补给他 —— 鱼是纯函数,补一份参数他就能算出当前位置,
    // 这也正是断线重连不需要额外恢复逻辑的原因
    if (this.fish.length) this.emit(seat, { t: 'spawn', fish: this.fish });
    this.emit(null, { t: 'seat', seat, view: this.view(seat)! });
  }

  leave(seat: number): void {
    if (!this.seats[seat]) return;
    this.seats[seat] = null;
    // 走的人的炮弹一并清掉,否则会留下几发没有主人的网
    this.bullets = this.bullets.filter((b) => b.seat !== seat);
    this.emit(null, { t: 'seat', seat, view: null });
  }

  get occupied(): number {
    return this.seats.reduce((n, s) => n + (s ? 1 : 0), 0);
  }

  balanceOf(seat: number): number {
    return this.seats[seat]?.balance ?? 0;
  }

  levelOf(seat: number): number {
    return this.seats[seat]?.level ?? MIN_LEVEL;
  }

  private view(seat: number): SeatView | null {
    const s = this.seats[seat];
    return s ? { seat, name: s.name, level: s.level } : null;
  }

  private views(): SeatView[] {
    const out: SeatView[] = [];
    for (let i = 0; i < MAX_SEATS; i += 1) {
      const v = this.view(i);
      if (v) out.push(v);
    }
    return out;
  }

  // -------------------------------------------------------------- 输入

  input(seat: number, msg: ClientMsg, now: number): void {
    const state = this.seats[seat];
    if (!state) return;

    switch (msg.t) {
      case 'aim':
        if (Number.isFinite(msg.angle)) state.aim = msg.angle;
        break;

      case 'level': {
        const next = clampLevel(state.level + (msg.delta > 0 ? 1 : -1));
        if (next === state.level) return;
        state.level = next;
        this.emit(null, { t: 'seat', seat, view: this.view(seat)! });
        break;
      }

      case 'fire':
        this.fire(seat, state, msg, now);
        break;

      default:
        break;
    }
  }

  /**
   * 开炮。校验 → 扣钱 → 把炮弹放进模拟。
   * **客户端已经先把炮弹画出来了**,这里被拒的话它会收到 deny 再收回去 ——
   * 手感上宁可偶尔收回,也不要每一发都等一次往返(DESIGN §3.3)。
   */
  private fire(seat: number, state: SeatState, msg: { id: number; angle: number }, now: number): void {
    if (!Number.isFinite(msg.angle) || !Number.isInteger(msg.id)) {
      return this.emit(seat, { t: 'deny', reason: 'bad' });
    }
    // 冷却留 20ms 宽容:客户端的计时和服务端差几毫秒是常态,卡死会让高频点击莫名丢发
    if (now - state.lastFireAt < FIRE_COOLDOWN_MS - 20) {
      return this.emit(seat, { t: 'deny', reason: 'fast' });
    }
    if (state.balance < state.level) {
      return this.emit(seat, { t: 'deny', reason: 'broke' });
    }

    state.lastFireAt = now;
    this.credit(seat, state, -state.level);

    const origin = SEATS[seat];
    // 炮口朝向做半球约束:下方座位只能往上打,反之亦然。
    // 不做的话,客户端改个角度就能把网直接怼在对面炮台上刷同屏鱼
    const angle = clampAim(msg.angle, origin.up);
    this.bullets.push({
      id: msg.id,
      seat,
      x: origin.x + Math.cos(angle) * 44,
      y: origin.y + Math.sin(angle) * 44,
      vx: Math.cos(angle) * BULLET_SPEED,
      vy: Math.sin(angle) * BULLET_SPEED,
      level: state.level,
      born: now,
    });

    // 自己那发不回传(客户端已经画了),只广播给别人
    for (let i = 0; i < MAX_SEATS; i += 1) {
      if (i === seat || !this.seats[i]) continue;
      this.emit(i, { t: 'fired', seat, id: msg.id, x: origin.x, y: origin.y, angle, level: state.level });
    }
  }

  // -------------------------------------------------------------- 主循环

  tick(now: number, dtMs: number): void {
    if (!this.started) return;
    this.reap(now);
    this.spawnWave(now);
    this.stepBullets(now, dtMs / 1000);
    this.grants(now);
  }

  /** 游出界的鱼两端各自按 life 移除,不发消息 —— 这是纯函数路径白送的好处 */
  private reap(now: number): void {
    if (this.fish.some((f) => isGone(f, now))) {
      this.fish = this.fish.filter((f) => !isGone(f, now));
    }
  }

  private spawnWave(now: number): void {
    if (now >= this.nextBossAt) {
      this.nextBossAt = now + BOSS_INTERVAL_MS;
      this.push(now, [makeFish(this.rng, this.nextFishId++, 'boss', now, { life: BOSS_LIFE_MS })]);
    }

    if (now < this.nextSpawnAt || this.fish.length >= FISH_TARGET) return;

    const kind = weighted<FishKindId>(this.rng, SPAWNABLE, SPAWNABLE.map((k) => FISH_KINDS[k].weight));
    const spec = FISH_KINDS[kind];
    // 成群的鱼共用方向,不然「一群」看着像一堆各走各的
    const flip = this.rng() < 0.5;
    const count = Math.max(1, Math.round(this.rng() * spec.school));
    const batch: FishSpawn[] = [];
    for (let i = 0; i < count && this.fish.length + batch.length < FISH_MAX; i += 1) {
      const f = makeFish(this.rng, this.nextFishId++, kind, now + i * 260, { flip });
      batch.push(f);
    }
    this.push(now, batch);
    this.nextSpawnAt = now + 700 + this.rng() * 900;
  }

  private push(now: number, batch: FishSpawn[]): void {
    if (!batch.length) return;
    this.fish.push(...batch);
    this.emit(null, { t: 'spawn', fish: batch });
  }

  /**
   * 推进炮弹并判碰撞。
   *
   * 分 4 个子步:20Hz 下一帧走 44 像素,而最小的鱼判定圈才 22 —— 整帧推进会穿过去,
   * 表现是「明明打中了却没炸」,而且是随机发生的那种,极难查。
   */
  private stepBullets(now: number, dt: number): void {
    if (!this.bullets.length) return;
    const STEPS = 4;
    const sub = dt / STEPS;
    const alive: Bullet[] = [];

    for (const b of this.bullets) {
      let hit = false;
      for (let s = 0; s < STEPS && !hit; s += 1) {
        b.x += b.vx * sub;
        b.y += b.vy * sub;
        // 侧壁反弹。上下边界不反弹 —— 打到头就是这一发没了
        if (b.x < 0) { b.x = -b.x; b.vx = -b.vx; }
        else if (b.x > GAME_WIDTH) { b.x = GAME_WIDTH * 2 - b.x; b.vx = -b.vx; }

        if (this.hitTest(b, now)) { this.explode(b, now); hit = true; }
      }
      if (hit) continue;
      if (now - b.born > BULLET_LIFE_MS || b.y < -40 || b.y > GAME_HEIGHT + 40) {
        // 自然消失的网也要炸开:玩家看到的是"网撒到头了",不是凭空不见
        this.explode(b, now);
        continue;
      }
      alive.push(b);
    }
    this.bullets = alive;
  }

  /**
   * 网碰到鱼没有。**判定圈是网的半径 + 鱼的半径**,不是炮弹那个点 ——
   * 网就是命中判定本身,这也是高等级炮唯一的真实优势(config.netRadius)。
   */
  private hitTest(b: Bullet, now: number): boolean {
    const r = netRadius(b.level);
    for (const f of this.fish) {
      if (now < f.t0) continue; // 成群投放时后几条还没进场
      const p = fishPos(f, now);
      const reach = r + FISH_KINDS[f.kind].radius;
      const dx = p.x - b.x;
      const dy = p.y - b.y;
      if (dx * dx + dy * dy <= reach * reach) return true;
    }
    return false;
  }

  /**
   * 网炸开。**这是唯一产钱的地方。**
   *
   * 判定的是整个网覆盖范围内的所有鱼,而不只是撞上的那条 ——
   * 这样高等级炮的大网才有"糊一片"的价值(config.netRadius)。
   */
  private explode(b: Bullet, now: number): void {
    const state = this.seats[b.seat];
    this.emit(null, { t: 'pop', id: b.id, x: b.x, y: b.y, seat: b.seat, level: b.level });
    if (!state) return;

    const r = netRadius(b.level);

    // 先圈出网覆盖到的鱼,再统一判定 —— 概率要按覆盖数分摊(config.catchChance),
    // 所以必须先知道总共罩住了几条,不能边扫边摇
    const covered: Array<{ f: FishSpawn; x: number; y: number }> = [];
    for (const f of this.fish) {
      if (now < f.t0) continue;
      const p = fishPos(f, now);
      const reach = r + FISH_KINDS[f.kind].radius;
      const dx = p.x - b.x;
      const dy = p.y - b.y;
      if (dx * dx + dy * dy <= reach * reach) covered.push({ f, x: p.x, y: p.y });
    }

    const caught: number[] = [];
    for (const c of covered) {
      const spec = FISH_KINDS[c.f.kind];
      if (this.rng() >= catchChance(spec.value, covered.length)) continue;

      const gold = spec.value * b.level;
      caught.push(c.f.id);
      this.credit(b.seat, state, gold);
      this.emit(null, { t: 'caught', fish: c.f.id, seat: b.seat, gold, x: c.x, y: c.y });
    }
    if (caught.length) this.fish = this.fish.filter((f) => !caught.includes(f.id));
  }

  /** 破产补助。理由见 DESIGN §6.4:不做充值,卡住玩家是纯粹的流失 */
  private grants(now: number): void {
    for (let seat = 0; seat < MAX_SEATS; seat += 1) {
      const s = this.seats[seat];
      if (!s || s.balance >= MIN_LEVEL) continue;
      if (now - s.lastGrantAt < GRANT_COOLDOWN_MS) continue;
      s.lastGrantAt = now;
      s.balance = GRANT_AMOUNT;
      this.onWallet?.(seat, s.balance);
      this.emit(seat, { t: 'wallet', balance: s.balance, grant: true });
    }
  }

  private credit(seat: number, state: SeatState, delta: number): void {
    state.balance = Math.max(0, state.balance + delta);
    this.onWallet?.(seat, state.balance);
    this.emit(seat, { t: 'wallet', balance: state.balance });
  }
}

function clampLevel(level: number): number {
  return Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, Math.round(level)));
}

/** 把瞄准角压进正确的半球,并留出 8° 不让它贴着水平线打(那样网只会沿边跑) */
function clampAim(angle: number, up: boolean): number {
  const EDGE = 0.14;
  // 先归一到 (-PI, PI]
  let a = Math.atan2(Math.sin(angle), Math.cos(angle));
  // 越界的先镜像回本半球再夹。直接夹的话,"朝正下方"会被夹成"朝正右方",
  // 玩家会看到炮口突然横过去 —— 镜像至少保住了左右意图
  if (up) {
    if (a > 0) a = -a;
    a = Math.min(-EDGE, Math.max(-Math.PI + EDGE, a));
  } else {
    if (a < 0) a = -a;
    a = Math.max(EDGE, Math.min(Math.PI - EDGE, a));
  }
  return a;
}

/** 池子上下界,给渲染层复用,免得两边各写一份 */
export const POOL = { top: POOL_TOP, bottom: POOL_BOTTOM };
