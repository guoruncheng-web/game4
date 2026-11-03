import * as Phaser from 'phaser';
import {
  DIFFICULTIES, DIFFICULTY_ORDER, GAME_HEIGHT, GAME_WIDTH, PALETTE, type Difficulty,
} from '../config';
import { isMuted, setMuted, sfx } from '../sfx';
import { loadDifficulty, loadRecord, saveDifficulty } from '../storage';
import { ballTexture } from '../textures';

/** 菜单。界面全英文 —— 这款是给海外玩家的 */
export class MenuScene extends Phaser.Scene {
  private difficulty: Difficulty = 'pro';
  private cards: Array<{ bg: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text; id: Difficulty }> = [];
  private hintText!: Phaser.GameObjects.Text;
  private recordText!: Phaser.GameObjects.Text;
  private soundText!: Phaser.GameObjects.Text;

  constructor() { super('PoolMenu'); }

  create() {
    this.difficulty = loadDifficulty() ?? 'pro';
    this.cards = [];
    this.cameras.main.setBackgroundColor('#0d1a14');

    // 背景:一块台呢加几颗散落的球,直接告诉玩家这是什么游戏
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x123322, 1);
    this.add.rectangle(GAME_WIDTH / 2, 250, GAME_WIDTH - 60, 300, 0x1f7a52, 1)
      .setStrokeStyle(10, 0x5a3320, 1);
    const decor = [
      { id: 9, x: 150, y: 210 }, { id: 3, x: 205, y: 258 }, { id: 14, x: 262, y: 205 },
      { id: 8, x: 320, y: 252 }, { id: 5, x: 378, y: 208 },
    ];
    for (const item of decor) {
      this.add.image(item.x, item.y, ballTexture(item.id)).setDisplaySize(34, 34);
    }

    this.add.text(GAME_WIDTH / 2, 130, 'EIGHT BALL', {
      fontFamily: 'system-ui, sans-serif', fontSize: '54px', fontStyle: 'bold',
      color: PALETTE.chalk, stroke: '#08120c', strokeThickness: 8,
    }).setOrigin(0.5);
    this.add.text(GAME_WIDTH / 2, 174, 'Rack up. Run the table.', {
      fontFamily: 'system-ui, sans-serif', fontSize: '17px', color: PALETTE.gold,
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, 446, 'OPPONENT', {
      fontFamily: 'system-ui, sans-serif', fontSize: '14px', fontStyle: 'bold', color: PALETTE.dim,
    }).setOrigin(0.5);

    DIFFICULTY_ORDER.forEach((id, index) => {
      const y = 500 + index * 74;
      const bg = this.add.rectangle(GAME_WIDTH / 2, y, GAME_WIDTH - 96, 62, 0x143427, 1)
        .setStrokeStyle(2, 0x2f5c46, 1)
        .setInteractive({ useHandCursor: true });
      const label = this.add.text(GAME_WIDTH / 2, y, DIFFICULTIES[id].label, {
        fontFamily: 'system-ui, sans-serif', fontSize: '24px', fontStyle: 'bold', color: PALETTE.chalk,
      }).setOrigin(0.5);
      bg.on('pointerup', () => {
        sfx.ui();
        this.difficulty = id;
        saveDifficulty(id);
        this.refresh();
      });
      this.cards.push({ bg, label, id });
    });

    this.hintText = this.add.text(GAME_WIDTH / 2, 724, '', {
      fontFamily: 'system-ui, sans-serif', fontSize: '15px', color: PALETTE.dim, align: 'center',
    }).setOrigin(0.5);
    this.recordText = this.add.text(GAME_WIDTH / 2, 752, '', {
      fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: PALETTE.gold,
    }).setOrigin(0.5);

    const play = this.add.rectangle(GAME_WIDTH / 2, 830, GAME_WIDTH - 140, 74, 0xf4c95d, 1)
      .setInteractive({ useHandCursor: true });
    this.add.text(GAME_WIDTH / 2, 830, 'PLAY', {
      fontFamily: 'system-ui, sans-serif', fontSize: '30px', fontStyle: 'bold', color: '#123322',
    }).setOrigin(0.5);
    play.on('pointerup', () => {
      sfx.ui();
      this.scene.start('PoolGame', { difficulty: this.difficulty });
    });

    this.soundText = this.add.text(GAME_WIDTH / 2, 906, '', {
      fontFamily: 'system-ui, sans-serif', fontSize: '15px', color: PALETTE.dim,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    this.soundText.on('pointerup', () => {
      setMuted(!isMuted());
      sfx.ui();
      this.refresh();
    });

    this.input.keyboard?.on('keydown-ENTER', () => this.scene.start('PoolGame', { difficulty: this.difficulty }));
    this.refresh();
  }

  private refresh() {
    for (const card of this.cards) {
      const active = card.id === this.difficulty;
      card.bg.setFillStyle(active ? 0x1f7a52 : 0x143427, 1);
      card.bg.setStrokeStyle(2, active ? 0xf4c95d : 0x2f5c46, 1);
      card.label.setColor(active ? '#ffffff' : PALETTE.chalk);
    }
    const spec = DIFFICULTIES[this.difficulty];
    this.hintText.setText(spec.hint);
    const record = loadRecord(this.difficulty);
    this.recordText.setText(
      record.wins + record.losses === 0
        ? 'No games yet'
        : `${record.wins}W · ${record.losses}L · best streak ${record.best}`,
    );
    this.soundText.setText(isMuted() ? 'SOUND: OFF' : 'SOUND: ON');
  }
}
