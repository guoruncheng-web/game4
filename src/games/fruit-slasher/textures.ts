import * as Phaser from 'phaser';
import { FRUIT_KINDS, type FruitKind } from './config';

const ASSET_ROOT = '/fruit-slasher/assets';

/** 在 Boot 阶段加载已经离线去背、裁边的生产素材。 */
export function preloadArt(scene: Phaser.Scene) {
  scene.load.image('fs-background', `${ASSET_ROOT}/backgrounds/dojo-night-v1.png`);
  for (const kind of FRUIT_KINDS) {
    scene.load.image(`fs-fruit-${kind}`, `${ASSET_ROOT}/sprites/${kind}-full.png`);
    scene.load.image(`fs-half-${kind}-a`, `${ASSET_ROOT}/sprites/${kind}-half-a.png`);
    scene.load.image(`fs-half-${kind}-b`, `${ASSET_ROOT}/sprites/${kind}-half-b.png`);
  }
  scene.load.image('fs-bomb', `${ASSET_ROOT}/sprites/bomb.png`);
  scene.load.image('fs-plaque', `${ASSET_ROOT}/ui/plaque.png`);
  scene.load.image('fs-panel', `${ASSET_ROOT}/ui/results-panel-v4.png`);
  scene.load.image('fs-life', `${ASSET_ROOT}/ui/life.png`);
}

/** 粒子和空生命槽保持运行时生成，便于场景着色复用。 */
export function createArtTextures(scene: Phaser.Scene) {
  if (scene.textures.exists('fs-drop')) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(5, 5, 5);
  g.generateTexture('fs-drop', 10, 10);

  g.clear();
  g.lineStyle(3, 0x66717b, 1);
  g.strokeCircle(16, 16, 11);
  g.generateTexture('fs-life-empty', 32, 32);
  g.destroy();
}

export function fruitTexture(kind: FruitKind) {
  return `fs-fruit-${kind}`;
}

export function fruitHalfTexture(kind: FruitKind, side: 'a' | 'b') {
  return `fs-half-${kind}-${side}`;
}
