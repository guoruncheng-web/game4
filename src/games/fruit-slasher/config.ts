export const GAME_WIDTH = 540;
export const GAME_HEIGHT = 960;
export const GRAVITY = 900;

/** 命数由难度决定,见 DIFFICULTIES;这里不再放 lives,免得留下一个改了没反应的死常量 */
export const GAMEPLAY = {
  /**
   * 每颗水果的基础分。
   * 刻意不是 1:基础分为 1 时 Math.round(1×0.8) 和 Math.round(1×1.0) 都等于 1,
   * 难度的得分倍率会被四舍五入整个抹平,声明的 ×0.8 / ×1.6 等于没生效。
   */
  fruitScore: 10,
  /** 一刀切中 3 个以上时,每多一个额外给的连击奖励 */
  comboScore: 10,
  /** 轨迹静止超过这个时长就自然断刀,否则按住不放能把整局刷成一个巨型 combo */
  strokeIdleMs: 220,
  spawnY: 1010,
  missY: 1015,
  minSlashDistance: 6,
  slashPointLifeMs: 130,
  firstBombAtMs: 10_000,
  maxTargets: 9,
};

export type FruitKind = 'watermelon' | 'orange' | 'apple' | 'kiwi' | 'strawberry';

export const FRUIT_KINDS: FruitKind[] = [
  'watermelon',
  'orange',
  'apple',
  'kiwi',
  'strawberry',
];

export const FRUIT_COLORS: Record<FruitKind, number> = {
  watermelon: 0xf04455,
  orange: 0xffa21a,
  apple: 0xd9363e,
  kiwi: 0x7fbe38,
  strawberry: 0xe83d4f,
};

export const FRUIT_RADII: Record<FruitKind, number> = {
  watermelon: 38,
  orange: 32,
  apple: 33,
  kiwi: 30,
  strawberry: 30,
};

/** 灯笼木色调,场景与 UI 共用 */
export const PALETTE = {
  cream: '#fff0c8',
  gold: '#ffd45a',
  amber: 0xffb84a,
  ember: '#ff6a4a',
  mist: '#bfd7de',
  dim: '#8aa4ae',
  night: 0x071326,
  wood: 0x3a2118,
  woodLit: 0x78492e,
} as const;

export type GameMode = 'classic' | 'timed' | 'zen';

export type ModeSpec = {
  id: GameMode;
  label: string;
  hint: string;
  /** 限时秒数;null = 无限,靠掉命结束 */
  seconds: number | null;
  /** 漏水果是否扣命 */
  missCostsLife: boolean;
  /** 漏水果扣多少秒(限时模式用) */
  missCostsSeconds: number;
  /** 会不会出炸弹 */
  bombs: boolean;
  /** 切到炸弹:结束这一局,还是扣秒数 */
  bombEndsRun: boolean;
  bombCostsSeconds: number;
};

export const MODES: Record<GameMode, ModeSpec> = {
  classic: {
    id: 'classic', label: '经典', hint: '漏三个水果就结束 · 切到炸弹直接完蛋',
    seconds: null, missCostsLife: true, missCostsSeconds: 0,
    bombs: true, bombEndsRun: true, bombCostsSeconds: 0,
  },
  timed: {
    id: 'timed', label: '限时 60 秒', hint: '不扣命 · 漏水果 -2 秒 · 切到炸弹 -8 秒',
    seconds: 60, missCostsLife: false, missCostsSeconds: 2,
    bombs: true, bombEndsRun: false, bombCostsSeconds: 8,
  },
  // bombs: false 时后面两个炸弹字段永远走不到,保持中性值,别指望改它们有反应
  zen: {
    id: 'zen', label: '禅意 90 秒', hint: '没有炸弹 · 不扣命 · 纯粹刷分',
    seconds: 90, missCostsLife: false, missCostsSeconds: 0,
    bombs: false, bombEndsRun: false, bombCostsSeconds: 0,
  },
};

export const MODE_ORDER: GameMode[] = ['classic', 'timed', 'zen'];

export type DifficultyId = 'rookie' | 'standard' | 'master';

export type DifficultySpec = {
  id: DifficultyId;
  label: string;
  hint: string;
  lives: number;
  /** 出场间隔倍率,越小越密 */
  delayScale: number;
  /** 炸弹概率倍率 */
  bombScale: number;
  /** 每波水果数量加成 */
  fruitBonus: number;
  scoreScale: number;
};

export const DIFFICULTIES: Record<DifficultyId, DifficultySpec> = {
  rookie: {
    id: 'rookie', label: '学徒', hint: '4 条命 · 出场慢 · 炸弹少 · 得分 ×0.8',
    lives: 4, delayScale: 1.28, bombScale: 0.55, fruitBonus: 0, scoreScale: 0.8,
  },
  standard: {
    id: 'standard', label: '刀客', hint: '3 条命 · 标准配平 · 得分 ×1.0',
    lives: 3, delayScale: 1, bombScale: 1, fruitBonus: 0, scoreScale: 1,
  },
  master: {
    id: 'master', label: '宗师', hint: '2 条命 · 又密又多炸弹 · 得分 ×1.6',
    lives: 2, delayScale: 0.76, bombScale: 1.45, fruitBonus: 1, scoreScale: 1.6,
  },
};

export const DIFFICULTY_ORDER: DifficultyId[] = ['rookie', 'standard', 'master'];

export function difficultyAt(elapsedMs: number, spec: DifficultySpec = DIFFICULTIES.standard) {
  const seconds = elapsedMs / 1000;
  const base = seconds < 8
    ? { minFruit: 1, maxFruit: 2, minDelay: 1350, maxDelay: 1600, bombChance: 0 }
    : seconds < 25
    ? { minFruit: 1, maxFruit: 3, minDelay: 1050, maxDelay: 1350, bombChance: 0.15 }
    : seconds < 50
    ? { minFruit: 2, maxFruit: 4, minDelay: 820, maxDelay: 1100, bombChance: 0.25 }
    : seconds < 80
    ? { minFruit: 3, maxFruit: 5, minDelay: 650, maxDelay: 900, bombChance: 0.35 }
    : { minFruit: 3, maxFruit: 6, minDelay: 550, maxDelay: 780, bombChance: 0.4 };
  return {
    minFruit: base.minFruit + spec.fruitBonus,
    maxFruit: base.maxFruit + spec.fruitBonus,
    minDelay: Math.round(base.minDelay * spec.delayScale),
    maxDelay: Math.round(base.maxDelay * spec.delayScale),
    bombChance: Math.min(0.6, base.bombChance * spec.bombScale),
  };
}
