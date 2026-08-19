/**
 * 局内同步。**GameScene 只跟这个类打交道**,不直接碰 net / protocol。
 *
 * `GameScene.ts` 已经 899 行,承担了波次、Boss、道具、粒子、HUD。
 * 再把同步和权威判定铺进去就没法维护了 —— 所以联机状态全部收在这里,
 * GameScene 那边只多一处「我是不是 host」的分支(COOP.md §6)。
 *
 * 权威划分(COOP.md §4.1):
 * - **host** 说了算:波次推进、敌机生成、敌机死亡的最终裁决。
 * - **guest** 只管自己的飞机和开火,打中了上报给 host,由 host 宣布死亡。
 *
 * 这样划分是因为两端各自判定击杀必然出现「我打爆的敌机在你屏幕上还活着」。
 */

import type { CoopBridge } from './bridge';
import {
  POS_INTERVAL_MS, type NetMessage, type Role,
} from './protocol';

/** 敌机生成的全部参数。host 摇好之后原样发给 guest */
export type SpawnPayload = {
  id: number;
  kind: string;
  x: number;
  hp: number;
  phase: number;
  /** 相对延迟,不是绝对时刻 —— 免疫两端时钟差异 */
  diveIn: number;
  vx: number;
  vy: number;
  fireIn: number | null;
  gunner: boolean;
};

export type CoopHooks = {
  /** 对方飞机位置。收到就更新那个精灵 */
  onPeerPos(x: number, y: number): void;
  /** 对方开火。本地生成一发**纯表现**的子弹 —— 伤害由对方自己那端判 */
  onPeerFire(x: number, y: number, weapon: number): void;
  /** guest 专用:host 宣布进入下一波 */
  onWave(index: number): void;
  /** guest 专用:host 生成了一架敌机 */
  onSpawn(payload: SpawnPayload): void;
  /** guest 专用:host 裁定某架敌机死了 */
  onEnemyDead(id: number): void;
  /** host 专用:guest 报告打中了谁 */
  onHitReport(id: number, damage: number): void;
  /** guest 专用:host 生成了 Boss */
  onBossSpawn(id: number, spec: number, hp: number): void;
  /** guest 专用:Boss 血量变了,只更新血条 */
  onBossHp(hp: number, maxHp: number): void;
  /** guest 专用:敌机位置校正 */
  onSync(entries: Array<[number, number, number]>): void;
  /** guest 专用:道具掉落 */
  onPower(id: number, kind: string, x: number, y: number): void;
  /** 道具被对方捡走了 */
  onTaken(id: number): void;
  /** 对方的状态,给 HUD */
  onPeerState(score: number, lives: number, dead: boolean): void;
  /** 对方还在加载,p 是 0~1 */
  onPeerLoad(p: number): void;
  /** 对方的场景也就绪了 */
  onPeerReady(): void;
  /** 对方掉线了 */
  onPeerLeft(): void;
};

export class CoopSession {
  readonly role: Role;
  readonly peerName: string;
  private lastPosAt = 0;
  private nextEnemyId = 1;
  private disposed = false;

  constructor(
    private readonly bridge: CoopBridge,
    private readonly hooks: CoopHooks,
  ) {
    this.role = bridge.role;
    this.peerName = bridge.peer;
    bridge.listen((data: unknown) => this.receive(data as NetMessage));
    bridge.onClose(() => this.hooks.onPeerLeft());
  }

  get isHost() {
    return this.role === 'host';
  }

  /** 每帧调用。位置按 20Hz 节流 —— 每帧都发既没必要也塞不下 */
  tick(now: number, x: number, y: number) {
    if (this.disposed) return;
    if (now - this.lastPosAt < POS_INTERVAL_MS) return;
    this.lastPosAt = now;
    // 位置取整:小数点后的精度在屏幕上一个像素都体现不出来,却让每条消息长一截
    this.bridge.send({ t: 'pos', x: Math.round(x), y: Math.round(y) });
  }

  /** 我这边的场景准备好了。对方收到才知道可以开打 */
  sendReady() {
    this.bridge.send({ t: 'ready' });
  }

  sendFire(x: number, y: number, weapon: number) {
    this.bridge.send({ t: 'fire', x: Math.round(x), y: Math.round(y), weapon });
  }

  // ---------------------------------------------------------------- host 侧

  /** 分配一个全局唯一的敌机编号。只有 host 会调 —— 编号由它一家发放才不会撞 */
  allocEnemyId(): number {
    return this.nextEnemyId++;
  }

  broadcastWave(index: number) {
    if (this.isHost) this.bridge.send({ t: 'wave', index });
  }

  broadcastSpawn(p: SpawnPayload) {
    if (this.isHost) this.bridge.send({ t: 'spawn', ...p });
  }

  broadcastBossSpawn(id: number, spec: number, hp: number) {
    if (this.isHost) this.bridge.send({ t: 'bspawn', id, spec, hp });
  }

  broadcastBossHp(hp: number, maxHp: number) {
    if (this.isHost) this.bridge.send({ t: 'boss', hp, maxHp });
  }

  /**
   * 敌机位置校正。**只有 host 发**,4Hz。
   *
   * 两端各自按 spawn 参数本地模拟,但 Arcade 的积分依赖每帧 dt,帧率不同必然缓慢漂移。
   * 这条不是「同步位置」,是「纠正漂移」—— 所以频率可以很低,
   * guest 收到后插值靠拢而不是硬设(硬设会让敌机每 250ms 抖一下)。
   */
  broadcastSync(entries: Array<[number, number, number]>) {
    if (this.isHost && entries.length) this.bridge.send({ t: 'sync', e: entries });
  }

  broadcastPower(id: number, kind: string, x: number, y: number) {
    if (this.isHost) this.bridge.send({ t: 'power', id, kind, x, y });
  }

  /** 道具被谁捡了。两端都要发 —— 捡的人自己知道,得告诉对方把它移掉 */
  broadcastTaken(id: number) {
    this.bridge.send({ t: 'taken', id, by: this.role });
  }

  /** 自己的状态,给对方的 HUD 显示 */
  broadcastState(score: number, lives: number, weapon: number, dead: boolean) {
    this.bridge.send({ t: 'state', score, lives, weapon, dead });
  }

  /** host 宣布敌机死亡。by 决定这一杀记给谁 */
  broadcastDead(id: number, by: Role) {
    if (this.isHost) this.bridge.send({ t: 'dead', id, by });
  }

  // ---------------------------------------------------------------- guest 侧

  /** guest 打中了敌机:**只上报,不本地扣血**。生死由 host 说了算 */
  reportHit(id: number, damage = 1) {
    if (!this.isHost) this.bridge.send({ t: 'hit', id, damage });
  }

  // ---------------------------------------------------------------- 收

  private receive(msg: NetMessage) {
    if (this.disposed) return;
    switch (msg.t) {
      case 'ready':
        this.hooks.onPeerReady();
        break;
      case 'load':
        this.hooks.onPeerLoad(msg.p);
        break;
      case 'pos':
        this.hooks.onPeerPos(msg.x, msg.y);
        break;
      case 'fire':
        this.hooks.onPeerFire(msg.x, msg.y, msg.weapon);
        break;
      case 'wave':
        if (!this.isHost) this.hooks.onWave(msg.index);
        break;
      case 'spawn':
        if (!this.isHost) {
          const payload: SpawnPayload = {
            id: msg.id, kind: msg.kind, x: msg.x, hp: msg.hp, phase: msg.phase,
            diveIn: msg.diveIn, vx: msg.vx, vy: msg.vy, fireIn: msg.fireIn, gunner: msg.gunner,
          };
          this.hooks.onSpawn(payload);
        }
        break;
      case 'dead':
        if (!this.isHost) this.hooks.onEnemyDead(msg.id);
        break;
      case 'bspawn':
        if (!this.isHost) this.hooks.onBossSpawn(msg.id, msg.spec, msg.hp);
        break;
      case 'boss':
        if (!this.isHost) this.hooks.onBossHp(msg.hp, msg.maxHp);
        break;
      case 'sync':
        if (!this.isHost) this.hooks.onSync(msg.e);
        break;
      case 'power':
        if (!this.isHost) this.hooks.onPower(msg.id, msg.kind, msg.x, msg.y);
        break;
      case 'taken':
        this.hooks.onTaken(msg.id);
        break;
      case 'state':
        this.hooks.onPeerState(msg.score, msg.lives, msg.dead);
        break;
      case 'hit':
        if (this.isHost) this.hooks.onHitReport(msg.id, msg.damage);
        break;
      case 'bye':
        this.hooks.onPeerLeft();
        break;
      default:
        // 还没实现的消息类型(sync / power / state 等)先忽略,
        // 不要在这里抛错 —— 版本不一致时应当降级,不是崩掉
        break;
    }
  }

  dispose(reason: 'finished' | 'quit' = 'quit') {
    if (this.disposed) return;
    this.disposed = true;
    this.bridge.send({ t: 'bye', reason });
    this.bridge.listen(null);
  }
}
