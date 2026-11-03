/**
 * 棋盘的静态数据表。标准 Ludo 盘,和新版 `image/gameplay-concept-v2.png` 一致。
 *
 * 外圈 52 格,格号 0..51,**顺时针**。座位 s 的入场格在 `ENTRY[s]`。
 * 外圈格子本身没有任何特殊效果 —— **没有捷径、没有跳跃格**,
 * 唯一的特殊格是 8 个安全格。落点永远就是"当前步数 + 点数",这一点是 Ludo 的地基,
 * 别往里加"踩到某格前进 N 步"之类的规则,那会让整盘的距离计算失去意义。
 *
 * 着色只影响渲染:四个入场格画成各家的颜色,其余米白。
 */

import { HOME_LEN, SEATS, TRACK } from '../config';
import { ENTRY_INDEX } from './layout';

/**
 * 座位序:0 红(下) / 1 绿(左) / 2 黄(上) / 3 蓝(右)。
 * **这个顺序沿着棋盘转一圈**,轮次才是绕着桌子走而不是跨对角跳(见 layout.ts)。
 */
export const COLORS = ['red', 'green', 'yellow', 'blue'] as const;
export type Color = (typeof COLORS)[number];

/**
 * 每个座位的入场格(外圈格号)。
 *
 * **直接取几何算出来的那份**(`layout.ENTRY_INDEX`),不在这里再写一遍 ——
 * 两处各存一份迟早会对不上,而对不上的表现是棋子走到格子外面,极难查。
 */
export const ENTRY: number[] = ENTRY_INDEX;

/**
 * 安全格(外圈格号)。站在上面撞不动。
 *
 * 标准 Ludo 是 8 个:四个彩色入场格,加四个 ★ —— ★ 在各自入场格往前第 8 格。
 * 参考图上每条臂各有一个 ★,位置正是这里。
 */
export const SAFE: number[] = ENTRY.flatMap((e) => [e, (e + 8) % TRACK]).sort((a, b) => a - b);
const SAFE_SET = new Set(SAFE);

export function isSafe(cell: number): boolean {
  return SAFE_SET.has(cell);
}

/**
 * 这一格画成谁的颜色。**只影响渲染,不参与任何判定。**
 * 入场格画成该家的颜色,其余米白(返回 -1)。
 */
export function cellTint(cell: number): number {
  const seat = ENTRY.indexOf(cell);
  return seat;
}

/** 一颗棋子走了 step 步之后在哪个外圈格。step 必须 < TRACK */
export function cellAt(seat: number, step: number): number {
  return (ENTRY[seat] + step) % TRACK;
}

/** 自检。改了上面任何一个常量都跑一遍 */
export function validate(): string[] {
  const errors: string[] = [];
  if (ENTRY.length !== SEATS) errors.push('入场格数量和座位数对不上');
  if (new Set(ENTRY).size !== SEATS) errors.push('有两家共用同一个入场格');
  const gaps = ENTRY.map((e, i) => ((ENTRY[(i + 1) % SEATS] - e + TRACK) % TRACK));
  if (new Set(gaps).size !== 1) errors.push(`四家入场格间距不等:${gaps.join(',')} —— 先手优势会不公平`);
  if (SAFE.length !== SEATS * 2) errors.push('安全格应该是 8 个');
  if (HOME_LEN < 1) errors.push('终点道至少 1 格');
  return errors;
}
