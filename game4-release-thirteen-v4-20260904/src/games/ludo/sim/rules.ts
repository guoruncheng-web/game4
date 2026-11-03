/**
 * 规则内核。**整个游戏唯一的判定来源。**
 *
 * 这里全部是纯函数:输入局面和点数,输出所有合法走法及其后果。
 * 一处写对,三处受益(DESIGN.md §9):
 *   - AI 拿它当搜索的边
 *   - UI 拿它做落点高亮
 *   - 服务端拿它校验客户端提交的走法
 * 反过来也成立 —— 一处写错三处一起错,所以它必须配无头用例集
 * (`pnpm ludo:test`,照捕鱼的 `pnpm fish:rtp` 那条路子)。
 *
 * **不许在这里摇骰子。** 点数一律由调用方传进来:服务端摇了广播,
 * 客户端只是拿着已知的点数问"能怎么走"。骰子留在这里 = 客户端可以自己摇 = 作弊入口。
 */

import { GOAL, LAUNCH_FACES, PIECES_PER_SEAT, SEATS, TRACK, trackCell } from '../config';
import { ENTRY, SAFE, cellAt, isSafe } from './board';

/** 一颗棋子走了多少步。-1 = 还在基地;>= GOAL = 已到家 */
export type Piece = number;
export const BASE: Piece = -1;

/** 局面。**纯数据,可结构化克隆** —— AI 要靠这一点做搜索 */
export type Board = {
  /** [座位][棋子] = 已走步数 */
  pieces: Piece[][];
};

export type Hit = {
  seat: number;
  piece: number;
  /** 被撞回到第几步 */
  to: Piece;
};

export type Move = {
  /** 用掉的是哪个点数(在 dice 数组里的下标) */
  die: number;
  face: number;
  piece: number;
  from: Piece;
  to: Piece;
  /** 撞掉了谁 */
  hits: Hit[];
  /** 这一步之后这颗棋子到家了 */
  goal: boolean;
};

export function emptyBoard(): Board {
  return {
    pieces: Array.from({ length: SEATS }, () => Array.from({ length: PIECES_PER_SEAT }, () => BASE)),
  };
}

/**
 * 开局局面:**每人先有一颗在入场格上**。
 *
 * 标准规则要掷出 6 才能出子,连续四轮出不了子的概率有 48% ——
 * 送一颗在场,第一回合所有人都有得走。
 */
export function initialBoard(): Board {
  const board = emptyBoard();
  for (let seat = 0; seat < SEATS; seat += 1) board.pieces[seat][0] = 0;
  return board;
}

export function cloneBoard(board: Board): Board {
  return { pieces: board.pieces.map((row) => row.slice()) };
}

export function isHome(step: Piece): boolean {
  return step >= GOAL;
}

/** 一颗棋子现在占着哪个外圈格。在基地、在终点道、已到家都返回 null */
export function cellOf(seat: number, step: Piece): number | null {
  if (step < 0 || step >= TRACK) return null;
  return trackCell(seat, step);
}

/**
 * 被撞之后退到哪。**回基地,从头再来。**
 *
 * 试过改成"退回最近的己方安全格"来减轻挫败,最后还是回到标准 ——
 * 撞子是这游戏唯一的对抗手段,削弱它等于把仅有的互动也削掉。
 * 挫败改用另一条来补:**被撞方下一回合掷 3 个骰子选 1**(config.DICE_AFTER_HIT),
 * 挨打之后立刻拿到更强的选择权,比"少退几格"有用得多。
 */
export function knockbackTo(): Piece {
  return BASE;
}

/**
 * 列出一个座位在给定点数下的**全部**合法走法。
 *
 * dice 是这回合摇出来的点数(通常 2 个,刚被撞过是 3 个)。
 * 返回的每一条都用掉其中一个点数 —— 「掷 N 选 1」这条规则就体现在这里:
 * 调用方从返回的列表里挑一条执行,剩下的点数直接作废。
 */
export function legalMoves(board: Board, seat: number, dice: number[]): Move[] {
  const moves: Move[] = [];
  const mine = board.pieces[seat];

  for (let die = 0; die < dice.length; die += 1) {
    const face = dice[die];

    for (let piece = 0; piece < mine.length; piece += 1) {
      const from = mine[piece];
      if (isHome(from)) continue;

      let raw: Piece;
      if (from === BASE) {
        // 出子:掷出 5 或 6 才行。标准规则只认 6,开局最多有 48% 的人连续四轮无事可做
        if (!LAUNCH_FACES.includes(face)) continue;
        moves.push({ die, face, piece, from, to: 0, hits: hitsAt(board, seat, 0), goal: false });
        continue;
      } else {
        raw = from + face;
        // 终点道:点数够就行,不用精确(DESIGN §3.4)。超出直接到家
        if (raw > GOAL) raw = GOAL;
      }

      const to = Math.min(raw, GOAL);
      moves.push({ die, face, piece, from, to, hits: hitsAt(board, seat, to), goal: to >= GOAL });
    }
  }

  return moves;
}

/** 落在 to 这一步会撞掉谁。安全格上的棋子撞不动 */
function hitsAt(board: Board, seat: number, to: Piece): Hit[] {
  if (to < 0 || to >= TRACK) return [];
  const cell = trackCell(seat, to);
  if (isSafe(cell)) return [];

  const hits: Hit[] = [];
  for (let other = 0; other < SEATS; other += 1) {
    if (other === seat) continue;
    for (let piece = 0; piece < board.pieces[other].length; piece += 1) {
      const step = board.pieces[other][piece];
      if (cellOf(other, step) !== cell) continue;
      hits.push({ seat: other, piece, to: knockbackTo() });
    }
  }
  return hits;
}

/** 执行一步。**不改传进来的局面**,返回新的 —— AI 要靠这一点做搜索 */
export function applyMove(board: Board, seat: number, move: Move): Board {
  const next = cloneBoard(board);
  next.pieces[seat][move.piece] = move.to;
  for (const hit of move.hits) next.pieces[hit.seat][hit.piece] = hit.to;
  return next;
}

/** 这个座位的棋子全到家了没 */
export function isFinished(board: Board, seat: number): boolean {
  return board.pieces[seat].every((step) => isHome(step));
}

/** 排名用的进度分:已走步数之和,到家的按满分算 */
export function progress(board: Board, seat: number): number {
  return board.pieces[seat].reduce((sum, step) => sum + Math.max(0, Math.min(step, GOAL)), 0);
}

/** 给 UI 和调试用:把一步走法说成人话 */
export function describe(move: Move): string {
  const parts = [`${move.face} 点`, move.from === BASE ? '出子' : `${move.from}→${move.to}`];
  if (move.hits.length) parts.push(`撞 ${move.hits.length} 颗`);
  if (move.goal) parts.push('到家');
  return parts.join(' · ');
}

/** 棋盘数据表转出去,渲染层和 AI 都要用 */
export { ENTRY, SAFE, cellAt, isSafe };
