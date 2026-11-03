import * as Phaser from 'phaser';

/**
 * 所有贴图都用 Graphics 在运行时生成,项目不依赖任何外部图片资源。
 */
export function createTextures(scene: Phaser.Scene) {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);

  // 玩家:圆角身体 + 眼睛
  g.clear();
  g.fillStyle(0x4ade80, 1);
  g.fillRoundedRect(0, 0, 28, 36, 8);
  g.fillStyle(0x14532d, 1);
  g.fillRoundedRect(0, 26, 28, 10, { tl: 0, tr: 0, bl: 8, br: 8 });
  g.fillStyle(0xffffff, 1);
  g.fillCircle(9, 14, 4.5);
  g.fillCircle(20, 14, 4.5);
  g.fillStyle(0x0f172a, 1);
  g.fillCircle(10.5, 14, 2.2);
  g.fillCircle(21.5, 14, 2.2);
  g.generateTexture('player', 28, 36);

  // 地面砖块(平铺单元)
  g.clear();
  g.fillStyle(0x334155, 1);
  g.fillRect(0, 0, 32, 32);
  g.fillStyle(0x475569, 1);
  g.fillRect(0, 0, 32, 6);
  g.lineStyle(1, 0x1e293b, 1);
  g.strokeRect(0, 0, 32, 32);
  g.generateTexture('tile', 32, 32);

  // 星星
  g.clear();
  g.fillStyle(0xfacc15, 1);
  drawStar(g, 12, 12, 5, 11, 5);
  g.fillStyle(0xfde68a, 1);
  drawStar(g, 12, 11, 5, 6, 2.6);
  g.generateTexture('star', 24, 24);

  // 敌人:带引线的炸弹
  g.clear();
  g.fillStyle(0x1f2937, 1);
  g.fillCircle(12, 14, 10);
  g.fillStyle(0xef4444, 1);
  g.fillRect(11, 1, 3, 5);
  g.fillStyle(0x9ca3af, 1);
  g.fillCircle(8, 10, 2.6);
  g.generateTexture('bomb', 24, 26);

  // 粒子
  g.clear();
  g.fillStyle(0xffffff, 1);
  g.fillCircle(4, 4, 4);
  g.generateTexture('spark', 8, 8);

  g.destroy();
}

function drawStar(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  points: number,
  outer: number,
  inner: number,
) {
  const step = Math.PI / points;
  g.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + i * step;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.closePath();
  g.fillPath();
}
