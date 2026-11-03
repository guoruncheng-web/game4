/**
 * 尺寸、手感、配色常量。
 * 逻辑画布固定 540×960(竖屏),所有坐标都在这套逻辑像素里,渲染层交给 Scale.FIT 去铺满屏幕。
 */
export const GAME_WIDTH = 540;
export const GAME_HEIGHT = 960;

/**
 * 台面(有效击球区)的矩形。宽高严格 1:2 —— 真实九尺台是 127×254cm,
 * 比例不对的话所有走位角度都会跟真台不一样,老玩家一杆就能感觉出来。
 */
export const PLAY = {
  left: 96,
  right: 444,
  top: 148,
  bottom: 844,
} as const;

export const PLAY_WIDTH = PLAY.right - PLAY.left;
export const PLAY_HEIGHT = PLAY.bottom - PLAY.top;

/** 木质库边的厚度,只影响画面,不参与判定 */
export const RAIL = 26;

/**
 * 球半径。真实比例是 球径/台宽 = 5.7/127 ≈ 0.045,
 * 换算到 348px 的台宽就是直径 15.6px。手机上略微放大一点点更好瞄。
 */
export const BALL_R = 8.6;

/** 袋口捕获半径。真实袋口约两个球宽,这里取略大一点,免得贴库球擦着袋口不进显得别扭 */
export const POCKET_R = 15.5;

const midY = (PLAY.top + PLAY.bottom) / 2;
/** 六个袋:四角 + 两个中袋 */
export const POCKETS = [
  { x: PLAY.left, y: PLAY.top },
  { x: PLAY.right, y: PLAY.top },
  { x: PLAY.left, y: midY },
  { x: PLAY.right, y: midY },
  { x: PLAY.left, y: PLAY.bottom },
  { x: PLAY.right, y: PLAY.bottom },
] as const;

export const PHYSICS = {
  /** 滚动摩擦减速度(px/s²)。调大 = 台面"涩",球跑不远 */
  friction: 205,
  /** 低于这个速度直接判定停下,否则球会以肉眼看不见的速度蠕动半天,回合迟迟不结束 */
  stopSpeed: 7,
  /** 撞库的能量保留系数 */
  cushionRestitution: 0.72,
  /** 撞库时切向速度的保留系数(库皮的摩擦) */
  cushionFriction: 0.96,
  /** 球与球对撞的能量保留系数,真球接近完全弹性 */
  ballRestitution: 0.95,
  /** 满力出杆的初速度(px/s) */
  maxShotSpeed: 1460,
  /** 最小出杆速度,免得推杆推了个寂寞 */
  minShotSpeed: 210,
  /** 物理定步长。固定步长才能让 AI 的无头试算和玩家看到的结果完全一致 */
  stepSeconds: 1 / 300,
  /** 一杆最长模拟时长,兜底防止极端情况下无限滚 */
  maxShotSeconds: 18,
} as const;

/** 开球点与置球点(竖屏:玩家在下方开球,球堆在上半区) */
export const BREAK_SPOT = { x: (PLAY.left + PLAY.right) / 2, y: PLAY.bottom - PLAY_HEIGHT * 0.25 };
export const RACK_APEX = { x: (PLAY.left + PLAY.right) / 2, y: PLAY.top + PLAY_HEIGHT * 0.26 };

/** 1~7 全色,9~15 花色,8 号黑球,0 是母球 */
export const BALL_COLORS: Record<number, number> = {
  1: 0xf2c11a,
  2: 0x1f5fd0,
  3: 0xd83a2a,
  4: 0x6b3fa0,
  5: 0xef7622,
  6: 0x1e8f52,
  7: 0x8f2f2a,
  8: 0x14161c,
};

export const PALETTE = {
  cloth: 0x1f7a52,
  clothDark: 0x14563a,
  rail: 0x5a3320,
  railLit: 0x8a5233,
  pocket: 0x0a0d10,
  chalk: '#eef7f2',
  gold: '#f4c95d',
  danger: '#ff6a4a',
  dim: '#8fb3a4',
} as const;

export type Difficulty = 'rookie' | 'pro' | 'shark';

export type DifficultySpec = {
  id: Difficulty;
  /** 菜单上的英文名 */
  label: string;
  hint: string;
  /** 瞄准误差(弧度),越大越菜 */
  aimError: number;
  /** 力度误差比例 */
  powerError: number;
  /** 试算的候选杆数量,越多越会挑 */
  candidates: number;
};

export const DIFFICULTIES: Record<Difficulty, DifficultySpec> = {
  rookie: {
    id: 'rookie', label: 'ROOKIE', hint: 'Misses often, plays no position',
    aimError: 0.045, powerError: 0.22, candidates: 4,
  },
  pro: {
    id: 'pro', label: 'PRO', hint: 'Solid potter, punishes your fouls',
    aimError: 0.018, powerError: 0.12, candidates: 8,
  },
  shark: {
    id: 'shark', label: 'SHARK', hint: 'Runs the table if you let it',
    aimError: 0.006, powerError: 0.05, candidates: 14,
  },
};

export const DIFFICULTY_ORDER: Difficulty[] = ['rookie', 'pro', 'shark'];

export const STORAGE_PREFIX = 'eight-ball';
