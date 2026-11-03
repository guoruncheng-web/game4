export const GAME_WIDTH = 540;
export const GAME_HEIGHT = 960;

/** 战役模式的总波次;第 4 / 8 / 12 波是 Boss 波,打掉第三个 Boss 即通关 */
export const CAMPAIGN_WAVES = 12;

export const TUNING = {
  playerSpeed: 390,
  fireDelay: 145,
  bulletSpeed: 720,
  enemyBulletSpeed: 245,
  maxLives: 5,
  /** 拾取型护盾的持续时间;开局护盾不设时限,见 GameScene.grantShield */
  shieldDuration: 7000,
  /** 护盾能挡下的次数,时间到或层数耗尽都会消失 */
  shieldCharges: 3,
  /** 挡下一次之后的硬直:没有它,一轮 130ms 连发能瞬间打光三层 */
  shieldHitCooldown: 480,
  /** 漏防惩罚的独立冷却,不和受击无敌帧共用 */
  leakGrace: 1200,
  comboWindow: 1800,
  bossEvery: 4,
  maxWeapon: 3,
} as const;

export type GameMode = 'campaign' | 'endless';
export type DifficultyId = 'easy' | 'normal' | 'hard';

export type DifficultySpec = {
  id: DifficultyId;
  label: string;
  hint: string;
  /** 起始命数 */
  lives: number;
  /**
   * 每多少波给敌机 +1 血。
   * 这里刻意不用乘法倍率:小兵基础血只有 1,×0.8 和 ×1.35 四舍五入之后都是 1,
   * 三档难度在前半程会完全一样,声明的倍率等于没生效。
   */
  hpStep: number;
  /** 起手就叠加的固定血量 */
  hpFlat: number;
  /** 敌机下落速度倍率 */
  enemySpeed: number;
  /** 敌弹速度倍率 */
  enemyBullet: number;
  /** 敌机开火概率倍率 */
  fireChance: number;
  /** Boss 血量倍率 */
  bossHp: number;
  /** 掉落概率倍率 */
  powerChance: number;
  /** 结算得分倍率 */
  scoreScale: number;
};

export const DIFFICULTIES: Record<DifficultyId, DifficultySpec> = {
  easy: {
    id: 'easy', label: '新兵', hint: '4 条命 · 敌火迟缓 · 得分 ×0.8',
    lives: 4, hpStep: 8, hpFlat: 0, enemySpeed: 0.85, enemyBullet: 0.8,
    fireChance: 0.6, bossHp: 0.8, powerChance: 1.6, scoreScale: 0.8,
  },
  normal: {
    id: 'normal', label: '王牌', hint: '3 条命 · 标准配平 · 得分 ×1.0',
    lives: 3, hpStep: 6, hpFlat: 0, enemySpeed: 1, enemyBullet: 1,
    fireChance: 1, bossHp: 1, powerChance: 1, scoreScale: 1,
  },
  hard: {
    id: 'hard', label: '死神', hint: '2 条命 · 敌军厚甲狂暴 · 得分 ×1.6',
    lives: 2, hpStep: 4, hpFlat: 1, enemySpeed: 1.15, enemyBullet: 1.2,
    fireChance: 1.5, bossHp: 1.35, powerChance: 0.7, scoreScale: 1.6,
  },
};

export const DIFFICULTY_ORDER: DifficultyId[] = ['easy', 'normal', 'hard'];

/** 霓虹配色,场景与 UI 共用 */
export const COLORS = {
  cyan: 0x54ecff,
  cyanDim: 0x2c93a8,
  deep: 0x09283a,
  panel: 0x050d19,
  red: 0xff4b52,
  amber: 0xffb04a,
  green: 0x60f5a8,
  ink: '#eafbff',
  sub: '#9feaff',
  muted: '#7fabc4',
  warn: '#ff6b63',
} as const;
