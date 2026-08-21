/**
 * 对局层:把 `sim/game.ts` 的状态摆到画面上,并处理输入。
 *
 * **判定一律走 sim,这里不做任何规则。** 能走哪几步问 `currentMoves()`,
 * 走完之后的局面问 `play()` —— 这一层只负责"把结果演出来"和"把点击翻译成下标"。
 *
 * 现在是**本地对局**(骰子在本地摇,机器人也在本地跑)。接服务端时要换的只有
 * `roll` 和 `play` 的调用方式,画面部分一行不用动。
 */

import { DICE_PER_TURN, PIECES_PER_SEAT, SEATS } from './config';
import {
  createGame, currentMoves, pass, play, roll, scores, timeLeft,
} from './sim/game';
import type { GameState } from './sim/game';
import type { Move } from './sim/rules';
import { BASE } from './sim/rules';
import { BoardView } from './three/board';
import { PieceLayer } from './three/pieces';
import { Stage } from './three/stage';

/** 机器人思考时间:秒回像没在想,太慢让人等 */
const BOT_THINK_MS = () => 600 + Math.random() * 600;
/** 一步走完之后停一下,让人看清发生了什么 */
const SETTLE_MS = 260;

export type WorldEvents = {
  /** 状态变了(轮次、点数、分数、结束),UI 据此刷新 */
  onState(state: GameState, scores: number[]): void;
  /** 该本地玩家掷骰子了 */
  onYourTurn(): void;
  onOver(state: GameState): void;
};

export class World {
  private readonly board: BoardView;
  private readonly layer: PieceLayer;
  private state: GameState;
  private moves: Move[] = [];
  private waiting = false;
  private timer = 0;
  private readonly seat: number;

  private readonly onPointerDown: (e: PointerEvent) => void;

  constructor(
    private readonly stage: Stage,
    private readonly events: WorldEvents,
    /** 本地玩家坐哪个座位,其余交给机器人 */
    seat = 0,
    duration?: number,
  ) {
    this.seat = seat;
    this.board = new BoardView(stage.scene);
    this.layer = new PieceLayer(stage.scene);
    this.state = createGame(performance.now(), duration);
    this.layer.sync(this.state.board.pieces);

    this.onPointerDown = (e) => this.handleTap(e);
    stage.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);

    this.emit();
    this.beginTurn();
  }

  // -------------------------------------------------------------- 回合

  private emit(): void {
    this.events.onState(this.state, scores(this.state));
  }

  /** 轮到谁了:自己就等点骰子,机器人就自己走 */
  private beginTurn(): void {
    if (this.state.over) { this.events.onOver(this.state); return; }
    if (this.state.turn === this.seat) {
      this.events.onYourTurn();
      return;
    }
    this.timer = window.setTimeout(() => this.botTurn(), BOT_THINK_MS());
  }

  /** 本地玩家点「掷骰子」 */
  rollDice(): void {
    if (this.state.over || this.state.turn !== this.seat || this.state.dice.length) return;
    this.state = roll(this.state, Math.random, performance.now());
    this.moves = currentMoves(this.state);
    this.emit();

    if (!this.moves.length) {
      // 掷不出能走的点是常态,不能卡住 —— 停一下让人看清点数再过
      this.timer = window.setTimeout(() => this.finishTurn(pass(this.state, performance.now())), 900);
      return;
    }
    this.highlight();
  }

  private botTurn(): void {
    if (this.state.over) return;
    this.state = roll(this.state, Math.random, performance.now());
    this.moves = currentMoves(this.state);
    this.emit();
    if (!this.moves.length) {
      this.timer = window.setTimeout(() => this.finishTurn(pass(this.state, performance.now())), 600);
      return;
    }
    // 「老手」档:能到家就到家,其次撞人,再次走得最远(DESIGN §11)
    let best = 0;
    let bestScore = -Infinity;
    this.moves.forEach((m, i) => {
      const v = (m.goal ? 1000 : 0) + m.hits.length * 200 + (m.to - m.from);
      if (v > bestScore) { bestScore = v; best = i; }
    });
    this.timer = window.setTimeout(() => this.commit(best), BOT_THINK_MS());
  }

  /** 点棋子 = 选一条走法 */
  private handleTap(event: PointerEvent): void {
    if (this.state.turn !== this.seat || !this.moves.length || this.layer.busy) return;
    const p = this.stage.pointerToWorld(event.clientX, event.clientY);
    const hit = this.layer.pick(p.x, p.y, this.seat);
    if (!hit) return;
    const index = this.moves.findIndex((m) => m.piece === hit.index);
    if (index >= 0) this.commit(index);
  }

  /** 执行第 index 条走法,并把动画演出来 */
  private commit(index: number): void {
    const move = this.moves[index];
    if (!move) return;
    const seat = this.state.turn;
    this.clearHighlight();

    const view = this.layer.pieces[seat][move.piece];
    if (move.from === BASE) view.launch();
    else view.walk(move.from, move.to);

    // 被撞的那些等落点走到了再飞回去,不然会看着"还没碰到就死了"
    const hits = move.hits;
    const next = play(this.state, index, performance.now());
    const delay = (move.from === BASE ? 420 : (move.to - move.from) * 120) + SETTLE_MS;
    this.timer = window.setTimeout(() => {
      for (const hit of hits) this.layer.pieces[hit.seat][hit.piece].knockBack(0);
      this.finishTurn(next, hits.length ? 460 : 0);
    }, delay);
  }

  private finishTurn(next: GameState, extra = 0): void {
    this.state = next;
    this.moves = [];
    this.emit();
    this.timer = window.setTimeout(() => this.beginTurn(), extra);
  }

  // -------------------------------------------------------------- 画面

  private highlight(): void {
    const set = new Set(this.moves.map((m) => m.piece));
    for (let i = 0; i < PIECES_PER_SEAT; i += 1) {
      this.layer.pieces[this.seat][i].setHighlight(set.has(i));
    }
  }

  private clearHighlight(): void {
    for (let seat = 0; seat < SEATS; seat += 1) {
      for (const piece of this.layer.pieces[seat]) piece.setHighlight(false);
    }
  }

  update(dt: number): void {
    this.layer.update(dt);
  }

  get snapshot(): { state: GameState; scores: number[]; left: number; dice: number[] } {
    return {
      state: this.state,
      scores: scores(this.state),
      left: timeLeft(this.state, performance.now()),
      dice: this.state.dice.length ? this.state.dice : new Array(DICE_PER_TURN).fill(0),
    };
  }

  destroy(): void {
    window.clearTimeout(this.timer);
    this.stage.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
    this.layer.dispose();
    this.board.dispose();
  }
}
