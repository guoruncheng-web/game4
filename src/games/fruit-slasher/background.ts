import * as Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './config';

/** 创建低对比月夜竹林背景，中心区域刻意保持干净。 */
export function createBackground(scene: Phaser.Scene) {
  if (scene.textures.exists('fs-background')) {
    scene.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'fs-background')
      .setDisplaySize(GAME_WIDTH, GAME_HEIGHT)
      .setDepth(-100);
    return;
  }
  const g = scene.add.graphics().setDepth(-100);
  g.fillGradientStyle(0x071326, 0x071326, 0x102d4a, 0x102d4a, 1);
  g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  // 月亮与远山
  g.fillStyle(0xd9efff, 0.65);
  g.fillCircle(104, 245, 34);
  g.fillStyle(0x17344a, 1);
  g.fillTriangle(-80, 820, 95, 570, 260, 820);
  g.fillTriangle(135, 820, 330, 535, 520, 820);
  g.fillTriangle(360, 820, 515, 610, 650, 820);
  g.fillStyle(0x102a3c, 1);
  g.fillTriangle(-100, 860, 120, 650, 325, 860);
  g.fillTriangle(180, 860, 410, 630, 670, 860);

  // 道场剪影与暖窗
  g.fillStyle(0x091b25, 1);
  g.fillRect(55, 745, 430, 135);
  g.fillTriangle(25, 760, 270, 690, 515, 760);
  g.fillStyle(0xffb84a, 0.65);
  for (let x = 95; x <= 420; x += 108) g.fillRect(x, 785, 42, 52);
  g.lineStyle(4, 0x3a2118, 0.9);
  for (let x = 116; x <= 440; x += 108) g.lineBetween(x, 785, x, 837);

  // 两侧竹竿
  drawBamboo(g, 18, 0, 0.94);
  drawBamboo(g, 58, 40, 0.72);
  drawBamboo(g, 522, 10, 0.9);
  drawBamboo(g, 486, 85, 0.68);

  // 底部木台
  g.fillStyle(0x3a2118, 1);
  g.fillRect(0, 878, GAME_WIDTH, 82);
  g.fillStyle(0x78492e, 1);
  g.fillRect(0, 878, GAME_WIDTH, 9);
  g.lineStyle(2, 0x24150f, 0.75);
  for (let y = 902; y < 960; y += 25) g.lineBetween(0, y, GAME_WIDTH, y);
  for (let x = 72; x < GAME_WIDTH; x += 116) g.lineBetween(x, 880, x - 12, 960);

  // 稳定星点，避免背景高频闪动干扰目标
  const stars = [
    [175, 154], [226, 198], [334, 146], [407, 232], [290, 286], [456, 326], [139, 347],
  ];
  g.fillStyle(0xffffff, 0.55);
  for (const [x, y] of stars) g.fillCircle(x, y, 1.2);
}

function drawBamboo(g: Phaser.GameObjects.Graphics, x: number, y: number, alpha: number) {
  g.fillStyle(0x102c2e, alpha);
  g.fillRoundedRect(x - 9, y, 18, 800, 7);
  g.lineStyle(3, 0x28514a, alpha);
  for (let iy = y + 80; iy < 800; iy += 108) g.lineBetween(x - 9, iy, x + 9, iy);
  for (let iy = y + 120; iy < 720; iy += 170) {
    const direction = x < GAME_WIDTH / 2 ? 1 : -1;
    g.fillStyle(0x102c2e, alpha);
    g.fillTriangle(x, iy, x + direction * 42, iy - 24, x + direction * 29, iy + 5);
    g.fillTriangle(x, iy + 8, x + direction * 49, iy + 22, x + direction * 25, iy + 31);
  }
}
