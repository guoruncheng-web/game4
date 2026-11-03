/**
 * Ludo 规则内核的用例集。
 *
 *   pnpm ludo:test
 *
 * **改了 sim/rules.ts、sim/board.ts 或 config.ts 之后必须跑一遍。**
 * 覆盖设计文档里写死的那些边界:出子条件、落点、撞子回基地、安全格、
 * 终点道"点数够就行",以及验收里那两条可证伪的量化指标。
 * 这里覆盖的是设计文档里明确写死的那些边界:起飞条件、跳格连锁、飞行道、
 * 撞子退位、终点道"点数够就行",以及 §11 验收里那两条可证伪的量化指标。
 */

import {
  BASE, applyMove, emptyBoard, initialBoard, isFinished, legalMoves,
} from '../../../src/games/ludo/sim/rules.ts';
import { GOAL, PIECES_PER_SEAT, TRACK, entryCell, trackCell } from '../../../src/games/ludo/config.ts';
import { ENTRY, SAFE, validate } from '../../../src/games/ludo/sim/board.ts';
import { RING, cellOfStep, baseCell, HOME_PATH, validate as validateLayout } from '../../../src/games/ludo/sim/layout.ts';

let pass = 0;
let fail = 0;
const ok = (cond, what, extra = '') => {
  if (cond) { pass += 1; console.log(`ok   ${what}`); }
  else { fail += 1; console.log(`FAIL ${what}${extra ? `  ${extra}` : ''}`); }
};

// ---------------------------------------------------------------- 棋盘自洽

{
  const errors = validate();
  ok(errors.length === 0, '棋盘自检通过', errors.join(' / '));
  const geo = validateLayout();
  ok(geo.length === 0, '棋盘几何自检通过', geo.join(' / '));
  ok(RING.length === TRACK, `外圈几何 ${RING.length} 格 == config.TRACK ${TRACK}`);

  // 相邻性:整条路径(外圈 + 终点道)每一步都必须走到相邻格,不能斜跳
  let jumps = 0;
  for (let seat = 0; seat < 4; seat += 1) {
    for (let step = 0; step < GOAL - 1; step += 1) {
      const a = cellOfStep(seat, step);
      const b = cellOfStep(seat, step + 1);
      if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) !== 1) jumps += 1;
    }
  }
  ok(jumps === 0, '整条路径每一步都走到相邻格(含拐进终点道那一下)', `${jumps} 处斜跳`);

  // 基地、终点道、外圈三者不能重叠
  const kk = (c) => `${c[0]},${c[1]}`;
  const ringKeys = new Set(RING.map(kk));
  const homeKeys = new Set(HOME_PATH.flat().map(kk));
  let overlap = 0;
  for (let seat = 0; seat < 4; seat += 1) {
    for (let p = 0; p < PIECES_PER_SEAT; p += 1) {
      const b = kk(baseCell(seat, p));
      if (ringKeys.has(b) || homeKeys.has(b)) overlap += 1;
    }
  }
  ok(overlap === 0, '基地格不和外圈/终点道重叠');
  ok(SAFE.length === 8, '安全格 8 个(4 个入场格 + 4 个 ★)');
  ok(ENTRY.every((e) => SAFE.includes(e)), '每个入场格都是安全格');
  const gaps = ENTRY.map((e, i) => (ENTRY[(i + 1) % 4] - e + TRACK) % TRACK);
  ok(new Set(gaps).size === 1, `四家入场格等距(${gaps.join(',')})`);
  ok(GOAL === TRACK + 6, `一颗棋子要走 ${GOAL} 步:外圈 ${TRACK} + 终点道 6`);
}

// ---------------------------------------------------------------- 起飞

{
  const board = emptyBoard();
  for (const face of [1, 2, 3, 4]) {
    ok(legalMoves(board, 0, [face]).length === 0, `基地里掷 ${face} 点不能出子`);
  }
  for (const face of [5, 6]) {
    const moves = legalMoves(board, 0, [face]);
    ok(moves.length === PIECES_PER_SEAT && moves.every((m) => m.from === BASE && m.to === 0),
      `掷 ${face} 点可以出子`, `实际 ${moves.length} 条`);
  }
  const start = initialBoard();
  ok([0, 1, 2, 3].every((s) => start.pieces[s].filter((p) => p === 0).length === 1),
    '开局每人有且只有一颗在入场格上');
}

// ---------------------------------------------------------------- 落点

{
  const board = emptyBoard();
  board.pieces[0][0] = 3;
  const moves = legalMoves(board, 0, [1, 5]);
  ok(moves.find((m) => m.face === 1)?.to === 4 && moves.find((m) => m.face === 5)?.to === 8,
    '落点就是"当前步数 + 点数",没有任何捷径');
}

// ---------------------------------------------------------------- 撞子

{
  const board = emptyBoard();
  // 让座位 1 的棋子停在一个"不是安全格"的位置上,再让座位 0 撞上去
  let victimStep = -1;
  let attackerStep = -1;
  outer:
  for (let a = 1; a < TRACK; a += 1) {
    const cell = trackCell(0, a);
    if (SAFE.includes(cell)) continue;
    for (let v = 1; v < TRACK; v += 1) {
      if (trackCell(1, v) === cell) { victimStep = v; attackerStep = a; break outer; }
    }
  }
  board.pieces[0][0] = attackerStep - 1;
  board.pieces[1][0] = victimStep;
  const move = legalMoves(board, 0, [1]).find((m) => m.to === attackerStep);
  ok(!!move && move.hits.length === 1, '撞到对手会被记录', `attacker=${attackerStep}`);
  const after = applyMove(board, 0, move);
  ok(after.pieces[1][0] === BASE, '被撞的棋子回基地');
  ok(board.pieces[1][0] === victimStep, 'applyMove 不修改传进来的局面(AI 搜索依赖这一点)');
}

{
  const board = emptyBoard();
  // 安全格上的棋子撞不动
  const safeCell = SAFE.find((c) => c !== entryCell(0));
  let vs = -1; let as = -1;
  for (let v = 0; v < TRACK; v += 1) if (trackCell(1, v) === safeCell) vs = v;
  for (let a = 0; a < TRACK; a += 1) if (trackCell(0, a) === safeCell) as = a;
  if (vs >= 0 && as >= 1) {
    board.pieces[1][0] = vs;
    board.pieces[0][0] = as - 1;
    const move = legalMoves(board, 0, [1]).find((m) => m.to === as);
    ok(!!move && move.hits.length === 0, '安全格上的棋子撞不动');
  }
}

// ---------------------------------------------------------------- 终点道

{
  const board = emptyBoard();
  board.pieces[0][0] = GOAL - 2;
  const moves = legalMoves(board, 0, [1, 6]);
  ok(moves.find((m) => m.face === 6)?.goal === true, '点数超出也能进终点(不用精确)');
  ok(moves.find((m) => m.face === 1)?.goal === false, '差一步就是差一步');
  ok(moves.every((m) => m.to <= GOAL), '步数不会超过终点');

  const done = emptyBoard();
  done.pieces[0] = Array.from({ length: PIECES_PER_SEAT }, () => GOAL);
  ok(isFinished(done, 0), '全部到家 = 完成');
  ok(legalMoves(done, 0, [1, 2, 3, 4, 5, 6]).length === 0, '到家的棋子不再有走法');
}

// ---------------------------------------------------------------- 设计目标(DESIGN §11 的量化验收)

{
  // 开局第一回合,四个人都必须有得走
  const start = initialBoard();
  let allHaveMoves = true;
  for (let a = 1; a <= 6; a += 1) {
    for (let b = 1; b <= 6; b += 1) {
      for (let s = 0; s < 4; s += 1) {
        if (legalMoves(start, s, [a, b]).length === 0) allHaveMoves = false;
      }
    }
  }
  ok(allHaveMoves, '开局任意点数下,四个人都至少有一种走法(开局不该有人干等)');
}

{
  // 「掷二选一」有没有真的带来选择:随机对局里统计每回合的合法走法数
  const counts = [];
  let seed = 20260820;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const d6 = () => 1 + Math.floor(rnd() * 6);

  for (let game = 0; game < 200; game += 1) {
    let board = initialBoard();
    for (let turn = 0; turn < 400; turn += 1) {
      const seat = turn % 4;
      if (isFinished(board, seat)) continue;
      const moves = legalMoves(board, seat, [d6(), d6()]);
      counts.push(moves.length);
      if (!moves.length) continue;
      board = applyMove(board, seat, moves[Math.floor(rnd() * moves.length)]);
    }
  }
  counts.sort((a, b) => a - b);
  const median = counts[Math.floor(counts.length / 2)];
  const zero = counts.filter((c) => c === 0).length / counts.length;
  ok(median >= 2, `每回合合法走法数中位数 ≥ 2(实际 ${median})`);
  ok(zero < 0.05, `无路可走的回合占比 < 5%(实际 ${(zero * 100).toFixed(1)}%)`);
}


// ---------------------------------------------------------------- 回合状态机

{
  const G = await import('../../../src/games/ludo/sim/game.ts');
  const C = await import('../../../src/games/ludo/config.ts');

  // 固定种子 —— 同一个种子必须复现同一整局
  const makeRng = (seed) => () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  /** 自动打完一局:每回合摇点、随机选一步,直到结束 */
  const autoplay = (seed, { duration = 900, clock = () => 0 } = {}) => {
    const rng = makeRng(seed);
    let s = G.createGame(clock(), duration);
    let turns = 0;
    while (!s.over && turns < 20000) {
      turns += 1;
      s = G.roll(s, rng, clock());
      const moves = G.currentMoves(s);
      s = moves.length ? G.play(s, Math.floor(rng() * moves.length), clock()) : G.pass(s, clock());
    }
    return { state: s, turns };
  };

  {
    const a = autoplay(2026);
    const b = autoplay(2026);
    ok(JSON.stringify(a.state.board) === JSON.stringify(b.state.board),
      '同一个种子复现同一整局(服务端出问题时能重放)');
    ok(a.state.over !== null, `一局能自然结束(${a.state.over},${a.turns} 回合)`);
  }

  {
    const { state } = autoplay(7);
    const sc = G.scores(state);
    ok(sc.every((v) => v >= 0 && v <= G.MAX_SCORE), `分数落在 0~${G.MAX_SCORE}`, sc.join('/'));
    const rank = G.ranking(state);
    ok(new Set(rank).size === 4 && rank.length === 4, '名次是四家的一个排列', rank.join('>'));
    // 已完成的必须排在未完成的前面
    const idx = (seat) => rank.indexOf(seat);
    ok(state.finished.every((seat) => state.finished.every((o) => idx(seat) <= idx(o) || state.finished.indexOf(o) < state.finished.indexOf(seat))),
      '完成顺序决定名次');
  }

  {
    // 时间到:把时钟直接推过终点
    let now = 0;
    const rng = makeRng(11);
    let s = G.createGame(now, 300);
    s = G.roll(s, rng, now);
    now = s.endsAt + 1;
    const moves = G.currentMoves(s);
    s = moves.length ? G.play(s, 0, now) : G.pass(s, now);
    ok(s.over === 'timeup', '时间到就结算', String(s.over));
  }

  {
    // 回合上限
    const { state } = autoplay(3, { duration: 10 ** 6 });
    ok(state.round <= C.MAX_ROUNDS + 1, `回合数不超过上限 ${C.MAX_ROUNDS}`, `实际 ${state.round}`);
  }

  {
    // 被撞的人下回合多摇一个骰子
    let s = G.createGame(0, 900);
    ok(G.diceCount(s) === C.DICE_PER_TURN, `平时摇 ${C.DICE_PER_TURN} 个骰子`);
    s = { ...s, hitSince: s.hitSince.map((_, i) => i === s.turn) };
    ok(G.diceCount(s) === C.DICE_AFTER_HIT, `刚被撞过摇 ${C.DICE_AFTER_HIT} 个骰子`);
    const after = G.roll(s, makeRng(5), 0);
    ok(after.dice.length === C.DICE_AFTER_HIT, '补偿在这一回合生效');
    ok(after.hitSince[s.turn] === false, '补偿是一次性的,摇完就清掉');
  }

  {
    // 摇之前没有走法,摇完才有
    const s = G.createGame(0, 900);
    ok(G.currentMoves(s).length === 0, '没摇骰子之前没有任何合法走法');
    const rolled = G.roll(s, makeRng(9), 0);
    ok(rolled.dice.length === C.DICE_PER_TURN && G.currentMoves(rolled).length > 0,
      '摇完就有走法');
    ok(G.roll(rolled, makeRng(1), 0).dice.join() === rolled.dice.join(),
      '同一回合重复摇不会换点数(防客户端刷骰子)');
  }
}

{
  // 胜利条件必须真的够得着:给足时间和回合,应该有人能把四颗全送到家
  const G = await import('../../../src/games/ludo/sim/game.ts');
  const makeRng = (seed) => () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  let reached = 0;
  for (let seed = 1; seed <= 12; seed += 1) {
    const rng = makeRng(seed);
    let s = G.createGame(0, 10 ** 6);
    for (let i = 0; i < 20000 && !s.over; i += 1) {
      s = G.roll(s, rng, 0);
      const moves = G.currentMoves(s);
      // 贪心:优先能到家的,其次走得最远的 —— 近似一个会玩的人
      let best = -1;
      let bestScore = -1;
      moves.forEach((m, i2) => {
        const v = (m.goal ? 1000 : 0) + (m.hits.length ? 200 : 0) + (m.to - m.from);
        if (v > bestScore) { bestScore = v; best = i2; }
      });
      s = best >= 0 ? G.play(s, best, 0) : G.pass(s, 0);
    }
    if (s.over === 'finished') reached += 1;
  }
  ok(reached >= 10, `胜利条件够得着:12 局里 ${reached} 局有人跑完(不是每局都撞回合墙)`);
}

console.log(`\n${pass} 通过 / ${fail} 失败`);
if (fail) process.exitCode = 1;
