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

/**
 * 素材是 AI 出图,原图普遍比实际显示尺寸大 4~6 倍(水果最大只画到 112px,原图却有 475px)。
 * 逻辑画布固定 540×960,再大的贴图也只是白占显存、白做纹理缩采样,
 * 在低端机上是实打实的卡顿来源。Boot 阶段一次性重采样到"够用就好"的尺寸,
 * 之后整局都用小图。倍数留了 ~1.5×,放大动效也不会糊。
 */
const MAX_SIZE: Array<[RegExp, number]> = [
  [/^fs-fruit-|^fs-half-/, 256],
  [/^fs-bomb$/, 192],
  [/^fs-background$/, 640],
  [/^fs-plaque$/, 512],
  [/^fs-panel$/, 640],
  [/^fs-life$/, 96],
];

export function downscaleArt(scene: Phaser.Scene) {
  for (const key of scene.textures.getTextureKeys()) {
    const limit = MAX_SIZE.find(([pattern]) => pattern.test(key))?.[1];
    if (limit === undefined) continue;
    const source = scene.textures.get(key).getSourceImage();
    if (!(source instanceof HTMLImageElement)) continue;
    const scale = limit / Math.max(source.width, source.height);
    if (scale >= 1) continue;
    const width = Math.max(1, Math.round(source.width * scale));
    const height = Math.max(1, Math.round(source.height * scale));
    // 先把原图引用拿在手上,再删掉旧贴图,好让画布贴图沿用同一个 key
    scene.textures.remove(key);
    const canvas = scene.textures.createCanvas(key, width, height);
    if (!canvas) continue;
    canvas.context.imageSmoothingEnabled = true;
    canvas.context.imageSmoothingQuality = 'high';
    canvas.context.drawImage(source, 0, 0, width, height);
    canvas.refresh();
  }
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
