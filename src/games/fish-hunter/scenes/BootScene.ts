import * as Phaser from 'phaser';
import { buildTextures } from '../textures';

/**
 * 生成占位贴图,然后直奔战斗场景。
 *
 * 捕鱼**没有"开局"这个时刻**(DESIGN.md §4.2):鱼一直在游,人随进随打。
 * 所以这里没有菜单场景 —— 进来就是在池边。
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('FishBoot');
  }

  create(): void {
    buildTextures(this);
    // transport 由 index.ts 放进 registry(场景拿不到 startGame 的局部变量)
    this.scene.start('FishGame', { transport: this.registry.get('transport') });
  }
}
