import * as Phaser from 'phaser';
import { CoopSession, type SpawnPayload } from '../coop/session';
import type { CoopBridge } from '../coop/bridge';
import {
  CAMPAIGN_WAVES, COLORS, DIFFICULTIES, GAME_HEIGHT, GAME_WIDTH, TUNING,
  type DifficultyId, type DifficultySpec, type GameMode,
} from '../config';
import { sfx } from '../sfx';
import { pushScore, saveSettings } from '../storage';
import { drawSpace } from './MenuScene';

type BodyImage = Phaser.Types.Physics.Arcade.ImageWithDynamicBody;

type EnemyKind = 'grunt' | 'weaver' | 'charger' | 'gunner';

/** 只有一张敌机贴图,靠染色 + 行为区分兵种;颜色即预警 */
const ENEMY_SPEC: Record<EnemyKind, {
  tint: number; hp: number; speed: number; score: number; fire: number; scale: number; weight: number; from: number;
}> = {
  grunt:   { tint: 0xffffff, hp: 1, speed: 1,    score: 100, fire: 1,   scale: 1,    weight: 4, from: 1 },
  weaver:  { tint: 0x7be3ff, hp: 1, speed: 0.9,  score: 130, fire: 0.8, scale: 0.95, weight: 3, from: 2 },
  charger: { tint: 0xff9a5c, hp: 1, speed: 0.55, score: 160, fire: 0,   scale: 1.05, weight: 2, from: 3 },
  gunner:  { tint: 0xc39cff, hp: 3, speed: 0.7,  score: 200, fire: 2.4, scale: 1.15, weight: 2, from: 5 },
};

/** Boss 三型轮换,战役里就是第 4 / 8 / 12 波的三场 */
const BOSS_SPEC = [
  { name: 'CORE CARRIER', hp: 26, tint: 0xffffff, pattern: 0 },
  { name: 'VOID LANCER',  hp: 40, tint: 0xffb0d8, pattern: 1 },
  { name: 'STAR EATER',   hp: 56, tint: 0xffc98a, pattern: 2 },
];

/** 战机中心点的活动范围,键盘边界和拖动钳位共用同一份 */
const PLAY_AREA = { minX: 62, maxX: GAME_WIDTH - 62, minY: 170, maxY: GAME_HEIGHT - 95 };
/** 战机显示尺寸与碰撞体占比,边界反推要用它算半宽半高 */
const PLAYER = { w: 130, h: 195, bodyW: 0.56, bodyH: 0.62 };

type PowerKind = 'shield' | 'weapon' | 'life';
const POWER_TEXTURE: Record<PowerKind, string> = {
  shield: 'ns-power', weapon: 'ns-power-weapon', life: 'ns-power-life',
};

export class GameScene extends Phaser.Scene {
  private player!: BodyImage;
  private space!: Phaser.GameObjects.TileSprite;
  private speedLines!: Phaser.GameObjects.Particles.ParticleEmitter;
  // 特效对象一律预建复用。每次命中都 new 一个 Text / ParticleEmitter / Graphics 的话,
  // Text 会连带新建 canvas 并上传一张 GPU 贴图,发射器和 Graphics 也各自分配缓冲,
  // 一秒十几次就会攒出可感知的卡顿(尤其手机)。
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private debris!: Phaser.GameObjects.Particles.ParticleEmitter;
  private debrisBoss!: Phaser.GameObjects.Particles.ParticleEmitter;
  private floatPool: Phaser.GameObjects.Text[] = [];
  private floatCursor = 0;
  private fxPool: Phaser.GameObjects.Image[] = [];
  private fxCursor = 0;
  private screenFlash!: Phaser.GameObjects.Rectangle;
  private hitStopTimer?: number;
  private enemies!: Phaser.Physics.Arcade.Group;
  private shots!: Phaser.Physics.Arcade.Group;
  private enemyShots!: Phaser.Physics.Arcade.Group;
  private powers!: Phaser.Physics.Arcade.Group;
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private scoreText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private shieldText!: Phaser.GameObjects.Text;
  private shieldAura!: Phaser.GameObjects.Graphics;
  private bossLabel!: Phaser.GameObjects.Text;
  private bossPhase!: Phaser.GameObjects.Text;
  private bossBar!: Phaser.GameObjects.Rectangle;
  private bossBarBack!: Phaser.GameObjects.Rectangle;

  /**
   * 联机握手的产物。**单人时是 undefined,所有联机分支都靠它短路** ——
   * 单人模式必须一行不改地照常跑,这是 COOP.md §7 的第一条验收。
   */
  private coop?: CoopBridge;
  /** 联机会话。单人时是 undefined,所有联机分支都靠它短路 */
  private coopSession?: CoopSession;
  /** 对方的飞机。纯表现:不参与任何碰撞,它的伤害判定在对方那一端 */
  private peer?: Phaser.GameObjects.Image;
  /** 对方的子弹。同样纯表现,碰到敌机只是消失 + 冒个火花,不扣血 */
  private peerShots!: Phaser.Physics.Arcade.Group;
  /** netId → 敌机,给 host 的裁决和 guest 的死亡事件用 */
  private readonly netEnemies = new Map<number, BodyImage>();
  /** 单人模式下的敌机编号。联机时编号由 host 统一发放 */
  private localEnemyId = 0;
  /** netId → 道具,用于「对方捡走了」时把它移掉 */
  private readonly netPowers = new Map<number, BodyImage>();
  /** guest 收到的敌机位置校正目标。每帧朝它插值靠拢,不硬设 */
  private readonly syncTargets = new Map<number, { x: number; y: number }>();
  private lastSyncAt = 0;
  private lastStateAt = 0;
  /** 对方的分数和命数,给 HUD */
  private peerState = { score: 0, lives: 0, dead: false };
  /** 对方的场景就绪了没。开局要等它 —— 否则先加载完的那个会自己先打起来 */
  private peerReady = false;
  /**
   * 对方飞机的目标位置。**收到就硬设的话画面会一跳一跳** ——
   * 位置是 20Hz 发的,而画面跑 60fps,等于每三帧才动一次。存下来逐帧插值靠拢。
   */
  private peerTarget: { x: number; y: number } | null = null;
  private waitingText?: Phaser.GameObjects.Text;
  private mode: GameMode = 'campaign';
  private difficulty: DifficultyId = 'normal';
  private diff: DifficultySpec = DIFFICULTIES.normal;

  private score = 0;
  private lives: number = DIFFICULTIES.normal.lives;
  private weapon = 1;
  private shieldCharges = 0;
  /** create() 里 this.time.now 还是 0(Clock 要等第一帧 update 才对齐),需要延到首帧再起算 */
  private started = false;
  private wave = 0;
  private remaining = 0;
  private lastShot = 0;
  private lastKill = 0;
  private lastBossImpact = 0;
  private combo = 1;
  private shieldUntil = 0;
  private invulnerableUntil = 0;
  private leakGraceUntil = 0;
  private lastDamageAt = -9999;
  private pausedAt = 0;
  private ended = false;
  private dragging = false;
  private waveTimer?: Phaser.Time.TimerEvent;

  constructor() { super('NeonGame'); }

  init(data: { mode?: GameMode; difficulty?: DifficultyId; coop?: CoopBridge }) {
    this.mode = data?.mode ?? 'campaign';
    this.difficulty = data?.difficulty && DIFFICULTIES[data.difficulty] ? data.difficulty : 'normal';
    this.diff = DIFFICULTIES[this.difficulty];
    this.coop = data?.coop;
  }

  create() {
    this.space = drawSpace(this);
    this.createFlightLayer();
    this.createFxPools();
    this.reset();
    this.player = this.physics.add.image(GAME_WIDTH / 2, 810, 'ns-player') as BodyImage;
    this.player.setDisplaySize(PLAYER.w, PLAYER.h).setBlendMode(Phaser.BlendModes.NORMAL).setCollideWorldBounds(true).setDepth(10);
    // Arcade Body 的尺寸使用原始贴图像素，之后还会乘显示缩放比例。
    // 因此必须按原图比例设置，不能沿用旧程序贴图的几十像素尺寸。
    this.player.body.setSize(this.player.width * PLAYER.bodyW, this.player.height * PLAYER.bodyH, true);
    // 键盘操作必须和拖动受同一条上边界约束(中心 y ≥ 170)。
    // 否则玩家能贴到 HUD 底下,Boss 的弹幕永远打不到,出现一个绝对安全位。
    //
    // 半宽半高只能自己按显示尺寸算,不能读 body.halfWidth/halfHeight:
    // setDisplaySize 不通知 body,setSize 用的还是建体时记下的 scale=1,
    // 此刻读到的是"源图像素 / 2"(314×434)而不是 36×60,反推出来的边界会比屏幕还大一圈。
    // body 尺寸要到第一次物理步的 updateBounds() 才和显示缩放对齐。
    const hw = (PLAYER.w * PLAYER.bodyW) / 2, hh = (PLAYER.h * PLAYER.bodyH) / 2;
    this.player.body.setBoundsRectangle(new Phaser.Geom.Rectangle(
      PLAY_AREA.minX - hw, PLAY_AREA.minY - hh,
      PLAY_AREA.maxX - PLAY_AREA.minX + hw * 2, PLAY_AREA.maxY - PLAY_AREA.minY + hh * 2,
    ));
    this.enemies = this.physics.add.group();
    this.shots = this.physics.add.group({ maxSize: 60 });
    // 狂暴态 Boss 的吞吐能到约 13 发/秒,池子留够,取不到弹会让扇形缺发
    this.enemyShots = this.physics.add.group({ maxSize: 80 });
    this.powers = this.physics.add.group();
    this.cursors = this.input.keyboard?.createCursorKeys();
    this.createHud();
    this.physics.add.overlap(this.shots, this.enemies, this.hitEnemy as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this);
    this.setupCoop();
    this.physics.add.overlap(this.player, this.enemies, this.hitPlayer as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this);
    this.physics.add.overlap(this.player, this.enemyShots, this.hitPlayer as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this);
    this.physics.add.overlap(this.player, this.powers, this.takePower as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback, undefined, this);
    this.bindPointer();
    this.input.keyboard?.on('keydown-P', () => this.pauseGame());
    this.input.keyboard?.on('keydown-ESC', () => this.pauseGame());
    if (this.coopSession) {
      // 联机开局要等双方都就绪。**这里不能直接开波** ——
      // 对面可能还在 Boot 加载贴图,那时它连 CoopSession 都还没挂上,
      // 早期的 wave / spawn 全会丢,一开局就不同步
      this.waitingText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, '等待队友加载…', {
        fontFamily: 'monospace', fontSize: '22px', color: '#b9faff',
      }).setOrigin(0.5).setDepth(60);
      this.coopSession.sendReady();
      this.tryStartCoop();
    } else {
      this.time.delayedCall(650, () => this.startWave());
    }
    // Clock.now 取的是全局 loop 时间:场景暂停时它不推进,恢复那一帧却会直接跳到当前时间。
    // 于是所有"绝对截止时间"(护盾、无敌帧、俯冲时刻)会把暂停时长白白吃掉,
    // 而 delayedCall 是按 delta 累加的、本来就抗暂停 —— 半套抗、半套不抗,只能手动补偿。
    this.events.on(Phaser.Scenes.Events.PAUSE, () => { this.pausedAt = this.game.loop.time; });
    this.events.on(Phaser.Scenes.Events.RESUME, () => this.shiftDeadlines(this.game.loop.time - this.pausedAt));
    // 切标签页 / 最小化走的是游戏级事件,整个 loop 都停了,场景 RESUME 根本不触发。
    // 这条路比按暂停更常见,Phaser 正好把隐藏时长放在 RESUME 的参数里。
    const onGameResume = (pauseDuration: number) => this.shiftDeadlines(pauseDuration);
    this.game.events.on(Phaser.Core.Events.RESUME, onGameResume);
    // 离开场景一定要收掉连接。漏了的话 PeerConnection 会一直挂着,
    // 而且服务端房间停在 connected —— 双方谁也邀请不了谁
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.coop) {
        // 走 session 而不是直接关桥:它会先给对方发一条 bye,
        // 对方就能立刻知道是「退出」而不是「网络断了」,文案不一样
        this.coopSession?.dispose('quit');
        this.coop.close();
        this.coopSession = undefined;
        this.coop = undefined;
        this.netEnemies.clear();
        this.netPowers.clear();
        this.syncTargets.clear();
      }
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.removeAllListeners();
      this.input.keyboard?.removeAllListeners();
      this.events.off(Phaser.Scenes.Events.PAUSE);
      this.events.off(Phaser.Scenes.Events.RESUME);
      // 游戏级 emitter 活得比场景久,不摘掉会每重开一局多叠一个监听
      this.game.events.off(Phaser.Core.Events.RESUME, onGameResume);
      if (this.hitStopTimer !== undefined) window.clearTimeout(this.hitStopTimer);
      this.hitStopTimer = undefined;
      this.waveTimer?.remove(false);
    });
  }

  update(time: number) {
    if (this.ended) return;
    if (!this.started) {
      // 开局护盾要在这里起算:create() 阶段 Clock.now 还停在 0,
      // 按 this.time.now 算出来的 shieldUntil=7000 在首局早就是过去时了。
      this.started = true;
      // 起飞护盾:1 层、不过期,撑到第一次真的挨打为止
      this.grantShield(1, undefined, time);
    }
    this.space.tilePositionY -= 2.8 + Math.min(this.wave * 0.12, 1.8);
    const left = this.cursors?.left.isDown ? 1 : 0;
    const right = this.cursors?.right.isDown ? 1 : 0;
    const up = this.cursors?.up.isDown ? 1 : 0;
    const down = this.cursors?.down.isDown ? 1 : 0;
    if (!this.dragging) this.player.setVelocity((right - left) * TUNING.playerSpeed, (down - up) * TUNING.playerSpeed);
    else this.player.setVelocity(0);
    // 自己的位置按 20Hz 节流发出去,节流在 CoopSession 里做
    this.coopSession?.tick(this.time.now, this.player.x, this.player.y);
    this.tickCoop(this.time.now);
    if (time - this.lastShot >= TUNING.fireDelay) this.fire(time);
    if (time - this.lastKill > TUNING.comboWindow) this.combo = 1;
    this.player.setAlpha(time < this.invulnerableUntil && Math.floor(time / 80) % 2 ? 0.25 : 1);
    // 起飞护盾(1 层)全程都在,染成常态绿会让"刚吃到 3 层"这个信号消失,所以按层数分深浅
    this.player.setTint(!this.shieldActive(time) ? 0xffffff : this.shieldCharges > 1 ? 0x60f5a8 : 0xbdf0d8);
    this.refreshStatus();
    this.comboText.setVisible(this.combo > 1 && time - this.lastKill <= TUNING.comboWindow).setText(`×${this.combo}\nCOMBO`);
    const shieldActive = this.shieldActive(time);
    const shieldLeft = Number.isFinite(this.shieldUntil)
      ? `\n${Math.max(0, (this.shieldUntil - time) / 1000).toFixed(1)}` : '';
    // 贴右边界时把标签翻到机身左侧,否则会被画面裁掉
    const flip = this.player.x > GAME_WIDTH - 130;
    this.shieldText.setVisible(shieldActive)
      .setPosition(this.player.x + (flip ? -54 : 54), this.player.y - 12)
      .setOrigin(flip ? 1 : 0, 0.5)
      .setText(`SHIELD ×${this.shieldCharges}${shieldLeft}`);
    this.shieldAura.setVisible(shieldActive).setPosition(this.player.x, this.player.y);
    // 子弹是带 maxSize 的对象池,回收即可复用。
    // **peerShots 必须一起回收** —— 漏了它的表现极具迷惑性:对方的子弹打了约 9 秒
    // (64 发 / 每秒 7 发)之后就再也出不来了,看着像网络断了,其实是池子耗尽;
    // 而那几十个一直活着的物理体还在参与碰撞检测,顺带把帧率也拖下去
    for (const group of [this.shots, this.enemyShots, this.peerShots]) for (const child of group.getChildren()) {
      const image = child as BodyImage;
      // 追踪弹可能打成近水平弹道,只按 y 回收会让它长期占着池子,Boss 取不到弹就"哑火"
      if (image.y < -80 || image.y > GAME_HEIGHT + 80 || image.x < -80 || image.x > GAME_WIDTH + 80) {
        image.disableBody(true, true);
      }
    }
    for (const child of this.powers.getChildren()) {
      const power = child as BodyImage;
      if (power.active && power.y > GAME_HEIGHT + 80) this.retire(power);
    }
    for (const child of this.enemies.getChildren()) {
      const enemy = child as BodyImage;
      if (!enemy.active) continue;
      this.driveEnemy(enemy, time);
      if (enemy.y > GAME_HEIGHT + 50 && !enemy.getData('boss')) {
        this.retire(enemy); this.remaining--; this.damage('leak'); this.checkWave();
      }
    }
  }

  /**
   * 敌机和道具是 create 出来的(不是带 maxSize 的对象池),只 disable 不销毁会在长局里越堆越多。
   * 延迟一帧再 destroy,避开正在进行的物理碰撞遍历。
   */
  private retire(image: BodyImage) {
    if (!image.active) return;
    image.disableBody(true, true);
    this.time.delayedCall(0, () => image.destroy());
  }

  /** 把所有绝对时间戳整体后移暂停时长,让暂停真的不消耗游戏内时间 */
  private shiftDeadlines(delta: number) {
    if (!(delta > 0)) return;
    if (Number.isFinite(this.shieldUntil)) this.shieldUntil += delta;
    this.invulnerableUntil += delta;
    this.leakGraceUntil += delta;
    this.lastKill += delta;
    this.lastShot += delta;
    this.lastDamageAt += delta;
    this.lastBossImpact += delta;
    for (const child of this.enemies.getChildren()) {
      const enemy = child as BodyImage;
      const diveAt = Number(enemy.getData('diveAt'));
      if (Number.isFinite(diveAt)) enemy.setData('diveAt', diveAt + delta);
    }
  }

  /** 护盾同时受时间和层数限制,两者任一耗尽就失效 */
  private shieldActive(time = this.time.now) {
    return this.shieldCharges > 0 && time < this.shieldUntil;
  }

  /**
   * duration 省略 = 不设时限,只按层数消耗。
   * 开局护盾走这条:第 1 波首架敌机要 ~10 秒才够得到玩家,给个 7 秒倒计时的话
   * 会在什么都没发生的情况下静默消失,只会教玩家"护盾会自己没掉"。
   */
  private grantShield(charges: number, duration?: number, time = this.time.now) {
    this.shieldCharges = charges;
    this.shieldUntil = duration === undefined ? Number.POSITIVE_INFINITY : time + duration;
  }

  /** 兵种行为:游走机左右摆、冲锋机蓄力后俯冲 */
  private driveEnemy(enemy: BodyImage, time: number) {
    const kind = enemy.getData('kind') as EnemyKind | undefined;
    if (kind === 'weaver') {
      enemy.setVelocityX(Math.cos((time + Number(enemy.getData('phase'))) / 320) * 165);
    } else if (kind === 'charger' && !enemy.getData('dived') && time >= Number(enemy.getData('diveAt'))) {
      enemy.setData('dived', true);
      enemy.setVelocity(0, 470 * this.diff.enemySpeed);
      enemy.setTint(0xff5a32);
      this.tweens.add({ targets: enemy, scale: enemy.scale * 1.12, duration: 140, yoyo: true });
    }
  }

  private reset() {
    this.score = 0;
    this.lives = this.diff.lives;
    this.weapon = 1;
    this.wave = 0;
    this.remaining = 0;
    this.lastShot = 0;
    this.lastKill = 0;
    this.lastBossImpact = 0;
    this.combo = 1;
    this.shieldUntil = 0;
    this.shieldCharges = 0;
    this.started = false;
    this.invulnerableUntil = 0;
    this.leakGraceUntil = 0;
    this.lastDamageAt = -9999;
    this.pausedAt = 0;
    this.ended = false;
    this.dragging = false;
  }

  private createHud() {
    this.add.image(GAME_WIDTH / 2, 62, 'ns-hud-frame').setDisplaySize(GAME_WIDTH, 124).setDepth(29);
    this.add.text(174, 22, 'SCORE', { fontFamily: 'monospace', fontSize: '13px', color: '#55eaff', letterSpacing: 3 }).setOrigin(0.5, 0).setDepth(30);
    this.scoreText = this.add.text(136, 43, '000000', { fontFamily: 'monospace', fontSize: '32px', color: '#efffff', fontStyle: 'bold', stroke: '#062033', strokeThickness: 4 }).setDepth(30);
    this.statusText = this.add.text(487, 20, '', { fontFamily: 'monospace', fontSize: '17px', color: '#bffaff', fontStyle: 'bold', align: 'right', lineSpacing: 6 }).setOrigin(1, 0).setDepth(30);
    // Boss 血条挪到 HUD 框下沿,不再和右上角的状态文本抢位置
    // x=96 是给左边的暂停按钮(x 25~67)让位,别退回 64
    this.bossLabel = this.add.text(96, 125, 'CORE CARRIER', { fontFamily: 'monospace', fontSize: '14px', color: '#ff6b63', fontStyle: 'bold', letterSpacing: 1 }).setVisible(false).setDepth(31);
    this.bossBarBack = this.add.rectangle(323, 152, 284, 12, 0x17090d, 0.78).setVisible(false).setDepth(30);
    this.bossBar = this.add.rectangle(181, 152, 284, 8, 0xff4b52).setOrigin(0, 0.5).setVisible(false).setDepth(31);
    this.bossPhase = this.add.text(505, 132, 'PHASE 1', { fontFamily: 'monospace', fontSize: '11px', color: '#ff776d' }).setOrigin(1, 0).setDepth(31).setVisible(false);
    this.comboText = this.add.text(492, 554, '', { fontFamily: 'monospace', fontSize: '26px', color: '#ffc34d', fontStyle: 'bold', align: 'center', stroke: '#351d06', strokeThickness: 5 }).setOrigin(1, 0.5).setDepth(32).setVisible(false);
    this.shieldText = this.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '12px', color: '#7ff7ff', align: 'center', stroke: '#042134', strokeThickness: 4 }).setOrigin(0.5).setDepth(32).setVisible(false);
    this.shieldAura = this.add.graphics().setDepth(9).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    this.shieldAura.fillStyle(0x20bfe8, 0.08).fillCircle(0, 0, 58);
    this.shieldAura.lineStyle(3, 0x54ecff, 0.65).strokeCircle(0, 0, 58);
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI * 2 * i) / 8;
      this.shieldAura.lineStyle(2, 0xb6ffff, 0.45).lineBetween(Math.cos(a) * 50, Math.sin(a) * 50, Math.cos(a) * 58, Math.sin(a) * 58);
    }
    this.createPauseButton();
  }

  private createPauseButton() {
    // y=132 而不是贴顶:页面左上角有个 48px 的"返回首页" DOM 按钮压在画布上面,
    // 画布按 FIT 铺满时(视口接近 9:16)两者会重叠,点下去是离开游戏而不是暂停。
    // 仍然保持在 y<150 的 HUD 带内,这样 bindPointer 的"HUD 区不移动战机"守卫依然生效。
    const x = 46, y = 132;
    const icon = this.add.graphics({ x, y }).setDepth(31);
    icon.fillStyle(0x0a2434, 0.9).fillCircle(0, 0, 21);
    icon.lineStyle(2, COLORS.cyan, 0.85).strokeCircle(0, 0, 21);
    icon.fillStyle(0xbdf6ff, 1).fillRect(-7, -9, 5, 18).fillRect(3, -9, 5, 18);
    const zone = this.add.zone(x, y, 52, 52).setOrigin(0.5).setDepth(32)
      .setInteractive({ useHandCursor: true });
    zone.on('pointerup', () => this.pauseGame());
  }

  private refreshStatus() {
    const waveLabel = this.mode === 'campaign'
      ? `WAVE ${String(this.wave).padStart(2, '0')}/${CAMPAIGN_WAVES}`
      : `WAVE ${String(this.wave).padStart(2, '0')}`;
    const lives = this.lives > 0 ? '▲ '.repeat(this.lives).trim() : '—';
    const power = '▮'.repeat(this.weapon) + '▯'.repeat(TUNING.maxWeapon - this.weapon);
    // 联机时多显示一行队友:协作模式里「他还有几条命」直接影响你要不要冒险
    const peer = this.coopSession
      ? `\n${this.coopSession.peerName} ${this.peerState.dead ? '阵亡' : `▲${this.peerState.lives}`} ${String(this.peerState.score).padStart(6, '0')}`
      : '';
    this.statusText.setText(`${waveLabel}\n${lives}\nPWR ${power}${peer}`);
  }

  /** 预建所有会被高频触发的特效对象 */
  private createFxPools() {
    this.sparks = this.add.particles(0, 0, 'ns-spark', {
      speed: { min: 70, max: 260 }, lifespan: 420,
      scale: { start: 1.5, end: 0 }, tint: [0x35f2ff, 0xff4f91, 0xffd35a], emitting: false,
    }).setDepth(27);
    this.debris = this.add.particles(0, 0, 'ns-spark', {
      speed: { min: 90, max: 280 }, lifespan: { min: 260, max: 520 }, gravityY: 130,
      rotate: { min: 0, max: 360 },
      scaleX: { start: 1.5, end: 0.2 }, scaleY: { start: 0.5, end: 0.1 },
      tint: [0xffffff, 0xffb13b, 0xff5138, 0x4deaff],
      blendMode: Phaser.BlendModes.ADD, emitting: false,
    }).setDepth(26);
    this.debrisBoss = this.add.particles(0, 0, 'ns-spark', {
      speed: { min: 150, max: 480 }, lifespan: { min: 450, max: 900 }, gravityY: 80,
      rotate: { min: 0, max: 360 },
      scaleX: { start: 2.4, end: 0.2 }, scaleY: { start: 0.8, end: 0.1 },
      tint: [0xffffff, 0xffb13b, 0xff5138, 0x4deaff],
      blendMode: Phaser.BlendModes.ADD, emitting: false,
    }).setDepth(26);

    this.floatPool = Array.from({ length: 10 }, () => this.add.text(0, 0, '', {
      fontFamily: 'system-ui', fontSize: '23px', color: '#fff3a8', fontStyle: 'bold',
      stroke: '#32134d', strokeThickness: 5,
    }).setOrigin(0.5).setDepth(40).setVisible(false));
    this.floatCursor = 0;

    this.fxPool = Array.from({ length: 20 }, () => this.add.image(0, 0, 'ns-fx-impact')
      .setBlendMode(Phaser.BlendModes.ADD).setVisible(false));
    this.fxCursor = 0;

    // 整屏白闪,只在 Boss 爆炸时用一下
    this.screenFlash = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0xffffff)
      .setDepth(60).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
  }

  /**
   * 从池里取一张特效贴图。取满一轮就复用最旧的,顶多截断一个正在淡出的特效。
   * 贴图都是黑底手绘的辉光图,ADD 混合下黑色即透明,不需要额外抠图。
   */
  private takeFx(x: number, y: number, depth: number, key: string, size: number) {
    const image = this.fxPool[this.fxCursor++ % this.fxPool.length];
    this.tweens.killTweensOf(image);
    image.setTexture(key)
      .setPosition(x, y).setDepth(depth).setDisplaySize(size, size)
      .setAlpha(1).setAngle(0).setVisible(true);
    return image;
  }

  private createFlightLayer() {
    this.speedLines = this.add.particles(0, 0, 'ns-spark', {
      x: { min: 12, max: GAME_WIDTH - 12 }, y: -30,
      speedX: { min: -4, max: 4 }, speedY: { min: 540, max: 960 },
      lifespan: { min: 650, max: 1050 }, frequency: 55,
      alpha: { start: 0.05, end: 0.72 }, scaleX: { min: 0.25, max: 0.5 }, scaleY: { min: 2, max: 7 },
      tint: [0x8befff, 0xffffff, 0x7b70ff], blendMode: Phaser.BlendModes.ADD,
    }).setDepth(-10);
  }

  private bindPointer() {
    // y < 150 是 HUD 区,点在那儿是按暂停键,不能把战机瞬移过去
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.y < 150) return;
      this.dragging = true; this.moveTo(p);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => { if (p.isDown && this.dragging) this.moveTo(p); });
    this.input.on('pointerup', () => { this.dragging = false; });
    this.input.on('pointerupoutside', () => { this.dragging = false; });
  }

  private moveTo(pointer: Phaser.Input.Pointer) {
    this.player.setPosition(
      Phaser.Math.Clamp(pointer.x, PLAY_AREA.minX, PLAY_AREA.maxX),
      Phaser.Math.Clamp(pointer.y, PLAY_AREA.minY, PLAY_AREA.maxY),
    );
  }

  private pauseGame() {
    if (this.ended || this.scene.isPaused()) return;
    this.dragging = false;
    this.scene.pause();
    this.scene.launch('NeonPause', {
      mode: this.mode, difficulty: this.difficulty, wave: this.wave, score: this.score,
    });
  }

  private fire(time: number) {
    this.lastShot = time;
    const y = this.player.y - 30;
    // 火力等级决定弹道数量与散布
    const lanes = this.weapon === 1 ? [{ dx: 0, angle: 0 }]
      : this.weapon === 2 ? [{ dx: -17, angle: 0 }, { dx: 17, angle: 0 }]
      : [{ dx: -24, angle: -0.16 }, { dx: 0, angle: 0 }, { dx: 24, angle: 0.16 }];
    for (const lane of lanes) {
      const shot = this.shots.get(this.player.x + lane.dx, y, 'ns-shot') as BodyImage | null;
      if (!shot) continue;
      shot.enableBody(true, this.player.x + lane.dx, y, true, true);
      shot.setVelocity(Math.sin(lane.angle) * TUNING.bulletSpeed, -Math.cos(lane.angle) * TUNING.bulletSpeed);
      shot.setRotation(lane.angle);
    }
    this.coopSession?.sendFire(this.player.x, y, this.weapon);
    sfx.shoot();
  }

  // ---------------------------------------------------------------- 联机

  /**
   * 建立联机会话。**单人时整个方法直接返回**,后面所有联机分支都靠
   * `this.coopSession` 为 undefined 短路 —— 单人模式必须一行不改地照常跑。
   */
  private setupCoop() {
    // peerShots 无论单双人都要建:hitPeerShot 的碰撞注册要用到它,
    // 单人时它永远是空的,不产生任何开销
    this.peerShots = this.physics.add.group({ defaultKey: 'ns-shot', maxSize: 64 });
    if (!this.coop) return;

    // 对方的飞机换个色相区分。**不加物理体** —— 它纯粹是表现,
    // 对方的碰撞和受伤都在对方那一端判,这边多一份判定只会打架
    this.peer = this.add.image(GAME_WIDTH / 2, 810, 'ns-player')
      .setDisplaySize(PLAYER.w, PLAYER.h).setTint(0xffb46a).setAlpha(0.95).setDepth(9);

    // 对方的子弹碰到敌机只消失 + 冒火花,不扣血:伤害由对方那端上报给 host
    this.physics.add.overlap(
      this.peerShots, this.enemies,
      ((shotObject: Phaser.GameObjects.GameObject) => {
        const shot = shotObject as BodyImage;
        this.showLaserImpact(shot.x, shot.y, false);
        shot.disableBody(true, true);
      }) as Phaser.Types.Physics.Arcade.ArcadePhysicsCallback,
      undefined, this,
    );

    this.coopSession = new CoopSession(this.coop, {
      onPeerPos: (x, y) => {
        // 第一次收到直接就位,之后才插值 —— 否则对方会从屏幕中央滑过来
        if (!this.peerTarget) this.peer?.setPosition(x, y);
        this.peerTarget = { x, y };
      },
      onPeerFire: (x, y, weapon) => this.spawnPeerShots(x, y, weapon),
      onWave: (index) => this.followWave(index),
      onSpawn: (payload) => this.applySpawn(payload),
      onEnemyDead: (id) => {
        const enemy = this.netEnemies.get(id);
        if (enemy?.active) this.destroyEnemy(enemy);
      },
      onHitReport: (id, damage) => this.applyRemoteHit(id, damage),
      onBossSpawn: (id, spec, hp) => this.applyBossSpawn(id, spec, hp),
      onBossHp: (hp, maxHp) => this.paintBossBar(hp, maxHp),
      onSync: (entries) => {
        for (const [id, x, y] of entries) this.syncTargets.set(id, { x, y });
      },
      onPower: (id, kind, x, y) => this.applyPower(id, kind as PowerKind, x, y),
      onTaken: (id) => {
        const power = this.netPowers.get(id);
        this.netPowers.delete(id);
        if (power?.active) power.disableBody(true, true);
      },
      onPeerState: (score, lives, dead) => { this.peerState = { score, lives, dead }; },
      onPeerLoad: (p) => {
        // 自己已经进战场、对方还在加载时,把进度显示出来
        this.waitingText?.setText(`等待队友加载… ${Math.round(p * 100)}%`);
      },
      onPeerReady: () => {
        this.peerReady = true;
        // 对方可能比我先就绪 —— 那时我的 ready 还没发出去,它收不到。
        // 所以收到对方的 ready 之后再回一条,双方谁先谁后都能凑齐
        this.coopSession?.sendReady();
        this.tryStartCoop();
      },
      onPeerLeft: () => this.onPeerLeft(),
    });
  }

  /** 对方开火:本地生成纯表现的子弹。弹道和自己的完全一致,所以两端看到的一样 */
  private spawnPeerShots(x: number, y: number, weapon: number) {
    const lanes = weapon <= 1 ? [{ dx: 0, angle: 0 }]
      : weapon === 2 ? [{ dx: -17, angle: 0 }, { dx: 17, angle: 0 }]
        : [{ dx: -24, angle: -0.16 }, { dx: 0, angle: 0 }, { dx: 24, angle: 0.16 }];
    for (const lane of lanes) {
      const shot = this.peerShots.get(x + lane.dx, y, 'ns-shot') as BodyImage | null;
      if (!shot) continue;
      shot.enableBody(true, x + lane.dx, y, true, true);
      shot.setVelocity(Math.sin(lane.angle) * TUNING.bulletSpeed, -Math.cos(lane.angle) * TUNING.bulletSpeed);
      shot.setRotation(lane.angle);
      shot.setTint(0xffb46a);
    }
  }

  /** guest 跟随 host 的波次。只做表现,不再自己排生成 —— 敌机由 spawn 事件送来 */
  private followWave(index: number) {
    this.wave = index;
    const boss = this.wave % TUNING.bossEvery === 0;
    const finale = this.mode === 'campaign' && this.wave === CAMPAIGN_WAVES;
    const title = finale ? '⚠ 最终核心' : boss ? '⚠ 核心战舰来袭' : `WAVE ${this.wave}`;
    const banner = this.add.text(GAME_WIDTH / 2, 430, title, {
      fontFamily: 'Arial Black, system-ui', fontSize: boss ? '34px' : '42px',
      color: boss ? '#ff779f' : '#b9faff', stroke: '#201044', strokeThickness: 8,
    }).setOrigin(0.5).setDepth(40).setAlpha(0);
    this.tweens.add({ targets: banner, alpha: 1, y: 410, duration: 220, yoyo: true, hold: 550, onComplete: () => banner.destroy() });
    if (boss) sfx.boss();
  }

  /** host 收到 guest 的命中上报,扣血并在死亡时广播 —— 这一杀记在 guest 名下 */
  private applyRemoteHit(id: number, damage: number) {
    const enemy = this.netEnemies.get(id);
    if (!enemy?.active) return;
    const hp = Number(enemy.getData('hp')) - damage;
    enemy.setData('hp', hp);
    if (hp <= 0) this.destroyEnemy(enemy, 'guest');
  }

  /**
   * 双方都就绪了才开局。
   *
   * 只有 host 真正推波次,guest 只是把「等待队友」的字去掉 ——
   * 它的敌机全部来自 host 的 spawn 事件。
   */
  private tryStartCoop() {
    if (!this.coopSession || !this.peerReady || this.ended) return;
    if (this.waitingText) {
      this.waitingText.destroy();
      this.waitingText = undefined;
    } else {
      return; // 已经开过了,别开第二次
    }
    if (this.coopSession.isHost) this.time.delayedCall(650, () => this.startWave());
  }

  /** Boss 血条。host 打完自己画,guest 靠 boss 消息画 —— 同一段代码两边用 */
  private paintBossBar(hp: number, maxHp: number) {
    const ratio = Math.max(0, hp / (maxHp || 1));
    this.bossBar.setScale(ratio, 1);
    this.bossBar.setFillStyle(ratio > 0.66 ? 0xff4b52 : ratio > 0.33 ? 0xff8a3d : 0xffd23d);
    this.bossPhase.setText(`PHASE ${ratio > 0.66 ? 1 : ratio > 0.33 ? 2 : 3}`);
  }

  /**
   * 每帧的联机维护:host 定期广播位置校正,guest 朝目标插值靠拢。
   *
   * **插值而不是硬设**:硬设会让敌机每 250ms 抖一下,比漂移本身更难看。
   * 偏差大到一定程度才硬拉 —— 那说明已经不是漂移,是丢了事件。
   */
  private tickCoop(now: number) {
    const session = this.coopSession;
    if (!session) return;

    if (session.isHost) {
      if (now - this.lastSyncAt >= 250) {
        this.lastSyncAt = now;
        const entries: Array<[number, number, number]> = [];
        for (const [id, enemy] of this.netEnemies) {
          if (enemy.active) entries.push([id, Math.round(enemy.x), Math.round(enemy.y)]);
        }
        session.broadcastSync(entries);
      }
    } else if (this.syncTargets.size) {
      for (const [id, target] of this.syncTargets) {
        const enemy = this.netEnemies.get(id);
        if (!enemy?.active) { this.syncTargets.delete(id); continue; }
        const dx = target.x - enemy.x, dy = target.y - enemy.y;
        if (Math.hypot(dx, dy) > 60) enemy.setPosition(target.x, target.y);
        else enemy.setPosition(enemy.x + dx * 0.2, enemy.y + dy * 0.2);
      }
      this.syncTargets.clear();
    }

    // 对方飞机逐帧靠拢目标位置。0.25 是"跟得上又不抖"的折中:
    // 再大接近硬设,再小会明显拖在后面
    if (this.peer && this.peerTarget) {
      this.peer.setPosition(
        this.peer.x + (this.peerTarget.x - this.peer.x) * 0.25,
        this.peer.y + (this.peerTarget.y - this.peer.y) * 0.25,
      );
    }

    if (now - this.lastStateAt >= 1000) {
      this.lastStateAt = now;
      session.broadcastState(this.score, this.lives, this.weapon, this.ended);
    }
  }

  private onPeerLeft() {
    if (this.ended) return;
    this.floatText(GAME_WIDTH / 2, GAME_HEIGHT - 250, '队友掉线了');
    this.peer?.setAlpha(0.25);
    this.coopSession = undefined;
  }

  private startWave() {
    if (this.ended) return;
    // guest 不自己推波次,等 host 的 wave 事件(否则两边的波次会各走各的)
    if (this.coopSession && !this.coopSession.isHost) return;
    this.wave++;
    this.coopSession?.broadcastWave(this.wave);
    const boss = this.wave % TUNING.bossEvery === 0;
    const count = boss ? 9 : Math.min(4 + this.wave, 11);
    this.remaining = count;
    const finale = this.mode === 'campaign' && this.wave === CAMPAIGN_WAVES;
    const title = finale ? '⚠ 最终核心' : boss ? '⚠ 核心战舰来袭' : `WAVE ${this.wave}`;
    const banner = this.add.text(GAME_WIDTH / 2, 430, title, {
      fontFamily: 'Arial Black, system-ui', fontSize: boss ? '34px' : '42px',
      color: boss ? '#ff779f' : '#b9faff', stroke: '#201044', strokeThickness: 8,
    }).setOrigin(0.5).setDepth(40).setAlpha(0);
    this.tweens.add({ targets: banner, alpha: 1, y: 410, duration: 220, yoyo: true, hold: 550, onComplete: () => banner.destroy() });
    if (boss) {
      sfx.boss();
      this.showBossPortal(GAME_WIDTH / 2, 210);
      this.time.delayedCall(700, () => this.spawnBoss());
      const kinds = this.rollKinds(8);
      for (let i = 0; i < 8; i++) this.time.delayedCall(1050 + i * 180, () => this.spawnEnemy(i, kinds[i]));
    } else {
      const kinds = this.rollKinds(count);
      for (let i = 0; i < count; i++) this.time.delayedCall(500 + i * 260, () => this.spawnEnemy(i, kinds[i]));
    }
  }

  /** 按波次解锁兵种,再按权重抽这一波的编成 */
  private rollKinds(count: number): EnemyKind[] {
    const pool = (Object.keys(ENEMY_SPEC) as EnemyKind[]).filter((k) => this.wave >= ENEMY_SPEC[k].from);
    const total = pool.reduce((sum, k) => sum + ENEMY_SPEC[k].weight, 0);
    return Array.from({ length: count }, () => {
      let roll = Phaser.Math.FloatBetween(0, total);
      for (const kind of pool) {
        roll -= ENEMY_SPEC[kind].weight;
        if (roll <= 0) return kind;
      }
      return 'grunt' as EnemyKind;
    });
  }

  /**
   * 摇一架敌机的全部随机参数。**只有 host 会调。**
   *
   * 拆出这一步是联机的地基:Phaser.Math 用的是 Math.random(),两端各自摇必然对不上。
   * 参数集中在这里摇好、随生成事件发过去,两端造出来的才是同一架敌机(COOP.md §2)。
   */
  private rollSpawn(index: number, kind: EnemyKind): SpawnPayload {
    const spec = ENEMY_SPEC[kind];
    const chance = Math.min(0.12 + this.wave * 0.025, 0.4) * spec.fire * this.diff.fireChance;
    const willFire = spec.fire > 0 && Phaser.Math.FloatBetween(0, 1) < chance;
    return {
      id: this.coopSession ? this.coopSession.allocEnemyId() : ++this.localEnemyId,
      kind,
      x: 65 + (index % 5) * 102 + Phaser.Math.Between(-18, 18),
      hp: spec.hp + Math.floor(this.wave / this.diff.hpStep) + this.diff.hpFlat,
      phase: Phaser.Math.Between(0, 2000),
      // 相对延迟而不是绝对时刻 —— 免疫两端的时钟差异
      diveIn: Phaser.Math.Between(900, 1500),
      vx: kind === 'weaver' ? 0 : Phaser.Math.Between(-24, 24),
      vy: (82 + this.wave * 7) * spec.speed * this.diff.enemySpeed,
      fireIn: willFire ? 950 + index * 80 : null,
      gunner: kind === 'gunner',
    };
  }

  /** 按参数生成敌机。两端跑的是同一段代码,参数一致产出就一致 */
  private applySpawn(p: SpawnPayload) {
    if (this.ended) return;
    const kind = p.kind as EnemyKind;
    const spec = ENEMY_SPEC[kind];
    const enemy = this.enemies.create(p.x, -70, 'ns-enemy') as BodyImage;
    enemy.setDisplaySize(54 * spec.scale, 81 * spec.scale).setBlendMode(Phaser.BlendModes.NORMAL);
    enemy.setTint(spec.tint);
    enemy.setData({
      kind, hp: p.hp, boss: false, score: spec.score,
      phase: p.phase,
      diveAt: this.time.now + p.diveIn,
      dived: false,
      netId: p.id,
    });
    enemy.setVelocity(p.vx, p.vy);
    enemy.body.setSize(enemy.width * 0.66, enemy.height * 0.68, true);
    if (this.coopSession) this.netEnemies.set(p.id, enemy);
    // 敌机开火由 host 一家驱动 —— guest 也本地放的话就是双份弹幕
    if (p.fireIn !== null && (!this.coopSession || this.coopSession.isHost)) {
      this.time.delayedCall(p.fireIn, () => this.enemyFire(enemy, p.gunner));
    }
  }

  private spawnEnemy(index: number, kind: EnemyKind = 'grunt') {
    if (this.ended) return;
    // guest 不自己生成敌机,只等 host 的 spawn 事件
    if (this.coopSession && !this.coopSession.isHost) return;
    const params = this.rollSpawn(index, kind);
    this.applySpawn(params);
    this.coopSession?.broadcastSpawn(params);
  }


  private bossIndex() {
    return Math.max(1, Math.ceil(this.wave / TUNING.bossEvery));
  }

  private spawnBoss() {
    if (this.ended) return;
    // guest 不自己造 Boss,等 host 的 bspawn —— 血量带着难度和波次,两端各算必然不一致
    if (this.coopSession && !this.coopSession.isHost) return;
    const specIndex = (this.bossIndex() - 1) % BOSS_SPEC.length;
    const spec = BOSS_SPEC[specIndex];
    const hp = Math.round((spec.hp + this.wave * 2) * this.diff.bossHp);
    const id = this.coopSession ? this.coopSession.allocEnemyId() : ++this.localEnemyId;
    this.applyBossSpawn(id, specIndex, hp);
    this.coopSession?.broadcastBossSpawn(id, specIndex, hp);
  }

  /** 按参数造 Boss。两端跑同一段代码 */
  private applyBossSpawn(id: number, specIndex: number, hp: number) {
    if (this.ended) return;
    const spec = BOSS_SPEC[specIndex];
    const boss = this.enemies.create(GAME_WIDTH / 2, -170, 'ns-boss') as BodyImage;
    boss.setDisplaySize(390, 300).setBlendMode(Phaser.BlendModes.NORMAL).setTint(spec.tint);
    boss.setData({ hp, maxHp: hp, boss: true, pattern: spec.pattern, alt: 0, score: 1200 * this.bossIndex(), netId: id })
      .setVelocity(0, 0).setDepth(8);
    boss.body.setSize(boss.width * 0.76, boss.height * 0.72, true);
    // 入场期间只播放展示动画，不参与子弹碰撞，避免连续受击造成整机白闪。
    boss.body.enable = false;
    if (this.coopSession) this.netEnemies.set(id, boss);
    this.bossBarBack.setVisible(true); this.bossBar.setVisible(true).setScale(1, 1);
    this.bossLabel.setVisible(true).setText(spec.name);
    this.bossPhase.setVisible(true).setText('PHASE 1');
    this.tweens.add({
      targets: boss,
      y: 320,
      duration: 1700,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        if (!boss.active) return;
        boss.body.enable = true;
        boss.body.reset(boss.x, boss.y);
        boss.setVelocityX(82 + spec.pattern * 26).setBounce(1).setCollideWorldBounds(true);
        // 弹幕只由 host 排:两端各放一份就是双倍弹幕,而且落点还对不上
        if (!this.coopSession || this.coopSession.isHost) this.bossAttack(boss);
      },
    });
  }


  private bossAttack(boss: BodyImage) {
    if (!boss.active || this.ended) return;
    const pattern = Number(boss.getData('pattern'));
    const ratio = Number(boss.getData('hp')) / Number(boss.getData('maxHp'));
    const enraged = ratio <= 0.35;
    const speed = TUNING.enemyBulletSpeed * this.diff.enemyBullet;

    // 瞄准弹压住上方、固定弹幕封住横移:只有两者都在,玩家才必须真的走位。
    // 纯瞄准弹的话,弹速(294)追不上玩家(390),持续左右横移就能让整个扇面打空。
    if (pattern === 0) {
      for (let i = -1; i <= 1; i++) this.bossShot(boss, i * 0.34, speed * 1.35);
    } else if (pattern === 1) {
      for (let i = -1; i <= 1; i++) this.bossShot(boss, i * 0.3, speed * 1.35);
      for (const vx of [-135, 135]) this.bossWallShot(boss, vx, speed);
    } else {
      const alt = Number(boss.getData('alt'));
      boss.setData('alt', alt + 1);
      if (alt % 2 === 0) {
        for (let i = -2; i <= 2; i++) this.bossShot(boss, i * 0.22, speed * 1.3);
        for (const vx of [-160, 0, 160]) this.bossWallShot(boss, vx, speed);
      } else {
        for (let i = 0; i < 3; i++) {
          this.time.delayedCall(i * 130, () => {
            if (!boss.active || this.ended) return;
            const shot = this.enemyShots.get(boss.x, boss.y + 35, 'ns-enemy-shot') as BodyImage | null;
            if (!shot) return;
            shot.enableBody(true, boss.x, boss.y + 35, true, true);
            this.physics.moveToObject(shot, this.player, speed * 1.15);
          });
        }
      }
    }
    const base = Math.max(460, (1050 - pattern * 60) - this.wave * 25);
    this.time.delayedCall(enraged ? base * 0.62 : base, () => this.bossAttack(boss));
  }

  /**
   * 扇形弹幕以"炮口 → 玩家"为中轴,再按 spread 偏转。
   * 原来是固定 vy=+speed 的纯下行弹:玩家可达上界 170 高于炮口 355,
   * 于是顶在天花板上就绝对打不到,Boss 战只剩躲机身。
   */
  private bossShot(boss: BodyImage, spread: number, speed: number) {
    const x = boss.x, y = boss.y + 35;
    const shot = this.enemyShots.get(x, y, 'ns-enemy-shot') as BodyImage | null;
    if (!shot) return;
    // 玩家和炮口重合时 atan2(0,0) 会返回 0(正右方),兜底成朝下
    const dx = this.player.x - x, dy = this.player.y - y;
    const angle = (dx === 0 && dy === 0 ? Math.PI / 2 : Math.atan2(dy, dx)) + spread;
    shot.enableBody(true, x, y, true, true);
    shot.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
  }

  /** 不瞄准的固定弹幕,负责封住左右横移的逃生路线 */
  private bossWallShot(boss: BodyImage, vx: number, speed: number) {
    const x = boss.x, y = boss.y + 35;
    const shot = this.enemyShots.get(x, y, 'ns-enemy-shot') as BodyImage | null;
    shot?.enableBody(true, x, y, true, true).setVelocity(vx, speed);
  }

  private enemyFire(enemy: BodyImage, repeat = false) {
    if (!enemy.active || this.ended) return;
    const shot = this.enemyShots.get(enemy.x, enemy.y + 18, 'ns-enemy-shot') as BodyImage | null;
    if (shot) {
      shot.enableBody(true, enemy.x, enemy.y + 18, true, true);
      this.physics.moveToObject(shot, this.player, TUNING.enemyBulletSpeed * this.diff.enemyBullet);
    }
    // 炮艇会持续点射,死了或场景结束就自然停下
    if (repeat) this.time.delayedCall(Phaser.Math.Between(900, 1400), () => this.enemyFire(enemy, true));
  }

  private hitEnemy(shotObject: Phaser.GameObjects.GameObject, enemyObject: Phaser.GameObjects.GameObject) {
    const shot = shotObject as BodyImage, enemy = enemyObject as BodyImage;
    const impactX = shot.x, impactY = shot.y;
    shot.disableBody(true, true);
    // guest 只上报命中,**不本地扣血**。生死由 host 裁决后广播回来 ——
    // 两端各自扣血必然出现「我打爆的敌机在你屏幕上还活着」
    if (this.coopSession && !this.coopSession.isHost) {
      this.showLaserImpact(enemy.x, enemy.y, enemy.getData('boss') === true);
      this.coopSession.reportHit(Number(enemy.getData('netId')) || 0);
      return;
    }
    const hp = Number(enemy.getData('hp')) - 1;
    const boss = enemy.getData('boss') === true;
    enemy.setData('hp', hp);
    // Boss 尺寸大且受击频繁，整张贴图闪白会形成持续频闪；命中反馈交给局部冲击特效。
    if (!boss) {
      // 透明敌机只做短促的冷色乘法偏移，不使用整张纹理填充闪光。
      const kind = (enemy.getData('kind') as EnemyKind) ?? 'grunt';
      enemy.setTint(0x86cfff);
      this.time.delayedCall(55, () => { if (enemy.active) enemy.setTint(ENEMY_SPEC[kind].tint); });
    }
    if (!boss) this.showLaserImpact(enemy.x, enemy.y, false);
    else if (this.time.now - this.lastBossImpact >= 90) {
      this.lastBossImpact = this.time.now;
      this.showLaserImpact(impactX, impactY, true);
    }
    if (boss) {
      const maxHp = Number(enemy.getData('maxHp'));
      this.paintBossBar(hp, maxHp);
      this.coopSession?.broadcastBossHp(hp, maxHp);
    }
    if (hp <= 0) this.destroyEnemy(enemy);
  }

  private destroyEnemy(enemy: BodyImage, by: 'host' | 'guest' = 'host') {
    const netId = Number(enemy.getData('netId')) || 0;
    if (netId) {
      this.netEnemies.delete(netId);
      this.coopSession?.broadcastDead(netId, by);
    }
    const boss = enemy.getData('boss') === true;
    const base = Number(enemy.getData('score')) || 100;
    const x = enemy.x, y = enemy.y;
    this.retire(enemy);
    this.remaining--;
    this.combo = this.time.now - this.lastKill <= TUNING.comboWindow ? Math.min(this.combo + 1, 8) : 1;
    this.lastKill = this.time.now;
    // 难度倍率在计分那一刻就结算,HUD 上看到的分数就是最终分数
    this.score += Math.round(base * this.combo * this.diff.scoreScale);
    this.scoreText.setText(String(this.score).padStart(6, '0'));
    sfx.hit();
    this.showExplosion(x, y, boss);
    this.burst(x, y, boss ? 24 : 10);
    this.hitStop(boss ? 90 : 35);
    if (this.combo > 1) this.floatText(x, y, `×${this.combo}`);
    if (boss) {
      this.bossBar.setVisible(false); this.bossBarBack.setVisible(false);
      this.bossLabel.setVisible(false); this.bossPhase.setVisible(false);
      this.cameras.main.shake(260, 0.012);
      this.dropPower(x - 60, y, 'weapon');
      this.dropPower(x + 60, y, 'life');
      if (this.mode === 'campaign' && this.wave >= CAMPAIGN_WAVES) { this.finish(true); return; }
    } else if (Phaser.Math.FloatBetween(0, 1) < 0.11 * this.diff.powerChance) {
      this.dropPower(x, y, this.rollPower());
    }
    this.checkWave();
  }

  private rollPower(): PowerKind {
    if (this.lives < TUNING.maxLives && Phaser.Math.FloatBetween(0, 1) < 0.18) return 'life';
    if (this.weapon < TUNING.maxWeapon && Phaser.Math.FloatBetween(0, 1) < 0.5) return 'weapon';
    return 'shield';
  }

  private dropPower(x: number, y: number, kind: PowerKind) {
    // 掉不掉、掉什么由 host 一家决定 —— 两端各摇一次的话火力等级会分叉
    if (this.coopSession && !this.coopSession.isHost) return;
    const id = this.coopSession ? this.coopSession.allocEnemyId() : ++this.localEnemyId;
    this.applyPower(id, kind, x, y);
    this.coopSession?.broadcastPower(id, kind, x, y);
  }

  private applyPower(id: number, kind: PowerKind, x: number, y: number) {
    const power = this.powers.create(x, y, POWER_TEXTURE[kind]) as BodyImage;
    power.setData({ kind, netId: id }).setVelocityY(130).setDepth(11);
    if (this.coopSession) this.netPowers.set(id, power);
  }

  /** 捡道具:本地生效 + 告诉对方把它移掉。双方同时碰到会各拿一份,协作模式里无害 */
  private takePower(_playerObject: Phaser.GameObjects.GameObject, powerObject: Phaser.GameObjects.GameObject) {
    const power = powerObject as BodyImage;
    const kind = (power.getData('kind') as PowerKind) ?? 'shield';
    const netId = Number(power.getData('netId')) || 0;
    if (netId) {
      this.netPowers.delete(netId);
      this.coopSession?.broadcastTaken(netId);
    }
    this.retire(power);
    sfx.pickup();
    if (kind === 'weapon') {
      if (this.weapon < TUNING.maxWeapon) {
        this.weapon++;
        this.floatText(this.player.x, this.player.y - 45, `火力 ${this.weapon} 级`);
      } else {
        this.score += Math.round(300 * this.diff.scoreScale);
        this.scoreText.setText(String(this.score).padStart(6, '0'));
        this.floatText(this.player.x, this.player.y - 45, '火力已满 +300');
      }
    } else if (kind === 'life') {
      if (this.lives < TUNING.maxLives) {
        this.lives++;
        this.floatText(this.player.x, this.player.y - 45, '补给 +1 机');
      } else {
        this.score += Math.round(300 * this.diff.scoreScale);
        this.scoreText.setText(String(this.score).padStart(6, '0'));
        this.floatText(this.player.x, this.player.y - 45, '机库已满 +300');
      }
    } else {
      this.grantShield(TUNING.shieldCharges, TUNING.shieldDuration);
      this.floatText(this.player.x, this.player.y - 45, `护盾 ×${TUNING.shieldCharges}`);
    }
  }

  /**
   * 判定顺序很重要:必须先结算无敌/护盾,再决定要不要清掉撞上来的东西。
   * 反过来写的话,开着护盾把战机开进敌机里就能无代价清场,整个射击循环可以跳过。
   */
  private hitPlayer(_playerObject: Phaser.GameObjects.GameObject, dangerObject: Phaser.GameObjects.GameObject) {
    const danger = dangerObject as BodyImage;
    if (!danger.active || this.ended) return;
    const isShot = danger.texture.key === 'ns-enemy-shot';
    const isBoss = danger.getData('boss') === true;

    // 受伤后的无敌帧:免疫,但也不许穿身清场
    if (this.time.now < this.invulnerableUntil) {
      if (isShot) danger.disableBody(true, true);
      return;
    }

    if (this.shieldActive()) {
      this.shieldCharges--;
      this.showShieldImpact(this.player.x, this.player.y);
      // 挡下一次就进硬直:追踪弹是 130ms 一发的三连,没有硬直的话一轮就把三层打光;
      // 贴着 Boss 机身时 overlap 每帧都触发,同样靠它兜住。
      // 硬直也保证了"护盾碎裂"和"掉命"不会在同一帧一起发生。
      this.invulnerableUntil = this.time.now + TUNING.shieldHitCooldown;
      if (isShot) danger.disableBody(true, true);
      // 撞碎的敌机走正常击毁流程:有爆炸、有分数、波次计数也对得上
      else if (!isBoss) this.destroyEnemy(danger);
      if (this.shieldCharges <= 0) {
        this.shieldUntil = 0;
        this.floatText(this.player.x, this.player.y - 45, '护盾碎裂');
      }
      return;
    }

    if (isShot) danger.disableBody(true, true);
    else if (!isBoss) this.destroyEnemy(danger);
    this.damage('hit');
  }

  /**
   * reason=leak 是放跑敌机的失职惩罚,不是挨打:不掉火力,也不共用受击无敌帧。
   * 共用的话"上一次挨打是几秒前"这件毫不相关的事会决定漏 4 架扣 1 命还是 4 命。
   */
  private damage(reason: 'hit' | 'leak' = 'hit') {
    if (this.ended) return;
    // 两条冷却各管各的,但同一帧里"被撞 + 放跑一架"会连扣两条命(死神只有 2 条 = 直接结算),
    // 所以再加一道公共地板:任何两次掉命之间至少隔 450ms。
    if (this.time.now - this.lastDamageAt < 450) return;
    if (reason === 'hit') {
      if (this.time.now < this.invulnerableUntil) return;
      this.invulnerableUntil = this.time.now + 1350;
      // 挨打会掉一级火力,给"稳住不死"一个正反馈
      if (this.weapon > 1) this.weapon--;
    } else {
      if (this.time.now < this.leakGraceUntil) return;
      this.leakGraceUntil = this.time.now + TUNING.leakGrace;
      this.floatText(GAME_WIDTH / 2, GAME_HEIGHT - 210, '漏防 -1 机');
    }
    this.lastDamageAt = this.time.now;
    this.lives--; sfx.hurt(); this.cameras.main.shake(180, 0.014);
    if (this.lives <= 0) this.finish(false);
  }

  private checkWave() {
    if (this.remaining > 0 || this.ended) return;
    // 计数万一被减到负数,这里钳回 0;同时清掉上一枚计时器,避免排出两波
    this.remaining = 0;
    this.waveTimer?.remove(false);
    if (this.mode === 'campaign' && this.wave >= CAMPAIGN_WAVES) { this.finish(true); return; }
    this.waveTimer = this.time.delayedCall(1100, () => this.startWave());
  }

  private burst(x: number, y: number, amount: number) {
    this.sparks.emitParticleAt(x, y, amount);
  }

  private showLaserImpact(x: number, y: number, boss: boolean) {
    const size = boss ? 96 : 62;
    const flash = this.takeFx(x, y, 25, 'ns-fx-impact', size)
      .setAngle(Phaser.Math.Between(0, 359))
      .setAlpha(boss ? 0.7 : 0.95);
    const base = flash.scale;
    flash.setScale(base * 0.7);
    this.tweens.add({
      targets: flash, scale: base * 1.25, alpha: 0,
      duration: boss ? 130 : 170, ease: 'Quad.easeOut',
      onComplete: () => flash.setVisible(false),
    });
  }

  private showExplosion(x: number, y: number, boss: boolean) {
    // takeFx 用 setDisplaySize 定好目标尺寸,这里只能在它给出的 scale 上按比例缩放,
    // 直接 setScale(0.55) 会把 displaySize 算好的比例整个丢掉。
    const core = this.takeFx(x, y, 24, boss ? 'ns-fx-boom-boss' : 'ns-fx-boom', boss ? 300 : 128)
      .setAngle(Phaser.Math.Between(0, 359));
    const coreBase = core.scale;
    core.setScale(coreBase * 0.5);
    this.tweens.add({
      targets: core, scale: coreBase * 1.15, alpha: 0,
      duration: boss ? 620 : 330, ease: 'Expo.easeOut',
      onComplete: () => core.setVisible(false),
    });
    // 外圈再叠一层更慢更大的冲击波,拉出层次
    const wave = this.takeFx(x, y, 23, 'ns-fx-boom', boss ? 280 : 120).setAlpha(0.45);
    const waveBase = wave.scale;
    wave.setScale(waveBase * 0.35);
    this.tweens.add({
      targets: wave, scale: waveBase * (boss ? 2.2 : 1.7), alpha: 0,
      duration: boss ? 780 : 420, ease: 'Cubic.easeOut',
      onComplete: () => wave.setVisible(false),
    });
    (boss ? this.debrisBoss : this.debris).emitParticleAt(x, y, boss ? 38 : 16);
    if (boss) this.flashScreen(0.5, 240);
  }

  private showShieldImpact(x: number, y: number) {
    const shield = this.takeFx(x, y, 25, 'ns-fx-shield', 168).setAlpha(0.9);
    const base = shield.scale;
    shield.setScale(base * 0.85);
    this.tweens.add({
      targets: shield, scale: base * 1.15, alpha: 0,
      duration: 320, ease: 'Cubic.easeOut',
      onComplete: () => shield.setVisible(false),
    });
  }

  private showBossPortal(x: number, y: number) {
    const portal = this.takeFx(x, y, 6, 'ns-fx-portal', 340).setAlpha(0);
    const base = portal.scale;
    portal.setScale(base * 0.2);
    this.tweens.add({
      targets: portal, scale: base, alpha: 1, angle: 80, duration: 520, ease: 'Back.easeOut',
      yoyo: true, hold: 230, onComplete: () => portal.setVisible(false),
    });
  }

  /**
   * 顿帧:命中瞬间把时间放慢再弹回。
   * 这是打击感的主要来源之一 —— 比任何贴图都更能让"打中了"这件事被感觉到,
   * 而且几乎不花性能。时长必须很短,超过 ~90ms 就会变成卡顿而不是打击感。
   */
  private hitStop(duration: number) {
    if (this.ended) return;
    // 用 world.pause() 而不是调 timeScale:Arcade 的 timeScale 是步进间隔的倍数,
    // 调大之后 _elapsed 会继续累积,恢复时可能一次性补跑多步,把场上东西弹飞。
    // pause 是在累积之前就 return,干净得多。
    this.physics.world.pause();
    if (this.hitStopTimer !== undefined) window.clearTimeout(this.hitStopTimer);
    // 用真实时间恢复:tween 不受影响,爆炸照常放,只有物体停住
    this.hitStopTimer = window.setTimeout(() => {
      this.hitStopTimer = undefined;
      // 结算时 finish() 自己会把世界停住,别在那之后又给它放开
      if (this.ended || !this.sys || this.sys.settings.status >= Phaser.Scenes.SHUTDOWN) return;
      this.physics.world.resume();
    }, duration);
  }

  /** 整屏白闪,只给 Boss 爆炸这种大事件用 */
  private flashScreen(peak: number, duration: number) {
    this.tweens.killTweensOf(this.screenFlash);
    this.screenFlash.setAlpha(peak);
    this.tweens.add({ targets: this.screenFlash, alpha: 0, duration, ease: 'Quad.easeOut' });
  }

  private floatText(x: number, y: number, value: string) {
    const label = this.floatPool[this.floatCursor++ % this.floatPool.length];
    this.tweens.killTweensOf(label);
    label.setText(value).setPosition(x, y).setAlpha(1).setVisible(true);
    this.tweens.add({ targets: label, y: y - 45, alpha: 0, duration: 700, onComplete: () => label.setVisible(false) });
  }

  private finish(victory: boolean) {
    if (this.ended) return;
    this.ended = true;
    this.physics.world.pause();
    this.waveTimer?.remove(false);
    if (victory) {
      // 通关时把残余护航机一并炸掉,画面上不留活口
      for (const child of this.enemies.getChildren()) {
        const enemy = child as BodyImage;
        if (enemy.active) { this.showExplosion(enemy.x, enemy.y, false); this.retire(enemy); }
      }
      this.cameras.main.shake(420, 0.016);
      if (this.mode === 'campaign') saveSettings({ endlessUnlocked: true });
    }
    const { rank, best } = pushScore({
      score: this.score, wave: this.wave, difficulty: this.difficulty,
      mode: this.mode, victory, at: Date.now(),
    });
    this.time.delayedCall(victory ? 1100 : 500, () => this.scene.start('NeonGameOver', {
      score: this.score, wave: this.wave, best, rank, victory,
      mode: this.mode, difficulty: this.difficulty,
    }));
  }
}
