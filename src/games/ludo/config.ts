/**
 * Ludo 的全部规则参数。DESIGN.md §5 的落地。
 *
 * **这个文件会被服务端(Node)直接 import**(照捕鱼那套,见 fish-hunter/DESIGN.md §3.5),所以:
 * 不许 import 任何渲染库、不许碰 window、不许用 enum / namespace 这类
 * "擦掉类型就不是合法 JS" 的写法。
 */

export const SEATS = 4;
/**
 * 每人 4 颗 —— 标准配置,和参考图一致。
 *
 * 曾经砍到 3 颗来压时长,后来发现没必要:局时长(房主设 5/10/15 分钟)和
 * 回合上限(50 回合)这两道硬保险已经把时长焊死了,再动棋子数只是在破坏玩家的肌肉记忆。
 * **能用外部约束解决的,不要去改玩家熟悉的核心构件。**
 */
export const PIECES_PER_SEAT = 4;

/**
 * 外圈格数 = **56**(四臂各 14)。
 *
 * 这个数是**从棋盘几何反推出来的,不是拍脑袋定的**:标准 Ludo 盘是 15×15 的十字,
 * 竖条占第 6/7/8 列、横条占第 6/7/8 行、中心 3×3 是终点区、四条终点道各 6 格。
 * 在这个布局下,外圈环恰好 56 格,而且每格正好两个邻居 —— 是一个完美的简单环。
 *
 * 常听说的「Ludo 是 52 格」在这张 15×15 的盘上凑不出来:要凑 52 只能去掉中心块的
 * 四个内角格,那样环会断开(那 8 个格子会变成死胡同)。见 `sim/layout.ts` 的自检。
 *
 * 这个数**不影响任何规则**,只决定跑一圈多远。取 56 是为了让渲染和规则用同一套数 ——
 * 对不上的话棋子会走到格子外面去,而这种错在画面上极难查。
 */
export const TRACK = 56;
/** 臂长。四个起点均匀分布在外圈上 */
export const ARM = TRACK / SEATS;
/** 终点道格数。标准盘是 6 */
export const HOME_LEN = 6;
/** 一颗棋子从入场到到家要走的总步数。走到 >= 这个数就是到家 */
export const GOAL = TRACK + HOME_LEN;

/**
 * 一局最多多少回合。**兜底用的,正常不该由它结束一局。**
 *
 * 局时长是主控(5/10/15 分钟)，回合上限只负责极端情况下收束。
 * 50 回合无法保证四颗棋子跑完，因此规则层保留 150；UI 的设计稿进度单独显示 50。
 */
export const MAX_ROUNDS = 150;

/** 局时长档位(秒)。房主可调,默认 5 分钟 */
export const DURATIONS = [300, 600, 900];
export const DEFAULT_DURATION = 300;

/** 座位 s 的起点格在外圈上的编号 */
export function entryCell(seat: number): number {
  return seat * ARM;
}

/** 已走 step 步时所在的外圈格编号。step 必须 < TRACK */
export function trackCell(seat: number, step: number): number {
  return (entryCell(seat) + step) % TRACK;
}

/**
 * 格子颜色、同色格、飞行道、安全格**全部搬到了 `sim/board.ts`** ——
 * 它们是"这张盘长什么样",属于数据不属于参数。这里只留下和盘面无关的规则数字。
 */

// ---------------------------------------------------------------- 骰子

/** 每回合掷几个骰子。**用其中一个**,另一个作废(DESIGN §3.2 —— 全篇最重要的一条) */
export const DICE_PER_TURN = 2;
/** 刚被撞的一方,下回合掷几个。挨打之后立刻拿到更强的选择权 */
export const DICE_AFTER_HIT = 3;
/** 掷出这些点数可以出子。标准规则只有 6,开局最多有 48% 的人连续四轮无事可做 */
export const LAUNCH_FACES = [5, 6];

// ---------------------------------------------------------------- 节奏

/** 联机时的回合限时(毫秒)。超时自动走最保守的合法走法 */
export const TURN_TIMEOUT_MS = 30_000;
/** 第一名产生之后的倒计时,到点按进度排名 */
export const ENDGAME_MS = 90_000;

export const STORAGE_RECORD = 'ludo-record';
