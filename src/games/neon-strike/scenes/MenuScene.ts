import * as Phaser from 'phaser';
import {
  CAMPAIGN_WAVES, COLORS, DIFFICULTIES, DIFFICULTY_ORDER,
  GAME_HEIGHT, GAME_WIDTH, type DifficultyId,
} from '../config';
import { getVolume, isMuted, setMuted, setVolume, sfx } from '../sfx';
import { bestScore, clearRecords, loadScores, loadSettings, saveSettings } from '../storage';
import { neonButton, neonPanel, segmented, volumeBar } from '../ui';

export class MenuScene extends Phaser.Scene {
  private difficulty: DifficultyId = 'normal';
  private endlessUnlocked = false;
  private hintText!: Phaser.GameObjects.Text;
  private overlay?: Phaser.GameObjects.Container;

  constructor() { super('NeonMenu'); }

  create() {
    const settings = loadSettings();
    this.difficulty = settings.difficulty;
    this.endlessUnlocked = settings.endlessUnlocked;
    this.overlay = undefined;

    const space = drawSpace(this, 0.55);
    this.events.on(Phaser.Scenes.Events.UPDATE, () => { space.tilePositionY -= 0.42; });

    const header = this.add.graphics().setDepth(1);
    header.fillStyle(0x050d19, 0.86).fillRect(70, 128, 400, 122);
    header.lineStyle(2, COLORS.cyan, 0.72).strokeRect(70, 128, 400, 122);
    header.lineStyle(2, COLORS.red, 0.7).lineBetween(116, 250, 424, 250);
    this.add.text(GAME_WIDTH / 2, 157, 'NEON STRIKE', {
      fontFamily: 'Arial Black, sans-serif', fontSize: '48px', color: COLORS.ink,
      stroke: '#0a3347', strokeThickness: 8,
    }).setOrigin(0.5).setDepth(2);
    this.add.text(GAME_WIDTH / 2, 218, '星门防卫协议 // ONLINE', {
      fontFamily: 'monospace', fontSize: '16px', color: COLORS.warn, letterSpacing: 2,
    }).setOrigin(0.5).setDepth(2);

    const best = bestScore();
    this.add.text(GAME_WIDTH / 2, 272, `最高分 ${String(best).padStart(6, '0')}`, {
      fontFamily: 'monospace', fontSize: '17px', color: COLORS.sub,
    }).setOrigin(0.5);

    const fighter = this.add.image(GAME_WIDTH / 2, 392, 'ns-player').setDisplaySize(146, 218);
    this.tweens.add({ targets: fighter, y: 403, duration: 950, yoyo: true, repeat: -1, ease: 'Sine.inOut' });

    this.add.text(GAME_WIDTH / 2, 520, '难度', {
      fontFamily: 'monospace', fontSize: '14px', color: '#5fd6ef', letterSpacing: 4,
    }).setOrigin(0.5);
    segmented(
      this, GAME_WIDTH / 2, 556, 390, 46,
      DIFFICULTY_ORDER.map((id) => ({ id, label: DIFFICULTIES[id].label })),
      this.difficulty,
      (id) => {
        this.difficulty = id;
        saveSettings({ difficulty: id });
        this.hintText.setText(DIFFICULTIES[id].hint);
      },
    );
    this.hintText = this.add.text(GAME_WIDTH / 2, 594, DIFFICULTIES[this.difficulty].hint, {
      fontFamily: 'system-ui', fontSize: '16px', color: COLORS.muted,
    }).setOrigin(0.5);

    neonButton(this, GAME_WIDTH / 2, 664, 300, 74, '开始战役', () => this.launch('campaign'), { size: 28 });
    this.add.text(GAME_WIDTH / 2, 712, `${CAMPAIGN_WAVES} 波 · 3 个 Boss · 有结局`, {
      fontFamily: 'monospace', fontSize: '13px', color: '#5f8fa8',
    }).setOrigin(0.5);

    neonButton(
      this, GAME_WIDTH / 2, 764, 300, 56,
      this.endlessUnlocked ? '无尽模式' : '无尽模式 · 未解锁',
      () => this.launch('endless'),
      { size: 21, accent: COLORS.amber, enabled: this.endlessUnlocked },
    );
    if (!this.endlessUnlocked) {
      this.add.text(GAME_WIDTH / 2, 800, '通关一次战役即可解锁', {
        fontFamily: 'monospace', fontSize: '13px', color: '#5f8fa8',
      }).setOrigin(0.5);
    }

    neonButton(this, GAME_WIDTH / 2 - 82, 862, 148, 50, '战绩', () => this.openScores(), { size: 19 });
    neonButton(this, GAME_WIDTH / 2 + 82, 862, 148, 50, '设置', () => this.openSettings(), { size: 19 });

    this.add.text(GAME_WIDTH / 2, 908, '拖动 / 方向键移动  ·  武器自动开火  ·  P 暂停', {
      fontFamily: 'monospace', fontSize: '14px', color: COLORS.muted,
    }).setOrigin(0.5);
    this.add.text(GAME_WIDTH / 2, 932, '敌机飞出画面底部 = 漏防,扣 1 机', {
      fontFamily: 'monospace', fontSize: '13px', color: '#c08a86',
    }).setOrigin(0.5);

    this.input.keyboard?.on('keydown-SPACE', () => { if (!this.overlay) this.launch('campaign'); });
    this.input.keyboard?.on('keydown-ENTER', () => { if (!this.overlay) this.launch('campaign'); });
    this.input.keyboard?.on('keydown-ESC', () => this.closeOverlay());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.removeAllListeners();
      this.events.removeAllListeners(Phaser.Scenes.Events.UPDATE);
    });
  }

  private launch(mode: 'campaign' | 'endless') {
    sfx.ui();
    this.scene.start('NeonGame', { mode, difficulty: this.difficulty });
  }

  /** 全屏遮罩 + 面板,同时只允许开一个 */
  private openOverlay(title: string, height: number) {
    this.closeOverlay();
    const container = this.add.container(0, 0).setDepth(60);
    const blocker = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x03060f, 0.82)
      .setInteractive();
    container.add(blocker);
    const cy = GAME_HEIGHT / 2;
    container.add(neonPanel(this, GAME_WIDTH / 2, cy, 460, height, { alpha: 0.96 }));
    container.add(this.add.text(GAME_WIDTH / 2, cy - height / 2 + 34, title, {
      fontFamily: 'Arial Black, system-ui', fontSize: '28px', color: COLORS.ink,
    }).setOrigin(0.5));
    container.add(neonButton(this, GAME_WIDTH / 2, cy + height / 2 - 44, 200, 52, '关闭',
      () => this.closeOverlay(), { size: 20 }).root);
    this.overlay = container;
    return { container, cy, height };
  }

  private closeOverlay() {
    this.overlay?.destroy(true);
    this.overlay = undefined;
  }

  private openScores() {
    const { container, cy, height } = this.openOverlay('本地战绩', 520);
    const records = loadScores();
    if (records.length === 0) {
      container.add(this.add.text(GAME_WIDTH / 2, cy, '还没有战绩,先出击一次', {
        fontFamily: 'system-ui', fontSize: '18px', color: COLORS.muted,
      }).setOrigin(0.5));
      return;
    }
    const top = cy - height / 2 + 84;
    container.add(this.add.text(GAME_WIDTH / 2, top, '  #   分数     波次   难度   模式', {
      fontFamily: 'monospace', fontSize: '14px', color: '#5fd6ef',
    }).setOrigin(0.5));
    records.forEach((record, i) => {
      const line = [
        String(i + 1).padStart(2, ' '),
        String(record.score).padStart(7, '0'),
        `${String(record.wave).padStart(2, '0')} 波`,
        DIFFICULTIES[record.difficulty]?.label ?? '—',
        record.mode === 'endless' ? '无尽' : record.victory ? '通关' : '战役',
      ].join('   ');
      container.add(this.add.text(GAME_WIDTH / 2, top + 34 + i * 30, line, {
        fontFamily: 'monospace', fontSize: '16px',
        color: record.victory ? '#8dffc4' : i === 0 ? '#ffd98a' : COLORS.ink,
      }).setOrigin(0.5));
    });
  }

  private openSettings() {
    const { container, cy, height } = this.openOverlay('设置', 470);
    const top = cy - height / 2 + 96;

    const muteLabel = () => (isMuted() ? '音效:关' : '音效:开');
    const muteButton = neonButton(
      this, GAME_WIDTH / 2, top + 108, 260, 52, muteLabel(),
      () => {
        const next = setMuted(!isMuted());
        muteButton.setLabel(muteLabel());
        if (!next) sfx.ui();
      },
      { size: 20, silent: true },
    );
    container.add(muteButton.root);

    container.add(this.add.text(GAME_WIDTH / 2, top, '主音量', {
      fontFamily: 'system-ui', fontSize: '18px', color: COLORS.sub,
    }).setOrigin(0.5));
    const bar = volumeBar(this, GAME_WIDTH / 2, top + 40, 340, 10, getVolume(), (value) => {
      setVolume(value);
      // 拖到有声音了就自动解除静音,否则玩家会以为音量条坏了
      if (value > 0 && isMuted()) { setMuted(false); muteButton.setLabel(muteLabel()); }
    });
    container.add(bar.cells);

    let armed = false;
    const clearButton = neonButton(
      this, GAME_WIDTH / 2, top + 178, 260, 52, '清除战绩榜',
      () => {
        if (!armed) { armed = true; clearButton.setLabel('再点一次确认'); return; }
        clearRecords();
        clearButton.setLabel('已清除');
        clearButton.setEnabled(false);
      },
      { size: 20, accent: COLORS.red },
    );
    container.add(clearButton.root);

    container.add(this.add.text(GAME_WIDTH / 2, top + 226, '战绩只存在这台设备的浏览器里(不含难度与解锁)', {
      fontFamily: 'monospace', fontSize: '13px', color: '#5f8fa8',
    }).setOrigin(0.5));
  }
}

export function drawSpace(scene: Phaser.Scene, alpha = 0.96) {
  scene.cameras.main.setBackgroundColor('#06051b');
  return scene.add.tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, 'ns-space')
    .setOrigin(0)
    .setTileScale(GAME_WIDTH / 941)
    .setAlpha(alpha)
    .setDepth(-20);
}
