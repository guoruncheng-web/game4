import * as Phaser from 'phaser';
import { GAME_WIDTH } from '../config';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create() {
    const cx = GAME_WIDTH / 2;

    this.add
      .text(cx, 170, 'STAR RUNNER', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '64px',
        fontStyle: 'bold',
        color: '#f8fafc',
      })
      .setOrigin(0.5)
      .setShadow(0, 6, '#0f172a', 12, false, true);

    this.add
      .text(cx, 232, '收集全部星星,躲开炸弹', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '22px',
        color: '#94a3b8',
      })
      .setOrigin(0.5);

    const player = this.add.sprite(cx, 330, 'player').setScale(2);
    this.tweens.add({
      targets: player,
      y: 310,
      duration: 700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.add
      .text(cx, 420, '← → 或 A / D 移动    ↑ / W / 空格 跳跃(可二段跳)', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '18px',
        color: '#cbd5e1',
      })
      .setOrigin(0.5);

    const best = Number(
      (typeof localStorage !== 'undefined' && localStorage.getItem('star-runner-best')) || 0,
    );
    if (best > 0) {
      this.add
        .text(cx, 452, `最高分:${best}`, {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '18px',
          color: '#facc15',
        })
        .setOrigin(0.5);
    }

    const hint = this.add
      .text(cx, 510, '按任意键 / 点击屏幕开始', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '24px',
        color: '#4ade80',
      })
      .setOrigin(0.5);

    this.tweens.add({ targets: hint, alpha: 0.25, duration: 800, yoyo: true, repeat: -1 });

    const start = () => this.scene.start('Game', { level: 1, score: 0, lives: 3 });
    this.input.keyboard?.once('keydown', start);
    this.input.once('pointerdown', start);
  }
}
