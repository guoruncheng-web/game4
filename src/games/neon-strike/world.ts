import * as THREE from 'three';
import {
  AIM, BOSS_SPEC, CAMPAIGN_WAVES, DIFFICULTIES, ENEMY_SPEC, HITBOX, OBSTACLE, OBSTACLE_SPEC,
  POWER_COLOR, SPACE, TUNING,
  type DifficultyId, type DifficultySpec, type EnemyKind, type GameMode, type ObstacleKind,
  type PowerKind,
} from './config';
import { sfx } from './sfx';
import { pushScore, saveSettings } from './storage';
import { cloneShip, collectArmorMaterials, collectGlowMaterials, disposeTree, type Assets } from './three/assets';
import type { Fx } from './three/fx';
import { Reticle } from './three/reticle';
import type { Stage } from './three/stage';

export type HudState = {
  score: number;
  lives: number;
  weapon: number;
  wave: number;
  mode: GameMode;
  combo: number;
  shield: { charges: number; seconds: number } | null;
  boss: { name: string; ratio: number; phase: number } | null;
};

export type WorldEvents = {
  onHud(state: HudState): void;
  onBanner(text: string, boss: boolean): void;
  onFloat(text: string, tone: 'good' | 'bad'): void;
  onFlash(strength: number): void;
  onFinish(result: { score: number; wave: number; best: number; rank: number; victory: boolean }): void;
};

type Enemy = {
  root: THREE.Object3D;
  glow: THREE.MeshStandardMaterial[];
  armor: THREE.MeshStandardMaterial[];
  armorBase: number[];
  active: boolean;
  kind: EnemyKind;
  hp: number;
  maxHp: number;
  boss: boolean;
  score: number;
  /** Boss 入场动画期间不吃子弹,避免连续受击闪成一片 */
  collidable: boolean;
  vx: number;
  vy: number;
  vz: number;
  phase: number;
  diveAt: number;
  dived: boolean;
  half: { x: number; y: number; z: number };
  flashUntil: number;
  pattern: number;
  alt: number;
  entry?: { fromZ: number; toZ: number; start: number; duration: number };
};

type Shot = {
  mesh: THREE.Mesh;
  active: boolean;
  vx: number;
  vy: number;
  vz: number;
};

type Obstacle = {
  root: THREE.Object3D;
  active: boolean;
  kind: ObstacleKind;
  /** null = 不可摧毁 */
  hp: number | null;
  vz: number;
  spin: number;
  axis: THREE.Vector3;
  half: { x: number; y: number; z: number };
};

type Power = {
  /** 模型(有 glb 时)或程序化八面体(没有时);两者都只当作一个可移动的节点用 */
  mesh: THREE.Object3D;
  active: boolean;
  kind: PowerKind;
  vz: number;
};

type Timer = { at: number; run: () => void };

const ENEMY_POOL = 22;
const SHOT_POOL = 60;
const ENEMY_SHOT_POOL = 90;
const POWER_POOL = 10;
/** 每种障碍物各一池。同屏最多 6 个,留一倍余量 */
const OBSTACLE_POOL = 12;

/** 玩家子弹的形状:细长的等离子束,长轴沿 Z */
function makeShotMesh(color: number, radius: number, length: number) {
  const geometry = new THREE.CylinderGeometry(radius, radius * 0.7, length, 8, 1, true);
  geometry.rotateX(Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  });
  return new THREE.Mesh(geometry, material);
}

export class World {
  readonly group = new THREE.Group();

  private player!: THREE.Object3D;
  private playerGlow: THREE.MeshStandardMaterial[] = [];
  private playerArmor: THREE.MeshStandardMaterial[] = [];
  private playerArmorBase: number[] = [];
  private shieldBubble!: THREE.Mesh;
  private reticle!: Reticle;
  /** 当前被软锁定的敌机;开火按它算弹道,准星也按它变色 */
  private lockTarget: Enemy | null = null;
  private engineLight!: THREE.PointLight;

  private enemies: Enemy[] = [];
  private shots: Shot[] = [];
  private enemyShots: Shot[] = [];
  private powers: Power[] = [];
  private obstacles: Obstacle[] = [];
  /** 本局是否已经提示过障碍物。只教一次 */
  private warnedObstacle = false;
  private timers: Timer[] = [];

  private diff: DifficultySpec;
  /**
   * 游戏内时钟(毫秒)。只有在真正推进的帧里才累加 —— 暂停、顿帧、切标签页都不走,
   * 于是护盾、无敌帧、俯冲时刻这些绝对截止时间天然不会被暂停偷走,
   * 不需要 2D 版那套"把所有 deadline 整体后移"的补偿。
   */
  private now = 0;
  private score = 0;
  private lives: number;
  private weapon = 1;
  private wave = 0;
  private remaining = 0;
  private combo = 1;
  private shieldCharges = 0;
  private shieldUntil = 0;
  private invulnerableUntil = 0;
  private leakGraceUntil = 0;
  private lastShot = 0;
  private lastKill = 0;
  private lastDamageAt = -9999;
  private lastBossImpact = 0;
  private hitStopUntil = 0;
  private ended = false;
  private boss?: Enemy;
  private bossName = '';

  private keys = new Set<string>();
  private dragPointer: number | null = null;
  private dragOffset = new THREE.Vector2();
  private target = new THREE.Vector2();
  private raycaster = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -SPACE.playerZ);
  private hitPoint = new THREE.Vector3();
  private pointer = new THREE.Vector2();
  private disposables: Array<{ dispose(): void }> = [];

  constructor(
    private readonly stage: Stage,
    private readonly fx: Fx,
    private readonly assets: Assets,
    private readonly mode: GameMode,
    private readonly difficulty: DifficultyId,
    private readonly events: WorldEvents,
  ) {
    this.diff = DIFFICULTIES[difficulty] ?? DIFFICULTIES.normal;
    this.lives = this.diff.lives;
    stage.root.add(this.group);
    this.buildPlayer();
    this.reticle = new Reticle(this.group);
    this.buildPools();
    this.bindInput();
    // 起飞护盾:1 层、不过期,撑到第一次真的挨打为止。
    // 给 7 秒倒计时的话,它会在什么都没发生的情况下静默消失,只会教玩家"护盾会自己没掉"。
    this.grantShield(1);
    this.after(650, () => this.startWave());
  }

  /** 暂停面板要显示当前进度,只读地暴露出去 */
  get progress() {
    return { wave: this.wave, score: this.score };
  }

  // ------------------------------------------------------------ 建场

  private buildPlayer() {
    this.player = cloneShip(this.assets.player);
    this.playerGlow = collectGlowMaterials(this.player);
    this.playerArmor = collectArmorMaterials(this.player);
    this.playerArmorBase = this.playerArmor.map((m) => m.color.getHex());
    this.player.position.set(0, 0, SPACE.playerZ);
    this.group.add(this.player);

    // 引擎的实时点光。战机是全场唯一贴近相机的物体,给它一盏自带光源,
    // 走位时机身的高光会跟着扫过,比纯自发光"贴纸"有体积得多。
    this.engineLight = new THREE.PointLight(0x66eaff, 26, 14, 2);
    this.engineLight.position.set(0, 0.2, 1.4);
    this.player.add(this.engineLight);

    const geometry = new THREE.IcosahedronGeometry(1.85, 2);
    const material = new THREE.MeshBasicMaterial({
      color: 0x54ecff, transparent: true, opacity: 0.16, wireframe: true,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    });
    this.shieldBubble = new THREE.Mesh(geometry, material);
    this.shieldBubble.visible = false;
    this.player.add(this.shieldBubble);
    this.disposables.push(geometry, material);
  }

  private buildPools() {
    for (let i = 0; i < ENEMY_POOL; i++) {
      const root = cloneShip(this.assets.enemy);
      // 模型机头朝 -Z,敌机要迎面而来,转半圈
      root.rotation.y = Math.PI;
      root.visible = false;
      this.group.add(root);
      const armor = collectArmorMaterials(root);
      this.enemies.push({
        root, glow: collectGlowMaterials(root), armor,
        armorBase: armor.map((m) => m.color.getHex()),
        active: false, kind: 'grunt', hp: 1, maxHp: 1, boss: false, score: 100, collidable: true,
        vx: 0, vy: 0, vz: 0, phase: 0, diveAt: 0, dived: false,
        half: { ...HITBOX.enemy }, flashUntil: 0, pattern: 0, alt: 0,
      });
    }

    // Boss 单独一只,模型和小兵不同,建一份挂着复用
    const bossRoot = cloneShip(this.assets.boss);
    bossRoot.rotation.y = Math.PI;
    bossRoot.visible = false;
    this.group.add(bossRoot);
    const bossArmor = collectArmorMaterials(bossRoot);
    this.boss = {
      root: bossRoot, glow: collectGlowMaterials(bossRoot), armor: bossArmor,
      armorBase: bossArmor.map((m) => m.color.getHex()),
      active: false, kind: 'grunt', hp: 1, maxHp: 1, boss: true, score: 1200, collidable: false,
      vx: 0, vy: 0, vz: 0, phase: 0, diveAt: 0, dived: false,
      half: { ...HITBOX.boss }, flashUntil: 0, pattern: 0, alt: 0,
    };

    for (let i = 0; i < SHOT_POOL; i++) {
      const mesh = makeShotMesh(0x9ffcff, 0.09, 1.8);
      mesh.visible = false;
      this.group.add(mesh);
      this.shots.push({ mesh, active: false, vx: 0, vy: 0, vz: 0 });
      this.disposables.push(mesh.geometry, mesh.material as THREE.Material);
    }
    for (let i = 0; i < ENEMY_SHOT_POOL; i++) {
      const mesh = makeShotMesh(0xff7a3c, 0.16, 1.1);
      mesh.visible = false;
      this.group.add(mesh);
      this.enemyShots.push({ mesh, active: false, vx: 0, vy: 0, vz: 0 });
      this.disposables.push(mesh.geometry, mesh.material as THREE.Material);
    }

    this.buildPowerPool();

    this.buildObstaclePool();
  }

  /**
   * 道具池。三种道具的模型和颜色都不一样,所以池位按种类固定分配:
   * 拿到 shield 掉落就去找空着的 shield 位。这和敌机那种"一套模型染色复用"不同 ——
   * 道具靠形状区分种类,染色救不了它。
   *
   * 没有 glb 时回落到程序化八面体 + 按种类染色,也就是这一版之前的样子。
   */
  private buildPowerPool() {
    const kinds = Object.keys(POWER_COLOR) as PowerKind[];
    const fallbackGeometry = new THREE.OctahedronGeometry(0.62, 0);
    let usedFallback = false;

    for (let i = 0; i < POWER_POOL; i++) {
      const kind = kinds[i % kinds.length];
      const proto = this.assets.pickups[kind];
      let mesh: THREE.Object3D;
      if (proto) {
        mesh = cloneShip(proto);
        mesh.scale.setScalar(0.72);
      } else {
        usedFallback = true;
        const material = new THREE.MeshStandardMaterial({
          color: POWER_COLOR[kind], emissive: POWER_COLOR[kind], emissiveIntensity: 1.4,
          metalness: 0.2, roughness: 0.25,
        });
        mesh = new THREE.Mesh(fallbackGeometry, material);
        this.disposables.push(material);
      }
      mesh.visible = false;
      this.group.add(mesh);
      this.powers.push({ mesh, active: false, kind, vz: 0 });
    }

    if (usedFallback) this.disposables.push(fallbackGeometry);
    else fallbackGeometry.dispose();
  }

  /**
   * 障碍物池。三种模型轮流建,缺哪种就跳过哪种 —— 模型没产出时游戏照常跑,
   * 只是这一局没有障碍物,不会因为少一个 glb 就开不了局。
   */
  private buildObstaclePool() {
    const kinds = (Object.keys(OBSTACLE_SPEC) as ObstacleKind[])
      .filter((kind) => !!this.assets.obstacles[kind]);
    if (!kinds.length) return;
    for (let i = 0; i < OBSTACLE_POOL; i++) {
      const kind = kinds[i % kinds.length];
      const root = cloneShip(this.assets.obstacles[kind]!);
      root.visible = false;
      this.group.add(root);
      this.obstacles.push({
        root, active: false, kind, hp: OBSTACLE_SPEC[kind].hp, vz: 0, spin: 0,
        axis: new THREE.Vector3(0, 1, 0), half: { ...OBSTACLE_SPEC[kind].half },
      });
    }
  }

  // ------------------------------------------------------------ 输入

  private onKeyDown = (e: KeyboardEvent) => {
    this.keys.add(e.code);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  };
  private onKeyUp = (e: KeyboardEvent) => { this.keys.delete(e.code); };

  private onPointerDown = (e: PointerEvent) => {
    if (this.dragPointer !== null) return;
    const point = this.projectToPlane(e);
    if (!point) return;
    this.dragPointer = e.pointerId;
    // 记下"手指落点"和"战机当前位置"的差值,之后一直保持这个差值。
    // 直接把战机瞬移到手指下面的话,手指本身会把战机遮住,
    // 而且按下的那一刻会突然跳一段,判断不了自己有没有撞上东西。
    this.dragOffset.set(this.target.x - point.x, this.target.y - point.y);
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  private onPointerMove = (e: PointerEvent) => {
    if (e.pointerId !== this.dragPointer) return;
    const point = this.projectToPlane(e);
    if (!point) return;
    this.target.set(point.x + this.dragOffset.x, point.y + this.dragOffset.y);
    this.clampTarget();
  };

  private onPointerUp = (e: PointerEvent) => {
    if (e.pointerId === this.dragPointer) this.dragPointer = null;
  };

  /** 把屏幕坐标打到 z=playerZ 的走位平面上 */
  private projectToPlane(e: PointerEvent) {
    const canvas = this.stage.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    this.pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.stage.camera);
    return this.raycaster.ray.intersectPlane(this.plane, this.hitPoint);
  }

  private bindInput() {
    const canvas = this.stage.renderer.domElement;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
  }

  private unbindInput() {
    const canvas = this.stage.renderer.domElement;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointermove', this.onPointerMove);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('pointercancel', this.onPointerUp);
  }

  private clampTarget() {
    const { halfX, halfY, centerY } = this.stage.playArea;
    this.target.x = THREE.MathUtils.clamp(this.target.x, -halfX, halfX);
    this.target.y = THREE.MathUtils.clamp(this.target.y, centerY - halfY, centerY + halfY);
  }

  /** 松开手指后键盘接管,所以两套输入必须共用同一个 target,不能各写各的 */
  private driveKeyboard(dt: number) {
    const k = this.keys;
    const x = (k.has('ArrowRight') || k.has('KeyD') ? 1 : 0) - (k.has('ArrowLeft') || k.has('KeyA') ? 1 : 0);
    const y = (k.has('ArrowUp') || k.has('KeyW') ? 1 : 0) - (k.has('ArrowDown') || k.has('KeyS') ? 1 : 0);
    if (x === 0 && y === 0) return;
    const len = Math.hypot(x, y) || 1;
    this.target.x += (x / len) * TUNING.playerSpeed * dt;
    this.target.y += (y / len) * TUNING.playerSpeed * dt;
    this.clampTarget();
  }

  // ------------------------------------------------------------ 主循环

  /** @param realDt 真实帧间隔(秒)。特效和顿帧按真实时间走,玩法按游戏时钟走。 */
  update(realDt: number) {
    const dt = Math.min(realDt, 0.05);
    const running = !this.ended && performance.now() >= this.hitStopUntil;
    const step = running ? dt : 0;
    this.now += step * 1000;

    const flow = 26 + Math.min(this.wave * 1.6, 22);
    this.stage.setFlowSpeed(flow);

    if (running) {
      this.driveKeyboard(dt);
      this.runTimers();
      this.driveShots(dt);
      this.driveEnemies(dt);
      this.drivePowers(dt);
      this.driveObstacles(dt);
      // 先结算锁定再开火:同一帧里刚被打掉的目标不该再吃到一发
      this.acquireLock();
      if (this.now - this.lastShot >= TUNING.fireDelay) this.fire();
      if (this.now - this.lastKill > TUNING.comboWindow && this.combo > 1) this.combo = 1;
      this.collide(dt);
    }

    this.drivePlayerVisual(dt);
    const p = this.player.position;
    this.reticle.update(dt, p.x, p.y, p.z, running && this.lockTarget ? this.lockTarget.root.position : null);
    // 特效跟着世界一起往身后掠,残骸不会诡异地悬停;顿帧期间也照放
    this.fx.update(dt, flow * dt * 0.35);
    this.stage.update(dt, this.player.position.x, this.player.position.y);
    this.emitHud();
  }

  private drivePlayerVisual(dt: number) {
    const p = this.player;
    // 位置用插值逼近 target:手指瞬移时机身有个短促的跟随,读起来像有惯性的飞行器
    const k = Math.min(1, dt * 16);
    p.position.x += (this.target.x - p.position.x) * k;
    p.position.y += (this.target.y - p.position.y) * k;
    const dx = this.target.x - p.position.x;
    const dy = this.target.y - p.position.y;
    // 横移压坡度、拉升抬机头,是最便宜也最有效的"这是一架飞机"的暗示
    p.rotation.z += (-dx * 0.42 - p.rotation.z) * k;
    p.rotation.x += (-dy * 0.25 - p.rotation.x) * k;
    p.rotation.y += (dx * 0.12 - p.rotation.y) * k;

    const invulnerable = this.now < this.invulnerableUntil;
    const blink = invulnerable && Math.floor(this.now / 80) % 2 === 0;
    p.visible = !blink;
    const shielded = this.shieldActive();
    this.shieldBubble.visible = shielded;
    if (shielded) {
      this.shieldBubble.rotation.y += dt * 0.9;
      this.shieldBubble.rotation.x += dt * 0.5;
      const material = this.shieldBubble.material as THREE.MeshBasicMaterial;
      // 层数多时更亮;只剩最后一层(含起飞盾)就压暗,让"快没了"这件事看得见
      material.opacity = this.shieldCharges > 1 ? 0.22 : 0.11;
    }
    const pulse = 22 + Math.sin(this.now / 90) * 5;
    this.engineLight.intensity = pulse;
  }

  private runTimers() {
    if (!this.timers.length) return;
    // 回调里可能继续 after(),先摘下来再跑,避免同一帧无限追加
    const due = this.timers.filter((t) => t.at <= this.now);
    if (!due.length) return;
    this.timers = this.timers.filter((t) => t.at > this.now);
    for (const timer of due) timer.run();
  }

  private after(ms: number, run: () => void) {
    this.timers.push({ at: this.now + ms, run });
  }

  // ------------------------------------------------------------ 射击

  /**
   * 软锁定:在弹道前方的一个窗口里挑最近的目标。
   *
   * 窗口是轴对齐的盒子而不是圆锥角,因为玩家读的就是"准星有没有套住它"这件二维的事;
   * 用角度会让近处判定小得离谱、远处大得没道理。窗口随纵深线性放宽,抵消透视误差。
   * Boss 一样吃这套 —— 它体量大,几乎总在窗口里,等于自动咬住,符合"打 Boss 时专心走位"的预期。
   */
  private acquireLock() {
    const p = this.player.position;
    let best: Enemy | null = null;
    let bestDepth = Infinity;
    for (const enemy of this.liveEnemies()) {
      const e = enemy.root.position;
      const depth = p.z - e.z;
      if (depth < AIM.minZ || depth > AIM.maxZ) continue;
      const grow = 1 + depth * AIM.lockGrow;
      if (Math.abs(e.x - p.x) > (AIM.lockX + enemy.half.x) * grow) continue;
      if (Math.abs(e.y - p.y) > (AIM.lockY + enemy.half.y) * grow) continue;
      // 咬最近的那个:玩家的注意力天然在最先撞上来的敌机身上
      if (depth < bestDepth) { bestDepth = depth; best = enemy; }
    }
    this.lockTarget = best;
  }

  private fire() {
    this.lastShot = this.now;
    const p = this.player.position;
    // 火力等级决定弹道数量与散布
    const lanes = this.weapon === 1 ? [{ dx: 0, spread: 0 }]
      : this.weapon === 2 ? [{ dx: -0.42, spread: 0 }, { dx: 0.42, spread: 0 }]
      : [{ dx: -0.6, spread: -0.1 }, { dx: 0, spread: 0 }, { dx: 0.6, spread: 0.1 }];
    const target = this.lockTarget?.root.position ?? null;
    for (const lane of lanes) {
      const shot = this.shots.find((s) => !s.active);
      if (!shot) continue;
      shot.active = true;
      shot.mesh.visible = true;
      const ox = p.x + lane.dx, oy = p.y + 0.05, oz = p.z - 1.4;
      shot.mesh.position.set(ox, oy, oz);
      if (target) {
        // 咬住目标时整束弹道折向它:多管火力仍从各自的枪口出发,在目标处收拢
        const dx = target.x - ox, dy = target.y - oy, dz = target.z - oz;
        const len = Math.hypot(dx, dy, dz) || 1;
        shot.vx = (dx / len) * TUNING.bulletSpeed;
        shot.vy = (dy / len) * TUNING.bulletSpeed;
        shot.vz = (dz / len) * TUNING.bulletSpeed;
      } else {
        shot.vx = lane.spread * TUNING.bulletSpeed;
        shot.vy = 0;
        shot.vz = -TUNING.bulletSpeed;
      }
      // 弹体朝向跟着弹道走,否则折向之后会看到子弹"横着飞"
      shot.mesh.lookAt(
        shot.mesh.position.x + shot.vx,
        shot.mesh.position.y + shot.vy,
        shot.mesh.position.z + shot.vz,
      );
    }
    sfx.shoot();
  }

  private spawnEnemyShot(x: number, y: number, z: number, vx: number, vy: number, vz: number) {
    const shot = this.enemyShots.find((s) => !s.active);
    if (!shot) return;
    shot.active = true;
    shot.mesh.visible = true;
    shot.mesh.position.set(x, y, z);
    shot.vx = vx; shot.vy = vy; shot.vz = vz;
  }

  /** 朝玩家当前位置开一发,spread 是绕世界 Y 轴的水平偏转 */
  private aimedShot(from: THREE.Vector3, speed: number, spread = 0) {
    const p = this.player.position;
    let dx = p.x - from.x, dy = p.y - from.y, dz = p.z - from.z;
    const len = Math.hypot(dx, dy, dz);
    // 炮口和玩家完全重合时方向是 0 向量,兜底成朝正后方(即朝玩家一侧)
    if (len < 1e-4) { dx = 0; dy = 0; dz = 1; }
    else { dx /= len; dy /= len; dz /= len; }
    if (spread !== 0) {
      const cos = Math.cos(spread), sin = Math.sin(spread);
      const nx = dx * cos + dz * sin;
      const nz = -dx * sin + dz * cos;
      dx = nx; dz = nz;
    }
    this.spawnEnemyShot(from.x, from.y, from.z, dx * speed, dy * speed, dz * speed);
  }

  private driveShots(dt: number) {
    const limitZ = this.stage.camera.position.z + 4;
    for (const shot of this.shots) {
      if (!shot.active) continue;
      shot.mesh.position.x += shot.vx * dt;
      shot.mesh.position.y += shot.vy * dt;
      shot.mesh.position.z += shot.vz * dt;
      if (shot.mesh.position.z < SPACE.spawnZ - 20) this.retireShot(shot);
    }
    for (const shot of this.enemyShots) {
      if (!shot.active) continue;
      const m = shot.mesh.position;
      m.x += shot.vx * dt; m.y += shot.vy * dt; m.z += shot.vz * dt;
      // 追踪弹可能打成近水平弹道,只按 z 回收会让它长期占着池子,Boss 取不到弹就"哑火"
      if (m.z > limitZ || m.z < SPACE.spawnZ - 20 || Math.abs(m.x) > 60 || Math.abs(m.y) > 40) {
        this.retireShot(shot);
      }
    }
  }

  private retireShot(shot: Shot) {
    shot.active = false;
    shot.mesh.visible = false;
  }

  // ------------------------------------------------------------ 波次与生成

  private startWave() {
    if (this.ended) return;
    this.wave++;
    const boss = this.wave % TUNING.bossEvery === 0;
    const count = boss ? 9 : Math.min(4 + this.wave, 11);
    this.remaining = count;
    const finale = this.mode === 'campaign' && this.wave === CAMPAIGN_WAVES;
    this.events.onBanner(finale ? '⚠ 最终核心' : boss ? '⚠ 核心战舰来袭' : `WAVE ${this.wave}`, boss);
    if (boss) {
      sfx.boss();
      this.fx.portal(0, 0, SPACE.bossZ - 6);
      this.after(700, () => this.spawnBoss());
      const kinds = this.rollKinds(8);
      for (let i = 0; i < 8; i++) this.after(1050 + i * 180, () => this.spawnEnemy(i, kinds[i]));
    } else {
      const kinds = this.rollKinds(count);
      for (let i = 0; i < count; i++) this.after(500 + i * 260, () => this.spawnEnemy(i, kinds[i]));
    }
    this.scheduleObstacles(boss);
  }

  /** 按波次解锁兵种,再按权重抽这一波的编成 */
  private rollKinds(count: number): EnemyKind[] {
    const pool = (Object.keys(ENEMY_SPEC) as EnemyKind[]).filter((k) => this.wave >= ENEMY_SPEC[k].from);
    const total = pool.reduce((sum, k) => sum + ENEMY_SPEC[k].weight, 0);
    return Array.from({ length: count }, () => {
      let roll = Math.random() * total;
      for (const kind of pool) {
        roll -= ENEMY_SPEC[kind].weight;
        if (roll <= 0) return kind;
      }
      return 'grunt' as EnemyKind;
    });
  }

  private spawnEnemy(index: number, kind: EnemyKind = 'grunt') {
    if (this.ended) return;
    const slot = this.enemies.find((e) => !e.active);
    if (!slot) return;
    const spec = ENEMY_SPEC[kind];
    const { halfX, halfY, centerY } = this.stage.playArea;
    // 五列 × 两排铺开。编队按走位范围换算,任何屏幕比例下都落在可打击的区域里
    const col = index % 5;
    const row = Math.floor(index / 5) % 2;
    // 编队铺满可走范围的 88%,再加上随机抖动也不会越界。
    // 之前是 105% + 抖动,最外侧那两列生成在玩家永远走不到的地方 ——
    // 打不到、撞不到,只能等它自己飞过去扣一条命
    const x = (col / 4 - 0.5) * 2 * halfX * 0.88 + (Math.random() - 0.5) * 0.5;
    const y = centerY + (row === 0 ? 0.32 : -0.4) * halfY + (Math.random() - 0.5) * 0.7;

    slot.active = true;
    slot.kind = kind;
    slot.boss = false;
    slot.collidable = true;
    slot.score = spec.score;
    slot.hp = spec.hp + Math.floor(this.wave / this.diff.hpStep) + this.diff.hpFlat;
    slot.maxHp = slot.hp;
    slot.phase = Math.random() * 2000;
    slot.diveAt = this.now + 900 + Math.random() * 600;
    slot.dived = false;
    slot.flashUntil = 0;
    slot.half = {
      x: HITBOX.enemy.x * spec.scale, y: HITBOX.enemy.y * spec.scale, z: HITBOX.enemy.z * spec.scale,
    };
    slot.root.scale.setScalar(spec.scale);
    slot.root.position.set(x, y, SPACE.spawnZ);
    slot.root.rotation.set(0, Math.PI, 0);
    slot.root.visible = true;
    this.paintGlow(slot, spec.glow);
    this.restoreArmor(slot);

    const forward = (11 + this.wave * 0.85) * spec.speed * this.diff.enemySpeed;
    slot.vz = forward;
    slot.vx = kind === 'weaver' ? 0 : (Math.random() - 0.5) * 1.6;
    slot.vy = (Math.random() - 0.5) * 0.6;

    const chance = Math.min(0.12 + this.wave * 0.025, 0.4) * spec.fire * this.diff.fireChance;
    if (spec.fire > 0 && Math.random() < chance) {
      this.after(950 + index * 80, () => this.enemyFire(slot, kind === 'gunner'));
    }
  }

  private bossIndex() {
    return Math.max(1, Math.ceil(this.wave / TUNING.bossEvery));
  }

  private spawnBoss() {
    if (this.ended || !this.boss) return;
    const spec = BOSS_SPEC[(this.bossIndex() - 1) % BOSS_SPEC.length];
    const boss = this.boss;
    boss.active = true;
    boss.boss = true;
    boss.collidable = false;
    boss.hp = Math.round((spec.hp + this.wave * 2) * this.diff.bossHp);
    boss.maxHp = boss.hp;
    boss.score = 1200 * this.bossIndex();
    boss.pattern = spec.pattern;
    boss.alt = 0;
    boss.flashUntil = 0;
    boss.vx = 0; boss.vy = 0; boss.vz = 0;
    boss.root.position.set(0, this.stage.playArea.centerY + 0.6, SPACE.spawnZ);
    boss.root.rotation.set(0, Math.PI, 0);
    boss.root.visible = true;
    this.paintGlow(boss, spec.glow);
    this.restoreArmor(boss);
    this.bossName = spec.name;
    // 入场期间只放展示动画,不参与子弹碰撞
    boss.entry = { fromZ: SPACE.spawnZ, toZ: SPACE.bossZ, start: this.now, duration: 1900 };
  }

  private onBossReady(boss: Enemy) {
    boss.collidable = true;
    boss.vx = (4.4 + boss.pattern * 1.1) * (Math.random() < 0.5 ? -1 : 1);
    this.bossAttack(boss);
  }

  private bossAttack(boss: Enemy) {
    if (!boss.active || this.ended) return;
    const ratio = boss.hp / boss.maxHp;
    const enraged = ratio <= 0.35;
    const speed = TUNING.enemyBulletSpeed * this.diff.enemyBullet;
    // 炮口在舰体正前方,不然子弹会从模型内部冒出来
    const muzzle = boss.root.position.clone();
    muzzle.z += 3.2;

    // 瞄准弹压住走位、固定弹幕封住横移:只有两者都在,玩家才必须真的动。
    // 纯瞄准弹的话,弹速追不上玩家的横移速度,持续左右拉扯就能让整个扇面打空。
    if (boss.pattern === 0) {
      for (let i = -1; i <= 1; i++) this.aimedShot(muzzle, speed * 1.35, i * 0.34);
    } else if (boss.pattern === 1) {
      for (let i = -1; i <= 1; i++) this.aimedShot(muzzle, speed * 1.3, i * 0.3);
      for (const vx of [-11, 11]) this.spawnEnemyShot(muzzle.x, muzzle.y, muzzle.z, vx, 0, speed);
    } else {
      boss.alt++;
      if (boss.alt % 2 === 1) {
        for (let i = -2; i <= 2; i++) this.aimedShot(muzzle, speed * 1.25, i * 0.22);
        for (const vx of [-13, 0, 13]) this.spawnEnemyShot(muzzle.x, muzzle.y, muzzle.z, vx, -2, speed);
      } else {
        for (let i = 0; i < 3; i++) {
          this.after(i * 130, () => {
            if (!boss.active || this.ended) return;
            const m = boss.root.position.clone();
            m.z += 3.2;
            this.aimedShot(m, speed * 1.15);
          });
        }
      }
    }
    const base = Math.max(460, (1050 - boss.pattern * 60) - this.wave * 25);
    this.after(enraged ? base * 0.62 : base, () => this.bossAttack(boss));
  }

  private enemyFire(enemy: Enemy, repeat = false) {
    if (!enemy.active || this.ended) return;
    const from = enemy.root.position.clone();
    from.z += 1;
    this.aimedShot(from, TUNING.enemyBulletSpeed * this.diff.enemyBullet);
    // 炮艇会持续点射,死了或结算了就自然停下
    if (repeat) this.after(900 + Math.random() * 500, () => this.enemyFire(enemy, true));
  }

  // ------------------------------------------------------------ 敌机行为

  private driveEnemies(dt: number) {
    for (const enemy of this.enemies) if (enemy.active) this.driveEnemy(enemy, dt);
    if (this.boss?.active) this.driveEnemy(this.boss, dt);
  }

  private driveEnemy(enemy: Enemy, dt: number) {
    const pos = enemy.root.position;

    if (enemy.entry) {
      const t = Math.min(1, (this.now - enemy.entry.start) / enemy.entry.duration);
      // easeOutCubic:远处冲过来,近处稳稳刹住
      const eased = 1 - (1 - t) ** 3;
      pos.z = enemy.entry.fromZ + (enemy.entry.toZ - enemy.entry.fromZ) * eased;
      enemy.root.rotation.z = Math.sin(t * Math.PI * 2) * 0.12;
      if (t >= 1) { enemy.entry = undefined; this.onBossReady(enemy); }
      return;
    }

    if (enemy.boss) {
      pos.x += enemy.vx * dt;
      const limit = this.stage.playArea.halfX * 0.9 + 1.2;
      if (pos.x > limit || pos.x < -limit) {
        enemy.vx *= -1;
        pos.x = THREE.MathUtils.clamp(pos.x, -limit, limit);
      }
      pos.y = this.stage.playArea.centerY + 0.6 + Math.sin(this.now / 900) * 0.5;
      enemy.root.rotation.z = -enemy.vx * 0.035;
      enemy.root.rotation.y = Math.PI + enemy.vx * 0.02;
      this.tickFlash(enemy);
      return;
    }

    if (enemy.kind === 'weaver') {
      enemy.vx = Math.cos((this.now + enemy.phase) / 320) * 4.6;
    } else if (enemy.kind === 'charger' && !enemy.dived && this.now >= enemy.diveAt) {
      enemy.dived = true;
      enemy.vx = 0; enemy.vy = 0;
      enemy.vz = 52 * this.diff.enemySpeed;
      this.paintGlow(enemy, 0xff3a12);
      enemy.root.scale.setScalar(ENEMY_SPEC.charger.scale * 1.12);
    }

    pos.x += enemy.vx * dt;
    pos.y += enemy.vy * dt;
    pos.z += enemy.vz * dt;
    // 横摆(weaver 的 vx 能到 ±4.6)会把敌机一路带出可走范围。
    // 越界就贴边并反向 —— 玩家够不到的敌机,既不是威胁也不是目标,只是噪音
    const { halfX, halfY, centerY } = this.stage.playArea;
    if (Math.abs(pos.x) > halfX) {
      pos.x = THREE.MathUtils.clamp(pos.x, -halfX, halfX);
      enemy.vx *= -1;
    }
    const lowY = centerY - halfY, highY = centerY + halfY;
    if (pos.y < lowY || pos.y > highY) {
      pos.y = THREE.MathUtils.clamp(pos.y, lowY, highY);
      enemy.vy *= -1;
    }
    enemy.root.rotation.z = -enemy.vx * 0.09;
    enemy.root.rotation.y = Math.PI - enemy.vx * 0.04;
    this.tickFlash(enemy);

    if (pos.z > SPACE.leakZ) {
      this.retireEnemy(enemy);
      this.remaining--;
      this.damage('leak');
      this.checkWave();
    }
  }

  /** 受击闪白只改装甲件的底色,能量件保持兵种色,免得整机变成一坨白 */
  private tickFlash(enemy: Enemy) {
    if (enemy.flashUntil === 0 || this.now < enemy.flashUntil) return;
    enemy.flashUntil = 0;
    this.restoreArmor(enemy);
  }

  private paintGlow(enemy: Enemy, color: number) {
    for (const material of enemy.glow) {
      material.emissive.setHex(color);
      material.color.setHex(color);
    }
  }

  private restoreArmor(enemy: Enemy) {
    enemy.armor.forEach((material, i) => material.color.setHex(enemy.armorBase[i]));
  }

  private flashArmor(enemy: Enemy) {
    for (const material of enemy.armor) material.color.setHex(0x9fd8ff);
    enemy.flashUntil = this.now + 60;
  }

  private retireEnemy(enemy: Enemy) {
    if (this.lockTarget === enemy) this.lockTarget = null;
    enemy.active = false;
    enemy.collidable = false;
    enemy.entry = undefined;
    enemy.root.visible = false;
    enemy.root.scale.setScalar(1);
  }

  // ------------------------------------------------------------ 碰撞

  /**
   * 轴对齐盒 vs 点。z 方向额外把盒子撑开一个"这一帧相对位移"的量:
   * 子弹一帧能跑 1.6 个单位,敌机半长只有 0.85,不做扫掠的话高速对撞会直接穿过去。
   */
  private overlaps(
    box: THREE.Vector3, half: { x: number; y: number; z: number },
    point: THREE.Vector3, radius: number, sweepZ: number,
  ) {
    return Math.abs(point.x - box.x) <= half.x + radius
      && Math.abs(point.y - box.y) <= half.y + radius
      && Math.abs(point.z - box.z) <= half.z + radius + sweepZ;
  }

  private *liveEnemies() {
    for (const enemy of this.enemies) if (enemy.active && enemy.collidable) yield enemy;
    if (this.boss?.active && this.boss.collidable) yield this.boss;
  }

  private collide(dt: number) {
    for (const shot of this.shots) {
      if (!shot.active) continue;
      const sweep = Math.abs(shot.vz) * dt * 0.5;
      for (const enemy of this.liveEnemies()) {
        if (!this.overlaps(enemy.root.position, enemy.half, shot.mesh.position, HITBOX.shot, sweep)) continue;
        const x = shot.mesh.position.x, y = shot.mesh.position.y, z = shot.mesh.position.z;
        this.retireShot(shot);
        this.hitEnemy(enemy, x, y, z);
        break;
      }
    }

    // 玩家子弹被障碍物挡下 —— 这是障碍物最主要的战术含义:
    // 咬住了目标不等于打得中,身位没绕过去,子弹就喂给石头了。
    //
    // 敌弹刻意不挡:能挡的话最优解就是贴在岩块后面等,走位压力立刻变成蹲坑收益,
    // 而躲在掩体后不动恰恰是这类纵深射击最不该奖励的打法。
    for (const shot of this.shots) {
      if (!shot.active) continue;
      const sweep = Math.abs(shot.vz) * dt * 0.5;
      for (const obstacle of this.obstacles) {
        if (!obstacle.active) continue;
        if (!this.overlaps(obstacle.root.position, obstacle.half, shot.mesh.position, HITBOX.shot, sweep)) continue;
        const x = shot.mesh.position.x, y = shot.mesh.position.y, z = shot.mesh.position.z;
        this.retireShot(shot);
        this.hitObstacle(obstacle, x, y, z);
        break;
      }
    }

    const p = this.player.position;
    for (const shot of this.enemyShots) {
      if (!shot.active) continue;
      const sweep = Math.abs(shot.vz) * dt * 0.5;
      if (!this.overlaps(p, HITBOX.player, shot.mesh.position, HITBOX.shot, sweep)) continue;
      this.hitPlayer(shot, null);
    }
    for (const enemy of this.liveEnemies()) {
      const sweep = Math.abs(enemy.vz) * dt * 0.5;
      if (!this.overlaps(enemy.root.position, enemy.half, p, HITBOX.player.x, sweep)) continue;
      this.hitPlayer(null, enemy);
    }
    for (const obstacle of this.obstacles) {
      if (!obstacle.active) continue;
      const sweep = Math.abs(obstacle.vz) * dt * 0.5;
      if (!this.overlaps(obstacle.root.position, obstacle.half, p, HITBOX.player.x, sweep)) continue;
      // 撞上去两边都要结算:玩家吃伤害(护盾会先顶),障碍物原地炸掉。
      // 不炸掉的话它会卡在玩家身上,在无敌帧结束的瞬间再判定一次,直接连掉两条命
      this.breakObstacle(obstacle, false);
      this.hitPlayer(null, null);
    }
    for (const power of this.powers) {
      if (!power.active) continue;
      if (!this.overlaps(p, HITBOX.player, power.mesh.position, HITBOX.power, Math.abs(power.vz) * dt * 0.5)) continue;
      this.takePower(power);
    }
  }

  private hitEnemy(enemy: Enemy, x: number, y: number, z: number) {
    enemy.hp -= 1;
    if (!enemy.boss) {
      this.flashArmor(enemy);
      this.fx.laserImpact(x, y, z, false);
    } else if (this.now - this.lastBossImpact >= 90) {
      // Boss 体量大、受击频繁,整机闪白会形成持续频闪;命中反馈交给局部冲击特效
      this.lastBossImpact = this.now;
      this.fx.laserImpact(x, y, z, true);
    }
    if (enemy.hp <= 0) this.destroyEnemy(enemy);
  }

  private destroyEnemy(enemy: Enemy) {
    const boss = enemy.boss;
    const base = enemy.score || 100;
    const { x, y, z } = enemy.root.position;
    this.retireEnemy(enemy);
    this.remaining--;
    this.combo = this.now - this.lastKill <= TUNING.comboWindow ? Math.min(this.combo + 1, 8) : 1;
    this.lastKill = this.now;
    // 难度倍率在计分那一刻就结算,HUD 上看到的分数就是最终分数
    this.score += Math.round(base * this.combo * this.diff.scoreScale);
    sfx.hit();
    this.fx.explosion(x, y, z, boss);
    this.hitStop(boss ? 90 : 35);
    if (boss) {
      this.stage.shake(320, 0.5);
      this.events.onFlash(0.55);
      this.dropPower(x - 2.2, y, z, 'weapon');
      this.dropPower(x + 2.2, y, z, 'life');
      if (this.mode === 'campaign' && this.wave >= CAMPAIGN_WAVES) { this.finish(true); return; }
    } else if (Math.random() < 0.11 * this.diff.powerChance) {
      this.dropPower(x, y, z, this.rollPower());
    }
    this.checkWave();
  }

  private rollPower(): PowerKind {
    if (this.lives < TUNING.maxLives && Math.random() < 0.18) return 'life';
    if (this.weapon < TUNING.maxWeapon && Math.random() < 0.5) return 'weapon';
    return 'shield';
  }

  private dropPower(x: number, y: number, z: number, kind: PowerKind) {
    // 池位按种类固定,想要的那种用光了就不掉 —— 与其掉一个长得不对的,不如不掉
    const power = this.powers.find((p) => !p.active && p.kind === kind);
    if (!power) return;
    // 掉落点必须落在玩家够得到的范围里。掉落位置来自敌机的死亡坐标,
    // 而敌机死在边缘、Boss 又往两侧各甩一个,不钳的话就会出现"贴着边飞也吃不到"
    const { halfX, halfY, centerY } = this.stage.playArea;
    const dropX = THREE.MathUtils.clamp(x, -halfX * 0.92, halfX * 0.92);
    const dropY = THREE.MathUtils.clamp(y, centerY - halfY * 0.92, centerY + halfY * 0.92);
    power.active = true;
    power.vz = 16;
    power.mesh.position.set(dropX, dropY, z);
    power.mesh.rotation.set(0, 0, 0);
    power.mesh.visible = true;
  }

  private drivePowers(dt: number) {
    const limitZ = this.stage.camera.position.z + 4;
    for (const power of this.powers) {
      if (!power.active) continue;
      power.mesh.position.z += power.vz * dt;
      // 绕视线轴自转 + 小幅摆头。旧的八面体可以随便翻滚,但现在道具是靠正面图形
      // 区分种类的,一旦绕 Y 转起来就会周期性地侧成一条线,那几帧玩家读不出是什么
      power.mesh.rotation.z += dt * 1.25;
      power.mesh.rotation.y = Math.sin(this.now / 420 + power.mesh.position.x) * 0.32;
      // 进入最后一段距离后向玩家横向吸附。奖励是正反馈,不该变成一道精确操作题;
      // 吸附只在近处生效,远处仍然要靠走位去接,"提前判断落点"这件事还在
      const near = this.player.position.z - power.mesh.position.z;
      if (near < 22) {
        const pull = Math.min(1, dt * 3.2);
        power.mesh.position.x += (this.player.position.x - power.mesh.position.x) * pull;
        power.mesh.position.y += (this.player.position.y - power.mesh.position.y) * pull;
      }
      if (power.mesh.position.z > limitZ) { power.active = false; power.mesh.visible = false; }
    }
  }

  // ------------------------------------------------------------ 障碍物

  /**
   * 排一波障碍物。和敌机错开时间下发,免得同一瞬间又要打又要躲。
   *
   * 障碍物不计入 remaining:波次结束的条件是"敌机清完",不是"路上没东西了"。
   * 否则玩家会被迫去打那些本来可以绕开的岩块,走位压力反而变成了打靶任务。
   */
  private scheduleObstacles(boss: boolean) {
    if (!this.obstacles.length || this.wave < OBSTACLE.fromWave) return;
    const count = boss
      ? OBSTACLE.boss
      : Math.min(OBSTACLE.base + Math.floor(this.wave / OBSTACLE.step), OBSTACLE.max);
    for (let i = 0; i < count; i++) {
      this.after(900 + i * 700 + Math.random() * 400, () => this.spawnObstacle());
    }
    if (!this.warnedObstacle) {
      this.warnedObstacle = true;
      this.after(820, () => this.events.onBanner('⚠ 航道有残骸', false));
    }
  }

  private rollObstacleKind(): ObstacleKind {
    const kinds = Object.keys(OBSTACLE_SPEC) as ObstacleKind[];
    const pool = kinds.filter((kind) => this.obstacles.some((o) => o.kind === kind));
    let total = 0;
    for (const kind of pool) total += OBSTACLE_SPEC[kind].weight;
    let roll = Math.random() * total;
    for (const kind of pool) {
      roll -= OBSTACLE_SPEC[kind].weight;
      if (roll <= 0) return kind;
    }
    return pool[0];
  }

  private spawnObstacle() {
    if (this.ended || !this.obstacles.length) return;
    const kind = this.rollObstacleKind();
    // 池按种类固定分配,想要的那种用光了就退而用任意空位(用它自己的种类)
    const slot = this.obstacles.find((o) => !o.active && o.kind === kind)
      ?? this.obstacles.find((o) => !o.active);
    if (!slot) return;
    const spec = OBSTACLE_SPEC[slot.kind];
    const { halfX, halfY, centerY } = this.stage.playArea;

    slot.active = true;
    slot.hp = spec.hp;
    slot.vz = (11 + this.wave * 0.85) * spec.speed * this.diff.enemySpeed;
    slot.spin = spec.spin * (Math.random() < 0.5 ? -1 : 1);
    // 每个个体一根随机转轴:同一个模型转起来就不像是同一件东西
    slot.axis.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    // 尺寸按航道宽度封顶。货舱本身半宽 1.7,而手机竖屏的航道半宽只有 4.2 上下,
    // 不封顶的话它会占掉大半条航道 —— 玩家不是"躲得难",是根本没有可去的位置
    const room = halfX * OBSTACLE.maxLaneShare;
    const scale = Math.min(0.85 + Math.random() * 0.3, room / spec.half.x);
    slot.root.scale.setScalar(scale);
    // 碰撞盒跟着实例缩放走。固定值的话表现成"看着躲开了却撞上"
    slot.half.x = spec.half.x * scale;
    slot.half.y = spec.half.y * scale;
    slot.half.z = spec.half.z * scale;

    // 落点要保证另一侧留得下一整架战机:先随机,再按需要往中间收 ——
    // 贴边生成看着凶,实际上只是把玩家往另一边赶,反而没有选择
    const need = slot.half.x + HITBOX.player.x + 0.45;
    const span = Math.max(0, halfX - slot.half.x - 0.2);
    slot.root.position.set(
      THREE.MathUtils.clamp((Math.random() * 2 - 1) * span, -(halfX - need), halfX - need),
      centerY + (Math.random() * 2 - 1) * halfY * 0.7,
      SPACE.spawnZ - Math.random() * 20,
    );
    slot.root.rotation.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);
    slot.root.visible = true;
  }

  private driveObstacles(dt: number) {
    for (const obstacle of this.obstacles) {
      if (!obstacle.active) continue;
      obstacle.root.position.z += obstacle.vz * dt;
      obstacle.root.rotateOnAxis(obstacle.axis, obstacle.spin * dt);
      // 飞过身后就算躲开了,不扣命 —— 障碍物不是敌人,放它过去本来就是正解
      if (obstacle.root.position.z > SPACE.leakZ) this.retireObstacle(obstacle);
    }
  }

  private retireObstacle(obstacle: Obstacle) {
    obstacle.active = false;
    obstacle.root.visible = false;
  }

  /** 子弹打在障碍物上。打不动的只出火花,打得动的扣血、破了给分 */
  private hitObstacle(obstacle: Obstacle, x: number, y: number, z: number) {
    if (obstacle.hp === null) {
      this.fx.laserImpact(x, y, z, false);
      sfx.hit();
      return;
    }
    obstacle.hp -= 1;
    if (obstacle.hp > 0) {
      this.fx.laserImpact(x, y, z, false);
      sfx.hit();
      return;
    }
    this.breakObstacle(obstacle, true);
  }

  /** @param scored 被玩家打掉才给分;撞上去炸掉不给 */
  private breakObstacle(obstacle: Obstacle, scored: boolean) {
    const spec = OBSTACLE_SPEC[obstacle.kind];
    const { x, y, z } = obstacle.root.position;
    this.retireObstacle(obstacle);
    // 水雷炸得比岩块响:它本来就是炸弹,而且这是"差点撞上"的负反馈
    const big = obstacle.kind === 'mine';
    this.fx.explosion(x, y, z, big);
    this.stage.shake(big ? 180 : 110, big ? 0.5 : 0.28);
    sfx.hit();
    this.hitStop(big ? 60 : 30);
    if (scored && spec.score) {
      // 障碍物不吃连击:连击是打敌机的节奏奖励,让它被岩块续上就等于鼓励打石头
      this.score += spec.score;
      this.events.onFloat(`+${spec.score}`, 'good');
    }
  }

  private takePower(power: Power) {
    const kind = power.kind;
    power.active = false;
    power.mesh.visible = false;
    sfx.pickup();
    if (kind === 'weapon') {
      if (this.weapon < TUNING.maxWeapon) {
        this.weapon++;
        this.events.onFloat(`火力 ${this.weapon} 级`, 'good');
      } else {
        this.score += Math.round(300 * this.diff.scoreScale);
        this.events.onFloat('火力已满 +300', 'good');
      }
    } else if (kind === 'life') {
      if (this.lives < TUNING.maxLives) {
        this.lives++;
        this.events.onFloat('补给 +1 机', 'good');
      } else {
        this.score += Math.round(300 * this.diff.scoreScale);
        this.events.onFloat('机库已满 +300', 'good');
      }
    } else {
      this.grantShield(TUNING.shieldCharges, TUNING.shieldDuration);
      this.events.onFloat(`护盾 ×${TUNING.shieldCharges}`, 'good');
    }
  }

  /**
   * 判定顺序很重要:必须先结算无敌/护盾,再决定要不要清掉撞上来的东西。
   * 反过来写的话,开着护盾把战机开进敌机里就能无代价清场,整个射击循环可以跳过。
   */
  private hitPlayer(shot: Shot | null, enemy: Enemy | null) {
    if (this.ended) return;
    const p = this.player.position;

    // 受伤后的无敌帧:免疫,但也不许穿身清场
    if (this.now < this.invulnerableUntil) {
      if (shot) this.retireShot(shot);
      return;
    }

    if (this.shieldActive()) {
      this.shieldCharges--;
      this.fx.shieldImpact(p.x, p.y, p.z);
      // 挡下一次就进硬直:追踪弹是 130ms 一发的三连,没有硬直的话一轮就把三层打光;
      // 贴着 Boss 机身时每帧都会判定,同样靠它兜住。
      // 硬直也保证了"护盾碎裂"和"掉命"不会在同一帧一起发生。
      this.invulnerableUntil = this.now + TUNING.shieldHitCooldown;
      if (shot) this.retireShot(shot);
      // 撞碎的敌机走正常击毁流程:有爆炸、有分数、波次计数也对得上
      else if (enemy && !enemy.boss) this.destroyEnemy(enemy);
      if (this.shieldCharges <= 0) {
        this.shieldUntil = 0;
        this.events.onFloat('护盾碎裂', 'bad');
      }
      return;
    }

    if (shot) this.retireShot(shot);
    else if (enemy && !enemy.boss) this.destroyEnemy(enemy);
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
    if (this.now - this.lastDamageAt < 450) return;
    if (reason === 'hit') {
      if (this.now < this.invulnerableUntil) return;
      this.invulnerableUntil = this.now + 1350;
      // 挨打会掉一级火力,给"稳住不死"一个正反馈
      if (this.weapon > 1) this.weapon--;
    } else {
      if (this.now < this.leakGraceUntil) return;
      this.leakGraceUntil = this.now + TUNING.leakGrace;
      this.events.onFloat('漏防 -1 机', 'bad');
    }
    this.lastDamageAt = this.now;
    this.lives--;
    sfx.hurt();
    this.stage.shake(180, 0.28);
    this.events.onFlash(0.22);
    if (this.lives <= 0) this.finish(false);
  }

  private checkWave() {
    if (this.remaining > 0 || this.ended) return;
    // 计数万一被减到负数,这里钳回 0
    this.remaining = 0;
    if (this.mode === 'campaign' && this.wave >= CAMPAIGN_WAVES) { this.finish(true); return; }
    // 清掉可能已经排上的下一波,避免同时排出两波
    this.timers = this.timers.filter((t) => t.run !== this.startWaveBound);
    this.after(1100, this.startWaveBound);
  }

  private startWaveBound = () => this.startWave();

  // ------------------------------------------------------------ 护盾与顿帧

  /** 护盾同时受时间和层数限制,两者任一耗尽就失效 */
  private shieldActive() {
    return this.shieldCharges > 0 && this.now < this.shieldUntil;
  }

  /** duration 省略 = 不设时限,只按层数消耗 */
  private grantShield(charges: number, duration?: number) {
    this.shieldCharges = charges;
    this.shieldUntil = duration === undefined ? Number.POSITIVE_INFINITY : this.now + duration;
  }

  /**
   * 顿帧:命中瞬间把游戏时间停住再放开。
   * 这是打击感的主要来源之一 —— 比任何贴图都更能让"打中了"这件事被感觉到,
   * 而且几乎不花性能。时长必须很短,超过 ~90ms 就会变成卡顿而不是打击感。
   * 用真实时间计时,所以特效照常播,只有玩法逻辑停住。
   */
  private hitStop(duration: number) {
    if (this.ended) return;
    this.hitStopUntil = Math.max(this.hitStopUntil, performance.now() + duration);
  }

  private emitHud() {
    const boss = this.boss;
    const showBoss = boss?.active === true && !boss.entry;
    const ratio = showBoss ? Math.max(0, boss.hp / boss.maxHp) : 0;
    this.events.onHud({
      score: this.score,
      lives: Math.max(0, this.lives),
      weapon: this.weapon,
      wave: this.wave,
      mode: this.mode,
      combo: this.now - this.lastKill <= TUNING.comboWindow ? this.combo : 1,
      shield: this.shieldActive()
        ? {
          charges: this.shieldCharges,
          seconds: Number.isFinite(this.shieldUntil) ? Math.max(0, (this.shieldUntil - this.now) / 1000) : -1,
        }
        : null,
      boss: showBoss
        ? { name: this.bossName, ratio, phase: ratio > 0.66 ? 1 : ratio > 0.33 ? 2 : 3 }
        : null,
    });
  }

  private finish(victory: boolean) {
    if (this.ended) return;
    this.ended = true;
    this.timers = [];
    if (victory) {
      // 通关时把残余护航机一并炸掉,画面上不留活口
      for (const enemy of this.enemies) {
        if (!enemy.active) continue;
        const { x, y, z } = enemy.root.position;
        this.fx.explosion(x, y, z, false);
        this.retireEnemy(enemy);
      }
      this.stage.shake(420, 0.6);
      if (this.mode === 'campaign') saveSettings({ endlessUnlocked: true });
    }
    const { rank, best } = pushScore({
      score: this.score, wave: this.wave, difficulty: this.difficulty,
      mode: this.mode, victory, at: Date.now(),
    });
    window.setTimeout(() => {
      this.events.onFinish({ score: this.score, wave: this.wave, best, rank, victory });
    }, victory ? 1100 : 600);
  }

  dispose() {
    this.unbindInput();
    this.timers = [];
    this.lockTarget = null;
    // 准星的几何/材质是自己建的,disposeTree 只会遍历到它挂上去的那份,先显式收掉
    this.reticle.dispose();
    this.stage.root.remove(this.group);
    disposeTree(this.group);
    for (const item of this.disposables) item.dispose();
  }
}
