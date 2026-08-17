import * as Phaser from 'phaser';
import { createBackground } from '../background';
import {
  DIFFICULTIES, DIFFICULTY_ORDER, GAME_HEIGHT, GAME_WIDTH,
  MODES, MODE_ORDER, PALETTE, type DifficultyId, type GameMode,
} from '../config';
import { getVolume, isMuted, setMuted, setVolume, sfx } from '../sfx';
import { bestScoreOf, clearRecords, loadScores, loadSettings, saveSettings } from '../storage';
import { segmented, volumeBar, woodButton, woodPanel } from '../ui';

export class MenuScene extends Phaser.Scene {
  private mode: GameMode = 'classic';
  private difficulty: DifficultyId = 'standard';
  private modeHint!: Phaser.GameObjects.Text;
  private diffHint!: Phaser.GameObjects.Text;
  private bestText!: Phaser.GameObjects.Text;
  private overlay?: Phaser.GameObjects.Container;
  /** 场景切换只允许发生一次:双指同帧点两个按钮会排出两次 start,导致两个场景同时在跑 */
  private switching = false;

  constructor() { super('FruitMenu'); }

  private refreshBest() {
    const best = bestScoreOf(this.mode);
    this.bestText
      .setText(best > 0 ? `${MODES[this.mode].label} 最高分  ${best}` : '这个模式还没有成绩')
      .setColor(best > 0 ? PALETTE.gold : PALETTE.dim);
  }

  create() {
    const settings = loadSettings();
    this.mode = settings.mode;
    this.difficulty = settings.difficulty;
    this.overlay = undefined;

    createBackground(this);
    const cx = GAME_WIDTH / 2;

    this.add.image(cx, 128, 'fs-plaque').setDisplaySize(452, 176);
    this.add.text(cx, 118, '水果切切乐', {
      fontFamily: 'system-ui, sans-serif', fontSize: '50px', fontStyle: 'bold',
      color: PALETTE.cream, stroke: '#1b0e08', strokeThickness: 7,
    }).setOrigin(0.5);
    this.add.text(cx, 172, '滑动切水果 · 避开炸弹', {
      fontFamily: 'system-ui, sans-serif', fontSize: '20px', color: PALETTE.mist,
    }).setOrigin(0.5);

    // 最高分按模式分开显示:禅意没炸弹不扣命,分数结构性地高于经典,混在一起没有可比性
    this.bestText = this.add.text(cx, 232, '', {
      fontFamily: 'system-ui, sans-serif', fontSize: '22px', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.refreshBest();

    this.add.text(cx, 286, '模式', {
      fontFamily: 'system-ui, sans-serif', fontSize: '15px', color: PALETTE.dim, letterSpacing: 4,
    }).setOrigin(0.5);
    segmented(
      this, cx, 372, 400, 148,
      MODE_ORDER.map((id) => ({ id, label: MODES[id].label })),
      this.mode,
      (id) => {
        this.mode = id;
        saveSettings({ mode: id });
        this.modeHint.setText(MODES[id].hint);
        this.refreshBest();
      },
      { vertical: true, gap: 8, size: 22 },
    );
    this.modeHint = this.add.text(cx, 464, MODES[this.mode].hint, {
      fontFamily: 'system-ui, sans-serif', fontSize: '16px', color: PALETTE.mist,
      align: 'center', wordWrap: { width: 420 },
    }).setOrigin(0.5);

    this.add.text(cx, 512, '难度', {
      fontFamily: 'system-ui, sans-serif', fontSize: '15px', color: PALETTE.dim, letterSpacing: 4,
    }).setOrigin(0.5);
    segmented(
      this, cx, 556, 400, 46,
      DIFFICULTY_ORDER.map((id) => ({ id, label: DIFFICULTIES[id].label })),
      this.difficulty,
      (id) => {
        this.difficulty = id;
        saveSettings({ difficulty: id });
        this.diffHint.setText(DIFFICULTIES[id].hint);
      },
    );
    this.diffHint = this.add.text(cx, 594, DIFFICULTIES[this.difficulty].hint, {
      fontFamily: 'system-ui, sans-serif', fontSize: '15px', color: PALETTE.mist,
    }).setOrigin(0.5);

    // 保留"划过水果开始"的原有手感,同时补一个明确的按钮
    const fruit = this.add.image(cx, 690, 'fs-fruit-watermelon')
      .setDisplaySize(112, 112).setInteractive({ useHandCursor: true });
    this.tweens.add({ targets: fruit, y: 678, duration: 750, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.add.text(cx, 758, '划过西瓜，或点下面的按钮', {
      fontFamily: 'system-ui, sans-serif', fontSize: '16px', color: PALETTE.dim,
    }).setOrigin(0.5);

    woodButton(this, cx, 816, 300, 64, '开始', () => this.launch(), { size: 26 });
    woodButton(this, cx - 82, 890, 148, 48, '战绩', () => this.openScores(), { size: 18 });
    woodButton(this, cx + 82, 890, 148, 48, '设置', () => this.openSettings(), { size: 18 });
    this.add.text(cx, 934, 'P / ESC 暂停', {
      fontFamily: 'system-ui, sans-serif', fontSize: '14px', color: PALETTE.dim,
    }).setOrigin(0.5);

    let previous: Phaser.Math.Vector2 | null = null;
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      previous = new Phaser.Math.Vector2(pointer.x, pointer.y);
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!pointer.isDown || !previous || this.overlay) return;
      const line = new Phaser.Geom.Line(previous.x, previous.y, pointer.x, pointer.y);
      const circle = new Phaser.Geom.Circle(fruit.x, fruit.y, 60);
      previous.set(pointer.x, pointer.y);
      if (Phaser.Geom.Intersects.LineToCircle(line, circle)) this.launch();
    });
    this.input.on('pointerup', () => { previous = null; });
    fruit.on('pointerup', () => this.launch());

    this.input.keyboard?.on('keydown-SPACE', () => { if (!this.overlay) this.launch(); });
    this.input.keyboard?.on('keydown-ENTER', () => { if (!this.overlay) this.launch(); });
    this.input.keyboard?.on('keydown-ESC', () => this.closeOverlay());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.removeAllListeners();
      this.input.keyboard?.removeAllListeners();
    });
  }

  private launch() {
    // scene.stop 是排队执行的,isActive 守卫挡不住同一帧里的第二次调用
    if (this.switching || this.overlay) return;
    this.switching = true;
    sfx.ui();
    this.scene.start('FruitGame', { mode: this.mode, difficulty: this.difficulty });
  }

  /** 全屏遮罩 + 面板,同时只允许开一个 */
  private openOverlay(title: string, height: number) {
    this.closeOverlay();
    const container = this.add.container(0, 0).setDepth(60);
    container.add(
      this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x02070f, 0.84)
        .setInteractive(),
    );
    const cy = GAME_HEIGHT / 2;
    container.add(woodPanel(this, GAME_WIDTH / 2, cy, 456, height));
    container.add(this.add.text(GAME_WIDTH / 2, cy - height / 2 + 38, title, {
      fontFamily: 'system-ui, sans-serif', fontSize: '30px', fontStyle: 'bold',
      color: PALETTE.cream, stroke: '#3a2118', strokeThickness: 6,
    }).setOrigin(0.5));
    container.add(woodButton(this, GAME_WIDTH / 2, cy + height / 2 - 46, 200, 52, '关闭',
      () => this.closeOverlay(), { size: 20 }).root);
    this.overlay = container;
    return { container, cy, height };
  }

  private closeOverlay() {
    this.overlay?.destroy(true);
    this.overlay = undefined;
  }

  private openScores() {
    const { container, cy, height } = this.openOverlay(`${MODES[this.mode].label} · 战绩`, 520);
    const records = loadScores(this.mode);
    if (records.length === 0) {
      container.add(this.add.text(GAME_WIDTH / 2, cy, '还没有战绩，先切一局', {
        fontFamily: 'system-ui, sans-serif', fontSize: '18px', color: PALETTE.mist,
      }).setOrigin(0.5));
      return;
    }
    const top = cy - height / 2 + 88;
    container.add(this.add.text(GAME_WIDTH / 2, top, ' #    分数    难度    切中   连击', {
      fontFamily: 'monospace', fontSize: '14px', color: PALETTE.dim,
    }).setOrigin(0.5));
    records.forEach((record, i) => {
      const line = [
        String(i + 1).padStart(2, ' '),
        String(record.score).padStart(6, ' '),
        (DIFFICULTIES[record.difficulty]?.label ?? '—').padEnd(4, ' '),
        String(record.sliced).padStart(4, ' '),
        String(record.bestCombo).padStart(4, ' '),
      ].join('  ');
      container.add(this.add.text(GAME_WIDTH / 2, top + 34 + i * 30, line, {
        fontFamily: 'monospace', fontSize: '16px',
        color: record.completed ? '#9be8a8' : i === 0 ? PALETTE.gold : PALETTE.cream,
      }).setOrigin(0.5));
    });
  }

  private openSettings() {
    const { container, cy, height } = this.openOverlay('设置', 460);
    const top = cy - height / 2 + 100;

    const muteLabel = () => (isMuted() ? '音效：关' : '音效：开');
    const muteButton = woodButton(this, GAME_WIDTH / 2, top + 104, 260, 52, muteLabel(), () => {
      const next = setMuted(!isMuted());
      muteButton.setLabel(muteLabel());
      if (!next) sfx.ui();
    }, { size: 20, silent: true });
    container.add(muteButton.root);

    container.add(this.add.text(GAME_WIDTH / 2, top, '主音量', {
      fontFamily: 'system-ui, sans-serif', fontSize: '18px', color: PALETTE.mist,
    }).setOrigin(0.5));
    const bar = volumeBar(this, GAME_WIDTH / 2, top + 40, 340, 10, getVolume(), (value) => {
      setVolume(value);
      if (value > 0 && isMuted()) { setMuted(false); muteButton.setLabel(muteLabel()); }
    });
    container.add(bar.cells);

    let armed = false;
    const clearButton = woodButton(this, GAME_WIDTH / 2, top + 174, 260, 52, '清除战绩榜', () => {
      if (!armed) { armed = true; clearButton.setLabel('再点一次确认'); return; }
      clearRecords();
      clearButton.setLabel('已清除');
      clearButton.setEnabled(false);
      // 菜单上的最高分是 create 时画的,清完必须回写,否则会一直挂着一个已经不存在的纪录
      this.refreshBest();
    }, { size: 20, accent: 0xff6a4a });
    container.add(clearButton.root);

    container.add(this.add.text(GAME_WIDTH / 2, top + 222, '战绩只存在这台设备的浏览器里', {
      fontFamily: 'system-ui, sans-serif', fontSize: '13px', color: PALETTE.dim,
    }).setOrigin(0.5));
  }
}
