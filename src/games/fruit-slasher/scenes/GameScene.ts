import * as Phaser from 'phaser';
import { createBackground } from '../background';
import {
  difficultyAt,
  FRUIT_COLORS,
  FRUIT_KINDS,
  FRUIT_RADII,
  GAME_HEIGHT,
  GAME_WIDTH,
  GAMEPLAY,
  type FruitKind,
} from '../config';
import { sfx } from '../sfx';
import { fruitHalfTexture, fruitTexture } from '../textures';

type Target = Phaser.Types.Physics.Arcade.ImageWithDynamicBody;
type SlashPoint = { x: number; y: number; time: number };

export type GameOverData = {
  score: number;
  sliced: number;
  bestCombo: number;
  reason: 'miss' | 'bomb';
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
  private lives = GAMEPLAY.lives;
  private strokeHits = 0;
  private sliced = 0;
  private bestCombo = 0;
  private ending = false;
  private bombInPreviousWave = false;
  private rng = new Phaser.Math.RandomDataGenerator();

  constructor() { super('FruitGame'); }

  create() {
    this.resetState();
    createBackground(this);
    this.targets = this.physics.add.group();
    this.halves = this.physics.add.group();
    this.slash = this.add.graphics().setDepth(80);
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

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.spawnTimer?.remove(false);
      this.input.removeAllListeners();
      this.points = [];
      this.previousPoint = null;
    });
  }

  update(time: number) {
    if (this.ending) return;
    this.points = this.points.filter((point) => time - point.time <= GAMEPLAY.slashPointLifeMs);
    this.drawSlash(time);

    for (const child of this.targets.getChildren()) {
      const target = child as Target;
      if (!target.active || target.y <= GAMEPLAY.missY || target.body.velocity.y <= 0) continue;
      const isBomb = target.getData('isBomb') === true;
      target.disableBody(true, true);
      if (!isBomb) this.missFruit();
    }
    for (const child of this.halves.getChildren()) {
      const half = child as Target;
      if (half.active && half.y > GAME_HEIGHT + 150) half.destroy();
    }
  }

  private resetState() {
    this.score = 0;
    this.lives = GAMEPLAY.lives;
    this.strokeHits = 0;
    this.sliced = 0;
    this.bestCombo = 0;
    this.ending = false;
    this.bombInPreviousWave = false;
    this.points = [];
    this.previousPoint = null;
    this.lifeIcons = [];
  }

  private createHud() {
    this.scoreText = this.add.text(82, 22, '0', {
      fontFamily: 'system-ui, sans-serif', fontSize: '60px', fontStyle: 'bold', color: '#fff0c8',
      stroke: '#071326', strokeThickness: 7,
    }).setDepth(110);
    for (let i = 0; i < GAMEPLAY.lives; i++) {
      this.lifeIcons.push(
        this.add.image(GAME_WIDTH - 28 - i * 39, 51, 'fs-life').setDisplaySize(34, 34).setDepth(110),
      );
    }
  }

  private bindInput() {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.ending) return;
      this.finishStroke();
      this.previousPoint = new Phaser.Math.Vector2(pointer.x, pointer.y);
      this.points = [{ x: pointer.x, y: pointer.y, time: this.time.now }];
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.ending || !pointer.isDown || !this.previousPoint) return;
      const distance = Phaser.Math.Distance.Between(this.previousPoint.x, this.previousPoint.y, pointer.x, pointer.y);
      if (distance < GAMEPLAY.minSlashDistance) return;
      const from = this.previousPoint.clone();
      const to = new Phaser.Math.Vector2(pointer.x, pointer.y);
      this.previousPoint.copy(to);
      this.points.push({ x: to.x, y: to.y, time: this.time.now });
      sfx.whoosh(distance * 60);
      this.processSlash(from, to);
    });
    const finish = () => { this.finishStroke(); this.previousPoint = null; };
    this.input.on('pointerup', finish);
    this.input.on('pointerupoutside', finish);
    this.input.on('gameout', finish);
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
    fruit.disableBody(true, true);
    this.strokeHits += 1;
    this.sliced += 1;
    this.score += 1;
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
    this.floatText(x, y, '+1', '#fff0c8', 22);
  }

  private finishStroke() {
    if (this.strokeHits >= 3) {
      const bonus = this.strokeHits;
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
    this.ending = true;
    this.finishStroke();
    this.spawnTimer?.remove(false);
    this.physics.world.pause();
    sfx.explosion();
    this.cameras.main.shake(250, 0.02);
    const flash = this.add.circle(bomb.x, bomb.y, 18, 0xffffff, 0.9).setDepth(120);
    const ring = this.add.circle(bomb.x, bomb.y, 28, 0xff6a32, 0).setStrokeStyle(10, 0xff6a32, 0.9).setDepth(119);
    this.tweens.add({ targets: [flash, ring], scale: 6, alpha: 0, duration: 260, onComplete: () => { flash.destroy(); ring.destroy(); } });
    this.time.delayedCall(620, () => this.scene.start('FruitGameOver', this.gameOverData('bomb')));
  }

  private missFruit() {
    if (this.ending) return;
    this.lives -= 1;
    sfx.miss();
    const icon = this.lifeIcons[this.lives];
    if (icon) {
      icon.setTexture('fs-life-empty').setDisplaySize(34, 34);
      this.tweens.add({ targets: icon, scale: 1.45, duration: 90, yoyo: true });
    }
    const warning = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0xff4b3e, 0.14).setDepth(105);
    this.tweens.add({ targets: warning, alpha: 0, duration: 260, onComplete: () => warning.destroy() });
    if (this.lives <= 0) this.endFromMiss();
  }

  private endFromMiss() {
    this.ending = true;
    this.finishStroke();
    this.spawnTimer?.remove(false);
    this.time.delayedCall(450, () => this.scene.start('FruitGameOver', this.gameOverData('miss')));
  }

  private gameOverData(reason: 'miss' | 'bomb'): GameOverData {
    return { score: this.score, sliced: this.sliced, bestCombo: this.bestCombo, reason };
  }

  private scheduleWave(delay?: number) {
    const elapsed = this.time.now - this.startedAt;
    const difficulty = difficultyAt(elapsed);
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
    const canBomb = this.time.now - this.startedAt >= GAMEPLAY.firstBombAtMs && !this.bombInPreviousWave && room > count;
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

  private juice(x: number, y: number, color: number, angle: number) {
    const emitter = this.add.particles(x, y, 'fs-drop', {
      angle: { min: Phaser.Math.RadToDeg(angle + Math.PI / 2) - 35, max: Phaser.Math.RadToDeg(angle + Math.PI / 2) + 215 },
      speed: { min: 80, max: 250 }, gravityY: 420, lifespan: { min: 260, max: 500 },
      scale: { start: 0.75, end: 0 }, tint: color, quantity: 11, emitting: false,
    }).setDepth(28);
    emitter.explode(11);
    this.time.delayedCall(600, () => emitter.destroy());
  }

  private floatText(x: number, y: number, value: string, color: string, size: number) {
    const label = this.add.text(x, y, value, { fontFamily: 'system-ui, sans-serif', fontSize: `${size}px`, fontStyle: 'bold', color, stroke: '#071326', strokeThickness: 4 }).setOrigin(0.5).setDepth(95);
    this.tweens.add({ targets: label, y: y - 32, alpha: 0, duration: 380, onComplete: () => label.destroy() });
  }

  private comboText(count: number, bonus: number) {
    const label = this.add.text(GAME_WIDTH / 2, 350, `${count} FRUIT COMBO\n+${bonus}`, {
      align: 'center', fontFamily: 'system-ui, sans-serif', fontSize: '34px', fontStyle: 'bold', color: '#ffd45a',
      stroke: '#3a2118', strokeThickness: 7,
    }).setOrigin(0.5).setDepth(100).setScale(0.6);
    this.tweens.add({ targets: label, scale: 1, duration: 130, ease: 'Back.easeOut' });
    this.tweens.add({ targets: label, y: 310, alpha: 0, delay: 420, duration: 260, onComplete: () => label.destroy() });
  }
}
