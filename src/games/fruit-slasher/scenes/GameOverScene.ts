import * as Phaser from 'phaser';
import { createBackground } from '../background';
import { DIFFICULTIES, GAME_HEIGHT, GAME_WIDTH, MODES, PALETTE } from '../config';
import { sfx } from '../sfx';
import { bestScoreOf, pushScore } from '../storage';
import { woodButton } from '../ui';
import type { GameOverData } from './GameScene';

const HEADLINE: Record<GameOverData['reason'], { text: string; color: string }> = {
  bomb: { text: '切到炸弹了', color: PALETTE.ember },
  miss: { text: '水果漏掉了', color: PALETTE.cream },
  time: { text: '时间到', color: PALETTE.gold },
};

export class GameOverScene extends Phaser.Scene {
  private result!: GameOverData;
  private switching = false;
  constructor() { super('FruitGameOver'); }
  init(data: GameOverData) { this.result = data; this.switching = false; }

  create() {
    createBackground(this);
    const cx = GAME_WIDTH / 2;
    this.add.rectangle(cx, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x020711, 0.58);

    // 必须在 pushScore 之前取:写完之后 best 已经包含本局,自己永远打平自己
    const previousBest = bestScoreOf(this.result.mode);
    const { rank, best } = pushScore({
      score: this.result.score,
      sliced: this.result.sliced,
      bestCombo: this.result.bestCombo,
      mode: this.result.mode,
      difficulty: this.result.difficulty,
      completed: this.result.completed,
      at: Date.now(),
    });
    // 严格大于:打平历史最高分不算破纪录
    const isNewBest = this.result.score > 0 && this.result.score > previousBest;
    if (isNewBest) sfx.newBest();

    const panel = this.add.image(cx, 502, 'fs-panel').setDisplaySize(450, 620);
    const panelScaleX = panel.scaleX;
    const panelScaleY = panel.scaleY;
    panel.setAlpha(0).setScale(panelScaleX * 0.96, panelScaleY * 0.96);
    this.tweens.add({
      targets: panel,
      y: 484, alpha: 1, scaleX: panelScaleX, scaleY: panelScaleY,
      duration: 320, ease: 'Cubic.easeOut',
    });

    const head = HEADLINE[this.result.reason] ?? HEADLINE.miss;
    this.add.text(cx, 254, head.text, {
      fontFamily: 'system-ui, sans-serif', fontSize: '36px', fontStyle: 'bold', color: head.color,
    }).setOrigin(0.5);
    this.add.text(cx, 296, this.result.completed ? '完整撑完了一局' : '这一局到此为止', {
      fontFamily: 'system-ui, sans-serif', fontSize: '16px', color: PALETTE.dim,
    }).setOrigin(0.5);

    if (isNewBest) {
      this.add.text(cx, 330, '新纪录！', {
        fontFamily: 'system-ui, sans-serif', fontSize: '24px', fontStyle: 'bold', color: PALETTE.gold,
      }).setOrigin(0.5);
    }

    this.add.text(cx, 394, String(this.result.score), {
      fontFamily: 'system-ui, sans-serif', fontSize: '78px', fontStyle: 'bold',
      color: PALETTE.cream, stroke: '#3a2118', strokeThickness: 7,
    }).setOrigin(0.5);

    this.add.text(cx, 456,
      `${MODES[this.result.mode]?.label ?? '经典'} · ${DIFFICULTIES[this.result.difficulty]?.label ?? '刀客'}`, {
      fontFamily: 'system-ui, sans-serif', fontSize: '19px', color: PALETTE.mist,
    }).setOrigin(0.5);

    this.add.text(cx, 524, `最高分  ${best}\n切中水果  ${this.result.sliced}\n最高 Combo  ${this.result.bestCombo}`, {
      align: 'center', lineSpacing: 10, fontFamily: 'system-ui, sans-serif',
      fontSize: '21px', color: PALETTE.mist,
    }).setOrigin(0.5);

    if (rank > 0) {
      this.add.text(cx, 592, `本地战绩榜 第 ${rank} 名`, {
        fontFamily: 'system-ui, sans-serif', fontSize: '15px', color: PALETTE.dim,
      }).setOrigin(0.5);
    }

    // 两个按钮同屏,双指同帧各点一个会排出两次 start,让 FruitGame 和 FruitMenu 同时在跑。
    // scene.stop 是排队执行的,靠 isActive 判断挡不住,只能自己上闩。
    const go = (key: string, data?: object) => () => {
      if (this.switching) return;
      this.switching = true;
      this.scene.start(key, data);
    };
    const again = go('FruitGame', { mode: this.result.mode, difficulty: this.result.difficulty });

    // 结算刚出现时先不接受输入,避免玩家最后一刀的手势直接把新一局点掉
    this.time.delayedCall(450, () => {
      woodButton(this, cx, 664, 286, 66, '再来一局', again, { size: 26 });
      woodButton(this, cx, 744, 286, 52, '换个模式', go('FruitMenu'), { size: 20 });
      this.input.keyboard?.once('keydown-SPACE', () => { sfx.ui(); again(); });
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.keyboard?.removeAllListeners());
  }
}
