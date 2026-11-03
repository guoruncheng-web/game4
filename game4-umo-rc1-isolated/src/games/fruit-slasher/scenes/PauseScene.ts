import * as Phaser from 'phaser';
import {
  DIFFICULTIES, GAME_HEIGHT, GAME_WIDTH, MODES, PALETTE,
  type DifficultyId, type GameMode,
} from '../config';
import { getVolume, isMuted, setMuted, setVolume, sfx } from '../sfx';
import { volumeBar, woodButton, woodPanel } from '../ui';

type PauseData = { mode: GameMode; difficulty: DifficultyId; score: number };

/**
 * 叠在 GameScene 之上的暂停层。
 * GameScene 用 scene.pause() 冻结(物理、计时器、输入全停),这里负责恢复或退出。
 */
export class PauseScene extends Phaser.Scene {
  constructor() { super('FruitPause'); }

  private switching = false;

  create(data: PauseData) {
    this.switching = false;
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    this.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x02070f, 0.76).setInteractive();
    woodPanel(this, cx, cy, 440, 540);

    this.add.text(cx, cy - 222, '暂停', {
      fontFamily: 'system-ui, sans-serif', fontSize: '42px', fontStyle: 'bold',
      color: PALETTE.cream, stroke: '#3a2118', strokeThickness: 7,
    }).setOrigin(0.5);
    this.add.text(cx, cy - 170, `${MODES[data.mode].label} · ${DIFFICULTIES[data.difficulty].label}`, {
      fontFamily: 'system-ui, sans-serif', fontSize: '19px', color: PALETTE.mist,
    }).setOrigin(0.5);
    this.add.text(cx, cy - 138, `当前得分  ${data.score}`, {
      fontFamily: 'system-ui, sans-serif', fontSize: '20px', fontStyle: 'bold', color: PALETTE.gold,
    }).setOrigin(0.5);

    const muteLabel = () => (isMuted() ? '音效：关' : '音效：开');
    const muteButton = woodButton(this, cx, cy - 4, 300, 50, muteLabel(), () => {
      const next = setMuted(!isMuted());
      muteButton.setLabel(muteLabel());
      if (!next) sfx.ui();
    }, { size: 19, silent: true });

    this.add.text(cx, cy - 74, '主音量', {
      fontFamily: 'system-ui, sans-serif', fontSize: '16px', color: PALETTE.mist,
    }).setOrigin(0.5);
    volumeBar(this, cx, cy - 44, 300, 10, getVolume(), (value) => {
      setVolume(value);
      // 拖到有声音了就自动解除静音,否则玩家会以为音量条坏了
      if (value > 0 && isMuted()) { setMuted(false); muteButton.setLabel(muteLabel()); }
    });

    // 三个按钮同屏,双指同帧点两个会排出两次场景切换,这里上闩只放行第一次
    const go = (action: () => void) => () => {
      if (this.switching) return;
      this.switching = true;
      action();
    };
    woodButton(this, cx, cy + 74, 300, 66, '继续切', go(() => this.resumeGame()), { size: 26 });
    woodButton(this, cx, cy + 150, 300, 54, '重新开始', go(() => {
      this.scene.stop('FruitGame');
      this.scene.start('FruitGame', { mode: data.mode, difficulty: data.difficulty });
    }), { size: 20 });
    woodButton(this, cx, cy + 218, 300, 54, '放弃并返回菜单', go(() => {
      this.scene.stop('FruitGame');
      this.scene.start('FruitMenu');
    }), { size: 20, accent: 0xff6a4a });

    this.input.keyboard?.on('keydown-ESC', () => this.resumeGame());
    this.input.keyboard?.on('keydown-P', () => this.resumeGame());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.keyboard?.removeAllListeners());
  }

  private resumeGame() {
    sfx.ui();
    this.scene.stop();
    this.scene.resume('FruitGame');
  }
}
