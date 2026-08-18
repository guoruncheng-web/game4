import * as Phaser from 'phaser';
import { DIFFICULTIES, GAME_HEIGHT, GAME_WIDTH, PALETTE } from '../config';
import { sfx } from '../sfx';
import { saveResult } from '../storage';
import type { PoolOverData } from './GameScene';

export class GameOverScene extends Phaser.Scene {
  private result!: PoolOverData;

  constructor() { super('PoolOver'); }

  init(data: PoolOverData) {
    this.result = data;
  }

  create() {
    const won = this.result.winner === 'you';
    const record = saveResult(this.result.difficulty, won);
    this.cameras.main.setBackgroundColor('#0d1a14');
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x123322, 1);

    this.add.rectangle(GAME_WIDTH / 2, 430, GAME_WIDTH - 80, 420, 0x143427, 1)
      .setStrokeStyle(2, won ? 0xf4c95d : 0x3f5a4c, 1);

    this.add.text(GAME_WIDTH / 2, 300, won ? 'YOU WIN' : 'YOU LOSE', {
      fontFamily: 'system-ui, sans-serif', fontSize: '52px', fontStyle: 'bold',
      color: won ? PALETTE.gold : PALETTE.danger, stroke: '#08120c', strokeThickness: 7,
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, 356, this.result.reason || (won ? 'Clean finish' : 'Better luck next rack'), {
      fontFamily: 'system-ui, sans-serif', fontSize: '16px', color: PALETTE.dim,
      align: 'center', wordWrap: { width: GAME_WIDTH - 140 },
    }).setOrigin(0.5);

    const lines = [
      `Opponent      ${DIFFICULTIES[this.result.difficulty].label}`,
      `Balls potted  ${this.result.potted}`,
      `Record        ${record.wins}W · ${record.losses}L`,
      `Win streak    ${record.streak}  (best ${record.best})`,
    ];
    lines.forEach((line, i) => {
      this.add.text(GAME_WIDTH / 2, 428 + i * 34, line, {
        fontFamily: 'ui-monospace, monospace', fontSize: '16px', color: PALETTE.chalk,
      }).setOrigin(0.5);
    });

    this.button(690, 'REMATCH', 0xf4c95d, '#123322', () => {
      this.scene.start('PoolGame', { difficulty: this.result.difficulty });
    });
    this.button(778, 'MENU', 0x143427, PALETTE.chalk, () => this.scene.start('PoolMenu'));

    this.input.keyboard?.on('keydown-ENTER', () => this.scene.start('PoolGame', { difficulty: this.result.difficulty }));
  }

  private button(y: number, text: string, fill: number, color: string, onClick: () => void) {
    const rect = this.add.rectangle(GAME_WIDTH / 2, y, GAME_WIDTH - 150, 66, fill, 1)
      .setStrokeStyle(2, 0x2f5c46, 1)
      .setInteractive({ useHandCursor: true });
    this.add.text(GAME_WIDTH / 2, y, text, {
      fontFamily: 'system-ui, sans-serif', fontSize: '24px', fontStyle: 'bold', color,
    }).setOrigin(0.5);
    rect.on('pointerup', () => { sfx.ui(); onClick(); });
  }
}
