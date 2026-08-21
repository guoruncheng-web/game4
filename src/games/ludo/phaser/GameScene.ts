/**
 * 对局场景。**判定一律走 `sim/`,这里只负责画和收输入。**
 *
 * 从 Three.js 改造过来的时候,换掉的只有这一层 ——
 * `sim/board` `sim/layout` `sim/rules` `sim/game` 四个文件一行没动,
 * 44 项无头用例原样继续跑着当保险。这正是当初把判定和画面分开的回报。
 *
 * 2D 在这一款反而更顺手:棋盘本来就是正俯视的一张格子网,
 * `layout.ts` 给的 (行, 列) 直接就是屏幕坐标,不需要像 3D 那样翻 y 轴、算射线、
 * 也不会出现"棋子立着、棋盘躺着"的视角打架。
 */

import * as Phaser from 'phaser';
import {
  DEFAULT_DURATION, MAX_ROUNDS, PIECES_PER_SEAT, SEATS, TURN_TIMEOUT_MS,
} from '../config';
import {
  createGame, currentMoves, pass, play, roll, scores, timeLeft,
} from '../sim/game';
import type { GameState } from '../sim/game';
import type { Move } from '../sim/rules';
import { BASE } from '../sim/rules';
import type { Cell } from '../sim/layout';
import { GRID, cellOfStep } from '../sim/layout';
import { VIEW_BASE_SLOTS } from '../render/boardTexture';
import { TEX, buildTextures } from './textures';

export const GAME_WIDTH = 720;
export const GAME_HEIGHT = 1280;

/** 棋盘在画布上的显示边长与中心。上面留给时钟,下面留给骰子 */
const BOARD_SIZE = 690;
const BOARD_CX = GAME_WIDTH / 2;
const BOARD_CY = 600;
const CELL = BOARD_SIZE / GRID;

/** 棋子走一格的时长。慢到能数清,快到不烦 */
const STEP_MS = 130;
/** 机器人思考时间:秒回像没在想,太慢让人等 */
const botThink = () => 600 + Math.random() * 600;

type PieceView = { sprite: Phaser.GameObjects.Image; seat: number; index: number };

export class GameScene extends Phaser.Scene {
  private state!: GameState;
  private moves: Move[] = [];
  private pieces: PieceView[][] = [];
  private seat = 0;
  private duration = DEFAULT_DURATION;

  private clockText!: Phaser.GameObjects.Text;
  private roundText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private scoreTexts: Phaser.GameObjects.Text[] = [];
  private panelGlows: Phaser.GameObjects.Graphics[] = [];
  private diceImages: Phaser.GameObjects.Image[] = [];
  private rollButton!: Phaser.GameObjects.Container;
  private busy = false;

  constructor() {
    super('LudoGame');
  }

  /** 头像走素材文件(public/ludo/avatars),不是画出来的 */
  preload(): void {
    for (let seat = 0; seat < SEATS; seat += 1) {
      this.load.image(`ludo-face-${seat}`, `/ludo/avatars/player-0${seat + 1}.png`);
    }
  }

  init(data: { seat?: number; duration?: number }): void {
    this.seat = data?.seat ?? 0;
    this.duration = data?.duration ?? DEFAULT_DURATION;
  }

  create(): void {
    // **局面必须在这里建,不能在 init 里。**
    // init 跑的时候场景的时钟系统还没起来,`this.time.now` 是 0 ——
    // 于是 endsAt 被算成"0 + 5 分钟",而 update 里的 time.now 早就超过它了,
    // 表现就是时钟从一开始就显示 00:00。
    this.state = createGame(this.time.now, this.duration);
    buildTextures(this);
    this.add.image(BOARD_CX, BOARD_CY, TEX.board).setDisplaySize(BOARD_SIZE, BOARD_SIZE);

    this.buildBasePanels();
    this.buildPieces();
    this.buildHud();
    this.syncPieces();
    this.refreshHud();
    this.beginTurn();
  }

  // -------------------------------------------------------------- 坐标

  /** 棋盘格 → 画布坐标。**只有这一个换算入口**,别处一律用格坐标思考 */
  private toScreen(cell: Cell): { x: number; y: number } {
    const [row, col] = cell;
    return {
      x: BOARD_CX + (col + 0.5 - GRID / 2) * CELL,
      y: BOARD_CY + (row + 0.5 - GRID / 2) * CELL,
    };
  }

  private cellOfPiece(seat: number, step: number): Cell {
    return step === BASE ? VIEW_BASE_SLOTS[seat][0] : cellOfStep(seat, step);
  }

  // -------------------------------------------------------------- 棋子

  private buildPieces(): void {
    for (let seat = 0; seat < SEATS; seat += 1) {
      const row: PieceView[] = [];
      for (let i = 0; i < PIECES_PER_SEAT; i += 1) {
        const sprite = this.add
          .image(0, 0, TEX.pawn(seat))
          .setDisplaySize(CELL * 0.86, CELL * 0.86)
          .setDepth(10);
        // 点棋子就是选一条走法。Phaser 自带命中,不用像 3D 那样自己发射线
        sprite.setInteractive({ useHandCursor: true });
        sprite.on('pointerdown', () => this.tapPiece(seat, i));
        row.push({ sprite, seat, index: i });
      }
      this.pieces.push(row);
    }
  }

  /** 把整盘棋子摆到当前局面(不做动画)。开局、重连用 */
  private syncPieces(): void {
    for (let seat = 0; seat < SEATS; seat += 1) {
      for (let i = 0; i < PIECES_PER_SEAT; i += 1) {
        const step = this.state.board.pieces[seat][i];
        const cell = step === BASE ? VIEW_BASE_SLOTS[seat][i] : cellOfStep(seat, step);
        const { x, y } = this.toScreen(cell);
        this.pieces[seat][i].sprite.setPosition(x, y);
      }
    }
  }

  // -------------------------------------------------------------- 回合

  private beginTurn(): void {
    if (this.state.over) return this.showResult();
    this.busy = false;
    if (this.state.turn === this.seat) {
      this.setRollable(true);
      this.hintText.setText('轮到你了,掷骰子');
    } else {
      this.setRollable(false);
      this.hintText.setText(`${['红', '绿', '黄', '蓝'][this.state.turn]}方回合`);
      this.time.delayedCall(botThink(), () => this.botTurn());
    }
    this.refreshHud();
  }

  private rollDice(): void {
    if (this.busy || this.state.over || this.state.turn !== this.seat || this.state.dice.length) return;
    this.state = roll(this.state, Math.random, this.time.now);
    this.moves = currentMoves(this.state);
    this.setRollable(false);
    this.refreshHud();

    if (!this.moves.length) {
      // 掷不出能走的点是常态,不能卡住 —— 停一下让人看清点数再过
      this.hintText.setText('没有能走的棋子');
      this.time.delayedCall(900, () => this.finishTurn(pass(this.state, this.time.now)));
      return;
    }
    this.hintText.setText('点一颗棋子走');
    this.highlight();
  }

  private botTurn(): void {
    if (this.state.over || this.state.turn === this.seat) return;
    this.state = roll(this.state, Math.random, this.time.now);
    this.moves = currentMoves(this.state);
    this.refreshHud();
    if (!this.moves.length) {
      this.time.delayedCall(600, () => this.finishTurn(pass(this.state, this.time.now)));
      return;
    }
    // 「老手」档:能到家就到家,其次撞人,再次走得最远(DESIGN §11)
    let best = 0;
    let bestScore = -Infinity;
    this.moves.forEach((m, i) => {
      const v = (m.goal ? 1000 : 0) + m.hits.length * 200 + (m.to - m.from);
      if (v > bestScore) { bestScore = v; best = i; }
    });
    this.time.delayedCall(botThink(), () => this.commit(best));
  }

  private tapPiece(seat: number, index: number): void {
    if (this.busy || seat !== this.seat || !this.moves.length) return;
    const move = this.moves.findIndex((m) => m.piece === index);
    if (move >= 0) this.commit(move);
  }

  /** 执行第 index 条走法,并把动画演出来 */
  private commit(index: number): void {
    const move = this.moves[index];
    if (!move || this.busy) return;
    this.busy = true;
    this.clearHighlight();

    const seat = this.state.turn;
    const next = play(this.state, index, this.time.now);
    const sprite = this.pieces[seat][move.piece].sprite;

    // **一格一格走完,不能直接瞬移到落点。**
    // 玩家要靠数着格子过去确认这一步走对了;瞬移之后撞子会变得莫名其妙 ——
    // 明明看着没碰到,对方却回家了
    const path: Cell[] = [];
    if (move.from === BASE) path.push(cellOfStep(seat, 0));
    else for (let s = move.from + 1; s <= move.to; s += 1) path.push(this.cellOfPiece(seat, s));

    this.walk(sprite, path, () => {
      for (const hit of move.hits) this.knockBack(hit.seat, hit.piece);
      this.time.delayedCall(move.hits.length ? 460 : 120, () => this.finishTurn(next));
    });
  }

  private walk(sprite: Phaser.GameObjects.Image, path: Cell[], done: () => void): void {
    if (!path.length) return done();
    const targets = path.map((cell) => this.toScreen(cell));
    let i = 0;
    const step = () => {
      const t = targets[i];
      this.tweens.add({
        targets: sprite,
        x: t.x,
        y: t.y,
        duration: STEP_MS,
        ease: 'Sine.out',
        onComplete: () => {
          i += 1;
          if (i < targets.length) step();
          else done();
        },
      });
      // 一点抬起感,不然像在地上滑
      this.tweens.add({
        targets: sprite,
        scale: sprite.scale * 1.12,
        duration: STEP_MS / 2,
        yoyo: true,
      });
    };
    step();
  }

  private knockBack(seat: number, index: number): void {
    const sprite = this.pieces[seat][index].sprite;
    const home = this.toScreen(VIEW_BASE_SLOTS[seat][index]);
    this.cameras.main.shake(120, 0.004);
    this.tweens.add({
      targets: sprite,
      x: home.x,
      y: home.y,
      duration: 420,
      ease: 'Back.in',
    });
  }

  private finishTurn(next: GameState): void {
    this.state = next;
    this.moves = [];
    this.refreshHud();
    this.time.delayedCall(60, () => this.beginTurn());
  }

  /**
   * 四家的信息面板,**画在各自基地区块里**(对局稿 gameplay-competitor-layout-concept-v2)。
   *
   * 不做成棋盘外的卡片:稿子里头像、名字、分数条和那一排待出场的棋子是**同一块基地**的内容,
   * 摆到棋盘外就要为四个方位各设计一套对位关系,而且棋盘一缩放就会错开。
   * 画进同一张画布则天然跟着棋盘走。
   */
  private buildBasePanels(): void {
    for (let seat = 0; seat < SEATS; seat += 1) {
      const piecesRow = VIEW_BASE_SLOTS[seat][0][0];
      const col0 = VIEW_BASE_SLOTS[seat][0][1] - 0.65;
      const centerCol = col0 + 2.35;

      // 高亮底:轮到谁,谁的面板亮起来
      const glow = this.add.graphics().setDepth(4);
      this.panelGlows.push(glow);

      const face = this.toScreen([piecesRow - 2.15, centerCol]);
      const avatar = this.add
        .image(face.x, face.y, `ludo-face-${seat}`)
        .setDisplaySize(CELL * 1.7, CELL * 1.7)
        .setDepth(5);
      // 圆形裁切 + 白边,和稿子里的头像一致
      const mask = this.make.graphics({ x: 0, y: 0 }, false);
      mask.fillCircle(face.x, face.y, CELL * 0.85);
      avatar.setMask(mask.createGeometryMask());
      const ring = this.add.graphics().setDepth(5);
      ring.lineStyle(4, 0xffffff, 0.92);
      ring.strokeCircle(face.x, face.y, CELL * 0.85);

      const name = this.toScreen([piecesRow - 1.2, centerCol]);
      this.add.text(name.x, name.y, seat === this.seat ? '你' : ['红', '绿', '黄', '蓝'][seat], {
        fontFamily: 'system-ui, sans-serif', fontSize: '26px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(6);

      // 分数条
      const bar = this.toScreen([piecesRow - 0.72, centerCol]);
      const barW = CELL * 4.3;
      const barH = CELL * 0.62;
      const g = this.add.graphics().setDepth(5);
      g.fillStyle(0x000000, 0.34);
      g.fillRoundedRect(bar.x - barW / 2, bar.y - barH / 2, barW, barH, barH / 2);
      const score = this.add.text(bar.x, bar.y, '0', {
        fontFamily: 'system-ui, sans-serif', fontSize: '30px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(6);
      this.scoreTexts.push(score);
    }
  }

  // -------------------------------------------------------------- HUD

  private buildHud(): void {
    const font = { fontFamily: 'system-ui, sans-serif', color: '#ffffff' };

    this.clockText = this.add.text(GAME_WIDTH / 2, 60, '05:00', {
      ...font, fontSize: '46px', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.roundText = this.add.text(GAME_WIDTH / 2, 106, `Round 1/${MAX_ROUNDS}`, {
      ...font, fontSize: '22px', color: '#9fc6ff',
    }).setOrigin(0.5);

    this.hintText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 210, '', {
      ...font, fontSize: '24px', color: '#cfe9f7',
    }).setOrigin(0.5);

    // 骰子放在**自己基地内**(对局稿就是这么摆的),不在棋盘下方。
    // 好处是"轮到我了"和"我的骰子"在同一块区域,不用来回看
    const seatRow = VIEW_BASE_SLOTS[this.seat][0][0] + 1.45;
    const seatCol = VIEW_BASE_SLOTS[this.seat][0][1] + 1.6;
    for (let i = 0; i < 3; i += 1) {
      const at = this.toScreen([seatRow, seatCol + i * 1.25]);
      const die = this.add
        .image(at.x, at.y, TEX.die(1))
        .setDisplaySize(CELL * 1.05, CELL * 1.05)
        .setDepth(12)
        .setVisible(false);
      this.diceImages.push(die);
    }

    this.rollButton = this.makeButton(GAME_WIDTH / 2, GAME_HEIGHT - 84, '掷骰子', () => this.rollDice());
  }

  private makeButton(x: number, y: number, label: string, onClick: () => void): Phaser.GameObjects.Container {
    const bg = this.add.graphics();
    bg.fillStyle(0x22b455, 1);
    bg.fillRoundedRect(-120, -34, 240, 68, 20);
    bg.fillStyle(0x4ade80, 1);
    bg.fillRoundedRect(-116, -30, 232, 52, 18);
    const text = this.add.text(0, -4, label, {
      fontFamily: 'system-ui, sans-serif', fontSize: '30px', color: '#06301a', fontStyle: 'bold',
    }).setOrigin(0.5);
    const container = this.add.container(x, y, [bg, text]);
    container.setSize(240, 68);
    container.setInteractive(new Phaser.Geom.Rectangle(-120, -34, 240, 68), Phaser.Geom.Rectangle.Contains);
    container.on('pointerdown', onClick);
    return container;
  }

  private setRollable(on: boolean): void {
    this.rollButton.setAlpha(on ? 1 : 0.4);
    if (on) this.rollButton.setInteractive();
    else this.rollButton.disableInteractive();
  }

  private refreshHud(): void {
    const s = scores(this.state);
    this.scoreTexts.forEach((t, seat) => t.setText(String(s[seat])));
    this.roundText.setText(`Round ${Math.min(this.state.round, MAX_ROUNDS)}/${MAX_ROUNDS}`);

    const dice = this.state.dice;
    this.diceImages.forEach((die, i) => {
      const face = dice[i];
      die.setVisible(Boolean(face));
      if (face) die.setTexture(TEX.die(face));
    });
    // 骰子数会变(被撞过是三颗),在基地内居中排布
    const shown = dice.length || 0;
    const row = VIEW_BASE_SLOTS[this.seat][0][0] + 1.45;
    const col = VIEW_BASE_SLOTS[this.seat][0][1] + 1.6;
    this.diceImages.forEach((die, i) => {
      const at = this.toScreen([row, col + (i - (shown - 1) / 2) * 1.25]);
      die.setPosition(at.x, at.y);
    });
  }

  private highlight(): void {
    const set = new Set(this.moves.map((m) => m.piece));
    for (let i = 0; i < PIECES_PER_SEAT; i += 1) {
      const sprite = this.pieces[this.seat][i].sprite;
      if (!set.has(i)) continue;
      // 可走的棋子上下浮动 —— 比描边更容易在小屏上看见
      this.tweens.add({
        targets: sprite,
        y: sprite.y - 8,
        duration: 420,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut',
      });
    }
  }

  private clearHighlight(): void {
    for (const row of this.pieces) {
      for (const p of row) this.tweens.killTweensOf(p.sprite);
    }
    this.syncPieces();
  }

  private showResult(): void {
    const reason = this.state.over === 'timeup' ? '时间到'
      : this.state.over === 'rounds' ? '回合用尽' : '有人跑完了';
    this.setRollable(false);
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x041028, 0.82).setDepth(50);
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, reason, {
      fontFamily: 'system-ui, sans-serif', fontSize: '48px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(51);
  }

  update(): void {
    if (this.state.over) return;
    this.clockText.setText(mmss(timeLeft(this.state, this.time.now)));
    // 回合超时:自动走最保守的一步,免得四个人一起卡在某人身上
    if (this.state.dice.length && this.time.now > this.state.deadline + TURN_TIMEOUT_MS) {
      this.finishTurn(pass(this.state, this.time.now));
    }
  }
}

function mmss(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
