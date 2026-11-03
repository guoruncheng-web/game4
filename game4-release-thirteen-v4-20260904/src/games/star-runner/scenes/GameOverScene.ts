import * as Phaser from 'phaser';
import { GAME_WIDTH } from '../config';

type Data = { score: number; level: number };

export class GameOverScene extends Phaser.Scene {
  private score = 0;
  private level = 1;

  constructor() {
    super('GameOver');
  }

  init(data: Data) {
    this.score = data.score ?? 0;
    this.level = data.level ?? 1;
  }

  create() {
    const cx = GAME_WIDTH / 2;
    this.cameras.main.setBackgroundColor('#0b1120');
    this.cameras.main.fadeIn(300, 0, 0, 0);

    let best = 0;
    if (typeof localStorage !== 'undefined') {
      best = Number(localStorage.getItem('star-runner-best') || 0);
      if (this.score > best) {
        best = this.score;
        localStorage.setItem('star-runner-best', String(best));
      }
    }

    this.add
      .text(cx, 190, 'GAME OVER', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '58px',
        fontStyle: 'bold',
        color: '#f87171',
      })
      .setOrigin(0.5);

    this.add
      .text(cx, 275, `本局得分 ${this.score}   ·   到达第 ${this.level} 关`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '24px',
        color: '#e2e8f0',
      })
      .setOrigin(0.5);

    this.add
      .text(cx, 315, `最高分 ${best}`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '20px',
        color: '#facc15',
      })
      .setOrigin(0.5);

    const hint = this.add
      .text(cx, 410, '按任意键 / 点击重新开始', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '22px',
        color: '#4ade80',
      })
      .setOrigin(0.5);
    this.tweens.add({ targets: hint, alpha: 0.25, duration: 800, yoyo: true, repeat: -1 });

    const restart = () => this.scene.start('Game', { level: 1, score: 0, lives: 3 });
    this.time.delayedCall(600, () => {
      this.input.keyboard?.once('keydown', restart);
      this.input.once('pointerdown', restart);
    });
  }
}
