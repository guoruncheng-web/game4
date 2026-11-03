import * as Phaser from 'phaser';
import { createTextures } from '../textures';

export class BootScene extends Phaser.Scene {
  constructor() { super('PoolBoot'); }

  create() {
    // 贴图全是现场生成的,没有网络加载,所以这里不需要进度条
    createTextures(this);
    this.scene.start('PoolMenu');
  }
}
