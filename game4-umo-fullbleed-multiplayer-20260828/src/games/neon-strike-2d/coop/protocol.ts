/**
 * 局内同步的消息定义。**两端共用同一份**,协议全文见 ../COOP.md §4。
 *
 * 一条设计原则贯穿全表:**能推算的就不同步。**
 * 子弹是匀速直线,收到 `fire` 事件本地生成即可;敌机走脚本路径,
 * 收到 `spawn`(带齐全部随机参数)本地模拟即可。
 * 逐帧广播这些东西是这类游戏最典型的带宽错误 —— 射速 7/s、每颗子弹活一秒,
 * 逐帧同步就是每秒几百条消息,而它们本来就是可推算的。
 */

/** 谁说了算。邀请方是 host,负责波次、敌机生成、击杀裁决、道具掉落 */
export type Role = 'host' | 'guest';

export type NetMessage =
  /** 握手后的时钟对齐,来回 5 次取最短往返(COOP.md §4.4) */
  /**
   * 场景已就绪。**开局必须等这条**:两边各自加载各自的,
   * 先加载完的那个如果直接开打,早期的 wave / spawn 事件对面根本收不到 ——
   * 那时它还在 Boot 场景里,CoopSession 都还没挂上。
   */
  | { t: 'ready' }
  /** 加载进度 0~1。开局前互相报,让等待的一方看得见对方到哪了 */
  | { t: 'load'; p: number }
  | { t: 'ping'; id: number }
  | { t: 'pong'; id: number; now: number }

  /** 对方飞机的位置。20Hz,是判断「对方还活着没」的心跳来源 */
  | { t: 'pos'; x: number; y: number }
  /** 开火事件。子弹本地生成,不逐帧同步 */
  | { t: 'fire'; x: number; y: number; weapon: number }

  /** 以下 host→guest:波次与敌机 */
  | { t: 'wave'; index: number }
  /**
   * 敌机生成。**随机参数必须全带上** —— Phaser.Math 用的是 Math.random(),
   * 两端各自摇必然对不上(COOP.md §2)。
   *
   * 注意 diveIn / fireIn 是**相对延迟**而不是绝对时刻。
   * 用绝对时刻就必须先对齐两端的时钟,而相对延迟天然免疫时钟差异 ——
   * 代价只是 guest 那边晚 RTT/2 触发(几十毫秒,看不出来)。
   */
  | {
      t: 'spawn'; id: number; kind: string; x: number; hp: number;
      phase: number; diveIn: number; vx: number; vy: number; fireIn: number | null; gunner: boolean;
    }
  | { t: 'efire'; id: number; x: number; y: number; angle: number; speed: number }
  /**
   * Boss 生成。和普通敌机同一套思路:host 摇好参数,两端用同一段代码造。
   * 单独一条消息是因为 Boss 有血条、有阶段、入场动画也不一样。
   */
  | { t: 'bspawn'; id: number; spec: number; hp: number }
  /** 低频位置校正,4Hz。guest 收到后插值靠拢,不硬设(硬设会每 250ms 抖一下) */
  | { t: 'sync'; e: Array<[number, number, number]> }
  /** 敌机死亡的最终裁决。by 决定这一杀记给谁 */
  | { t: 'dead'; id: number; by: Role }
  | { t: 'power'; id: number; kind: string; x: number; y: number }
  | { t: 'taken'; id: number; by: Role }
  /** Boss 血量。guest 只用它更新血条,不参与判定 */
  | { t: 'boss'; hp: number; maxHp: number }

  /** guest→host:我打中了谁。最终生死由 host 裁决 */
  | { t: 'hit'; id: number; damage: number }

  /** 双向:各自的状态,给对方 HUD 用 */
  | { t: 'state'; score: number; lives: number; weapon: number; dead: boolean }
  /** 局末或主动退出 */
  | { t: 'bye'; reason: 'finished' | 'quit' };

/** 位置同步频率(毫秒)。20Hz —— 再低会让对方飞机看着一顿一顿 */
export const POS_INTERVAL_MS = 50;
/** 敌机位置校正频率(毫秒)。4Hz 就够,它只用来纠正缓慢漂移 */
export const SYNC_INTERVAL_MS = 250;
/** 状态广播频率(毫秒) */
export const STATE_INTERVAL_MS = 1000;
/**
 * 多久收不到对方任何消息就判定断线。
 * pos 是 20Hz 的,3 秒空窗一定是断了 —— 不可能是网络抖动。
 */
export const PEER_TIMEOUT_MS = 3000;
/** 敌机位置偏差超过这个值就硬设,说明已经不是漂移而是丢了事件 */
export const SYNC_SNAP_DISTANCE = 60;
