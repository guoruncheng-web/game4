/**
 * 12 关的关卡表与投放序列生成。
 *
 * 本文件承载 DESIGN.md §8.2 的可解性约束:
 * **每关每种类型的数量必须是 3 的倍数**,否则关卡末尾会剩下 1~2 个永远消不掉的物件,
 * 把槽位永久占死 —— 这是本类游戏最经典的崩关 bug。
 *
 * 实现方式是「先按三个一组配额,再乘 3」,所以不是靠事后校验,是结构上不可能出错。
 * 校验函数 assertSolvable 仍然保留,给改动的人当安全网。
 */

import { TYPE_ORDER, type PieceTypeId } from './pieces';

export type Level = {
  /** 1 起 */
  id: number;
  /** 参与本关的类型数 */
  typeCount: number;
  /** 物件总数,必然是 3 的倍数 */
  total: number;
  /** 限时(毫秒) */
  timeMs: number;
};

const S = 1000;

/**
 * DESIGN.md §9 的难度曲线。三个旋钮:类型数、总数、限时。
 *
 * 两条硬约束:
 * 1. **total 必须能被 3 整除**,而且 total/3 ≥ typeCount(每类至少凑得出一组)。
 * 2. **第 1 关必须是 3 类**。鸽笼不等式(§8.1)说 7 格槽位要塞满至少需要 4 类,
 *    所以 3 类那一关**不可能死于槽位** —— 新手只可能超时,不会在还没理解规则时被判负。
 */
export const LEVELS: readonly Level[] = [
  { id: 1, typeCount: 3, total: 18, timeMs: 180 * S },
  { id: 2, typeCount: 4, total: 24, timeMs: 180 * S },
  { id: 3, typeCount: 5, total: 30, timeMs: 170 * S },
  { id: 4, typeCount: 6, total: 39, timeMs: 170 * S },
  { id: 5, typeCount: 7, total: 48, timeMs: 165 * S },
  { id: 6, typeCount: 8, total: 57, timeMs: 160 * S },
  { id: 7, typeCount: 9, total: 66, timeMs: 155 * S },
  { id: 8, typeCount: 10, total: 75, timeMs: 150 * S },
  { id: 9, typeCount: 11, total: 84, timeMs: 145 * S },
  { id: 10, typeCount: 12, total: 93, timeMs: 140 * S },
  { id: 11, typeCount: 12, total: 105, timeMs: 130 * S },
  { id: 12, typeCount: 12, total: 120, timeMs: 120 * S },
] as const;

export const LEVEL_COUNT = LEVELS.length;

export function getLevel(id: number): Level {
  return LEVELS[Math.min(Math.max(id, 1), LEVEL_COUNT) - 1];
}

/** 本关用到的类型,按「从最好认到最难认」取前 N 个 */
export function levelTypes(level: Level): PieceTypeId[] {
  return TYPE_ORDER.slice(0, level.typeCount);
}

/**
 * 各类型的数量配额。
 * 先把 total/3 组「三个一组」尽量均分到各类型(每类至少 1 组),再乘回 3。
 * 返回值与 levelTypes 一一对应。
 */
export function levelCounts(level: Level): number[] {
  const triples = Math.floor(level.total / 3);
  const n = level.typeCount;
  const base = Math.floor(triples / n);
  let rest = triples - base * n;
  return Array.from({ length: n }, () => {
    const extra = rest > 0 ? 1 : 0;
    rest -= extra;
    return (base + extra) * 3;
  });
}

/**
 * 生成本关的投放序列:一个打乱过的类型数组,长度等于 total。
 *
 * 注意「打乱的是投放顺序,不是类型的决定」—— 数量在上一步就已经定死了。
 * 运行时随机决定类型会直接破坏 3 的倍数,那正是 §8.2 禁止的做法。
 */
export function buildDropOrder(level: Level, random: () => number = Math.random): PieceTypeId[] {
  const types = levelTypes(level);
  const counts = levelCounts(level);
  const bag: PieceTypeId[] = [];
  types.forEach((t, i) => {
    for (let k = 0; k < counts[i]; k += 1) bag.push(t);
  });
  // Fisher-Yates
  for (let i = bag.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

/**
 * 安全网:任何一关的任何类型数量不是 3 的倍数就抛。
 * 开发期在 startGame 里跑一次,production 下被 tree-shake 不掉也只是几十次取模,可忽略。
 */
export function assertSolvable() {
  for (const level of LEVELS) {
    const counts = levelCounts(level);
    const sum = counts.reduce((a, b) => a + b, 0);
    if (counts.some((c) => c % 3 !== 0)) {
      throw new Error(`[triple-pile] 第 ${level.id} 关存在非 3 倍数的类型数量: ${counts.join(',')}`);
    }
    if (counts.some((c) => c < 3)) {
      throw new Error(`[triple-pile] 第 ${level.id} 关有类型数量不足 3: ${counts.join(',')}`);
    }
    if (sum !== level.total) {
      throw new Error(`[triple-pile] 第 ${level.id} 关配额合计 ${sum} 与 total ${level.total} 不符`);
    }
  }
}
