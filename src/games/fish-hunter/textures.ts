/**
 * 运行时生成的占位贴图。
 *
 * **这是临时的。** DESIGN.md §7 已经写明:8 种鱼最终要走 ComfyUI 出侧视图 PNG,
 * 因为辨识度直接决定玩家能不能瞬间判断「这条值不值得打」,而这是 Graphics
 * 画不出来的。这里生成的色块只为把玩法先跑起来验手感(§8 第 1 步)。
 *
 * 出图之后,BootScene 换成 load.image 即可,别的地方不用动 ——
 * 贴图名(`fish-<kind>`)和朝向约定(**一律朝右画**,朝左靠 flipX)保持不变。
 */

import * as Phaser from 'phaser';
import { FISH_KINDS, SEAT_COLORS } from './config';
import type { FishKindId } from './config';

export function buildTextures(scene: Phaser.Scene): void {
  for (const kind of Object.keys(FISH_KINDS) as FishKindId[]) buildFish(scene, kind);
  buildBullet(scene);
  buildNets(scene);
  buildCannons(scene);
  buildBubble(scene);
  buildCoin(scene);
}

/** 鱼:椭圆身体 + 三角尾 + 一只眼。朝右 */
function buildFish(scene: Phaser.Scene, kind: FishKindId): void {
  const spec = FISH_KINDS[kind];
  const r = spec.radius;
  const w = r * 2.6;
  const h = r * 2;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);

  const dark = Phaser.Display.Color.IntegerToColor(spec.color).darken(28).color;

  // 尾巴
  g.fillStyle(dark, 1);
  g.beginPath();
  g.moveTo(r * 0.4, h / 2);
  g.lineTo(0, h / 2 - r * 0.55);
  g.lineTo(0, h / 2 + r * 0.55);
  g.closePath();
  g.fillPath();

  // 身体
  g.fillStyle(spec.color, 1);
  g.fillEllipse(w * 0.58, h / 2, r * 2, h * 0.92);

  // 背鳍
  g.fillStyle(dark, 1);
  g.beginPath();
  g.moveTo(w * 0.5, h / 2 - h * 0.42);
  g.lineTo(w * 0.66, h / 2 - h * 0.62);
  g.lineTo(w * 0.78, h / 2 - h * 0.3);
  g.closePath();
  g.fillPath();

  // 眼睛。大鱼的眼睛按比例放大,不然只有一个点
  const eyeR = Math.max(2.5, r * 0.13);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(w * 0.86, h / 2 - r * 0.22, eyeR);
  g.fillStyle(0x101820, 1);
  g.fillCircle(w * 0.88, h / 2 - r * 0.22, eyeR * 0.55);

  g.generateTexture(`fish-${kind}`, Math.ceil(w), Math.ceil(h));
  g.destroy();
}

/** 炮弹。一枚带尾焰的小弹丸,颜色在运行时用 setTint 换成座位色 */
function buildBullet(scene: Phaser.Scene): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(9, 9, 7);
  g.fillStyle(0xffffff, 0.45);
  g.fillCircle(9, 9, 9);
  g.generateTexture('bullet', 18, 18);
  g.destroy();
}

/** 网:一圈同心圆 + 米字线。同样靠 setTint 上座位色 */
function buildNets(scene: Phaser.Scene): void {
  const size = 256;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const c = size / 2;
  g.lineStyle(3, 0xffffff, 0.9);
  for (const k of [0.35, 0.62, 0.9]) g.strokeCircle(c, c, c * k);
  g.lineStyle(2, 0xffffff, 0.55);
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    g.beginPath();
    g.moveTo(c, c);
    g.lineTo(c + Math.cos(a) * c * 0.9, c + Math.sin(a) * c * 0.9);
    g.strokePath();
  }
  g.generateTexture('net', size, size);
  g.destroy();
}

/** 炮台。一律朝上画,朝下的座位靠 rotation 转过去 */
function buildCannons(scene: Phaser.Scene): void {
  for (let seat = 0; seat < SEAT_COLORS.length; seat += 1) {
    const color = SEAT_COLORS[seat];
    const g = scene.make.graphics({ x: 0, y: 0 }, false);
    const w = 64;
    const h = 78;
    // 底座
    g.fillStyle(0x123044, 1);
    g.fillRoundedRect(4, h - 34, w - 8, 30, 10);
    g.fillStyle(color, 1);
    g.fillRoundedRect(10, h - 30, w - 20, 12, 6);
    // 炮管
    g.fillStyle(0x1b4a63, 1);
    g.fillRoundedRect(w / 2 - 11, 6, 22, h - 30, 8);
    g.fillStyle(color, 1);
    g.fillRoundedRect(w / 2 - 7, 2, 14, 20, 6);
    g.generateTexture(`cannon-${seat}`, w, h);
    g.destroy();
  }
}

/** 背景气泡 */
function buildBubble(scene: Phaser.Scene): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0xffffff, 0.16);
  g.fillCircle(16, 16, 15);
  g.fillStyle(0xffffff, 0.34);
  g.fillCircle(11, 11, 4);
  g.generateTexture('bubble', 32, 32);
  g.destroy();
}

/** 金币 */
function buildCoin(scene: Phaser.Scene): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0xf6b93b, 1);
  g.fillCircle(13, 13, 12);
  g.fillStyle(0xfdd835, 1);
  g.fillCircle(13, 13, 8.5);
  g.generateTexture('coin', 26, 26);
  g.destroy();
}
