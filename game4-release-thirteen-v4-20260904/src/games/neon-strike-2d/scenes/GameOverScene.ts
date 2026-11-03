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
  /** 联机局才有:队友的名字和分数。没有它就按单人渲染 */
  coop?: { peer: string; peerScore: number; me: string };
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

    if (data.coop) {
      this.renderCoopScores(data);
    } else {
      this.add.text(GAME_WIDTH / 2, 356, 'FINAL SCORE', {
        fontFamily: 'monospace', fontSize: '15px', color: '#5cecff', letterSpacing: 4,
      }).setOrigin(0.5);
      this.add.text(GAME_WIDTH / 2, 400, String(data.score).padStart(6, '0'), {
        fontFamily: 'monospace', fontSize: '58px', color: '#e9fdff', fontStyle: 'bold',
      }).setOrigin(0.5);
    }

    const modeLabel = data.mode === 'endless' ? '无尽' : '战役';
    const waveLabel = data.mode === 'campaign' ? `${data.wave}/${CAMPAIGN_WAVES}` : String(data.wave);
    this.add.text(GAME_WIDTH / 2, 462,
      `${modeLabel} · ${DIFFICULTIES[data.difficulty]?.label ?? '王牌'} · 波次 ${waveLabel}`, {
      fontFamily: 'system-ui', fontSize: '19px', color: COLORS.sub,
    }).setOrigin(0.5);

    if (data.coop) {
      // 联机局不进单人榜(COOP.md §4.5),所以这里不显示最高分和名次 ——
      // 显示了反而会让人以为这一局记进去了
      this.add.text(GAME_WIDTH / 2, 500, `合计 ${String(data.score + data.coop.peerScore).padStart(6, '0')}`, {
        fontFamily: 'monospace', fontSize: '21px', color: '#ffd75e', fontStyle: 'bold',
      }).setOrigin(0.5);
      this.add.text(GAME_WIDTH / 2, 530, '双人局不计入个人战绩榜', {
        fontFamily: 'monospace', fontSize: '13px', color: '#5f8fa8',
      }).setOrigin(0.5);
    } else {
      const newBest = data.score > 0 && data.score >= data.best;
      this.add.text(GAME_WIDTH / 2, 500, newBest ? '★ 新纪录 ★' : `最高分 ${String(data.best).padStart(6, '0')}`, {
        fontFamily: 'monospace', fontSize: '19px', color: newBest ? '#ffd75e' : COLORS.muted, fontStyle: 'bold',
      }).setOrigin(0.5);
      if (data.rank > 0) {
        this.add.text(GAME_WIDTH / 2, 532, `本地战绩榜 第 ${data.rank} 名`, {
          fontFamily: 'monospace', fontSize: '15px', color: '#5f8fa8',
        }).setOrigin(0.5);
      }
    }

    // 联机局不给「再次出击」:队友已经不在这一局里了,直接重开只会变成一个人打。
    // 想再来一局要回匹配页重新约人,这一步不能省
    const again = data.coop
      ? () => {
        // Phaser 场景里拿不到 next/navigation。整页跳转反而是对的:
        // 它会顺带把 Phaser 实例彻底销毁,不留画布和音频
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = '/neon-strike-2d/lobby';
      }
      : () => this.scene.start('NeonGame', { mode: data.mode, difficulty: data.difficulty });
    neonButton(this, GAME_WIDTH / 2, 618, 286, 70, data.coop ? '再约一局' : '再次出击', again, { size: 27 });
    neonButton(this, GAME_WIDTH / 2, 704, 286, 54, '返回菜单', () => this.scene.start('NeonMenu'), {
      size: 20, accent: COLORS.amber,
    });

    this.input.keyboard?.once('keydown-SPACE', () => { sfx.ui(); again(); });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.input.keyboard?.removeAllListeners());
  }

  /**
   * 双人分数并排显示。
   *
   * 分开记而不是只给一个合计:协作模式里两个人都想知道自己打了多少,
   * 只显示总分会让贡献大的那个觉得白打了。合计单独放一行(见上面)。
   */
  private renderCoopScores(data: ResultData) {
    const coop = data.coop!;
    const mine = data.score;
    const theirs = coop.peerScore;
    const columns: Array<[string, number, number, boolean]> = [
      [coop.me, mine, GAME_WIDTH / 2 - 108, true],
      [coop.peer, theirs, GAME_WIDTH / 2 + 108, false],
    ];
    for (const [name, value, x, isMe] of columns) {
      this.add.text(x, 350, isMe ? `${name}(你)` : name, {
        fontFamily: 'monospace', fontSize: '14px',
        color: isMe ? '#5cecff' : '#ffb46a',
      }).setOrigin(0.5);
      this.add.text(x, 390, String(value).padStart(6, '0'), {
        fontFamily: 'monospace', fontSize: '34px', fontStyle: 'bold',
        color: isMe ? '#e9fdff' : '#ffd9ab',
      }).setOrigin(0.5);
    }
    // 打成平手时不给冠军标记 —— 两个都标或都不标,标一个是错的
    if (mine !== theirs) {
      this.add.text(mine > theirs ? GAME_WIDTH / 2 - 108 : GAME_WIDTH / 2 + 108, 420, '★ MVP', {
        fontFamily: 'monospace', fontSize: '13px', color: '#ffd75e', fontStyle: 'bold',
      }).setOrigin(0.5);
    }
  }
}
