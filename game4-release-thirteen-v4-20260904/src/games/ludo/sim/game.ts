/**
 * 回合状态机:谁的回合、摇了什么点、走完之后轮到谁、什么时候结束、名次怎么排。
 *
 * 和 `rules.ts` 的分工:
 *   - `rules.ts` 回答「这个局面 + 这些点数,能怎么走」——**不知道现在是谁的回合,也不摇骰子**
 *   - `game.ts` 回答「现在轮到谁、摇到了什么、这一局结束了没」
 *
 * **骰子在这里摇,但随机源由外部注入**(`rng` 参数)。
 * 服务端传自己的随机数,测试传固定种子 —— 同一个种子必须复现同一整局,
 * 否则出了问题只能靠瞪代码。客户端永远不调用摇骰子的那条路径(它没有权威)。
 */

import {
  DEFAULT_DURATION, DICE_AFTER_HIT, DICE_PER_TURN, GOAL, MAX_ROUNDS, PIECES_PER_SEAT,
  SEATS, TURN_TIMEOUT_MS,
} from '../config';
import type { Board, Move } from './rules';
import { applyMove, initialBoard, isFinished, legalMoves } from './rules';

export type Rng = () => number;

/** 一局为什么结束的 */
export type OverReason = 'finished' | 'timeup' | 'rounds';

export type GameState = {
  board: Board;
  /** 当前轮到哪个座位 */
  turn: number;
  /** 第几轮(所有人各走一次算一轮),从 1 开始 */
  round: number;
  /** 本回合摇出来的点数。空数组表示还没摇 */
  dice: number[];
  /**
   * 自上一次自己的回合以来被撞过。被撞的人下回合多摇一个骰子(DESIGN §9.4)——
   * 挨打之后立刻拿到更强的选择权,比"少退几格"有用得多。
   */
  hitSince: boolean[];
  /** 按完成先后记下的座位,决定名次 */
  finished: number[];
  /** 这一局的起止时刻(服务端时钟) */
  startedAt: number;
  endsAt: number;
  /** 当前回合的超时时刻 */
  deadline: number;
  over: OverReason | null;
};

export function createGame(now: number, duration = DEFAULT_DURATION): GameState {
  return {
    board: initialBoard(),
    turn: 0,
    round: 1,
    dice: [],
    hitSince: new Array(SEATS).fill(false),
    finished: [],
    startedAt: now,
    endsAt: now + duration * 1000,
    deadline: now + TURN_TIMEOUT_MS,
    over: null,
  };
}

/** 本回合该摇几个骰子 */
export function diceCount(state: GameState, seat = state.turn): number {
  return state.hitSince[seat] ? DICE_AFTER_HIT : DICE_PER_TURN;
}

/**
 * 摇骰子。**只有服务端调这个。**
 *
 * 摇完就把 `hitSince` 清掉 —— 补偿是一次性的,不能一直吃。
 */
export function roll(state: GameState, rng: Rng, now: number): GameState {
  if (state.over || state.dice.length) return state;
  const count = diceCount(state);
  const dice = Array.from({ length: count }, () => 1 + Math.floor(rng() * 6));
  const hitSince = state.hitSince.slice();
  hitSince[state.turn] = false;
  return { ...state, dice, hitSince, deadline: now + TURN_TIMEOUT_MS };
}

/** 当前回合的全部合法走法。摇之前是空的 */
export function currentMoves(state: GameState): Move[] {
  if (state.over || !state.dice.length) return [];
  return legalMoves(state.board, state.turn, state.dice);
}

/**
 * 走一步,然后轮到下一个人。
 *
 * `index` 是 `currentMoves()` 返回数组里的下标。**服务端必须自己算一遍 currentMoves 再取**,
 * 不能信客户端传过来的走法本身 —— 否则改一个字段就能凭空移动棋子。
 */
export function play(state: GameState, index: number, now: number): GameState {
  const moves = currentMoves(state);
  const move = moves[index];
  if (!move) return state;

  const board = applyMove(state.board, state.turn, move);
  const hitSince = state.hitSince.slice();
  for (const hit of move.hits) hitSince[hit.seat] = true;

  const finished = state.finished.slice();
  if (isFinished(board, state.turn) && !finished.includes(state.turn)) {
    finished.push(state.turn);
  }

  return advance({ ...state, board, hitSince, finished }, now);
}

/**
 * 这回合没有任何合法走法(或超时未操作),直接过。
 *
 * **必须有这条路**:掷不出能走的点是常态,没有它整局会卡在某个人身上。
 */
export function pass(state: GameState, now: number): GameState {
  if (state.over || !state.dice.length) return state;
  return advance(state, now);
}

/** 轮到下一个还没结束的人,并检查三道收尾条件 */
function advance(state: GameState, now: number): GameState {
  let turn = state.turn;
  let round = state.round;

  // 跳过已经全部到家的座位
  for (let i = 0; i < SEATS; i += 1) {
    const next = (turn + 1) % SEATS;
    if (next <= turn) round += 1; // 绕回座位 0 就是新的一轮
    turn = next;
    if (!isFinished(state.board, turn)) break;
  }

  const next: GameState = { ...state, turn, round, dice: [], deadline: now + TURN_TIMEOUT_MS };
  return { ...next, over: checkOver(next, now) };
}

/**
 * 三道收尾条件(DESIGN §6)。任意一道触发就结算。
 * **不要再加第四道** —— 多套并行会让玩家永远搞不清这局什么时候结束。
 */
export function checkOver(state: GameState, now: number): OverReason | null {
  if (state.over) return state.over;
  // 只剩一家没走完就可以收了,让最后一个人独自跑完剩下的路没有任何意义
  if (state.finished.length >= SEATS - 1) return 'finished';
  if (now >= state.endsAt) return 'timeup';
  if (state.round > MAX_ROUNDS) return 'rounds';
  return null;
}

/** 每家的分数。一颗到家 100,否则按进度折算,满分 400 */
export function scores(state: GameState): number[] {
  return state.board.pieces.map((row) =>
    row.reduce((sum, step) => {
      if (step >= GOAL) return sum + 100;
      if (step < 0) return sum;
      return sum + Math.floor((step / GOAL) * 100);
    }, 0));
}

/**
 * 名次。**先按完成顺序,再按分数** ——
 * 时间到的时候光比分数会出现并列,而并列在四人局里是最扫兴的结果;
 * 完成顺序天然没有并列,所以它优先。
 */
export function ranking(state: GameState): number[] {
  const score = scores(state);
  return Array.from({ length: SEATS }, (_, seat) => seat).sort((a, b) => {
    const fa = state.finished.indexOf(a);
    const fb = state.finished.indexOf(b);
    if (fa !== -1 || fb !== -1) {
      if (fa === -1) return 1;
      if (fb === -1) return -1;
      return fa - fb;
    }
    if (score[b] !== score[a]) return score[b] - score[a];
    // 分数也一样就按座位号,保证结果稳定(不稳定的排序会让两端显示不同的名次)
    return a - b;
  });
}

/** 满分,给 UI 画进度条用 */
export const MAX_SCORE = PIECES_PER_SEAT * 100;

/** 剩余时间(毫秒),不小于 0 */
export function timeLeft(state: GameState, now: number): number {
  return Math.max(0, state.endsAt - now);
}
