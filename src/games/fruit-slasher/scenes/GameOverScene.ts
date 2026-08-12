import * as Phaser from 'phaser';
import { createBackground } from '../background';
import { GAME_HEIGHT, GAME_WIDTH, STORAGE_KEY } from '../config';
import { sfx } from '../sfx';
import type { GameOverData } from './GameScene';

export class GameOverScene extends Phaser.Scene {
  private result!: GameOverData;
  constructor() { super('FruitGameOver'); }
  init(data: GameOverData) { this.result = data; }

  create() {
    createBackground(this);
    const cx = GAME_WIDTH / 2;
    this.add.rectangle(cx, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x020711, 0.58);
    let best = safeBest();
    const isNewBest = this.result.score > best;
    if (isNewBest) {
      best = this.result.score;
      try { localStorage.setItem(STORAGE_KEY, String(best)); } catch { /* 存储失败不影响结算 */ }
      sfx.newBest();
    }
    const panel = this.add.image(cx, 502, 'fs-panel').setDisplaySize(450, 578);
    const panelScaleX = panel.scaleX;
    const panelScaleY = panel.scaleY;
    panel.setAlpha(0).setScale(panelScaleX * 0.96, panelScaleY * 0.96);
    this.tweens.add({
      targets: panel,
      y: 480,
      alpha: 1,
      scaleX: panelScaleX,
      scaleY: panelScaleY,
      duration: 320,
      ease: 'Cubic.easeOut',
    });
    this.add.text(cx, 278, this.result.reason === 'bomb' ? '切到炸弹了' : '水果漏掉了', {
      fontFamily: 'system-ui, sans-serif', fontSize: '36px', fontStyle: 'bold', color: this.result.reason === 'bomb' ? '#ff6a4a' : '#fff0c8',
    }).setOrigin(0.5);
    if (isNewBest) this.add.text(cx, 326, '新纪录！', { fontFamily: 'system-ui, sans-serif', fontSize: '24px', fontStyle: 'bold', color: '#ffd45a' }).setOrigin(0.5);
    this.add.text(cx, 390, String(this.result.score), {
      fontFamily: 'system-ui, sans-serif', fontSize: '82px', fontStyle: 'bold', color: '#fff0c8', stroke: '#3a2118', strokeThickness: 7,
    }).setOrigin(0.5);
    this.add.text(cx, 493, `最高分  ${best}\n切中水果  ${this.result.sliced}\n最高 Combo  ${this.result.bestCombo}`, {
      align: 'center', lineSpacing: 11, fontFamily: 'system-ui, sans-serif', fontSize: '22px', color: '#bfd7de',
    }).setOrigin(0.5);
    const restartFruit = this.add.image(cx, 630, 'fs-fruit-orange').setDisplaySize(88, 88).setInteractive({ useHandCursor: true });
    const hint = this.add.text(cx, 704, '点击水果再来一局', { fontFamily: 'system-ui, sans-serif', fontSize: '22px', fontStyle: 'bold', color: '#fff0c8' }).setOrigin(0.5);
    this.tweens.add({ targets: [restartFruit, hint], alpha: 0.45, duration: 700, yoyo: true, repeat: -1 });
    this.time.delayedCall(450, () => {
      restartFruit.once('pointerdown', () => { sfx.ui(); this.scene.start('FruitGame'); });
      this.input.keyboard?.once('keydown', () => this.scene.start('FruitGame'));
    });
  }
}

function safeBest() {
  if (typeof localStorage === 'undefined') return 0;
  const value = Number(localStorage.getItem(STORAGE_KEY) || 0);
  return Number.isFinite(value) ? value : 0;
}
