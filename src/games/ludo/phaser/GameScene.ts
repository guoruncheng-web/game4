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
  createGame, currentMoves, diceCount, pass, play, roll, scores, timeLeft,
} from '../sim/game';
import type { GameState } from '../sim/game';
import type { Move } from '../sim/rules';
import { BASE } from '../sim/rules';
import type { Cell } from '../sim/layout';
import { cellOfStep } from '../sim/layout';
import { BASE_ORIGIN, BOARD_PX, CELL_PX, FRAME_PX, PANEL, VIEW_BASE_SLOTS } from '../render/boardTexture';
import { LUDO_IMAGES } from '../assets';
import { TEX, buildTextures } from './textures';

/**
 * 画布的逻辑分辨率。**1080 而不是 720。**
 * 720 在 2 倍 DPR 的手机上要被放大到 ~860 物理像素,棋盘贴图(960)因此被重采样,
 * 表现是整张盘发虚 —— 截图放大之后特别明显。1080 之后基本是 1:1。
 */
export const GAME_WIDTH = 1080;
export const GAME_HEIGHT = 1920;

/** 棋盘在画布上的显示边长与中心。上面留给时钟,下面留给骰子 */
const BOARD_SIZE = 1035;
const BOARD_CX = GAME_WIDTH / 2;
const BOARD_CY = 900;
/**
 * 屏幕上一格的边长。**要扣掉金框** —— 贴图里格子区只占 `BOARD_PX - 2×FRAME_PX`,
 * 直接拿 BOARD_SIZE/15 会让所有棋子整体偏移半个框的距离。
 */
const SCALE = BOARD_SIZE / BOARD_PX;
const CELL = CELL_PX * SCALE;
const BOARD_ORIGIN = -BOARD_SIZE / 2 + FRAME_PX * SCALE;

/** 棋子走一格的时长。慢到能数清,快到不烦 */
const STEP_MS = 130;
/** 机器人思考时间:秒回像没在想,太慢让人等 */
const botThink = () => 600 + Math.random() * 600;

type PieceView = {
  sprite: Phaser.GameObjects.Image;
  /** 落地阴影。**留在地面**,棋子跳起时它只缩小不跟着走 */
  shadow: Phaser.GameObjects.Image;
  seat: number;
  index: number;
};

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

  /**
   * 头像走素材文件。**文件名从资源清单里取,不要在这里手写** ——
   * 之前写死成 `player-0N.png`,素材改名成 `player-0N-square-v2.png` 之后就静默 404,
   * 画面上是一圈黑色占位块,而控制台只有一条不起眼的加载失败。
   */
  preload(): void {
    for (let seat = 0; seat < SEATS; seat += 1) {
      const url = LUDO_IMAGES.find((f) => f.includes(`/avatars/player-0${seat + 1}`));
      if (url) this.load.image(`ludo-face-${seat}`, url);
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
      x: BOARD_CX + BOARD_ORIGIN + (col + 0.5) * CELL,
      y: BOARD_CY + BOARD_ORIGIN + (row + 0.5) * CELL,
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
        const shadow = this.add
          .image(0, 0, TEX.shadow)
          .setDisplaySize(CELL * 0.78, CELL * 0.34)
          .setDepth(9);
        const sprite = this.add
          .image(0, 0, TEX.pawn(seat))
          // **按高度缩放,并把锚点放在底座**(origin y = 0.82)。
          // 这样棋子是"站在格子上"、头伸到格外,和 UI 一致;
          // 用居中锚点的话棋子会陷进格子里,看着又小又扁
          .setOrigin(0.5, 0.82)
          .setDisplaySize(CELL * 0.94, CELL * 1.31)
          .setDepth(10);
        // 点棋子就是选一条走法。Phaser 自带命中,不用像 3D 那样自己发射线
        sprite.setInteractive({ useHandCursor: true });
        sprite.on('pointerdown', () => this.tapPiece(seat, i));
        row.push({ sprite, shadow, seat, index: i });
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
        const view = this.pieces[seat][i];
        view.sprite.setPosition(x, y);
        // 地面高度单独记着:棋子会被 tween 抬起来,阴影不能跟着抬
        view.sprite.setData('groundY', y);
        view.shadow.setPosition(x, y);
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
          sprite.setData('groundY', t.y);
          i += 1;
          if (i < targets.length) step();
          else done();
        },
      });
      // 一点抬起感,不然像在地上滑。
      // **不能动 scale** —— 棋子贴图是竖长的(宽高比不等),`scale` 会同时改 x/y,
      // 把棋子压变形。抬 y 既安全又更像"跳过去"
      this.tweens.add({
        targets: sprite,
        y: t.y - CELL * 0.22,
        duration: STEP_MS / 2,
        yoyo: true,
        ease: 'Sine.out',
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
      onUpdate: () => sprite.setData('groundY', sprite.y),
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
      const [r0, c0] = BASE_ORIGIN[seat];
      const centerCol = c0 + PANEL.centerCol;

      // 高亮底:轮到谁,谁的面板亮起来
      const glow = this.add.graphics().setDepth(4);
      this.panelGlows.push(glow);

      // 头像在**左上角**,名字在它右侧 —— 参考 UI 的排法。
      // 居中摆放会把名字挤到下面一行,基地里本来就只有 6 格高,行数越少越清楚
      const face = this.toScreen([r0 + PANEL.avatarRow, c0 + 1.3]);
      const hasFace = this.textures.exists(`ludo-face-${seat}`);
      const avatar = this.add
        .image(face.x, face.y, hasFace ? `ludo-face-${seat}` : TEX.pawn(seat))
        .setDisplaySize(CELL * PANEL.avatarSize, CELL * PANEL.avatarSize)
        .setDepth(5);
      const mask = this.make.graphics({ x: 0, y: 0 }, false);
      mask.fillCircle(face.x, face.y, CELL * PANEL.avatarSize * 0.5);
      avatar.setMask(mask.createGeometryMask());
      // 金色双层圆环,和棋盘的金边成一套
      const ring = this.add.graphics().setDepth(5);
      ring.lineStyle(CELL * 0.16, 0xd9a327, 1);
      ring.strokeCircle(face.x, face.y, CELL * PANEL.avatarSize * 0.52);
      ring.lineStyle(CELL * 0.06, 0x8a5f12, 0.9);
      ring.strokeCircle(face.x, face.y, CELL * PANEL.avatarSize * 0.58);

      const name = this.toScreen([r0 + PANEL.avatarRow, c0 + 3.9]);
      this.add.text(name.x, name.y, seat === this.seat ? '你' : ['红', '绿', '黄', '蓝'][seat], {
        fontFamily: 'system-ui, sans-serif', fontSize: `${Math.round(CELL * 0.58)}px`,
        color: '#ffffff', fontStyle: 'bold', stroke: '#00000055', strokeThickness: 4,
      }).setOrigin(0.5).setDepth(6);

      // 分数条:**明显比底色深**。同色暗一档会糊成一片,参考 UI 用的是近黑的同色
      const bar = this.toScreen([r0 + PANEL.scoreRow, centerCol]);
      const barW = CELL * 4.5;
      const barH = CELL * PANEL.scoreHeight;
      const g = this.add.graphics().setDepth(5);
      g.fillStyle(0x000000, 0.46);
      g.fillRoundedRect(bar.x - barW / 2, bar.y - barH / 2, barW, barH, barH / 2);
      g.lineStyle(3, 0x000000, 0.3);
      g.strokeRoundedRect(bar.x - barW / 2, bar.y - barH / 2, barW, barH, barH / 2);
      const score = this.add.text(bar.x, bar.y, '0', {
        fontFamily: 'system-ui, sans-serif', fontSize: `${Math.round(CELL * 0.78)}px`,
        color: '#ffffff', fontStyle: 'bold',
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
    const seatRow = BASE_ORIGIN[this.seat][0] + PANEL.diceRow;
    const seatCol = BASE_ORIGIN[this.seat][1] + PANEL.centerCol;
    for (let i = 0; i < 3; i += 1) {
      const at = this.toScreen([seatRow, seatCol + (i - 1) * (PANEL.diceSize + 0.22)]);
      const die = this.add
        .image(at.x, at.y, TEX.die(1))
        .setDisplaySize(CELL * PANEL.diceSize, CELL * PANEL.diceSize)
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

    // **骰子常驻**:没掷之前也摆在那儿(暗一点),掷完才亮起来。
    // 整个消失的话,轮到自己时画面上会凭空冒出两颗骰子,而且新玩家不知道该点哪儿
    const dice = this.state.dice;
    const count = dice.length || diceCount(this.state, this.seat);
    this.diceImages.forEach((die, i) => {
      die.setVisible(i < count);
      if (dice[i]) die.setTexture(TEX.die(dice[i])).setAlpha(1);
      else die.setAlpha(0.78);
    });
    // 骰子数会变(被撞过是三颗),在基地内居中排布
    const shown = count;
    const row = BASE_ORIGIN[this.seat][0] + PANEL.diceRow;
    const col = BASE_ORIGIN[this.seat][1] + PANEL.centerCol;
    this.diceImages.forEach((die, i) => {
      const at = this.toScreen([row, col + (i - (shown - 1) / 2) * (PANEL.diceSize + 0.22)]);
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
        y: sprite.y - CELL * 0.18,
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
    // syncPieces 会把 groundY 一并重置 —— 高亮的浮动是"离地",不是换格子,
    // 停掉之后必须回到真实位置,否则阴影会停在半空
    this.syncPieces();
  }

  /** 阴影跟着棋子的 x 走,但留在地面;离地越高越小越淡 —— 这就是"跳起来"的观感来源 */
  private syncShadows(): void {
    for (const row of this.pieces) {
      for (const { sprite, shadow } of row) {
        const ground = (sprite.getData('groundY') as number | undefined) ?? sprite.y;
        const lift = Math.max(0, ground - sprite.y);
        const k = Math.max(0.55, 1 - lift / (CELL * 1.2));
        shadow.setPosition(sprite.x, ground);
        shadow.setDisplaySize(CELL * 0.78 * k, CELL * 0.34 * k);
        shadow.setAlpha(0.35 + 0.45 * k);
      }
    }
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
    this.syncShadows();
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
