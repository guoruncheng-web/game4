/**
 * 确定性随机数。
 *
 * 只在**服务端**用(投放什么鱼、走哪条路、捕没捕到),客户端不摇任何点数 ——
 * 客户端摇出来的结果没人信,摇了也是白摇(DESIGN.md §3.1)。
 *
 * 用可播种的 RNG 而不是 Math.random,是为了出问题时能靠 (房间种子, tick 序号)
 * 复现一整局。
 */

export type Rng = () => number;

/** mulberry32。够快、够均匀,32 位状态,复现只需要存一个整数 */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(rng: Rng, list: readonly T[]): T {
  return list[Math.floor(rng() * list.length)];
}

export function range(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}

/** 按权重抽一个。weights 必须和 items 等长且总和 > 0 */
export function weighted<T>(rng: Rng, items: readonly T[], weights: readonly number[]): T {
  let total = 0;
  for (const w of weights) total += w;
  let roll = rng() * total;
  for (let i = 0; i < items.length; i += 1) {
    roll -= weights[i];
    if (roll <= 0) return items[i];
  }
  return items[items.length - 1];
}
