import * as Phaser from 'phaser';
import { CAMPAIGN_WAVES, COLORS, DIFFICULTIES, GAME_HEIGHT, GAME_WIDTH, type DifficultyId, type GameMode } from '../config';
import { getVolume, isMuted, setMuted, setVolume, sfx } from '../sfx';
import { neonButton, neonPanel, volumeBar } from '../ui';

type PauseData = { mode: GameMode; difficulty: DifficultyId; wave: number; score: number };

/**
 * 叠在 GameScene 之上的暂停层。
 * GameScene 用 scene.pause() 冻结(物理、计时器、输入全停),这里负责恢复或退出。
 */
export class PauseScene extends Phaser.Scene {
  constructor() { super('NeonPause'); }

  create(data: PauseData) {
    const cy = GAME_HEIGHT / 2;
    this.add.rectangle(GAME_WIDTH / 2, cy, GAME_WIDTH, GAME_HEIGHT, 0x03060f, 0.78).setInteractive();
    neonPanel(this, GAME_WIDTH / 2, cy, 440, 560, { alpha: 0.96 });

    this.add.text(GAME_WIDTH / 2, cy - 232, '暂停', {
      fontFamily: 'Arial Black, system-ui', fontSize: '40px', color: COLORS.ink, stroke: '#0a3347', strokeThickness: 6,
    }).setOrigin(0.5);

    const waveLabel = data.mode === 'campaign'
      ? `第 ${data.wave} / ${CAMPAIGN_WAVES} 波`
      : `第 ${data.wave} 波`;
    this.add.text(GAME_WIDTH / 2, cy - 176, `${data.mode === 'campaign' ? '战役' : '无尽'} · ${DIFFICULTIES[data.difficulty].label} · ${waveLabel}`, {
      fontFamily: 'system-ui', fontSize: '18px', color: COLORS.sub,
    }).setOrigin(0.5);
    this.add.text(GAME_WIDTH / 2, cy - 142, `当前得分 ${String(data.score).padStart(6, '0')}`, {
      fontFamily: 'monospace', fontSize: '17px', color: '#ffd98a',
    }).setOrigin(0.5);

    const muteLabel = () => (isMuted() ? '音效:关' : '音效:开');
    const muteButton = neonButton(this, GAME_WIDTH / 2, cy - 4, 300, 50, muteLabel(), () => {
      const next = setMuted(!isMuted());
      muteButton.setLabel(muteLabel());
      if (!next) sfx.ui();
    }, { size: 19, silent: true });

    this.add.text(GAME_WIDTH / 2, cy - 74, '主音量', {
      fontFamily: 'system-ui', fontSize: '16px', color: COLORS.sub,
    }).setOrigin(0.5);
    volumeBar(this, GAME_WIDTH / 2, cy - 44, 300, 10, getVolume(), (value) => {
      setVolume(value);
      if (value > 0 && isMuted()) { setMuted(false); muteButton.setLabel(muteLabel()); }
    });

    neonButton(this, GAME_WIDTH / 2, cy + 76, 300, 68, '继续战斗', () => this.resumeGame(), { size: 26 });
    neonButton(this, GAME_WIDTH / 2, cy + 156, 300, 54, '重新开始', () => {
      this.scene.stop('NeonGame');
      this.scene.start('NeonGame', { mode: data.mode, difficulty: data.difficulty });
    }, { size: 20, accent: COLORS.amber });
    neonButton(this, GAME_WIDTH / 2, cy + 226, 300, 54, '放弃并返回菜单', () => {
      this.scene.stop('NeonGame');
      this.scene.start('NeonMenu');
    }, { size: 20, accent: COLORS.red });

    this.input.keyboard?.on('keydown-ESC', () => this.resumeGame());
    this.input.keyboard?.on('keydown-P', () => this.resumeGame());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.keyboard?.removeAllListeners());
  }

  private resumeGame() {
    sfx.ui();
    this.scene.stop();
    this.scene.resume('NeonGame');
  }
}
