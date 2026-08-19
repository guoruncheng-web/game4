/**
 * 战斗场景 = 一个带预测的显示器 + 输入设备(DESIGN.md §3.1)。
 *
 * 它做且只做三件事:
 *   1. 把 spawn 消息里的鱼按 fishPos(spawn, t) 画出来 —— 位置是算出来的,不是收来的;
 *   2. 玩家一按就立刻把炮弹画出来,同时把 fire 发出去 —— 手感不等往返;
 *   3. 收到 pop / caught / wallet 再补上结算表现。
 *
 * **这里不许有任何判定。** 打没打中、捕没捕到、余额多少,一律以服务端消息为准。
 * 本地算一份炮弹轨迹只是为了画面,算错了也只是画面,不影响钱。
 */

import * as Phaser from 'phaser';
import {
  BULLET_LIFE_MS, BULLET_SPEED, FIRE_COOLDOWN_MS, FISH_KINDS,
  GAME_HEIGHT, GAME_WIDTH, MAX_LEVEL, MIN_LEVEL, netRadius, POOL_BOTTOM, POOL_TOP,
  SEATS, SEAT_COLORS,
} from '../config';
import { fishPos, isGone } from '../sim/fish';
import { AIM_INTERVAL_MS } from '../sim/protocol';
import type { FishSpawn, ServerMsg } from '../sim/protocol';
import type { Transport } from '../net/transport';
import { play } from '../sfx';

type FishView = { spawn: FishSpawn; sprite: Phaser.GameObjects.Sprite };
type BulletView = {
  id: number; seat: number; level: number;
  x: number; y: number; vx: number; vy: number; born: number;
  sprite: Phaser.GameObjects.Sprite;
};

export class GameScene extends Phaser.Scene {
  private net!: Transport;
  private seat = 0;

  private fish = new Map<number, FishView>();
  private bullets = new Map<number, BulletView>();
  private cannons = new Map<number, Phaser.GameObjects.Sprite>();

  private balance = 0;
  private level = MIN_LEVEL;
  private nextBulletId = 1;
  private lastFireAt = 0;
  private lastAimAt = 0;
  private aim = -Math.PI / 2;
  private holding = false;

  private balanceText!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private hintUntil = 0;

  constructor() {
    super('FishGame');
  }

  init(data: { transport?: Transport }): void {
    // 兜底读 registry:场景被 restart 时 Phaser 不会重放 data
    this.net = data?.transport ?? (this.registry.get('transport') as Transport);
  }

  create(): void {
    this.buildBackground();
    this.buildHud();
    this.bindInput();

    this.net.listen((msg) => this.onMessage(msg));

    this.events.once('shutdown', () => {
      this.net.listen(null);
    });
  }

  // -------------------------------------------------------------- 画面底子

  private buildBackground(): void {
    const g = this.add.graphics().setDepth(0);
    g.fillGradientStyle(0x05263f, 0x05263f, 0x021320, 0x021320, 1);
    g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // 光柱。斜向的窄条,靠 alpha 呼吸,成本几乎为零
    for (let i = 0; i < 5; i += 1) {
      const shaft = this.add
        .rectangle(160 + i * 250, GAME_HEIGHT / 2, 90, GAME_HEIGHT * 1.6, 0x8fe3ff, 0.05)
        .setAngle(14)
        .setDepth(1);
      this.tweens.add({
        targets: shaft, alpha: { from: 0.03, to: 0.1 },
        duration: 2600 + i * 420, yoyo: true, repeat: -1, ease: 'Sine.inOut',
      });
    }

    // 炮台带。上下各一条,把鱼池的边界画出来
    for (const y of [POOL_TOP, POOL_BOTTOM]) {
      this.add.rectangle(GAME_WIDTH / 2, y, GAME_WIDTH, 2, 0x2ee6c8, 0.12).setDepth(1);
    }

    for (let i = 0; i < 22; i += 1) {
      const b = this.add
        .image(Phaser.Math.Between(0, GAME_WIDTH), Phaser.Math.Between(0, GAME_HEIGHT), 'bubble')
        .setDepth(2)
        .setScale(Phaser.Math.FloatBetween(0.25, 0.8))
        .setAlpha(Phaser.Math.FloatBetween(0.15, 0.5));
      this.tweens.add({
        targets: b,
        y: -40,
        duration: Phaser.Math.Between(9000, 18000),
        repeat: -1,
        delay: Phaser.Math.Between(0, 6000),
        onRepeat: () => {
          b.y = GAME_HEIGHT + 40;
          b.x = Phaser.Math.Between(0, GAME_WIDTH);
        },
      });
    }
  }

  private buildHud(): void {
    const seat = SEATS[this.seat];
    const color = SEAT_COLORS[this.seat];

    this.balanceText = this.add
      .text(28, GAME_HEIGHT - 96, '0', {
        fontFamily: 'system-ui, sans-serif', fontSize: '30px', color: '#f6d365', fontStyle: 'bold',
      })
      .setDepth(40);
    this.add
      .text(28, GAME_HEIGHT - 118, '金币', { fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: '#7fa6bd' })
      .setDepth(40);

    // 换炮。点炮台左右两侧的按钮,不用键盘也能调
    const mkButton = (x: number, label: string, delta: number) => {
      const btn = this.add
        .text(x, GAME_HEIGHT - 52, label, {
          fontFamily: 'system-ui, sans-serif', fontSize: '26px', color: '#cfe9f7',
          backgroundColor: '#0e3247', padding: { x: 12, y: 4 },
        })
        .setDepth(40)
        .setInteractive({ useHandCursor: true });
      btn.on('pointerdown', (p: Phaser.Input.Pointer) => {
        p.event.stopPropagation();
        this.changeLevel(delta);
      });
      return btn;
    };
    mkButton(seat.x - 130, '−', -1);
    mkButton(seat.x + 96, '+', 1);

    this.levelText = this.add
      .text(seat.x - 34, GAME_HEIGHT - 52, 'Lv.1', {
        fontFamily: 'system-ui, sans-serif', fontSize: '26px', color: '#ffffff', fontStyle: 'bold',
      })
      .setDepth(40);
    this.levelText.setColor(hex(color));

    this.hintText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 44, '', {
        fontFamily: 'system-ui, sans-serif', fontSize: '18px', color: '#ffd6d6',
      })
      .setOrigin(0.5)
      .setDepth(40);

    this.showHint('单机模式 · 余额存在本机,与账号不互通', 4200);
  }

  private ensureCannon(seat: number): Phaser.GameObjects.Sprite {
    let c = this.cannons.get(seat);
    if (!c) {
      const spec = SEATS[seat];
      c = this.add.sprite(spec.x, spec.y, `cannon-${seat}`).setDepth(35).setOrigin(0.5, 0.82);
      this.cannons.set(seat, c);
    }
    return c;
  }

  // -------------------------------------------------------------- 输入

  private bindInput(): void {
    this.ensureCannon(this.seat);

    this.input.on('pointerdown', () => { this.holding = true; });
    this.input.on('pointerup', () => { this.holding = false; });
    this.input.on('pointerout', () => { this.holding = false; });

    this.input.keyboard?.on('keydown-SPACE', () => { this.holding = true; });
    this.input.keyboard?.on('keyup-SPACE', () => { this.holding = false; });
    this.input.keyboard?.on('keydown-UP', () => this.changeLevel(1));
    this.input.keyboard?.on('keydown-DOWN', () => this.changeLevel(-1));
  }

  private changeLevel(delta: number): void {
    const next = Phaser.Math.Clamp(this.level + delta, MIN_LEVEL, MAX_LEVEL);
    if (next === this.level) return;
    this.level = next;
    this.levelText.setText(`Lv.${next}`);
    this.net.send({ t: 'level', delta });
  }

  /**
   * 开炮。**先画后发**:炮弹立刻出现在屏幕上,fire 消息同时发出去。
   * 服务端如果拒了(余额不足/太快),会回一条 deny,那时再把这发收回来。
   * 反过来做(等确认再画)会让每一发都背上一个往返的延迟,这类游戏最忌讳这个。
   */
  private tryFire(now: number): void {
    if (now - this.lastFireAt < FIRE_COOLDOWN_MS) return;
    this.lastFireAt = now;

    const id = this.seat * 1_000_000 + this.nextBulletId++;
    this.spawnBullet(id, this.seat, this.aim, this.level, now);
    this.net.send({ t: 'fire', id, angle: this.aim });
    play('fire');

    const cannon = this.ensureCannon(this.seat);
    this.tweens.add({ targets: cannon, scaleY: 0.88, duration: 60, yoyo: true });
  }

  private spawnBullet(id: number, seat: number, angle: number, level: number, now: number): void {
    const origin = SEATS[seat];
    const sprite = this.add
      .sprite(origin.x + Math.cos(angle) * 44, origin.y + Math.sin(angle) * 44, 'bullet')
      .setDepth(20)
      .setTint(SEAT_COLORS[seat])
      .setScale(0.7 + level * 0.06)
      .setRotation(angle);
    this.bullets.set(id, {
      id, seat, level,
      x: sprite.x, y: sprite.y,
      vx: Math.cos(angle) * BULLET_SPEED,
      vy: Math.sin(angle) * BULLET_SPEED,
      born: now,
      sprite,
    });
  }

  // -------------------------------------------------------------- 服务端消息

  private onMessage(msg: ServerMsg): void {
    switch (msg.t) {
      case 'hello':
        this.seat = msg.seat;
        this.balance = msg.balance;
        this.balanceText.setText(String(msg.balance));
        this.aim = SEATS[this.seat].up ? -Math.PI / 2 : Math.PI / 2;
        this.ensureCannon(this.seat);
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
        break;

      case 'pop':
        this.popNet(msg.id, msg.x, msg.y, msg.seat, msg.level);
        break;

      case 'caught':
        this.catchFish(msg.fish, msg.seat, msg.gold, msg.x, msg.y);
        break;

      case 'wallet':
        this.balance = msg.balance;
        this.balanceText.setText(String(msg.balance));
        if (msg.grant) this.showHint('余额见底,已补助 200 金币', 3000);
        break;

      case 'seat':
        if (msg.view) this.ensureCannon(msg.seat);
        else {
          this.cannons.get(msg.seat)?.destroy();
          this.cannons.delete(msg.seat);
        }
        break;

      case 'deny':
        // 这一发没打成,把先画出来的炮弹收掉
        this.rollbackLastBullet();
        if (msg.reason === 'broke') {
          this.showHint(`余额不足 · 降到 Lv.${Math.max(MIN_LEVEL, this.balance)} 或等补助`, 2000);
          play('deny');
        }
        break;

      default:
        break;
    }
  }

  /** deny 时收回最后一发。id 是自增的,最大的那个就是最新的 */
  private rollbackLastBullet(): void {
    let latest: BulletView | null = null;
    for (const b of this.bullets.values()) {
      if (b.seat !== this.seat) continue;
      if (!latest || b.id > latest.id) latest = b;
    }
    if (!latest) return;
    latest.sprite.destroy();
    this.bullets.delete(latest.id);
  }

  private addFish(spawn: FishSpawn): void {
    if (this.fish.has(spawn.id)) return;
    const sprite = this.add
      .sprite(-999, -999, `fish-${spawn.kind}`)
      .setDepth(10 + (FISH_KINDS[spawn.kind].value >= 80 ? 2 : 0));
    this.fish.set(spawn.id, { spawn, sprite });

    if (spawn.kind === 'dragon' || spawn.kind === 'boss') {
      this.showHint(`${FISH_KINDS[spawn.kind].label}进场!`, 2200);
    }
  }

  private removeFish(id: number, caught: boolean): void {
    const view = this.fish.get(id);
    if (!view) return;
    this.fish.delete(id);
    if (!caught) return view.sprite.destroy();

    this.tweens.add({
      targets: view.sprite,
      alpha: 0,
      scale: view.sprite.scale * 1.5,
      angle: view.sprite.angle + 60,
      duration: 260,
      onComplete: () => view.sprite.destroy(),
    });
  }

  private popNet(id: number, x: number, y: number, seat: number, level: number): void {
    const bullet = this.bullets.get(id);
    if (bullet) {
      bullet.sprite.destroy();
      this.bullets.delete(id);
    }
    const r = netRadius(level);
    const net = this.add
      .image(x, y, 'net')
      .setDepth(22)
      .setTint(SEAT_COLORS[seat])
      .setAlpha(0.85)
      .setDisplaySize(r * 0.7, r * 0.7);
    this.tweens.add({
      targets: net,
      displayWidth: r * 2,
      displayHeight: r * 2,
      alpha: 0,
      duration: 260,
      ease: 'Cubic.out',
      onComplete: () => net.destroy(),
    });
    play('pop');
  }

  private catchFish(fishId: number, seat: number, gold: number, x: number, y: number): void {
    const mine = seat === this.seat;
    this.removeFish(fishId, true);

    const label = this.add
      .text(x, y, `+${gold}`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: mine ? '30px' : '18px',
        color: hex(SEAT_COLORS[seat]),
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(30)
      .setAlpha(mine ? 1 : 0.65);
    this.tweens.add({
      targets: label, y: y - 60, alpha: 0, duration: mine ? 900 : 600,
      onComplete: () => label.destroy(),
    });

    if (!mine) return;

    // 金币飞向余额 —— 收益要有去向,直接跳数字会让人不知道钱从哪来
    const count = Math.min(6, 1 + Math.floor(gold / 40));
    for (let i = 0; i < count; i += 1) {
      const coin = this.add.image(x, y, 'coin').setDepth(31);
      this.tweens.add({
        targets: coin,
        x: this.balanceText.x + 20,
        y: this.balanceText.y + 14,
        scale: 0.5,
        duration: 420 + i * 60,
        delay: i * 40,
        ease: 'Cubic.in',
        onComplete: () => { coin.destroy(); play('coin'); },
      });
    }
    play(gold >= 400 ? 'jackpot' : 'catch');
  }

  private showHint(text: string, ms: number): void {
    this.hintText.setText(text).setAlpha(1);
    this.hintUntil = this.time.now + ms;
  }

  // -------------------------------------------------------------- 每帧

  update(_time: number, delta: number): void {
    const now = this.net.now();
    const dt = Math.min(delta, 60) / 1000;

    this.updateAim(now);
    if (this.holding) this.tryFire(now);
    this.updateFish(now);
    this.updateBullets(now, dt);

    if (this.hintUntil && this.time.now > this.hintUntil) {
      this.hintText.setAlpha(0);
      this.hintUntil = 0;
    }
  }

  private updateAim(now: number): void {
    const p = this.input.activePointer;
    const origin = SEATS[this.seat];
    const angle = Math.atan2(p.worldY - origin.y, p.worldX - origin.x);
    // 半球约束和服务端(room.clampAim)保持一致,不然炮口指向和实际弹道会差一截
    const EDGE = 0.14;
    this.aim = origin.up
      ? Phaser.Math.Clamp(angle > 0 ? -angle : angle, -Math.PI + EDGE, -EDGE)
      : Phaser.Math.Clamp(angle < 0 ? -angle : angle, EDGE, Math.PI - EDGE);

    this.ensureCannon(this.seat).setRotation(this.aim + Math.PI / 2);

    if (now - this.lastAimAt >= AIM_INTERVAL_MS) {
      this.lastAimAt = now;
      this.net.send({ t: 'aim', angle: this.aim });
    }
  }

  /**
   * 鱼的位置**每帧现算**,不是插值来的。
   * 这就是 DESIGN §3.2 的兑现:没有位置消息,也就没有抖动和漂移校正。
   */
  private updateFish(now: number): void {
    for (const [id, view] of this.fish) {
      const { spawn, sprite } = view;
      if (isGone(spawn, now)) { this.removeFish(id, false); continue; }
      if (now < spawn.t0) { sprite.setVisible(false); continue; }

      const pose = fishPos(spawn, now);
      sprite.setVisible(true);
      sprite.setPosition(pose.x, pose.y);
      // 朝左游时翻转贴图。贴图一律朝右画(textures.ts 的约定),
      // 翻转之后 rotation 要补 PI,否则鱼会倒着游
      const left = Math.cos(pose.angle) < 0;
      sprite.setFlipX(left);
      sprite.setRotation(left ? pose.angle + Math.PI : pose.angle);
    }
  }

  private updateBullets(now: number, dt: number): void {
    for (const [id, b] of this.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x < 0) { b.x = -b.x; b.vx = -b.vx; }
      else if (b.x > GAME_WIDTH) { b.x = GAME_WIDTH * 2 - b.x; b.vx = -b.vx; }
      b.sprite.setPosition(b.x, b.y);
      b.sprite.setRotation(Math.atan2(b.vy, b.vx));

      // 本地只负责"飞出画面/超时就别画了"。真正的命中判定在服务端,
      // 它会用一条 pop 把这发收掉
      if (now - b.born > BULLET_LIFE_MS + 400 || b.y < -60 || b.y > GAME_HEIGHT + 60) {
        b.sprite.destroy();
        this.bullets.delete(id);
      }
    }
  }
}

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}
