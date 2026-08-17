import * as Phaser from 'phaser';

export function createTextures(scene: Phaser.Scene) {
  // BootScene 失败重试时会重跑一次,已生成过就直接返回,避免 key 冲突告警
  if (scene.textures.exists('ns-spark')) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);

  g.fillStyle(0x20bfe8, 0.22).fillRoundedRect(1, 0, 14, 40, 7);
  g.fillStyle(0x51ecff, 0.72).fillRoundedRect(4, 1, 8, 38, 4);
  g.fillStyle(0xeaffff, 1).fillRoundedRect(7, 2, 2, 36, 1);
  g.generateTexture('ns-shot', 16, 40);
  g.clear().fillStyle(0xff351f, 0.3).fillTriangle(9, 34, 0, 3, 18, 3);
  g.fillStyle(0xff5a32, 0.9).fillTriangle(9, 31, 4, 4, 14, 4);
  g.fillStyle(0xfff0cb, 1).fillTriangle(9, 26, 7, 5, 11, 5);
  g.generateTexture('ns-enemy-shot', 18, 34);

  g.clear().fillStyle(0x60f5a8).fillCircle(16, 16, 15);
  g.lineStyle(3, 0xeafff3).strokeCircle(16, 16, 11);
  g.fillStyle(0xeafff3).fillRect(14, 7, 4, 18).fillRect(7, 14, 18, 4);
  g.generateTexture('ns-power', 32, 32);

  // 火力升级:琥珀色,双层上箭头
  g.clear().fillStyle(0xffb04a).fillCircle(16, 16, 15);
  g.lineStyle(3, 0xfff3d0).strokeCircle(16, 16, 11);
  g.fillStyle(0x3a2200).fillTriangle(16, 7, 8, 17, 24, 17).fillTriangle(16, 15, 8, 25, 24, 25);
  g.generateTexture('ns-power-weapon', 32, 32);

  // 补给命数:玫红色,十字加号
  g.clear().fillStyle(0xff5f8a).fillCircle(16, 16, 15);
  g.lineStyle(3, 0xffe3ec).strokeCircle(16, 16, 11);
  g.fillStyle(0xffffff).fillRect(14, 8, 4, 16).fillRect(8, 14, 16, 4);
  g.generateTexture('ns-power-life', 32, 32);

  g.clear().fillStyle(0xffffff).fillCircle(3, 3, 3);
  g.generateTexture('ns-spark', 6, 6);
  g.destroy();
}
