/**
 * 深海捕鱼的经济回归测试:无头跑一局,量实际 RTP。
 *
 *   node --import ./server/ts-register.mjs tools/sim/fish-hunter/rtp.mjs [炮等级] [虚拟分钟数]
 *
 * **改了 catchChance / netRadius / 鱼表 / 投放节奏之后必须跑一遍。**
 * DESIGN.md §6.3 记着基准值:各等级 RTP 应落在 0.88~0.92,
 * 落在区间外就是经济改坏了 —— 这类错误在游戏里几乎看不出来(手感照样对),
 * 只会表现为几小时之后所有人的余额一起失控。
 *
 * 机器人的行为是"每发都瞄准一条在场的鱼",所以它几乎不空放,
 * 量到的是**理论上限**。真人会空放,实际 RTP 只会更低。
 */

import { FishRoom } from '../../../src/games/fish-hunter/sim/room.ts';
import { fishPos } from '../../../src/games/fish-hunter/sim/fish.ts';
import { FIRE_COOLDOWN_MS, GAME_HEIGHT, GAME_WIDTH, POOL_BOTTOM, POOL_TOP, SEATS, TICK_MS } from '../../../src/games/fish-hunter/config.ts';

const LEVEL = Number(process.argv[2] || 3);
const MINUTES = Number(process.argv[3] || 480);
/** 给机器人一个花不完的本金,免得它中途破产,那会把样本切碎 */
const BANKROLL = 50_000_000;

let spawned = 0, pops = 0, caught = 0, gold = 0, spent = 0, denied = 0;
const fish = new Map();
let balance = 0;

const room = new FishRoom({
  seed: 12345,
  emit: (_seat, m) => {
    if (m.t === 'spawn') { for (const f of m.fish) { fish.set(f.id, f); spawned += 1; } }
    else if (m.t === 'caught') { caught += 1; gold += m.gold; fish.delete(m.fish); }
    else if (m.t === 'pop') pops += 1;
    else if (m.t === 'deny') denied += 1;
    else if (m.t === 'wallet') balance = m.balance;
    else if (m.t === 'hello') balance = m.balance;
  },
});

let now = 1_000_000;
room.join(0, 'bot', now, BANKROLL);
for (let i = 1; i < LEVEL; i += 1) room.input(0, { t: 'level', delta: 1 }, now);

let bulletId = 1;
let lastFire = 0;
const ticks = (MINUTES * 60 * 1000) / TICK_MS;

for (let i = 0; i < ticks; i += 1) {
  now += TICK_MS;
  room.tick(now, TICK_MS);

  if (now - lastFire >= FIRE_COOLDOWN_MS) {
    lastFire = now;
    const target = aimAtSomething(now);
    if (target) {
      const before = balance;
      const origin = SEATS[0];
      room.input(0, { t: 'fire', id: bulletId++, angle: Math.atan2(target.y - origin.y, target.x - origin.x) }, now);
      if (balance < before) spent += before - balance;
    }
  }

  // 客户端也是按 life 自己清的,这里照做,否则 fish 表会无限涨
  for (const [id, f] of fish) if (now - f.t0 >= f.life) fish.delete(id);
}

const report = {
  level: LEVEL,
  minutes: MINUTES,
  shots: spent / LEVEL,
  spawned, pops, caught, denied,
  spent, gold,
  rtp: Number((gold / spent).toFixed(3)),
  netPerMin: Number(((gold - spent) / MINUTES).toFixed(1)),
};
console.log(JSON.stringify(report, null, 2));

// 样本太小时不判定:金龙一条就值 200×等级,60 分钟的样本里它的方差足以把 RTP 拉到 0.93。
// 判定至少要 4 小时虚拟时长(约 6 万发)
if (MINUTES < 240) {
  console.error(`\n[i] 只跑了 ${MINUTES} 分钟,方差太大,不做判定。要判定请跑 480 分钟以上`);
} else if (report.rtp < 0.88 || report.rtp > 0.92) {
  console.error(`\n[!] RTP ${report.rtp} 越界(基准 0.88~0.92)—— 经济被改坏了,见 DESIGN.md §6.3`);
  process.exitCode = 1;
}

/** 找一条画面内、已经进场的鱼 */
function aimAtSomething(t) {
  for (const f of fish.values()) {
    if (t < f.t0) continue;
    const p = fishPos(f, t);
    if (p.x > 40 && p.x < GAME_WIDTH - 40 && p.y > POOL_TOP + 10 && p.y < POOL_BOTTOM - 10 && p.y < GAME_HEIGHT) return p;
  }
  return null;
}
