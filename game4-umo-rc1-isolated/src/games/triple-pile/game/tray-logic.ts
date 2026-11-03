/**
 * 槽位逻辑。**纯函数,零依赖** —— 不 import Three,不 import Rapier,不碰 DOM。
 *
 * 这个模块承载本作的全部正确性(三消判定、塞满判定、可解性),
 * 所以它必须能在不起浏览器的情况下被推演验证。任何时候都不要往这里塞渲染或物理。
 */

import type { PieceTypeId } from '../pieces';

/** 槽位里的一格 */
export type TraySlot = {
  /** 物件在本局内的唯一 id,和锅里的实例一一对应 */
  pieceId: number;
  type: PieceTypeId;
};

export type InsertResult = {
  tray: TraySlot[];
  /** 新物件落在第几格(插入后的下标),用于飞行动画的目标位置 */
  index: number;
};

/**
 * 把一个物件插进槽位。
 *
 * 规则:插到**同类的最右侧**;没有同类就排到最右端。
 * 这条是三消的通用惯例,作用是让玩家不用扫描整条槽位就能数出「这类我有几个了」。
 */
export function insert(tray: readonly TraySlot[], slot: TraySlot): InsertResult {
  let index = tray.length;
  for (let i = tray.length - 1; i >= 0; i -= 1) {
    if (tray[i].type === slot.type) {
      index = i + 1;
      break;
    }
  }
  const next = tray.slice();
  next.splice(index, 0, slot);
  return { tray: next, index };
}

/**
 * 找出凑齐 3 个的那一类。
 * 返回它们在 tray 里的下标(升序),没有就返回 null。
 *
 * 一次只处理一类:插入一个物件最多让一类达到 3,不存在同时凑齐两类的情况。
 */
export function findTriple(tray: readonly TraySlot[]): number[] | null {
  const buckets = new Map<PieceTypeId, number[]>();
  tray.forEach((slot, i) => {
    const list = buckets.get(slot.type);
    if (list) list.push(i);
    else buckets.set(slot.type, [i]);
  });
  for (const list of buckets.values()) {
    if (list.length >= 3) return list.slice(0, 3);
  }
  return null;
}

/** 移除给定下标(升序)的格子,右侧整体左移补位 */
export function removeAt(tray: readonly TraySlot[], indices: readonly number[]): TraySlot[] {
  const drop = new Set(indices);
  return tray.filter((_, i) => !drop.has(i));
}

/**
 * 是否已经塞满且无解。
 *
 * DESIGN.md §8.1 的鸽笼论证:塞满而不消除,要求每一类都只有 1 个或 2 个。
 * 所以「长度到达 slots 且找不到 3 个同类」就是死局 —— 不需要再看锅里还剩什么,
 * 因为已经没有格子能再收东西了。
 */
export function isStuck(tray: readonly TraySlot[], slots: number): boolean {
  return tray.length >= slots && findTriple(tray) === null;
}

/** 各类型在槽位里的数量,给「凑齐」道具和 HUD 用 */
export function countByType(tray: readonly TraySlot[]): Map<PieceTypeId, number> {
  const out = new Map<PieceTypeId, number>();
  for (const slot of tray) out.set(slot.type, (out.get(slot.type) ?? 0) + 1);
  return out;
}

/**
 * 「凑齐」道具的目标类型:槽位里数量最多的那一类。
 * 并列时取更靠左的那一类(先进先出,符合玩家的直觉预期)。
 * 槽位为空时返回 null。
 */
export function dominantType(tray: readonly TraySlot[]): PieceTypeId | null {
  const counts = countByType(tray);
  let best: PieceTypeId | null = null;
  let bestCount = 0;
  for (const slot of tray) {
    const c = counts.get(slot.type) ?? 0;
    if (c > bestCount) {
      bestCount = c;
      best = slot.type;
    }
  }
  return best;
}

/**
 * 「移出」道具:取最左边的 n 个退回锅里。
 * 返回被退回的格子和剩下的槽位。
 *
 * 注意必须是**退回**而不是丢弃 —— 丢弃会让该类型的剩余总数不再是 3 的倍数,直接崩关。
 */
export function takeOutLeft(tray: readonly TraySlot[], n: number): { removed: TraySlot[]; tray: TraySlot[] } {
  const k = Math.min(n, tray.length);
  return { removed: tray.slice(0, k), tray: tray.slice(k) };
}
