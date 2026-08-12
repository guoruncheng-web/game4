import * as Phaser from 'phaser';
import { createBackground } from '../background';
import { GAME_WIDTH, STORAGE_KEY } from '../config';
import { sfx } from '../sfx';

export class MenuScene extends Phaser.Scene {
  constructor() { super('FruitMenu'); }

  create() {
    createBackground(this);
    const cx = GAME_WIDTH / 2;
    this.add.image(cx, 166, 'fs-plaque').setDisplaySize(478, 188);
    this.add.text(cx, 174, '水果切切乐', {
      fontFamily: 'system-ui, sans-serif', fontSize: '54px', fontStyle: 'bold', color: '#fff0c8',
      stroke: '#1b0e08', strokeThickness: 7,
    }).setOrigin(0.5);
    this.add.text(cx, 270, '滑动切水果 · 避开炸弹', {
      fontFamily: 'system-ui, sans-serif', fontSize: '23px', color: '#bfd7de',
    }).setOrigin(0.5);

    const best = safeBest();
    if (best > 0) this.add.text(cx, 320, `最高分  ${best}`, {
      fontFamily: 'system-ui, sans-serif', fontSize: '24px', fontStyle: 'bold', color: '#ffd45a',
    }).setOrigin(0.5);

    const fruit = this.add.image(cx, 566, 'fs-fruit-watermelon').setDisplaySize(154, 154).setInteractive({ useHandCursor: true });
    this.tweens.add({ targets: fruit, y: 548, duration: 750, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    const hint = this.add.text(cx, 690, '划过西瓜开始', {
      fontFamily: 'system-ui, sans-serif', fontSize: '30px', fontStyle: 'bold', color: '#fff0c8',
      stroke: '#071326', strokeThickness: 6,
    }).setOrigin(0.5);
    this.tweens.add({ targets: hint, alpha: 0.35, duration: 700, yoyo: true, repeat: -1 });

    let previous: Phaser.Math.Vector2 | null = null;
    const start = () => {
      if (!this.scene.isActive('FruitMenu')) return;
      sfx.ui();
      this.scene.start('FruitGame');
    };
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => { previous = new Phaser.Math.Vector2(pointer.x, pointer.y); });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.isDown || !previous) return;
      const line = new Phaser.Geom.Line(previous.x, previous.y, pointer.x, pointer.y);
      const circle = new Phaser.Geom.Circle(fruit.x, fruit.y, 64);
      previous.set(pointer.x, pointer.y);
      if (Phaser.Geom.Intersects.LineToCircle(line, circle)) start();
    });
    this.input.once('pointerup', () => { previous = null; });
    this.input.keyboard?.once('keydown', start);
  }
}

function safeBest() {
  if (typeof localStorage === 'undefined') return 0;
  const value = Number(localStorage.getItem(STORAGE_KEY) || 0);
  return Number.isFinite(value) ? value : 0;
}
