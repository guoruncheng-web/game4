/**
 * 棋盘几何:把「第几步」翻译成 15×15 网格上的 (行, 列)。
 *
 * 渲染、开局动画、棋子移动路径全都读这里,**它是画面和规则之间唯一的桥**。
 * 规则那边只认「走了几步」(`sim/rules.ts` 的 Piece),完全不知道棋盘长什么样;
 * 这一层负责把步数摆到格子上。两者分开的好处是换一张盘不用碰规则。
 *
 * ## 为什么外圈是 56 格而不是常说的 52
 *
 * 标准 Ludo 盘就是 15×15 的十字:竖条占第 6/7/8 列,横条占第 6/7/8 行,
 * 中心 3×3 是终点区,四条终点道各 6 格。**在这个几何下,外圈环恰好是 56 格**
 * (每臂 14),而且每一格正好两个邻居 —— 是一个完美的简单环。
 *
 * 想凑成 52 只能去掉中心块的四个内角格,但那样环会断:验证脚本里那 8 个格子
 * 的邻居数会掉到 1,也就是死胡同。四臂 14 格是这张盘唯一自洽的走法。
 *
 * 这个数不影响任何规则 —— 「跳」和「飞」删掉之后,外圈长度只决定跑一圈多远。
 * 选 56 是为了**让渲染和规则用同一套数**:错开的话,棋子会走到格子外面去。
 */

import { HOME_LEN, PIECES_PER_SEAT, SEATS, TRACK } from '../config';

export const GRID = 15;
/** 中心终点格 */
export const CENTER: Cell = [7, 7];

export type Cell = [row: number, col: number];

const key = (c: Cell) => `${c[0]},${c[1]}`;

/** 十字:竖条 + 横条 */
function crossCells(): Cell[] {
  const out = new Map<string, Cell>();
  for (let r = 0; r < GRID; r += 1) for (const c of [6, 7, 8]) out.set(`${r},${c}`, [r, c]);
  for (let c = 0; c < GRID; c += 1) for (const r of [6, 7, 8]) out.set(`${r},${c}`, [r, c]);
  // Cocos Creator 3.8 的 loose Babel 会把 `[...map.values()]` 错译成
  // `[].concat(map.values())`，得到的是迭代器对象而不是格子数组，发布包会在 key() 崩溃。
  return Array.from(out.values());
}

/**
 * 四条终点道,各 6 格,**从外往里**排(第 0 格最靠外,第 5 格贴着中心)。
 *
 * **座位顺序 = 环上顺序**,不是随手排的:座位 0→1→2→3 必须沿着棋盘转一圈。
 * 一开始按「红黄蓝绿」排,结果回合会在棋盘上**跳着走**(红在下、黄在上,轮次直接跨过对角),
 * 四个人都搞不清下一个该谁。改成沿环的 下→左→上→右 之后,轮次就是绕着桌子转。
 */
export const HOME_PATH: Cell[][] = [
  Array.from({ length: HOME_LEN }, (_, i) => [13 - i, 7] as Cell), // 座位 0 红:下,自下而上
  Array.from({ length: HOME_LEN }, (_, i) => [7, 1 + i] as Cell),  // 座位 1 绿:左,自左向右
  Array.from({ length: HOME_LEN }, (_, i) => [1 + i, 7] as Cell),  // 座位 2 黄:上,自上而下
  Array.from({ length: HOME_LEN }, (_, i) => [7, 13 - i] as Cell), // 座位 3 蓝:右,自右向左
];

/** 四个基地里棋子的停放位(6×6 角块中间的 2×2)。和上面的座位序一致 */
export const BASE_SLOTS: Cell[][] = [
  [[11, 2], [11, 4], [13, 2], [13, 4]], // 红:左下
  [[1, 2], [1, 4], [3, 2], [3, 4]], // 绿:左上
  [[1, 10], [1, 12], [3, 10], [3, 12]], // 黄:右上
  [[11, 10], [11, 12], [13, 10], [13, 12]], // 蓝:右下
].map((slots) => slots.slice(0, PIECES_PER_SEAT) as Cell[]);

/**
 * 外圈环路,按**顺时针**排好序。
 *
 * 做法是把十字里除去终点道和中心的格子取出来,从一个已知起点沿着环走一圈 ——
 * 因为每格恰好两个邻居,"不走回头路"就唯一确定了下一步,不需要手写 56 行坐标。
 */
export const RING: Cell[] = (() => {
  const homeKeys = new Set(HOME_PATH.flat().map(key));
  const ring = new Map<string, Cell>();
  for (const cell of crossCells()) {
    const k = key(cell);
    if (homeKeys.has(k) || k === key(CENTER)) continue;
    ring.set(k, cell);
  }

  const neighbours = (cell: Cell): Cell[] => {
    const [r, c] = cell;
    return ([[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]] as Cell[])
      .filter((n) => ring.has(key(n)));
  };

  // 从座位 0 的入场格起步(它在终点道口再往外一格的下一格),沿环走一圈。
  // 起点选它,ENTRY_INDEX[0] 就是 0,读日志时不用再做偏移换算
  const start: Cell = [14, 6];
  const order: Cell[] = [start];
  let prev = key(start);
  let cur = neighbours(start).find((n) => key(n) !== key([14, 7] as Cell))!;
  while (key(cur) !== key(start)) {
    order.push(cur);
    const next = neighbours(cur).find((n) => key(n) !== prev)!;
    prev = key(cur);
    cur = next;
  }
  return order;
})();

/**
 * 每家入场格在 RING 里的下标。
 *
 * **由几何反推,不能写成 `seat × 14`。** 约束是:棋子走完整整一圈(第 TRACK-1 步)之后,
 * 下一步要拐进自己终点道的第一格 —— 所以入场格的**前一格**必须和终点道第一格相邻。
 * 硬编码 `seat × 14` 时红家绕完一圈停在 (14,6),而它的终点道从 (13,7) 起,
 * 两者是斜对角:棋子会斜着跳进终点道。这种错在数字上完全看不出来,只有画出来才发现。
 */
export const ENTRY_INDEX: number[] = Array.from({ length: SEATS }, (_, seat) => {
  const gate = HOME_PATH[seat][0];
  const inner = HOME_PATH[seat][1];
  // 终点道口再往外一格 —— 那才是绕完一圈的落脚点。
  // 光找"和道口相邻的环格"会有三个候选(道口左右各一个 + 外面一个),挑错就会四家不等距
  const outer: Cell = [2 * gate[0] - inner[0], 2 * gate[1] - inner[1]];
  const before = RING.findIndex((c) => c[0] === outer[0] && c[1] === outer[1]);
  if (before < 0) return 0; // 几何坏了,交给 validate 报错
  return (before + 1) % RING.length;
});

/** 走了 step 步之后所在的格子。step 可以落在外圈,也可以落在终点道 */
export function cellOfStep(seat: number, step: number): Cell {
  if (step < TRACK) return RING[(ENTRY_INDEX[seat] + step) % RING.length];
  const inHome = Math.min(step - TRACK, HOME_LEN - 1);
  return HOME_PATH[seat][inHome];
}

/** 基地里第 i 颗棋子的位置 */
export function baseCell(seat: number, piece: number): Cell {
  return BASE_SLOTS[seat][piece % BASE_SLOTS[seat].length];
}

/**
 * 网格坐标 → 世界坐标。棋盘中心是原点,**+x 向右、+y 向上**(Three 的习惯)。
 * `size` 是一格的边长。
 */
export function toWorld(cell: Cell, size: number): { x: number; y: number } {
  const [row, col] = cell;
  return {
    x: (col - (GRID - 1) / 2) * size,
    y: ((GRID - 1) / 2 - row) * size,
  };
}

/** 自检。改了上面任何一处都跑一遍 */
export function validate(): string[] {
  const errors: string[] = [];
  if (RING.length !== TRACK) {
    errors.push(`外圈实际 ${RING.length} 格,config.TRACK 却是 ${TRACK} —— 棋子会走到格子外面`);
  }
  if (RING.length % SEATS !== 0) errors.push('外圈格数不能被座位数整除,四家无法等距');

  const seen = new Set(RING.map(key));
  if (seen.size !== RING.length) errors.push('外圈有重复格子,说明环走岔了');

  for (let i = 0; i < RING.length; i += 1) {
    const a = RING[i];
    const b = RING[(i + 1) % RING.length];
    if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) !== 1) {
      errors.push(`第 ${i} 格和第 ${i + 1} 格不相邻:${key(a)} → ${key(b)}`);
      break;
    }
  }

  const homeKeys = new Set(HOME_PATH.flat().map(key));
  for (const cell of RING) {
    if (homeKeys.has(key(cell))) errors.push(`格 ${key(cell)} 同时是外圈和终点道`);
  }

  // 四家必须等距,否则先手优势不公平。**按环上顺序算**,不是按座位下标顺序
  const sorted = [...ENTRY_INDEX].sort((a, b) => a - b);
  const gaps = sorted.map((e, i) => (sorted[(i + 1) % SEATS] - e + RING.length) % RING.length);
  if (new Set(gaps).size !== 1) errors.push(`四家入场格不等距:${gaps.join(',')}`);

  // 座位顺序必须就是环上顺序,否则回合会在棋盘上跳着走
  const byRing = [...ENTRY_INDEX].every((e, i) => e === sorted[i]);
  if (!byRing) errors.push(`座位顺序和环上顺序不一致:${ENTRY_INDEX.join(',')} —— 轮次会跨对角跳`);

  // 终点道衔接:走完一圈的最后一格必须和终点道第一格相邻
  for (let seat = 0; seat < SEATS; seat += 1) {
    const last = cellOfStep(seat, TRACK - 1);
    const gate = HOME_PATH[seat][0];
    if (Math.abs(last[0] - gate[0]) + Math.abs(last[1] - gate[1]) !== 1) {
      errors.push(`座位 ${seat} 从 ${key(last)} 拐进终点道 ${key(gate)} 不相邻 —— 会斜着跳进去`);
    }
  }
  for (let seat = 0; seat < SEATS; seat += 1) {
    if (HOME_PATH[seat].length !== HOME_LEN) errors.push(`座位 ${seat} 的终点道不是 ${HOME_LEN} 格`);
    if (BASE_SLOTS[seat].length !== PIECES_PER_SEAT) errors.push(`座位 ${seat} 的基地槽位数不对`);
  }
  return errors;
}
