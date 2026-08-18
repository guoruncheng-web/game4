import * as Phaser from 'phaser';
import { planShot } from '../ai';
import {
  BALL_R, BREAK_SPOT, DIFFICULTIES, GAME_WIDTH, PALETTE,
  type Difficulty,
} from '../config';
import {
  advance, cloneBalls, emptyOutcome, isFreeSpot, nearestFreeSpot, strike, TABLE_BOUNDS,
  type Ball, type ShotEvent, type ShotOutcome,
} from '../physics';
import {
  applyJudgement, ballGroup, createMatch, judgeShot, remainingOf,
  type MatchState, type Player,
} from '../rules';
import { sfx } from '../sfx';
import { createRack, respotEight } from '../table';
import { drawPlacementHint, drawTable, isInKitchen, KITCHEN_TOP } from '../table-view';
import { ballTexture } from '../textures';

/** 出杆力度条:整条横在底部,按下去就是选力度,松手即出杆 */
const POWER_BAR = { x: 62, y: 902, width: GAME_WIDTH - 124, height: 26, zoneTop: 872 };

type Phase = 'placing' | 'aiming' | 'charging' | 'rolling' | 'cpu' | 'over';

export type PoolOverData = {
  winner: Player;
  reason: string;
  difficulty: Difficulty;
  /** 玩家打进了几颗自己的球,用来在结算页夸一句 */
  potted: number;
};

export class GameScene extends Phaser.Scene {
  private difficulty: Difficulty = 'pro';
  private balls: Ball[] = [];
  private ballsBefore: Ball[] = [];
  private sprites = new Map<number, Phaser.GameObjects.Image>();
  private state: MatchState = createMatch();
  private phase: Phase = 'placing';
  private outcome: ShotOutcome = emptyOutcome();
  private shotEvents: ShotEvent[] = [];
  /** 本杆已经滚了多久,用来兜底 */
  private rollingSeconds = 0;
  /** 是不是用空格在蓄力(和拖力度条区分开) */
  private keyCharging = false;

  private aimAngle = -Math.PI / 2;
  private power = 0;
  private aimGraphics!: Phaser.GameObjects.Graphics;
  private hintGraphics!: Phaser.GameObjects.Graphics;
  private powerGraphics!: Phaser.GameObjects.Graphics;
  private cueStick!: Phaser.GameObjects.Image;

  private youText!: Phaser.GameObjects.Text;
  private cpuText!: Phaser.GameObjects.Text;
  private youGroupText!: Phaser.GameObjects.Text;
  private cpuGroupText!: Phaser.GameObjects.Text;
  private messageText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private turnMarker!: Phaser.GameObjects.Graphics;

  /** 玩家这一局打进了多少自己的球,纯粹用于结算页 */
  private pottedByPlayer = 0;

  constructor() { super('PoolGame'); }

  init(data: { difficulty?: Difficulty }) {
    this.difficulty = data?.difficulty ?? 'pro';
  }

  create() {
    this.balls = createRack();
    this.state = createMatch('you');
    this.outcome = emptyOutcome();
    this.pottedByPlayer = 0;
    this.power = 0;
    this.aimAngle = -Math.PI / 2;

    this.cameras.main.setBackgroundColor('#0d1a14');
    drawTable(this);
    this.hintGraphics = this.add.graphics().setDepth(1);
    this.aimGraphics = this.add.graphics().setDepth(20);
    this.cueStick = this.add.image(0, 0, 'pb-cue').setOrigin(0, 0.5).setDepth(24).setVisible(false);
    this.powerGraphics = this.add.graphics().setDepth(30);

    for (const ball of this.balls) {
      const sprite = this.add.image(ball.x, ball.y, ballTexture(ball.id))
        .setDisplaySize(BALL_R * 2, BALL_R * 2)
        .setDepth(ball.id === 0 ? 12 : 10);
      this.sprites.set(ball.id, sprite);
    }

    this.createHud();
    this.bindInput();

    // 开球:母球放在开球区里,由玩家自己挑位置
    this.enterPlacing(true);
    this.setMessage('Place the cue ball, then break', PALETTE.chalk);

    this.shotEvents.length = 0;
    this.game.events.on(Phaser.Core.Events.BLUR, this.onBlur, this);

    // 场景重启时把监听全摘掉,否则旧场景的回调还挂在 game.events 上
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.removeAllListeners();
      this.input.keyboard?.removeAllListeners();
      this.game.events.off(Phaser.Core.Events.BLUR, this.onBlur, this);
      this.sprites.clear();
    });
  }

  private onBlur() {
    // 切后台时正在瞄准就把力度清零,回来不会莫名其妙自己出一杆
    if (this.phase === 'charging') {
      this.power = 0;
      this.keyCharging = false;
      this.phase = 'aiming';
      this.refreshAim();
    }
  }

  update(_time: number, delta: number) {
    if (this.phase === 'charging' && this.keyCharging) {
      // 空格是按住蓄力:力度从 0 涨到满大约 1 秒,松开出杆
      this.power = Math.min(1, this.power + delta / 950);
      this.refreshAim();
      return;
    }
    if (this.phase !== 'rolling') return;
    this.shotEvents.length = 0;
    const rest = advance(this.balls, delta / 1000, this.outcome, this.shotEvents);
    this.playEvents();
    this.syncSprites();
    this.rollingSeconds += delta / 1000;
    // 兜底:理论上摩擦一定会让球停下,但万一出现互相顶住的极端情形,
    // 这里强行收杆,总比整局卡死强
    if (!rest && this.rollingSeconds > 22) {
      for (const ball of this.balls) { ball.vx = 0; ball.vy = 0; }
      this.finishShot();
      return;
    }
    if (rest) this.finishShot();
  }

  // ---------- 画面 ----------

  private createHud() {
    this.add.rectangle(GAME_WIDTH / 2, 58, GAME_WIDTH - 24, 84, 0x102019, 0.9)
      .setStrokeStyle(1, 0x2f5c46, 1).setDepth(5);

    this.youText = this.add.text(52, 40, 'YOU', {
      fontFamily: 'system-ui, sans-serif', fontSize: '22px', fontStyle: 'bold', color: PALETTE.chalk,
    }).setOrigin(0, 0.5).setDepth(6);
    this.youGroupText = this.add.text(52, 68, 'open table', {
      fontFamily: 'system-ui, sans-serif', fontSize: '15px', color: PALETTE.dim,
    }).setOrigin(0, 0.5).setDepth(6);

    this.cpuText = this.add.text(GAME_WIDTH - 52, 40, 'CPU', {
      fontFamily: 'system-ui, sans-serif', fontSize: '22px', fontStyle: 'bold', color: PALETTE.chalk,
    }).setOrigin(1, 0.5).setDepth(6);
    this.cpuGroupText = this.add.text(GAME_WIDTH - 52, 68, 'open table', {
      fontFamily: 'system-ui, sans-serif', fontSize: '15px', color: PALETTE.dim,
    }).setOrigin(1, 0.5).setDepth(6);

    this.turnMarker = this.add.graphics().setDepth(6);

    this.messageText = this.add.text(GAME_WIDTH / 2, 58, '', {
      fontFamily: 'system-ui, sans-serif', fontSize: '17px', fontStyle: 'bold',
      color: PALETTE.gold, align: 'center', wordWrap: { width: 200 },
    }).setOrigin(0.5).setDepth(7);

    this.hintText = this.add.text(GAME_WIDTH / 2, 940, 'DRAG TO SET POWER · RELEASE TO SHOOT', {
      fontFamily: 'system-ui, sans-serif', fontSize: '13px', color: PALETTE.dim,
    }).setOrigin(0.5).setDepth(31);

    // 左上角的返回按钮是页面上的 DOM,不在画布里,所以暂停按钮放右上角避开它
    const pause = this.add.text(GAME_WIDTH - 22, 112, 'MENU', {
      fontFamily: 'system-ui, sans-serif', fontSize: '14px', fontStyle: 'bold', color: PALETTE.dim,
    }).setOrigin(1, 0.5).setDepth(31).setInteractive({ useHandCursor: true });
    pause.on('pointerup', () => { sfx.ui(); this.scene.start('PoolMenu'); });

    this.refreshHud();
  }

  private refreshHud() {
    const you = this.state.groups.you;
    const cpu = this.state.groups.cpu;
    this.youGroupText.setText(this.groupLabel('you', you));
    this.cpuGroupText.setText(this.groupLabel('cpu', cpu));

    this.turnMarker.clear();
    const active = this.state.turn === 'you' ? 46 : GAME_WIDTH - 46;
    this.turnMarker.fillStyle(0x6fe3a8, 1).fillCircle(active, 40, 5);
  }

  private groupLabel(player: Player, group: string | null) {
    if (this.state.winner) return '';
    if (!group) return 'open table';
    const left = remainingOf(this.balls, group as 'solids' | 'stripes');
    if (left === 0) return 'on the 8';
    return `${group} · ${left} left`;
  }

  private setMessage(text: string, color: string = PALETTE.gold) {
    this.messageText.setText(text).setColor(color);
  }

  private syncSprites() {
    for (const ball of this.balls) {
      const sprite = this.sprites.get(ball.id);
      if (!sprite) continue;
      if (ball.potted) {
        if (sprite.visible) {
          sprite.setVisible(false);
          this.flashPocket(sprite.x, sprite.y);
        }
        continue;
      }
      if (!sprite.visible) sprite.setVisible(true).setScale(1).setAlpha(1);
      sprite.setPosition(ball.x, ball.y);
      sprite.setDisplaySize(BALL_R * 2, BALL_R * 2);
    }
  }

  private flashPocket(x: number, y: number) {
    const glow = this.add.image(x, y, 'pb-glow').setDisplaySize(44, 44).setDepth(14).setAlpha(0.8);
    this.tweens.add({
      targets: glow, alpha: 0, scale: 1.6, duration: 260,
      onComplete: () => glow.destroy(),
    });
  }

  private playEvents() {
    // 一帧里可能攒了十几次碰撞,全播就是一团糊。只挑最响的两下
    let loudestCollide = 0;
    let loudestCushion = 0;
    let potted = false;
    for (const event of this.shotEvents) {
      if (event.type === 'collide') loudestCollide = Math.max(loudestCollide, event.speed);
      else if (event.type === 'cushion') loudestCushion = Math.max(loudestCushion, event.speed);
      else potted = true;
    }
    if (loudestCollide > 20) sfx.collide(loudestCollide);
    if (loudestCushion > 40) sfx.cushion(loudestCushion);
    if (potted) sfx.pot();
  }

  // ---------- 瞄准与出杆 ----------

  private cueBall() {
    return this.balls.find((b) => b.id === 0)!;
  }

  private refreshAim() {
    const g = this.aimGraphics;
    g.clear();
    const cue = this.cueBall();
    if (this.phase === 'rolling' || this.phase === 'over' || cue.potted) {
      this.cueStick.setVisible(false);
      this.drawPowerBar();
      return;
    }

    const dx = Math.cos(this.aimAngle);
    const dy = Math.sin(this.aimAngle);
    const trace = this.traceAim(cue, dx, dy);

    // 主瞄准线
    g.lineStyle(1.6, 0xffffff, 0.75);
    g.lineBetween(cue.x, cue.y, trace.x, trace.y);
    // 假想球:母球停在这个位置时正好吃到目标球
    g.lineStyle(1.4, 0xffffff, 0.55);
    g.strokeCircle(trace.x, trace.y, BALL_R);
    if (trace.ball) {
      // 目标球的去向,这是能不能进袋的关键信息
      g.lineStyle(2, 0x6fe3a8, 0.85);
      g.lineBetween(trace.ball.x, trace.ball.y, trace.ball.x + trace.outX * 66, trace.ball.y + trace.outY * 66);
    }

    // 球杆:力度越大拉得越靠后
    const gap = BALL_R + 8 + this.power * 46;
    this.cueStick
      .setVisible(this.phase !== 'placing')
      .setPosition(cue.x - dx * gap, cue.y - dy * gap)
      .setRotation(this.aimAngle + Math.PI)
      .setDisplaySize(300, 12);

    this.drawPowerBar();
  }

  /**
   * 从母球沿瞄准方向找第一个障碍:球或者库边。
   * 用解析求交而不是拿物理内核跑一遍 —— 每帧都要算,而且玩家要的就是"直线打过去会先碰到谁"。
   */
  private traceAim(cue: Ball, dx: number, dy: number) {
    let bestT = Infinity;
    let hit: Ball | null = null;
    const diameter = BALL_R * 2;
    for (const ball of this.balls) {
      if (ball.potted || ball.id === 0) continue;
      const fx = ball.x - cue.x;
      const fy = ball.y - cue.y;
      const b = fx * dx + fy * dy;
      if (b <= 0) continue;
      const c = fx * fx + fy * fy - diameter * diameter;
      const disc = b * b - c;
      if (disc < 0) continue;
      const t = b - Math.sqrt(disc);
      if (t < 0 || t >= bestT) continue;
      bestT = t;
      hit = ball;
    }

    let wallT = Infinity;
    if (dx > 0) wallT = Math.min(wallT, (TABLE_BOUNDS.right - cue.x) / dx);
    if (dx < 0) wallT = Math.min(wallT, (TABLE_BOUNDS.left - cue.x) / dx);
    if (dy > 0) wallT = Math.min(wallT, (TABLE_BOUNDS.bottom - cue.y) / dy);
    if (dy < 0) wallT = Math.min(wallT, (TABLE_BOUNDS.top - cue.y) / dy);

    if (hit && bestT <= wallT) {
      const x = cue.x + dx * bestT;
      const y = cue.y + dy * bestT;
      const len = Math.hypot(hit.x - x, hit.y - y) || 1;
      return { x, y, ball: hit, outX: (hit.x - x) / len, outY: (hit.y - y) / len };
    }
    const t = Number.isFinite(wallT) ? wallT : 0;
    return { x: cue.x + dx * t, y: cue.y + dy * t, ball: null as Ball | null, outX: 0, outY: 0 };
  }

  private drawPowerBar() {
    const g = this.powerGraphics;
    g.clear();
    const usable = this.phase === 'aiming' || this.phase === 'charging';
    g.fillStyle(0x0d1a14, 0.9);
    g.fillRoundedRect(POWER_BAR.x - 6, POWER_BAR.y - 6, POWER_BAR.width + 12, POWER_BAR.height + 12, 8);
    g.lineStyle(1, usable ? 0x3f7a5f : 0x24382e, 1);
    g.strokeRoundedRect(POWER_BAR.x - 6, POWER_BAR.y - 6, POWER_BAR.width + 12, POWER_BAR.height + 12, 8);
    if (this.power > 0) {
      // 力度越大越红,不用看数字也知道自己在打多重
      const color = Phaser.Display.Color.Interpolate.ColorWithColor(
        new Phaser.Display.Color(0x6fe3a8), new Phaser.Display.Color(0xff5a3c), 100, this.power * 100,
      );
      g.fillStyle(Phaser.Display.Color.GetColor(color.r, color.g, color.b), usable ? 1 : 0.4);
      g.fillRoundedRect(POWER_BAR.x, POWER_BAR.y, Math.max(6, POWER_BAR.width * this.power), POWER_BAR.height, 5);
    }
    for (let i = 1; i < 4; i++) {
      g.lineStyle(1, 0xffffff, 0.12);
      const x = POWER_BAR.x + (POWER_BAR.width * i) / 4;
      g.lineBetween(x, POWER_BAR.y + 3, x, POWER_BAR.y + POWER_BAR.height - 3);
    }
  }

  private bindInput() {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.onPointerDown(pointer));
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => this.onPointerMove(pointer));
    this.input.on('pointerup', () => this.onPointerUp());
    this.input.on('pointerupoutside', () => this.onPointerUp());

    // 桌面端:方向键微调角度,空格蓄力
    const keyboard = this.input.keyboard;
    keyboard?.on('keydown-LEFT', () => this.nudgeAim(-0.012));
    keyboard?.on('keydown-RIGHT', () => this.nudgeAim(0.012));
    keyboard?.on('keydown-SPACE', () => {
      if (this.phase !== 'aiming') return;
      this.phase = 'charging';
      this.keyCharging = true;
      this.power = 0;
      this.refreshAim();
    });
    keyboard?.on('keyup-SPACE', () => {
      if (this.phase !== 'charging' || !this.keyCharging) return;
      this.keyCharging = false;
      if (this.power < 0.04) { this.phase = 'aiming'; this.refreshAim(); return; }
      this.shoot();
    });
  }

  private nudgeAim(delta: number) {
    if (this.phase !== 'aiming' && this.phase !== 'charging') return;
    this.aimAngle += delta;
    this.refreshAim();
  }

  private onPointerDown(pointer: Phaser.Input.Pointer) {
    if (this.phase === 'placing') {
      this.tryPlaceCue(pointer.x, pointer.y);
      return;
    }
    if (this.phase !== 'aiming') return;
    if (pointer.y >= POWER_BAR.zoneTop) {
      this.phase = 'charging';
      this.setPowerFromPointer(pointer.x);
      return;
    }
    this.aimAt(pointer.x, pointer.y);
  }

  private onPointerMove(pointer: Phaser.Input.Pointer) {
    if (!pointer.isDown) return;
    if (this.phase === 'placing') { this.tryPlaceCue(pointer.x, pointer.y); return; }
    if (this.phase === 'charging') { this.setPowerFromPointer(pointer.x); return; }
    if (this.phase === 'aiming' && pointer.y < POWER_BAR.zoneTop) this.aimAt(pointer.x, pointer.y);
  }

  private onPointerUp() {
    if (this.phase === 'placing') { this.commitPlacement(); return; }
    if (this.phase === 'charging') {
      if (this.power < 0.04) { this.phase = 'aiming'; this.power = 0; this.refreshAim(); return; }
      this.shoot();
    }
  }

  private aimAt(x: number, y: number) {
    const cue = this.cueBall();
    if (Math.hypot(x - cue.x, y - cue.y) < 6) return;
    this.aimAngle = Math.atan2(y - cue.y, x - cue.x);
    this.refreshAim();
  }

  private setPowerFromPointer(x: number) {
    this.power = Phaser.Math.Clamp((x - POWER_BAR.x) / POWER_BAR.width, 0, 1);
    this.refreshAim();
  }

  private shoot() {
    if (this.phase !== 'charging' && this.phase !== 'aiming') return;
    const cue = this.cueBall();
    if (cue.potted) return;
    this.ballsBefore = cloneBalls(this.balls);
    this.outcome = emptyOutcome();
    strike(cue, this.aimAngle, this.power);
    sfx.cue(this.power);
    this.phase = 'rolling';
    this.rollingSeconds = 0;
    this.keyCharging = false;
    this.setMessage('');
    this.cueStick.setVisible(false);
    this.aimGraphics.clear();
    this.hintGraphics.clear();
    this.hintText.setText('');
    this.power = 0;
    this.drawPowerBar();
  }

  // ---------- 自由球 ----------

  private enterPlacing(kitchenOnly: boolean) {
    this.phase = 'placing';
    const cue = this.cueBall();
    cue.potted = false;
    cue.vx = 0;
    cue.vy = 0;
    if (kitchenOnly) {
      cue.x = BREAK_SPOT.x;
      cue.y = BREAK_SPOT.y;
    } else {
      const spot = nearestFreeSpot(this.balls, cue.x, cue.y, 0);
      cue.x = spot.x;
      cue.y = spot.y;
    }
    this.sprites.get(0)?.setVisible(true).setPosition(cue.x, cue.y);
    drawPlacementHint(this.hintGraphics, kitchenOnly);
    this.hintText.setText(kitchenOnly ? 'DRAG THE CUE BALL INSIDE THE LINE' : 'BALL IN HAND · DRAG THE CUE BALL');
    this.refreshAim();
  }

  private tryPlaceCue(x: number, y: number) {
    const cue = this.cueBall();
    const kitchenOnly = !this.state.broken;
    const clampedX = Phaser.Math.Clamp(x, TABLE_BOUNDS.left, TABLE_BOUNDS.right);
    const clampedY = Phaser.Math.Clamp(
      y,
      kitchenOnly ? KITCHEN_TOP + BALL_R : TABLE_BOUNDS.top,
      TABLE_BOUNDS.bottom,
    );
    if (kitchenOnly && !isInKitchen(clampedY)) return;
    const spot = isFreeSpot(this.balls, clampedX, clampedY, 0)
      ? { x: clampedX, y: clampedY }
      : nearestFreeSpot(this.balls, clampedX, clampedY, 0);
    cue.x = spot.x;
    cue.y = spot.y;
    this.sprites.get(0)?.setPosition(cue.x, cue.y);
    this.refreshAim();
  }

  /** 松手 = 位置定了。手机上不再要求额外点一次确认 */
  private commitPlacement() {
    this.phase = 'aiming';
    this.hintGraphics.clear();
    this.hintText.setText('DRAG TO SET POWER · RELEASE TO SHOOT');
    this.state.ballInHand = false;
    this.setMessage(this.state.broken ? 'Your shot' : 'Break them', PALETTE.chalk);
    this.refreshAim();
  }

  // ---------- 回合流转 ----------

  private finishShot() {
    const judged = judgeShot(this.state, this.ballsBefore, this.outcome);
    const shooter = this.state.turn;

    if (judged.respotEight) respotEight(this.balls);
    if (shooter === 'you') {
      const group = this.state.groups.you ?? judged.assigned;
      this.pottedByPlayer += this.outcome.potted.filter(
        (id) => id !== 0 && id !== 8 && (!group || ballGroup(id) === group),
      ).length;
    }

    applyJudgement(this.state, judged);
    this.syncSprites();
    this.refreshHud();

    if (judged.foul) sfx.foul();

    if (this.state.winner) {
      this.phase = 'over';
      this.endMatch();
      return;
    }

    this.setMessage(judged.message, judged.foul ? PALETTE.danger : PALETTE.gold);

    if (this.state.turn === 'you') {
      if (this.state.ballInHand) this.enterPlacing(false);
      else {
        this.phase = 'aiming';
        this.hintText.setText('DRAG TO SET POWER · RELEASE TO SHOOT');
        this.refreshAim();
      }
    } else {
      this.startCpuTurn();
    }
  }

  private startCpuTurn() {
    this.phase = 'cpu';
    this.hintText.setText('');
    this.setMessage('CPU is lining up…', PALETTE.dim);
    this.refreshAim();

    // 试算只要几毫秒,这里的延迟纯粹是给玩家一个"对手在想"的节奏
    this.time.delayedCall(620, () => {
      if (this.phase !== 'cpu') return;
      const plan = planShot(this.balls, this.state, DIFFICULTIES[this.difficulty]);
      const cue = this.cueBall();
      if (this.state.ballInHand || cue.potted) {
        // planShot 挑不出理想摆位时 placeCue 是 null,这时也必须把母球放回台面,
        // 否则 shoot() 会因为"母球还在袋里"直接返回,这一回合就永远卡住了
        const spot = plan.placeCue ?? nearestFreeSpot(this.balls, BREAK_SPOT.x, BREAK_SPOT.y, 0);
        cue.potted = false;
        cue.x = spot.x;
        cue.y = spot.y;
        cue.vx = 0;
        cue.vy = 0;
        this.state.ballInHand = false;
        this.sprites.get(0)?.setVisible(true).setPosition(cue.x, cue.y);
      }
      this.aimAngle = plan.angle;
      this.power = plan.power;
      this.refreshAim();
      this.time.delayedCall(520, () => {
        if (this.phase !== 'cpu') return;
        this.phase = 'charging';
        this.shoot();
      });
    });
  }

  private endMatch() {
    const won = this.state.winner === 'you';
    if (won) sfx.win(); else sfx.lose();
    this.setMessage(won ? 'YOU WIN' : 'CPU WINS', won ? PALETTE.gold : PALETTE.danger);
    this.time.delayedCall(900, () => {
      const data: PoolOverData = {
        winner: this.state.winner ?? 'cpu',
        reason: this.state.endReason,
        difficulty: this.difficulty,
        potted: this.pottedByPlayer,
      };
      this.scene.start('PoolOver', data);
    });
  }
}
