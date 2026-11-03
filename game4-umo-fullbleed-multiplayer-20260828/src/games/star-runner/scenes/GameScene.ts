import * as Phaser from 'phaser';
import { FALL_MARGIN, GAME_HEIGHT, GAME_WIDTH, PLAYER, WORLD_WIDTH } from '../config';
import { sfx } from '../sfx';

type GameData = { level: number; score: number; lives: number };

export class GameScene extends Phaser.Scene {
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private platforms!: Phaser.Physics.Arcade.StaticGroup;
  private stars!: Phaser.Physics.Arcade.Group;
  private bombs!: Phaser.Physics.Arcade.Group;

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<'left' | 'right' | 'jump', Phaser.Input.Keyboard.Key>;

  private level = 1;
  private score = 0;
  private lives = 3;

  private jumpsLeft = 0;
  private lastGroundedAt = -Infinity;
  private jumpPressedAt = -Infinity;
  private invulnerableUntil = 0;
  private spawn = new Phaser.Math.Vector2(80, 400);
  private transitioning = false;

  private scoreText!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;
  private livesText!: Phaser.GameObjects.Text;
  private rng!: Phaser.Math.RandomDataGenerator;

  constructor() {
    super('Game');
  }

  init(data: GameData) {
    this.level = data.level ?? 1;
    this.score = data.score ?? 0;
    this.lives = data.lives ?? 3;
    this.transitioning = false;
    this.invulnerableUntil = 0;
    this.rng = new Phaser.Math.RandomDataGenerator([`star-runner-${this.level}`]);
  }

  create() {
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, GAME_HEIGHT);
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, GAME_HEIGHT);
    this.cameras.main.setBackgroundColor('#0b1120');

    this.createBackground();
    this.createLevel();
    this.createPlayer();
    this.createHud();
    this.bindInput();

    this.physics.add.collider(this.player, this.platforms);
    this.physics.add.collider(this.stars, this.platforms);
    this.physics.add.collider(this.bombs, this.platforms);
    this.physics.add.overlap(this.player, this.stars, (_p, s) =>
      this.collectStar(s as Phaser.Types.Physics.Arcade.ImageWithDynamicBody),
    );
    this.physics.add.overlap(this.player, this.bombs, () => this.hitBomb());

    this.cameras.main.startFollow(this.player, true, 0.12, 0.12, 0, 80);
    this.cameras.main.fadeIn(300, 0, 0, 0);
  }

  // ---------------------------------------------------------------- 场景搭建

  private createBackground() {
    // 渐变天空(固定在相机上)
    const sky = this.add.graphics().setScrollFactor(0).setDepth(-100);
    sky.fillGradientStyle(0x0b1120, 0x0b1120, 0x1e293b, 0x312e81, 1);
    sky.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // 星空
    for (let i = 0; i < 90; i++) {
      const star = this.add
        .image(this.rng.between(0, WORLD_WIDTH), this.rng.between(0, 380), 'spark')
        .setScale(this.rng.realInRange(0.15, 0.45))
        .setAlpha(this.rng.realInRange(0.2, 0.8))
        .setScrollFactor(0.25)
        .setDepth(-90);
      this.tweens.add({
        targets: star,
        alpha: 0.1,
        duration: this.rng.between(1200, 3000),
        yoyo: true,
        repeat: -1,
      });
    }

    // 远景山丘
    const hills = this.add.graphics().setScrollFactor(0.45).setDepth(-80);
    hills.fillStyle(0x1e1b4b, 1);
    for (let x = -100; x < WORLD_WIDTH; x += 220) {
      hills.fillTriangle(x, GAME_HEIGHT, x + 130, GAME_HEIGHT - this.rng.between(120, 260), x + 260, GAME_HEIGHT);
    }
  }

  private createLevel() {
    this.platforms = this.physics.add.staticGroup();

    // 地面:整条铺满,中间挖若干缺口(关卡越高缺口越多)
    const gaps = new Set<number>();
    const gapCount = Math.min(4, this.level);
    for (let i = 0; i < gapCount; i++) {
      const start = this.rng.between(8, Math.floor(WORLD_WIDTH / 32) - 8);
      for (let w = 0; w < 3; w++) gaps.add(start + w);
    }
    for (let i = 0; i < WORLD_WIDTH / 32; i++) {
      if (gaps.has(i)) continue;
      this.addTiles(i * 32, GAME_HEIGHT - 32, 1, 1);
    }

    // 悬空平台
    const count = 12 + this.level;
    for (let i = 0; i < count; i++) {
      const width = this.rng.between(3, 6);
      const x = 220 + (i / count) * (WORLD_WIDTH - 400) + this.rng.between(-60, 60);
      const y = this.rng.between(180, GAME_HEIGHT - 140);
      this.addTiles(Phaser.Math.Snap.To(x, 32), Phaser.Math.Snap.To(y, 32), width, 1);
    }

    // 星星:每块悬空平台上方放一颗,再补一些空中的
    this.stars = this.physics.add.group();
    const platformBodies = this.platforms.getChildren() as Phaser.GameObjects.Image[];
    const elevated = platformBodies.filter((p) => p.y < GAME_HEIGHT - 64);
    Phaser.Utils.Array.Shuffle(elevated)
      .slice(0, 10 + this.level * 2)
      .forEach((p) => this.spawnStar(p.x, p.y - 44));

    // 炸弹:在空中弹跳的敌人
    this.bombs = this.physics.add.group();
    for (let i = 0; i < this.level + 1; i++) {
      this.spawnBomb(this.rng.between(400, WORLD_WIDTH - 100), this.rng.between(80, 200));
    }
  }

  private addTiles(x: number, y: number, cols: number, rows: number) {
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        this.platforms.create(x + c * 32 + 16, y + r * 32 + 16, 'tile');
      }
    }
  }

  private spawnStar(x: number, y: number) {
    const star = this.stars.create(x, y, 'star') as Phaser.Types.Physics.Arcade.ImageWithDynamicBody;
    star.setBounceY(this.rng.realInRange(0.3, 0.6));
    star.setCollideWorldBounds(true);
    this.tweens.add({
      targets: star,
      angle: 360,
      duration: this.rng.between(2000, 3600),
      repeat: -1,
    });
  }

  private spawnBomb(x: number, y: number) {
    const bomb = this.bombs.create(x, y, 'bomb') as Phaser.Types.Physics.Arcade.ImageWithDynamicBody;
    bomb.setBounce(1);
    bomb.setCollideWorldBounds(true);
    bomb.setCircle(11, 1, 3);
    const speed = 100 + this.level * 20;
    bomb.setVelocity(this.rng.sign() * speed, this.rng.between(-40, 40));
    bomb.body.setAllowGravity(false);
  }

  private createPlayer() {
    this.spawn.set(80, GAME_HEIGHT - 120);
    this.player = this.physics.add.sprite(this.spawn.x, this.spawn.y, 'player');
    this.player.setCollideWorldBounds(true);
    this.player.setDragX(PLAYER.drag);
    this.player.setMaxVelocity(PLAYER.speed, 900);
    this.player.body.setSize(24, 34).setOffset(2, 2);

    // 玩家用一套加高的专属边界:左右仍被关住,但底部留出屏幕外的空间,
    // 这样掉进地面缺口时能真正落出画面,由 update() 判定死亡重生。
    // (星星和炸弹继续沿用标准世界边界,不会掉出关卡。)
    this.player.body.setBoundsRectangle(
      new Phaser.Geom.Rectangle(0, 0, WORLD_WIDTH, GAME_HEIGHT + FALL_MARGIN),
    );
  }

  private createHud() {
    const style: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '20px',
      color: '#e2e8f0',
    };
    this.scoreText = this.add.text(16, 14, '', style).setScrollFactor(0).setDepth(100);
    this.levelText = this.add
      .text(GAME_WIDTH / 2, 14, '', style)
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(100);
    this.livesText = this.add
      .text(GAME_WIDTH - 16, 14, '', style)
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(100);
    this.refreshHud();
  }

  private refreshHud() {
    this.scoreText.setText(`分数 ${this.score}`);
    this.levelText.setText(`第 ${this.level} 关   ★ ${this.stars.countActive(true)}`);
    this.livesText.setText(`♥ ${this.lives}`);
  }

  private bindInput() {
    const kb = this.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.keys = {
      left: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      jump: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
    };
    kb.on('keydown-SPACE', () => (this.jumpPressedAt = this.time.now));
    kb.on('keydown-UP', () => (this.jumpPressedAt = this.time.now));
    kb.on('keydown-W', () => (this.jumpPressedAt = this.time.now));

    // 触屏:左 1/4 后退,1/4~1/2 前进,右半屏跳跃。
    // 多开两个指针,才能一边按方向一边按跳跃。
    this.input.addPointer(2);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.x > this.scale.width / 2) this.jumpPressedAt = this.time.now;
    });
  }

  // -------------------------------------------------------------------- 循环

  update(time: number) {
    if (this.transitioning) return;

    const onGround = this.player.body.blocked.down || this.player.body.touching.down;
    if (onGround) {
      this.lastGroundedAt = time;
      this.jumpsLeft = PLAYER.maxJumps;
    }

    // 扫描全部指针,而不是只看 activePointer,否则移动和跳跃只能二选一
    let touchLeft = false;
    let touchRight = false;
    for (const p of this.input.manager.pointers) {
      if (!p?.isDown) continue;
      if (p.x < this.scale.width * 0.25) touchLeft = true;
      else if (p.x < this.scale.width * 0.5) touchRight = true;
    }

    const left = this.cursors.left.isDown || this.keys.left.isDown || touchLeft;
    const right = this.cursors.right.isDown || this.keys.right.isDown || touchRight;

    if (left && !right) {
      this.player.setAccelerationX(-PLAYER.accel);
      this.player.setFlipX(true);
    } else if (right && !left) {
      this.player.setAccelerationX(PLAYER.accel);
      this.player.setFlipX(false);
    } else {
      this.player.setAccelerationX(0);
    }

    // 跳跃:郊狼时间 + 输入缓冲 + 二段跳
    const wantsJump = time - this.jumpPressedAt < PLAYER.bufferMs;
    const canCoyote = time - this.lastGroundedAt < PLAYER.coyoteMs;
    if (wantsJump && (canCoyote || this.jumpsLeft > 0)) {
      this.player.setVelocityY(-PLAYER.jump);
      this.jumpsLeft = canCoyote ? PLAYER.maxJumps - 1 : this.jumpsLeft - 1;
      this.lastGroundedAt = -Infinity;
      this.jumpPressedAt = -Infinity;
      sfx.jump();
      this.puff(this.player.x, this.player.y + 18, 0x4ade80, 6);
    }

    // 松开跳跃键时截断上升速度,做出可变跳跃高度
    const jumpHeld =
      this.cursors.up.isDown || this.cursors.space.isDown || this.keys.jump.isDown;
    if (!jumpHeld && this.player.body.velocity.y < -180) {
      this.player.setVelocityY(-180);
    }

    // 挤压拉伸,让手感更有活力
    const stretch = Phaser.Math.Clamp(this.player.body.velocity.y / 1400, -0.18, 0.18);
    this.player.setScale(1 - stretch, 1 + stretch);

    // 掉出世界底部
    if (this.player.y > GAME_HEIGHT + 40) this.fallOut();

    if (this.time.now < this.invulnerableUntil) {
      this.player.setAlpha(Math.floor(this.time.now / 60) % 2 ? 0.3 : 1);
    } else {
      this.player.setAlpha(1);
    }
  }

  // -------------------------------------------------------------------- 事件

  private collectStar(star: Phaser.Types.Physics.Arcade.ImageWithDynamicBody) {
    if (!star.active) return;
    star.disableBody(true, true);
    this.score += 10;
    sfx.collect();
    this.puff(star.x, star.y, 0xfacc15, 10);
    this.floatText(star.x, star.y, '+10', '#facc15');
    this.refreshHud();

    if (this.stars.countActive(true) === 0) this.nextLevel();
  }

  private hitBomb() {
    if (this.transitioning || this.time.now < this.invulnerableUntil) return;
    if (this.loseLife()) return;
    this.player.setVelocity(this.player.flipX ? 260 : -260, -300);
  }

  /**
   * 掉出关卡。无论是否处于无敌状态都必须先传送回重生点,
   * 否则受击后被击飞进坑里会永远卡在边界底部。
   */
  private fallOut() {
    if (this.transitioning) return;
    const wasInvulnerable = this.time.now < this.invulnerableUntil;
    this.player.setPosition(this.spawn.x, this.spawn.y);
    this.player.setVelocity(0, 0);
    if (wasInvulnerable) return;
    this.loseLife();
  }

  /** 扣一条命并播放反馈;返回 true 表示本局已经结束。 */
  private loseLife(): boolean {
    this.lives -= 1;
    this.invulnerableUntil = this.time.now + 1500;
    sfx.hurt();
    this.cameras.main.shake(220, 0.012);
    this.puff(this.player.x, this.player.y, 0xef4444, 14);
    this.refreshHud();

    if (this.lives <= 0) {
      this.endGame();
      return true;
    }
    return false;
  }

  private nextLevel() {
    this.transitioning = true;
    this.score += 50;
    sfx.levelUp();
    this.floatText(this.player.x, this.player.y - 30, '关卡通过! +50', '#4ade80');
    this.refreshHud();

    this.time.delayedCall(1100, () => {
      this.cameras.main.fadeOut(280, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () =>
        this.scene.restart({ level: this.level + 1, score: this.score, lives: this.lives }),
      );
    });
  }

  private endGame() {
    this.transitioning = true;
    sfx.gameOver();
    this.player.setTint(0x64748b);
    this.player.setVelocity(0, -200);
    this.player.body.setAllowGravity(true);
    this.physics.world.pause();

    this.time.delayedCall(900, () => {
      this.cameras.main.fadeOut(400, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () =>
        this.scene.start('GameOver', { score: this.score, level: this.level }),
      );
    });
  }

  // ------------------------------------------------------------------ 小特效

  private puff(x: number, y: number, color: number, count: number) {
    const emitter = this.add.particles(x, y, 'spark', {
      speed: { min: 60, max: 200 },
      scale: { start: 0.9, end: 0 },
      lifespan: 420,
      quantity: count,
      tint: color,
      emitting: false,
    });
    emitter.explode(count);
    this.time.delayedCall(600, () => emitter.destroy());
  }

  private floatText(x: number, y: number, text: string, color: string) {
    const label = this.add
      .text(x, y, text, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '20px',
        fontStyle: 'bold',
        color,
      })
      .setOrigin(0.5)
      .setDepth(90);
    this.tweens.add({
      targets: label,
      y: y - 42,
      alpha: 0,
      duration: 800,
      ease: 'Cubic.easeOut',
      onComplete: () => label.destroy(),
    });
  }
}
