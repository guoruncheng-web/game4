/**
 * 玩法与画面的接线层。取代了 Phaser 版的 GameScene。
 *
 * 它做且只做三件事(和 2D 版一字不差,因为**判定一行都没改**):
 *   1. 把 spawn 消息里的鱼按 fishPos(spawn, t) 摆到场景里 —— 位置是算出来的,不是收来的;
 *   2. 玩家一按就立刻画出炮弹,同时把 fire 发出去 —— 手感不等往返;
 *   3. 收到 pop / caught / wallet 再补上结算表现。
 *
 * **这里不许有任何判定。** 打没打中、捕没捕到、余额多少,一律以服务端消息为准。
 * 本地算一份炮弹轨迹只是为了画面,算错了也只是画面,不影响钱。
 */

import * as THREE from 'three';
import {
  BULLET_LIFE_MS, BULLET_SPEED, FIRE_COOLDOWN_MS, FISH_KINDS, GAME_HEIGHT, GAME_WIDTH,
  MAX_LEVEL, MIN_LEVEL, netRadius, SEATS, SEAT_COLORS,
} from './config';
import type { FishKindId } from './config';
import { fishPos, isGone } from './sim/fish';
import { AIM_INTERVAL_MS } from './sim/protocol';
import type { FishSpawn, ServerMsg } from './sim/protocol';
import type { Transport } from './net/transport';
import type { Assets } from './three/assets';
import { FishActor } from './three/fish';
import { Fx } from './three/fx';
import { CannonActor, makeBullet } from './three/props';
import { LAYER, Stage } from './three/stage';
import type { HudHandle } from './ui/hud';
import { play } from './sfx';

type FishView = { spawn: FishSpawn; actor: FishActor };
type BulletView = {
  id: number; seat: number; level: number;
  x: number; y: number; vx: number; vy: number; born: number;
  object: THREE.Object3D;
};

export class World {
  private readonly fish = new Map<number, FishView>();
  private readonly bullets = new Map<number, BulletView>();
  private readonly cannons = new Map<number, CannonActor>();
  private readonly fx: Fx;

  private seat = 0;
  private level = MIN_LEVEL;
  private balance = 0;
  private ready = false;

  private nextBulletId = 1;
  private lastFireAt = 0;
  private lastAimAt = 0;
  private aim = -Math.PI / 2;
  private holding = false;
  private pointer = { x: GAME_WIDTH / 2, y: 0 };

  private readonly onPointerDown: (e: PointerEvent) => void;
  private readonly onPointerMove: (e: PointerEvent) => void;
  private readonly onPointerUp: () => void;
  private readonly onKeyDown: (e: KeyboardEvent) => void;
  private readonly onKeyUp: (e: KeyboardEvent) => void;

  constructor(
    private readonly stage: Stage,
    private readonly assets: Assets,
    private readonly net: Transport,
    private readonly hud: HudHandle,
  ) {
    this.fx = new Fx(stage.scene);

    const canvas = stage.renderer.domElement;
    this.onPointerDown = (e) => { this.holding = true; this.trackPointer(e); };
    this.onPointerMove = (e) => this.trackPointer(e);
    this.onPointerUp = () => { this.holding = false; };
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);

    this.onKeyDown = (e) => {
      if (e.code === 'Space') this.holding = true;
      if (e.code === 'ArrowUp') this.changeLevel(1);
      if (e.code === 'ArrowDown') this.changeLevel(-1);
    };
    this.onKeyUp = (e) => { if (e.code === 'Space') this.holding = false; };
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);

    hud.onLevel((delta) => this.changeLevel(delta));
    net.listen((msg) => this.onMessage(msg));
  }

  private trackPointer(event: PointerEvent): void {
    this.pointer = this.stage.pointerToSim(event.clientX, event.clientY);
  }

  // -------------------------------------------------------------- 消息

  private onMessage(msg: ServerMsg): void {
    switch (msg.t) {
      case 'hello':
        this.seat = msg.seat;
        this.balance = msg.balance;
        this.aim = SEATS[this.seat].up ? -Math.PI / 2 : Math.PI / 2;
        // 上排座位把相机倒过来,自己那门炮永远在屏幕下方
        this.stage.setFlipped(!SEATS[this.seat].up);
        this.hud.setSeatColor(SEAT_COLORS[this.seat]);
        this.hud.setBalance(msg.balance);
        this.hud.setLevel(this.level);
        for (const view of msg.seats) this.ensureCannon(view.seat);
        this.ensureCannon(this.seat);
        this.ready = true;
        this.hud.hint(this.net.kind === 'local'
          ? '单机模式 · 余额存在本机,与账号不互通'
          : '联机 · 同一片鱼池,谁打死算谁的', 3600);
        break;

      case 'spawn':
        for (const f of msg.fish) this.addFish(f);
        break;

      case 'despawn':
        for (const id of msg.ids) this.removeFish(id, false);
        break;

      case 'fired':
        // 别人的炮弹。自己那发在 tryFire 里已经画了
        this.spawnBullet(msg.id, msg.seat, msg.angle, msg.level, this.net.now());
        this.cannons.get(msg.seat)?.kick();
        break;

      case 'pop':
        this.popNet(msg.id, msg.x, msg.y, msg.seat, msg.level);
        break;

      case 'caught':
        this.catchFish(msg.fish, msg.seat, msg.gold, msg.x, msg.y);
        break;

      case 'wallet':
        this.balance = msg.balance;
        this.hud.setBalance(msg.balance);
        if (msg.grant) this.hud.hint('余额见底,已补助 200 金币', 3000);
        break;

      case 'seat':
        if (msg.view) this.ensureCannon(msg.seat);
        break;

      case 'deny':
        this.rollbackLastBullet();
        if (msg.reason === 'broke') {
          this.hud.hint(`余额不足 · 降到 Lv.${Math.max(MIN_LEVEL, this.balance)} 或等补助`, 2200);
          play('deny');
        }
        break;

      default:
        break;
    }
  }

  private ensureCannon(seat: number): CannonActor {
    let cannon = this.cannons.get(seat);
    if (!cannon) {
      cannon = new CannonActor(this.assets.cannon, seat);
      this.stage.scene.add(cannon.object);
      this.cannons.set(seat, cannon);
    }
    return cannon;
  }

  private addFish(spawn: FishSpawn): void {
    if (this.fish.has(spawn.id)) return;
    const spec = FISH_KINDS[spawn.kind as FishKindId];
    const actor = new FishActor(this.assets.fish[spawn.kind as FishKindId], spec, spawn.seed);
    actor.object.visible = false;
    this.stage.scene.add(actor.object);
    this.fish.set(spawn.id, { spawn, actor });

    if (spawn.kind === 'dragon' || spawn.kind === 'boss') {
      this.hud.hint(`${spec.label}进场!`, 2400);
      this.fx.alert(GAME_WIDTH, GAME_HEIGHT, spec.color);
    }
  }

  private removeFish(id: number, caught: boolean): void {
    const view = this.fish.get(id);
    if (!view) return;
    this.fish.delete(id);
    if (caught) view.actor.vanish(() => view.actor.dispose());
    else view.actor.dispose();
  }

  // -------------------------------------------------------------- 开炮

  private changeLevel(delta: number): void {
    const next = Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, this.level + delta));
    if (next === this.level) return;
    this.level = next;
    this.hud.setLevel(next);
    this.net.send({ t: 'level', delta });
  }

  /**
   * **先画后发**:炮弹立刻出现在屏幕上,fire 消息同时发出去。
   * 服务端拒了会回 deny,那时再把这发收回来。反过来做(等确认再画)
   * 会让每一发都背上一个往返的延迟,这类游戏最忌讳这个。
   */
  private tryFire(now: number): void {
    if (now - this.lastFireAt < FIRE_COOLDOWN_MS) return;
    this.lastFireAt = now;

    const id = this.seat * 1_000_000 + this.nextBulletId++;
    this.spawnBullet(id, this.seat, this.aim, this.level, now);
    this.net.send({ t: 'fire', id, angle: this.aim });
    play('fire');

    const origin = SEATS[this.seat];
    this.fx.muzzle(origin.x, origin.y, this.aim, SEAT_COLORS[this.seat], this.level);
    this.ensureCannon(this.seat).kick();
  }

  private spawnBullet(id: number, seat: number, angle: number, level: number, now: number): void {
    const origin = SEATS[seat];
    const object = makeBullet(SEAT_COLORS[seat], level);
    const x = origin.x + Math.cos(angle) * 44;
    const y = origin.y + Math.sin(angle) * 44;
    object.position.set(x, -y, LAYER.bullet);
    this.stage.scene.add(object);
    this.bullets.set(id, {
      id, seat, level, x, y,
      vx: Math.cos(angle) * BULLET_SPEED,
      vy: Math.sin(angle) * BULLET_SPEED,
      born: now, object,
    });
  }

  /** deny 时收回最后一发。id 是自增的,最大的那个就是最新的 */
  private rollbackLastBullet(): void {
    let latest: BulletView | null = null;
    for (const b of this.bullets.values()) {
      if (b.seat !== this.seat) continue;
      if (!latest || b.id > latest.id) latest = b;
    }
    if (!latest) return;
    latest.object.removeFromParent();
    this.bullets.delete(latest.id);
  }

  private popNet(id: number, x: number, y: number, seat: number, level: number): void {
    const bullet = this.bullets.get(id);
    if (bullet) {
      bullet.object.removeFromParent();
      this.bullets.delete(id);
    }
    const r = netRadius(level);
    this.fx.splash(x, y, r, SEAT_COLORS[seat]);
    this.struggleUnderNet(x, y, r);
    play('pop');
  }

  /**
   * 网罩住了、但服务端没判它被捞中的鱼,闪一下。
   *
   * 判定圈和服务端那份是同一个公式(网半径 + 鱼半径,见 room.explode),
   * 但这里算出来的结果**只用来做表现** —— 谁死谁活以 caught 消息为准。
   * 缺了这个反馈,玩家分不清"网空放"和"罩住了没摇中",
   * 而后者恰恰是这游戏的核心体验(捕获概率本来就是 K/面值)。
   */
  private struggleUnderNet(x: number, y: number, r: number): void {
    const now = this.net.now();
    for (const { spawn, actor } of this.fish.values()) {
      if (now < spawn.t0 || !actor.object.visible) continue;
      const reach = r + FISH_KINDS[spawn.kind as FishKindId].radius;
      const dx = actor.object.position.x - x;
      const dy = -actor.object.position.y - y;
      if (dx * dx + dy * dy <= reach * reach) actor.flash();
    }
  }

  private catchFish(fishId: number, seat: number, gold: number, x: number, y: number): void {
    const mine = seat === this.seat;
    const big = gold >= 400;
    this.fx.catchBurst(x, y, SEAT_COLORS[seat], big, mine);
    this.removeFish(fishId, true);

    if (!mine) return;
    const origin = SEATS[this.seat];
    this.fx.coins(x, y, origin.x, origin.y, Math.min(6, 1 + Math.floor(gold / 40)));
    play(big ? 'jackpot' : 'catch');
  }

  // -------------------------------------------------------------- 每帧

  update(dtMs: number): void {
    const now = this.net.now();
    const dt = Math.min(dtMs, 60) / 1000;

    this.stage.update(performance.now());
    this.fx.update(dt);
    for (const cannon of this.cannons.values()) cannon.update(dt);

    if (this.ready) {
      this.updateAim(now);
      if (this.holding) this.tryFire(now);
    }
    this.updateFish(now, dt);
    this.updateBullets(now, dt);
  }

  private updateAim(now: number): void {
    const origin = SEATS[this.seat];
    const angle = Math.atan2(this.pointer.y - origin.y, this.pointer.x - origin.x);
    // 半球约束和服务端(room.clampAim)保持一致,不然炮口指向和实际弹道会差一截
    const EDGE = 0.14;
    this.aim = origin.up
      ? clamp(angle > 0 ? -angle : angle, -Math.PI + EDGE, -EDGE)
      : clamp(angle < 0 ? -angle : angle, EDGE, Math.PI - EDGE);

    this.ensureCannon(this.seat).aim(this.aim);

    if (now - this.lastAimAt >= AIM_INTERVAL_MS) {
      this.lastAimAt = now;
      this.net.send({ t: 'aim', angle: this.aim });
    }
  }

  /**
   * 鱼的位置**每帧现算**,不是插值来的。
   * 这就是 DESIGN §3.2 的兑现:没有位置消息,也就没有抖动和漂移校正。
   */
  private updateFish(now: number, dt: number): void {
    for (const [id, view] of this.fish) {
      const { spawn, actor } = view;
      if (isGone(spawn, now)) { this.removeFish(id, false); continue; }
      if (now < spawn.t0) { actor.object.visible = false; continue; }
      const pose = fishPos(spawn, now);
      actor.object.visible = true;
      actor.update(pose.x, pose.y, pose.angle, dt);
    }
  }

  private updateBullets(now: number, dt: number): void {
    for (const [id, b] of this.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x < 0) { b.x = -b.x; b.vx = -b.vx; }
      else if (b.x > GAME_WIDTH) { b.x = GAME_WIDTH * 2 - b.x; b.vx = -b.vx; }
      b.object.position.set(b.x, -b.y, LAYER.bullet);

      // 本地只负责"飞出画面/超时就别画了"。真正的命中判定在服务端,
      // 它会用一条 pop 把这发收掉
      if (now - b.born > BULLET_LIFE_MS + 400 || b.y < -60 || b.y > GAME_HEIGHT + 60) {
        b.object.removeFromParent();
        this.bullets.delete(id);
      }
    }
  }

  destroy(): void {
    const canvas = this.stage.renderer.domElement;
    canvas.removeEventListener('pointerdown', this.onPointerDown);
    canvas.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.net.listen(null);
    for (const view of this.fish.values()) view.actor.dispose();
    this.fish.clear();
    for (const b of this.bullets.values()) b.object.removeFromParent();
    this.bullets.clear();
    this.fx.dispose();
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
