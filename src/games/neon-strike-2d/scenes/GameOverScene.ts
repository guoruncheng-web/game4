import * as Phaser from 'phaser';
import { CAMPAIGN_WAVES, COLORS, DIFFICULTIES, GAME_WIDTH, type DifficultyId, type GameMode } from '../config';
import { sfx } from '../sfx';
import { neonButton } from '../ui';
import { drawSpace } from './MenuScene';

type ResultData = {
  score: number;
  wave: number;
  best: number;
  rank: number;
  victory: boolean;
  mode: GameMode;
  difficulty: DifficultyId;
};

export class GameOverScene extends Phaser.Scene {
  constructor() { super('NeonGameOver'); }

  create(data: ResultData) {
    const victory = data.victory === true;
    drawSpace(this);
    this.add.image(GAME_WIDTH / 2, 490, 'ns-panel').setDisplaySize(470, 620).setAlpha(0.96);

    this.add.text(GAME_WIDTH / 2, 246, victory ? '任务完成' : '任务结束', {
      fontFamily: 'Arial Black, system-ui', fontSize: '46px',
      color: victory ? '#7dffc0' : '#ff625d', stroke: '#0d1a14', strokeThickness: 8,
    }).setOrigin(0.5);
    this.add.text(GAME_WIDTH / 2, 296, victory
      ? '星门守住了 · 无尽模式已解锁'
      : `在第 ${data.wave} 波被击落`, {
      fontFamily: 'system-ui', fontSize: '17px', color: victory ? '#9ff5cd' : COLORS.warn,
    }).setOrigin(0.5);

    this.add.text(GAME_WIDTH / 2, 356, 'FINAL SCORE', {
      fontFamily: 'monospace', fontSize: '15px', color: '#5cecff', letterSpacing: 4,
    }).setOrigin(0.5);
    this.add.text(GAME_WIDTH / 2, 400, String(data.score).padStart(6, '0'), {
      fontFamily: 'monospace', fontSize: '58px', color: '#e9fdff', fontStyle: 'bold',
    }).setOrigin(0.5);

    const modeLabel = data.mode === 'endless' ? '无尽' : '战役';
    const waveLabel = data.mode === 'campaign' ? `${data.wave}/${CAMPAIGN_WAVES}` : String(data.wave);
    this.add.text(GAME_WIDTH / 2, 462,
      `${modeLabel} · ${DIFFICULTIES[data.difficulty]?.label ?? '王牌'} · 波次 ${waveLabel}`, {
      fontFamily: 'system-ui', fontSize: '19px', color: COLORS.sub,
    }).setOrigin(0.5);

    const newBest = data.score > 0 && data.score >= data.best;
    this.add.text(GAME_WIDTH / 2, 500, newBest ? '★ 新纪录 ★' : `最高分 ${String(data.best).padStart(6, '0')}`, {
      fontFamily: 'monospace', fontSize: '19px', color: newBest ? '#ffd75e' : COLORS.muted, fontStyle: 'bold',
    }).setOrigin(0.5);
    if (data.rank > 0) {
      this.add.text(GAME_WIDTH / 2, 532, `本地战绩榜 第 ${data.rank} 名`, {
        fontFamily: 'monospace', fontSize: '15px', color: '#5f8fa8',
      }).setOrigin(0.5);
    }

    const again = () => this.scene.start('NeonGame', { mode: data.mode, difficulty: data.difficulty });
    neonButton(this, GAME_WIDTH / 2, 618, 286, 70, '再次出击', again, { size: 27 });
    neonButton(this, GAME_WIDTH / 2, 704, 286, 54, '返回菜单', () => this.scene.start('NeonMenu'), {
      size: 20, accent: COLORS.amber,
    });

    this.input.keyboard?.once('keydown-SPACE', () => { sfx.ui(); again(); });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.keyboard?.removeAllListeners());
  }
}
