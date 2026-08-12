import * as Phaser from 'phaser';
import { createArtTextures, preloadArt } from '../textures';

export class BootScene extends Phaser.Scene {
  private loadFailed = false;

  constructor() { super('FruitBoot'); }
  preload() {
    this.loadFailed = false;
    const width = this.scale.width;
    const height = this.scale.height;
    const label = this.add.text(width / 2, height / 2 - 42, '正在准备水果…', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '24px',
      fontStyle: 'bold',
      color: '#fff0c8',
    }).setOrigin(0.5);
    const track = this.add.rectangle(width / 2, height / 2 + 8, 330, 16, 0x071326, 0.85)
      .setStrokeStyle(2, 0xd69b4d, 0.8);
    const fill = this.add.rectangle(width / 2 - 161, height / 2 + 8, 0, 10, 0xffb84a, 1)
      .setOrigin(0, 0.5);
    const percent = this.add.text(width / 2, height / 2 + 48, '0%', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '18px',
      color: '#bfd7de',
    }).setOrigin(0.5);

    this.load.on(Phaser.Loader.Events.PROGRESS, (value: number) => {
      fill.width = 322 * value;
      percent.setText(`${Math.round(value * 100)}%`);
    });
    this.load.once(Phaser.Loader.Events.FILE_LOAD_ERROR, () => {
      this.loadFailed = true;
      label.setText('资源加载失败，请刷新重试').setColor('#ff8a72');
      track.setStrokeStyle(2, 0xff4b3e, 1);
    });
    preloadArt(this);
  }
  create() {
    if (this.loadFailed) return;
    createArtTextures(this);
    this.scene.start('FruitMenu');
  }
}
