/**
 * 深海捕鱼的全部数值。DESIGN.md §6 的落地。
 *
 * **这个文件会被服务端(Node)直接 import**(见 DESIGN.md §3.5),所以:
 * 不许 import Phaser、不许碰 window、不许用 enum / namespace 这类
 * "擦掉类型就不是合法 JS" 的写法。
 */

/** 画布。16:10 —— PhaserCanvas 的横屏分支就是 aspect-[8/5],直接对上 */
export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 800;

/** 鱼池的上下边界。上下各留出一条炮台带 */
export const POOL_TOP = 120;
export const POOL_BOTTOM = GAME_HEIGHT - 120;

/** 模拟频率。20Hz —— 捕鱼的判定不需要更细,鱼和网都慢 */
export const TICK_MS = 50;

// ---------------------------------------------------------------- 鱼

export type FishKindId =
  | 'clown' | 'blue' | 'puffer' | 'turtle' | 'ray' | 'shark' | 'dragon' | 'boss';

export type FishKind = {
  id: FishKindId;
  label: string;
  /** 面值。捕获收益 = value × 炮等级 */
  value: number;
  /** 判定圈半径(像素) */
  radius: number;
  /**
   * 画面高度(像素)。**和 radius 解耦** —— 大鱼的轮廓可以明显超出判定圈,
   * 不然金龙那条长身子要么判定圈大得离谱、要么画得比章鱼还小。
   * 值来自 ART.md §2 那张表。
   */
  height: number;
  /** 游速(像素/秒) */
  speed: number;
  /** 随机出现权重。boss 不参与随机,由定时器投放 */
  weight: number;
  /** 一次最多成群出现几条 */
  school: number;
  /** 卡片色。占位贴图直接用它,出图之后仍用于飘字和描边 */
  color: number;
};

export const FISH_KINDS: Record<FishKindId, FishKind> = {
  clown:  { id: 'clown',  label: '小丑鱼', value: 2,   radius: 22, height: 44, speed: 105, weight: 40,  school: 6, color: 0xff9f43 },
  blue:   { id: 'blue',   label: '蓝鳍鱼', value: 5,   radius: 26, height: 52, speed: 120, weight: 25,  school: 4, color: 0x54a0ff },
  puffer: { id: 'puffer', label: '河豚',   value: 10,  radius: 30, height: 60, speed: 78,  weight: 15,  school: 2, color: 0xfeca57 },
  turtle: { id: 'turtle', label: '海龟',   value: 20,  radius: 38, height: 76, speed: 62,  weight: 10,  school: 1, color: 0x5cb04a },
  ray:    { id: 'ray',    label: '魔鬼鱼', value: 40,  radius: 44, height: 88, speed: 108, weight: 6,   school: 1, color: 0x8fc4e2 },
  shark:  { id: 'shark',  label: '鲨鱼',   value: 80,  radius: 52, height: 104, speed: 160, weight: 3,   school: 1, color: 0x8395a7 },
  dragon: { id: 'dragon', label: '金龙',   value: 200, radius: 62, height: 200, speed: 132, weight: 0.8, school: 1, color: 0xf9ca24 },
  boss:   { id: 'boss',   label: '章鱼王', value: 500, radius: 96, height: 260, speed: 46,  weight: 0,   school: 1, color: 0xee5253 },
};

/**
 * 注意 turtle 和 ray 的 color 是**按实际素材校正过的**,不等于 ART.md §2 表里最初声明的值:
 * 出图出来海龟是叶绿(不是翡翠绿)、魔鬼鱼是灰蓝(不是紫)。
 * 这个色只驱动飘字和描边,让它跟着画面走比让画面迁就它便宜得多。
 */

/** 随机投放的鱼种(不含 boss),顺序固定 —— 权重抽样依赖它稳定 */
export const SPAWNABLE: FishKindId[] = ['clown', 'blue', 'puffer', 'turtle', 'ray', 'shark', 'dragon'];

/** 池子里同时存在的鱼的目标条数 */
export const FISH_TARGET = 28;
/** 硬上限。服务端负担的估算(DESIGN §3.4)按 40 条算的,别让它超 */
export const FISH_MAX = 40;

/** boss 投放间隔 */
export const BOSS_INTERVAL_MS = 180_000;
/** boss 在场时间 */
export const BOSS_LIFE_MS = 25_000;

// ---------------------------------------------------------------- 炮

export const MIN_LEVEL = 1;
export const MAX_LEVEL = 7;
/** 开炮冷却。约 4.5 发/秒 */
export const FIRE_COOLDOWN_MS = 220;
export const BULLET_SPEED = 880;
export const BULLET_LIFE_MS = 2200;
/**
 * 网的半径。**这是炮等级唯一的真实优势**:
 * 网同时也是命中判定圈(见 room.stepBullets),网越大越不容易空放。
 * 概率不随等级变(见 catchChance),所以高等级炮的实际 RTP 更接近 K,
 * 差的那部分正是空放掉的子弹。
 */
export function netRadius(level: number): number {
  return 46 + level * 5;
}

/**
 * 捕获概率。**这是唯一的经济总旋钮**,改它之前先读 DESIGN.md §6.3。
 *
 * 公式推导(第一版写错过,无头模拟里跑出 229% 的 RTP,记在这里免得再犯):
 *
 *   成本 = level,收益 = value × level,所以要让期望回本必须有
 *     p × (value × level) = level  →  p = 1/value
 *   **level 不出现在概率里**。它一旦出现,RTP 就会随炮等级线性膨胀 ——
 *   开 7 级炮等于开印钞机。
 *
 *   再乘一个网内鱼数 covered:一网糊住 n 条鱼时,每条的概率各除以 n。
 *   不除的话,期望就是 n 倍 —— 密集鱼群会变成第二台印钞机。
 *   代价是「网住一群反而每条更难捞」有点反直觉,但总期望恒定才是 RTP 的定义,
 *   而且多捞的爽感靠的是**偶尔一网三条**,不是每网都三条。
 */
export const RTP_K = 0.92;
/** 概率上限。给便宜鱼封顶,免得 2 块钱的小丑鱼变成必中 */
export const CATCH_P_MAX = 0.9;

export function catchChance(value: number, covered: number): number {
  return Math.min(CATCH_P_MAX, RTP_K / (value * Math.max(1, covered)));
}

// ---------------------------------------------------------------- 钱包

export const START_BALANCE = 500;
/** 破产补助:补到多少 */
export const GRANT_AMOUNT = 200;
/** 补助冷却。存在的唯一目的是防「打空→立刻补→再打空」刷币,不是为了制造焦虑 */
export const GRANT_COOLDOWN_MS = 600_000;

// ---------------------------------------------------------------- 座位

export const MAX_SEATS = 4;

/** 炮台位置与朝向。座 0/1 在下(炮口朝上),座 2/3 在上(炮口朝下) */
export const SEATS: Array<{ x: number; y: number; up: boolean }> = [
  { x: 250,             y: GAME_HEIGHT - 58, up: true },
  { x: GAME_WIDTH - 250, y: GAME_HEIGHT - 58, up: true },
  { x: 250,             y: 58,                up: false },
  { x: GAME_WIDTH - 250, y: 58,               up: false },
];

/** 每个座位的固定色。网、炮台、飘字全部用它区分(DESIGN §7 可读性红线) */
export const SEAT_COLORS = [0x2ee6c8, 0xff9f43, 0xa55eea, 0x7bed9f];

export const STORAGE_WALLET = 'fish-hunter-wallet';
export const STORAGE_LEVEL = 'fish-hunter-level';
