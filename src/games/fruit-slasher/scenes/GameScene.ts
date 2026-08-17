import * as Phaser from 'phaser';
import { createBackground } from '../background';
import {
  DIFFICULTIES,
  difficultyAt,
  FRUIT_COLORS,
  FRUIT_KINDS,
  FRUIT_RADII,
  GAME_HEIGHT,
  GAME_WIDTH,
  GAMEPLAY,
  MODES,
  PALETTE,
  type DifficultyId,
  type DifficultySpec,
  type FruitKind,
  type GameMode,
  type ModeSpec,
} from '../config';
import { sfx } from '../sfx';
import { fruitHalfTexture, fruitTexture } from '../textures';

type Target = Phaser.Types.Physics.Arcade.ImageWithDynamicBody;
type SlashPoint = { x: number; y: number; time: number };

export type GameOverData = {
  score: number;
  sliced: number;
  bestCombo: number;
  reason: 'miss' | 'bomb' | 'time';
  mode: GameMode;
  difficulty: DifficultyId;
  /** 撑到时间结束 = 完成一局,经典模式永远是 false */
  completed: boolean;
};

export class GameScene extends Phaser.Scene {
  private targets!: Phaser.Physics.Arcade.Group;
  private halves!: Phaser.Physics.Arcade.Group;
  private slash!: Phaser.GameObjects.Graphics;
  private scoreText!: Phaser.GameObjects.Text;
  private lifeIcons: Phaser.GameObjects.Image[] = [];
  private points: SlashPoint[] = [];
  private previousPoint: Phaser.Math.Vector2 | null = null;
  private spawnTimer?: Phaser.Time.TimerEvent;
  private startedAt = 0;
  private score = 0;
  private lives: number = DIFFICULTIES.standard.lives;
  private strokeHits = 0;
  private sliced = 0;
  private bestCombo = 0;
  private ending = false;
  private bombInPreviousWave = false;
  private rng = new Phaser.Math.RandomDataGenerator();

  private mode: GameMode = 'classic';
  private modeSpec: ModeSpec = MODES.classic;
  private difficulty: DifficultyId = 'standard';
  private diff: DifficultySpec = DIFFICULTIES.standard;
  private juiceEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private confetti!: Phaser.GameObjects.Particles.ParticleEmitter;
  private floatPool: Phaser.GameObjects.Text[] = [];
  private floatCursor = 0;
  /** 正在挥刀的那根手指;null = 没有 */
  private strokePointer: number | null = null;
  private lastMoveAt = 0;
  private timerText?: Phaser.GameObjects.Text;
  /** 限时模式的剩余毫秒;非限时模式为 null */
  private remainMs: number | null = null;
  private pausedAt = 0;

  constructor() { super('FruitGame'); }

  init(data: { mode?: GameMode; difficulty?: DifficultyId }) {
    this.mode = data?.mode && MODES[data.mode] ? data.mode : 'classic';
    this.modeSpec = MODES[this.mode];
    this.difficulty = data?.difficulty && DIFFICULTIES[data.difficulty] ? data.difficulty : 'standard';
    this.diff = DIFFICULTIES[this.difficulty];
  }

  create() {
    this.resetState();
    createBackground(this);
    this.targets = this.physics.add.group();
    this.halves = this.physics.add.group();
    this.slash = this.add.graphics().setDepth(80);
    this.createFxPools();
    this.createHud();
    this.bindInput();
    this.startedAt = this.time.now;
    this.scheduleWave(500);
    this.cameras.main.fadeIn(220, 7, 19, 38);

    const guide = this.add.text(GAME_WIDTH / 2, 390, '按住并滑动切水果', {
      fontFamily: 'system-ui, sans-serif', fontSize: '25px', fontStyle: 'bold', color: '#bfd7de',
      stroke: '#071326', strokeThickness: 5,
    }).setOrigin(0.5).setDepth(100);
    this.tweens.add({ targets: guide, alpha: 0, delay: 2600, duration: 600, onComplete: () => guide.destroy() });

    this.input.keyboard?.on('keydown-P', () => this.pauseGame());
    this.input.keyboard?.on('keydown-ESC', () => this.pauseGame());
    // 场景暂停时 Clock.now 不推进,恢复那一帧却会跳到当前时间,
    // startedAt 是绝对时间戳,不补偿的话难度曲线会直接跳过暂停时长。
    this.events.on(Phaser.Scenes.Events.PAUSE, () => { this.pausedAt = this.game.loop.time; });
    this.events.on(Phaser.Scenes.Events.RESUME, () => { this.startedAt += this.game.loop.time - this.pausedAt; });
    const onGameResume = (pauseDuration: number) => { this.startedAt += pauseDuration; };
    this.game.events.on(Phaser.Core.Events.RESUME, onGameResume);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.spawnTimer?.remove(false);
      this.input.removeAllListeners();
      this.input.keyboard?.removeAllListeners();
      this.events.off(Phaser.Scenes.Events.PAUSE);
      this.events.off(Phaser.Scenes.Events.RESUME);
      this.game.events.off(Phaser.Core.Events.RESUME, onGameResume);
      this.points = [];
      this.previousPoint = null;
    });
  }

  update(time: number, delta: number) {
    if (this.ending) return;
    if (this.remainMs !== null) {
      this.remainMs -= delta;
      this.refreshTimer();
      if (this.remainMs <= 0) { this.endFromTime(); return; }
    }
    // 轨迹静止一段时间就自然断刀。没有这条的话按住不放能把整局切中数攒成一个
    // 巨型 combo,结束时一次性结算,总分直接翻倍,连击数也失去可比性。
    if (this.strokeHits > 0 && time - this.lastMoveAt > GAMEPLAY.strokeIdleMs) this.finishStroke();
    this.points = this.points.filter((point) => time - point.time <= GAMEPLAY.slashPointLifeMs);
    this.drawSlash(time);

    for (const child of this.targets.getChildren()) {
      const target = child as Target;
      if (!target.active || target.y <= GAMEPLAY.missY || target.body.velocity.y <= 0) continue;
      const isBomb = target.getData('isBomb') === true;
      this.retire(target);
      if (!isBomb) this.missFruit();
    }
    for (const child of this.halves.getChildren()) {
      const half = child as Target;
      if (half.active && half.y > GAME_HEIGHT + 150) half.destroy();
    }
  }

  private resetState() {
    this.score = 0;
    this.lives = this.diff.lives;
    this.strokeHits = 0;
    this.sliced = 0;
    this.bestCombo = 0;
    this.ending = false;
    this.bombInPreviousWave = false;
    this.points = [];
    this.previousPoint = null;
    this.lifeIcons = [];
    this.pausedAt = 0;
    this.floatCursor = 0;
    this.strokePointer = null;
    this.lastMoveAt = 0;
    this.remainMs = this.modeSpec.seconds === null ? null : this.modeSpec.seconds * 1000;
  }

  private createHud() {
    // 全屏使用 ENVELOP，长屏设备会裁掉逻辑画布左右两侧。
    // 分数固定在中央安全区，避免裁切后落入左上角返回按钮范围。
    this.scoreText = this.add.text(GAME_WIDTH / 2, 22, '0', {
      fontFamily: 'system-ui, sans-serif', fontSize: '60px', fontStyle: 'bold', color: PALETTE.cream,
      stroke: '#071326', strokeThickness: 7,
    }).setOrigin(0.5, 0).setDepth(110);

    // 只有会扣命的模式才画命数图标,不然玩家会以为漏水果有惩罚
    if (this.modeSpec.missCostsLife) {
      for (let i = 0; i < this.diff.lives; i++) {
        this.lifeIcons.push(
          this.add.image(GAME_WIDTH - 28 - i * 39, 51, 'fs-life').setDisplaySize(34, 34).setDepth(110),
        );
      }
    }
    if (this.remainMs !== null) {
      this.timerText = this.add.text(GAME_WIDTH - 24, 34, '', {
        fontFamily: 'system-ui, sans-serif', fontSize: '34px', fontStyle: 'bold',
        color: PALETTE.gold, stroke: '#071326', strokeThickness: 6,
      }).setOrigin(1, 0.5).setDepth(110);
      this.refreshTimer();
    }
    this.createPauseButton();
  }

  private createPauseButton() {
    // y=132 而不是贴顶:页面左上角有个 52px 的"返回首页" DOM 按钮压在画布上面,
    // 放在 y≈51 的话点下去是离开游戏,不是暂停。
    const x = 40, y = 132;
    const icon = this.add.graphics({ x, y }).setDepth(110);
    icon.fillStyle(PALETTE.wood, 0.92).fillCircle(0, 0, 21);
    icon.lineStyle(2, PALETTE.amber, 0.9).strokeCircle(0, 0, 21);
    icon.fillStyle(0xfff0c8, 1).fillRect(-7, -9, 5, 18).fillRect(3, -9, 5, 18);
    this.add.zone(x, y, 56, 56).setOrigin(0.5).setDepth(111)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => this.pauseGame());
  }

  private refreshTimer() {
    if (!this.timerText || this.remainMs === null) return;
    const left = Math.max(0, this.remainMs) / 1000;
    this.timerText.setText(left.toFixed(1));
    this.timerText.setColor(left <= 10 ? PALETTE.ember : PALETTE.gold);
  }

  private pauseGame() {
    if (this.ending || this.scene.isPaused()) return;
    this.finishStroke();
    this.previousPoint = null;
    this.strokePointer = null;
    this.points = [];
    this.scene.pause();
    this.scene.launch('FruitPause', {
      mode: this.mode, difficulty: this.difficulty, score: this.score,
    });
  }

  /** 限时模式加减秒数,给出飘字反馈 */
  private adjustTime(seconds: number, x: number, y: number) {
    if (this.remainMs === null || seconds === 0) return;
    this.remainMs = Math.max(0, this.remainMs - seconds * 1000);
    this.refreshTimer();
    this.floatText(x, y, `-${seconds} 秒`, PALETTE.ember, 26);
  }

  private bindInput() {
    // 只认第一根按下的手指。两根手指共用一套 previousPoint 的话,
    // A 指按住不动、B 指轻点就能生成一条横跨两指之间的线段,一刀切光沿途所有水果。
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.ending || this.strokePointer !== null) return;
      this.strokePointer = pointer.id;
      this.finishStroke();
      this.previousPoint = new Phaser.Math.Vector2(pointer.x, pointer.y);
      this.points = [{ x: pointer.x, y: pointer.y, time: this.time.now }];
      this.lastMoveAt = this.time.now;
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.ending || pointer.id !== this.strokePointer) return;
      if (!pointer.isDown || !this.previousPoint) return;
      const distance = Phaser.Math.Distance.Between(this.previousPoint.x, this.previousPoint.y, pointer.x, pointer.y);
      if (distance < GAMEPLAY.minSlashDistance) return;
      const from = this.previousPoint.clone();
      const to = new Phaser.Math.Vector2(pointer.x, pointer.y);
      this.previousPoint.copy(to);
      this.points.push({ x: to.x, y: to.y, time: this.time.now });
      // 高刷新率鼠标一帧能报十几次 pointermove,不封顶的话 drawSlash 每帧要重建
      // 上百段线的 Graphics 几何体并重新上传,足以拖出掉帧。刀光只需要最近这一小段。
      if (this.points.length > GAMEPLAY.maxSlashPoints) {
        this.points.splice(0, this.points.length - GAMEPLAY.maxSlashPoints);
      }
      this.lastMoveAt = this.time.now;
      sfx.whoosh(distance * 60);
      this.processSlash(from, to);
    });
    const finish = (pointer?: Phaser.Input.Pointer) => {
      if (pointer && pointer.id !== this.strokePointer) return;
      this.finishStroke();
      this.previousPoint = null;
      this.strokePointer = null;
    };
    this.input.on('pointerup', finish);
    this.input.on('pointerupoutside', finish);
    this.input.on('gameout', () => finish());
  }

  private processSlash(from: Phaser.Math.Vector2, to: Phaser.Math.Vector2) {
    const line = new Phaser.Geom.Line(from.x, from.y, to.x, to.y);
    const lengthSq = Phaser.Math.Distance.Squared(from.x, from.y, to.x, to.y);
    const hits: Array<{ target: Target; t: number }> = [];
    for (const child of this.targets.getChildren()) {
      const target = child as Target;
      if (!target.active || target.getData('cut')) continue;
      const radius = Number(target.getData('radius'));
      if (!Phaser.Geom.Intersects.LineToCircle(line, new Phaser.Geom.Circle(target.x, target.y, radius))) continue;
      const t = lengthSq === 0 ? 0 : Phaser.Math.Clamp(((target.x - from.x) * (to.x - from.x) + (target.y - from.y) * (to.y - from.y)) / lengthSq, 0, 1);
      hits.push({ target, t });
    }
    hits.sort((a, b) => a.t - b.t);
    const angle = Phaser.Math.Angle.Between(from.x, from.y, to.x, to.y);
    for (const hit of hits) {
      if (this.ending) break;
      if (hit.target.getData('isBomb')) this.hitBomb(hit.target);
      else this.sliceFruit(hit.target, angle);
    }
  }

  private sliceFruit(fruit: Target, slashAngle: number) {
    if (!fruit.active || fruit.getData('cut')) return;
    fruit.setData('cut', true);
    const kind = fruit.getData('kind') as FruitKind;
    const { x, y, angle } = fruit;
    const vx = fruit.body.velocity.x;
    const vy = fruit.body.velocity.y;
    this.retire(fruit);
    this.strokeHits += 1;
    this.sliced += 1;
    // 难度倍率在计分那一刻结算,HUD 上看到的分数就是最终分数
    const gained = this.award(GAMEPLAY.fruitScore);
    this.score += gained;
    this.refreshScore();
    sfx.slice(this.rng.realInRange(0.9, 1.1));

    const normal = slashAngle + Math.PI / 2;
    for (const side of [-1, 1]) {
      const halfKey = fruitHalfTexture(kind, side < 0 ? 'a' : 'b');
      const half = this.halves.create(x + Math.cos(normal) * side * 5, y + Math.sin(normal) * side * 5, halfKey) as Target;
      half.setVelocity(vx + Math.cos(normal) * side * 100, vy + Math.sin(normal) * side * 100);
      half.setAngularVelocity(side * 190 + angle * 0.5);
      const halfHeight = FRUIT_RADII[kind] * 1.9;
      half.setDisplaySize(halfHeight * (half.width / half.height), halfHeight);
      half.setDepth(35);
    }
    this.juice(x, y, FRUIT_COLORS[kind], slashAngle);
    this.floatText(x, y, `+${gained}`, PALETTE.cream, 22);
  }

  /** 统一过一遍难度得分倍率。基础分是 10 而不是 1,倍率才不会被取整抹平 */
  private award(base: number) {
    return Math.max(1, Math.round(base * this.diff.scoreScale));
  }

  /**
   * 目标是 create 出来的(不是带回收的对象池),只 disable 不销毁会在长局里越堆越多,
   * update 和 processSlash 每次都要遍历全部。延迟一帧再 destroy,避开物理碰撞遍历。
   */
  private retire(target: Target) {
    if (!target.active) return;
    target.disableBody(true, true);
    this.time.delayedCall(0, () => target.destroy());
  }

  private finishStroke() {
    if (this.strokeHits >= 3) {
      const bonus = this.award(this.strokeHits * GAMEPLAY.comboScore);
      this.score += bonus;
      this.bestCombo = Math.max(this.bestCombo, this.strokeHits);
      this.refreshScore();
      sfx.combo(this.strokeHits);
      this.comboText(this.strokeHits, bonus);
    }
    this.strokeHits = 0;
  }

  private hitBomb(bomb: Target) {
    if (this.ending) return;
    bomb.setData('cut', true);
    const { x, y } = bomb;
    sfx.explosion();
    this.cameras.main.shake(250, 0.02);
    const flash = this.add.circle(x, y, 18, 0xffffff, 0.9).setDepth(120);
    const ring = this.add.circle(x, y, 28, 0xff6a32, 0).setStrokeStyle(10, 0xff6a32, 0.9).setDepth(119);
    this.tweens.add({ targets: [flash, ring], scale: 6, alpha: 0, duration: 260, onComplete: () => { flash.destroy(); ring.destroy(); } });

    // 限时模式里炸弹只扣秒数,这一局还得继续打
    if (!this.modeSpec.bombEndsRun) {
      this.retire(bomb);
      this.adjustTime(this.modeSpec.bombCostsSeconds, x, y - 40);
      return;
    }
    this.ending = true;
    this.finishStroke();
    this.spawnTimer?.remove(false);
    this.physics.world.pause();
    this.time.delayedCall(620, () => this.scene.start('FruitGameOver', this.gameOverData('bomb')));
  }

  private missFruit() {
    if (this.ending) return;
    const warning = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0xff4b3e, 0.14).setDepth(105);
    this.tweens.add({ targets: warning, alpha: 0, duration: 260, onComplete: () => warning.destroy() });

    if (!this.modeSpec.missCostsLife) {
      // 禅意模式连秒数都不扣,漏了就漏了,只给一下轻提示
      if (this.modeSpec.missCostsSeconds > 0) {
        sfx.miss();
        this.adjustTime(this.modeSpec.missCostsSeconds, GAME_WIDTH / 2, GAME_HEIGHT - 200);
      }
      return;
    }
    this.lives -= 1;
    sfx.miss();
    const icon = this.lifeIcons[this.lives];
    if (icon) {
      icon.setTexture('fs-life-empty').setDisplaySize(34, 34);
      this.tweens.add({ targets: icon, scale: 1.45, duration: 90, yoyo: true });
    }
    if (this.lives <= 0) this.endFromMiss();
  }

  private endFromMiss() {
    this.ending = true;
    this.finishStroke();
    this.spawnTimer?.remove(false);
    this.time.delayedCall(450, () => this.scene.start('FruitGameOver', this.gameOverData('miss')));
  }

  /** 限时/禅意撑到时间结束 —— 这是这两个模式的"通关" */
  private endFromTime() {
    if (this.ending) return;
    this.ending = true;
    this.finishStroke();
    this.spawnTimer?.remove(false);
    this.physics.world.pause();
    this.timerText?.setText('0.0').setColor(PALETTE.gold);
    const banner = this.add.text(GAME_WIDTH / 2, 400, '时间到', {
      fontFamily: 'system-ui, sans-serif', fontSize: '56px', fontStyle: 'bold',
      color: PALETTE.gold, stroke: '#3a2118', strokeThickness: 8,
    }).setOrigin(0.5).setDepth(120).setScale(0.7);
    this.tweens.add({ targets: banner, scale: 1, duration: 220, ease: 'Back.easeOut' });
    this.time.delayedCall(900, () => this.scene.start('FruitGameOver', this.gameOverData('time')));
  }

  private gameOverData(reason: 'miss' | 'bomb' | 'time'): GameOverData {
    return {
      score: this.score, sliced: this.sliced, bestCombo: this.bestCombo, reason,
      mode: this.mode, difficulty: this.difficulty, completed: reason === 'time',
    };
  }

  private scheduleWave(delay?: number) {
    const elapsed = this.time.now - this.startedAt;
    const difficulty = difficultyAt(elapsed, this.diff);
    const wait = delay ?? this.rng.between(difficulty.minDelay, difficulty.maxDelay);
    this.spawnTimer = this.time.delayedCall(wait, () => {
      if (this.ending) return;
      if (this.targets.countActive(true) < GAMEPLAY.maxTargets) this.spawnWave(difficulty);
      this.scheduleWave();
    });
  }

  private spawnWave(difficulty: ReturnType<typeof difficultyAt>) {
    const room = GAMEPLAY.maxTargets - this.targets.countActive(true);
    const count = Math.min(room, this.rng.between(difficulty.minFruit, difficulty.maxFruit));
    const center = this.rng.between(155, GAME_WIDTH - 155);
    for (let i = 0; i < count; i++) {
      this.time.delayedCall(i * this.rng.between(70, 130), () => this.spawnFruit(center, i, count));
    }
    const canBomb = this.modeSpec.bombs
      && this.time.now - this.startedAt >= GAMEPLAY.firstBombAtMs
      && !this.bombInPreviousWave && room > count;
    const addBomb = canBomb && this.rng.frac() < difficulty.bombChance;
    if (addBomb) this.time.delayedCall(90, () => this.spawnBomb(center));
    this.bombInPreviousWave = addBomb;
  }

  private spawnFruit(center: number, index: number, count: number) {
    if (this.ending) return;
    const kind = this.rng.pick(FRUIT_KINDS);
    const spread = (index - (count - 1) / 2) * this.rng.between(52, 70);
    const x = Phaser.Math.Clamp(center + spread, 55, GAME_WIDTH - 55);
    const fruit = this.targets.create(x, GAMEPLAY.spawnY, fruitTexture(kind)) as Target;
    const diameter = FRUIT_RADII[kind] * 2;
    fruit.setDisplaySize(diameter * (fruit.width / fruit.height), diameter);
    const inward = (GAME_WIDTH / 2 - x) * this.rng.realInRange(0.28, 0.5);
    fruit.setVelocity(inward + this.rng.between(-75, 75), this.rng.between(-930, -780));
    fruit.setAngularVelocity(this.rng.between(-210, 210));
    fruit.setDataEnabled(); fruit.setData('kind', kind); fruit.setData('isBomb', false); fruit.setData('cut', false);
    fruit.setData('radius', FRUIT_RADII[kind] * 0.8);
    const sourceRadius = Math.min(fruit.width, fruit.height) * 0.4;
    fruit.setCircle(sourceRadius, fruit.width / 2 - sourceRadius, fruit.height / 2 - sourceRadius);
    fruit.setDepth(30);
  }

  private spawnBomb(center: number) {
    if (this.ending || this.targets.countActive(true) >= GAMEPLAY.maxTargets) return;
    const x = Phaser.Math.Clamp(center + this.rng.sign() * this.rng.between(92, 150), 58, GAME_WIDTH - 58);
    const bomb = this.targets.create(x, GAMEPLAY.spawnY + 15, 'fs-bomb') as Target;
    bomb.setDisplaySize(90 * (bomb.width / bomb.height), 90);
    bomb.setVelocity((GAME_WIDTH / 2 - x) * 0.34 + this.rng.between(-45, 45), this.rng.between(-875, -795));
    bomb.setAngularVelocity(this.rng.between(-65, 65));
    bomb.setDataEnabled(); bomb.setData('isBomb', true); bomb.setData('cut', false); bomb.setData('radius', 27);
    const bombSourceRadius = bomb.width * 0.38;
    bomb.setCircle(bombSourceRadius, bomb.width / 2 - bombSourceRadius, bomb.height * 0.35);
    bomb.setDepth(32);
  }

  private refreshScore() {
    this.scoreText.setText(String(this.score));
    this.tweens.killTweensOf(this.scoreText);
    this.scoreText.setScale(1.08);
    this.tweens.add({ targets: this.scoreText, scale: 1, duration: 100 });
  }

  private drawSlash(time: number) {
    this.slash.clear();
    if (this.points.length < 2) return;
    for (let i = 1; i < this.points.length; i++) {
      const a = this.points[i - 1]; const b = this.points[i];
      const alpha = Phaser.Math.Clamp(1 - (time - b.time) / GAMEPLAY.slashPointLifeMs, 0, 1);
      this.slash.lineStyle(16, 0x5ddcff, alpha * 0.24); this.slash.lineBetween(a.x, a.y, b.x, b.y);
      this.slash.lineStyle(7, 0x9cebff, alpha * 0.82); this.slash.lineBetween(a.x, a.y, b.x, b.y);
      this.slash.lineStyle(3, 0xf4ffff, alpha); this.slash.lineBetween(a.x, a.y, b.x, b.y);
    }
  }

  /**
   * 果汁和飘字都是"每切一个水果就来一次"的高频特效,不能每次新建对象:
   * 新建 Text 会连带新建 canvas 并上传一张 GPU 贴图,新建 ParticleEmitter 也要分配缓冲,
   * 一秒好几次就会攒出可感知的掉帧。这里全部走预建复用。
   */
  private createFxPools() {
    this.juiceEmitter = this.add.particles(0, 0, 'fs-drop', {
      speed: { min: 80, max: 250 }, gravityY: 420, lifespan: { min: 260, max: 500 },
      scale: { start: 0.75, end: 0 }, emitting: false,
    }).setDepth(28);
    this.confetti = this.add.particles(0, 0, 'fs-drop', {
      angle: { min: 205, max: 335 }, speed: { min: 130, max: 310 }, gravityY: 430,
      lifespan: { min: 420, max: 720 }, scaleX: { start: 0.85, end: 0.2 }, scaleY: { start: 0.35, end: 0.1 },
      tint: [0xffd45a, 0xff6b4a, 0x66eaff, 0xffffff], emitting: false,
    }).setDepth(96);
    this.floatPool = Array.from({ length: 12 }, () => this.add.text(0, 0, '', {
      fontFamily: 'system-ui, sans-serif', fontSize: '22px', fontStyle: 'bold',
      color: PALETTE.cream, stroke: '#071326', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(95).setVisible(false));
    this.floatCursor = 0;
  }

  private juice(x: number, y: number, color: number, angle: number) {
    const base = Phaser.Math.RadToDeg(angle + Math.PI / 2);
    this.juiceEmitter.setEmitterAngle({ min: base - 35, max: base + 215 });
    this.juiceEmitter.setParticleTint(color);
    this.juiceEmitter.emitParticleAt(x, y, 11);
  }

  private floatText(x: number, y: number, value: string, color: string, size: number) {
    const label = this.floatPool[this.floatCursor++ % this.floatPool.length];
    this.tweens.killTweensOf(label);
    label.setText(value).setPosition(x, y).setColor(color).setFontSize(size)
      .setAlpha(1).setVisible(true);
    this.tweens.add({ targets: label, y: y - 32, alpha: 0, duration: 380, onComplete: () => label.setVisible(false) });
  }

  private comboText(count: number, bonus: number) {
    const x = GAME_WIDTH / 2, y = 350;
    const burst = this.add.graphics({ x, y }).setBlendMode(Phaser.BlendModes.ADD).setDepth(94).setScale(0.35);
    burst.lineStyle(9, 0xffd45a, 0.85).strokeCircle(0, 0, 76);
    burst.lineStyle(3, 0xffffff, 0.95).strokeCircle(0, 0, 58);
    burst.lineStyle(5, 0x66eaff, 0.9).lineBetween(-104, 62, 104, -62);
    burst.lineStyle(2, 0xffffff, 1).lineBetween(-94, 51, 116, -74);
    for (let i = 0; i < 10; i++) {
      const angle = (Math.PI * 2 * i) / 10;
      const inner = 86, outer = i % 2 ? 104 : 120;
      burst.lineStyle(i % 2 ? 2 : 4, i % 2 ? 0xff7048 : 0xffef9c, 0.9);
      burst.lineBetween(Math.cos(angle) * inner, Math.sin(angle) * inner, Math.cos(angle) * outer, Math.sin(angle) * outer);
    }
    this.tweens.add({
      targets: burst,
      alpha: { from: 1, to: 0 }, scale: { from: 0.35, to: 1.25 }, angle: 18,
      duration: 520, ease: 'Cubic.easeOut',
      onComplete: () => burst.destroy(),
    });
    this.confetti.emitParticleAt(x, y, 18);
    const label = this.add.text(x, y, `${count} FRUIT COMBO\n+${bonus}`, {
      align: 'center', fontFamily: 'system-ui, sans-serif', fontSize: '34px', fontStyle: 'bold', color: '#ffd45a',
      stroke: '#3a2118', strokeThickness: 7,
    }).setOrigin(0.5).setDepth(100).setScale(0.6);
    this.tweens.add({ targets: label, scale: 1, duration: 130, ease: 'Back.easeOut' });
    this.tweens.add({ targets: label, y: 310, alpha: 0, delay: 420, duration: 260, onComplete: () => label.destroy() });
  }
}
