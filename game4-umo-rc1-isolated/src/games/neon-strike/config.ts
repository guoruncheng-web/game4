/**
 * 霓虹突击(Three.js 版)的全部数值旋钮。
 *
 * 坐标约定:前方是 -Z(和 glTF 的 Y-up 转换对齐,机头自然朝前),右是 +X,上是 +Y。
 * 玩家固定在 z=0 的平面上左右上下走位,敌人从远处的 -Z 迎面压过来,
 * 越过 leakZ 就算被放跑。所有速度单位都是"世界单位 / 秒"。
 */

/** 战役模式的总波次;第 4 / 8 / 12 波是 Boss 波,打掉第三个 Boss 即通关 */
export const CAMPAIGN_WAVES = 12;

/** 战场的空间布局。改这里等于改镜头和纵深手感。 */
export const SPACE = {
  /** 玩家所在的平面 */
  playerZ: 0,
  /** 敌人生成的纵深。约等于 8~10 秒的接敌时间 */
  spawnZ: -110,
  /** 越过这条线(在玩家身后)算漏防 */
  leakZ: 9,
  /** Boss 入场后停驻的纵深 */
  bossZ: -36,
  /** Boss 左右横移的边界 */
  bossRangeX: 5.2,
  /** 镜头相对玩家的后退量与抬升量。窄屏会在这个基准上按需往后拉,见 minHalfX */
  cameraBack: 10.6,
  cameraUp: 3.1,
  /**
   * 走位平面的最小半宽。
   *
   * fov 是竖直的,手机竖屏(aspect≈0.46)下水平视野只有桌面的五分之一,
   * 实测可走半宽只剩 1.68 —— 整条航道 3.36 宽,而战机自己就有 1.24,
   * 敌机 1.44、货舱障碍物 3.9,躲避在物理上不成立。
   *
   * 所以窄屏不是"挤一点",是玩不了。解决办法是把镜头往后拉(等比抬升),
   * 视野角不变、纵深观感不变,只是航道变宽、战机在屏幕上变小 ——
   * 这正是手机弹幕射击该有的比例。
   */
  minHalfX: 4.2,
  /** 后拉的上限,防止极端比例把镜头拉到雾里 */
  cameraBackMax: 30,
  /** 镜头看向玩家前方多远 */
  cameraLookAhead: 16,
  /** 镜头跟随玩家横向漂移的比例,0 = 完全固定 */
  cameraLag: 0.34,
  fov: 62,
  /** 走位平面到画面边缘留出的余量,避免战机贴边被裁 */
  marginX: 1.0,
  marginY: 1.0,
  /** 玩家在画面上的下沉量:让战机偏下,前方留出更多观察空间 */
  playerDropY: 1.5,
} as const;

export const TUNING = {
  /** 走位速度(单位/秒) */
  playerSpeed: 11.5,
  fireDelay: 145,
  bulletSpeed: 95,
  enemyBulletSpeed: 30,
  maxLives: 5,
  /** 拾取型护盾的持续时间;开局护盾不设时限,见 World.grantShield */
  shieldDuration: 7000,
  /** 护盾能挡下的次数,时间到或层数耗尽都会消失 */
  shieldCharges: 3,
  /** 挡下一次之后的硬直:没有它,一轮连发能瞬间打光三层 */
  shieldHitCooldown: 480,
  /** 漏防惩罚的独立冷却,不和受击无敌帧共用 */
  leakGrace: 1200,
  comboWindow: 1800,
  bossEvery: 4,
  maxWeapon: 3,
} as const;

/**
 * 瞄准辅助。
 *
 * 纵深射击最反直觉的一点:相机在战机后上方俯视,屏幕上的"对准"不等于世界里的对准,
 * 而玩家的输入(拖屏/方向键)又是屏幕空间的。不给参照物就等于让人蒙着打。
 * 这里的解法分两层 —— 准星把弹道显形(见 three/reticle.ts),软锁定则在
 * 一个明确的窗口内替玩家吃掉剩下的视差误差:目标进窗口才咬,所以"要瞄"这件事还在,
 * 只是不再惩罚看不出来的那几十厘米。
 */
export const AIM = {
  /** 准星双环所在的纵深(相对战机) */
  nearZ: 14,
  farZ: 40,
  /** 锁定窗口的半宽/半高(世界单位),敌机进了这个盒子才会被咬住 */
  lockX: 1.7,
  lockY: 1.15,
  /** 每单位纵深把窗口放宽的比例:远处透视误差更大,判定也更宽容 */
  lockGrow: 0.014,
  /** 太近(已经擦身而过)和太远(还在雾里)都不锁 */
  minZ: 3,
  maxZ: 96,
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
  /** 敌机推进速度倍率 */
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

export type EnemyKind = 'grunt' | 'weaver' | 'charger' | 'gunner';

/** 只有一套敌机模型,靠自发光配色 + 行为区分兵种;颜色即预警 */
export const ENEMY_SPEC: Record<EnemyKind, {
  /** 覆盖到能量件上的自发光色 */
  glow: number;
  hp: number; speed: number; score: number; fire: number; scale: number; weight: number; from: number;
}> = {
  grunt:   { glow: 0xff3b2e, hp: 1, speed: 1,    score: 100, fire: 1,   scale: 1,    weight: 4, from: 1 },
  weaver:  { glow: 0x35d8ff, hp: 1, speed: 0.9,  score: 130, fire: 0.8, scale: 0.95, weight: 3, from: 2 },
  charger: { glow: 0xff9a2e, hp: 1, speed: 0.55, score: 160, fire: 0,   scale: 1.1,  weight: 2, from: 3 },
  gunner:  { glow: 0xb46bff, hp: 3, speed: 0.7,  score: 200, fire: 2.4, scale: 1.2,  weight: 2, from: 5 },
};

/**
 * Boss 三型轮换,战役里就是第 4 / 8 / 12 波的三场。
 *
 * 三艘各有自己的模型和形态,不是换色的同一艘:
 * 环形母舰(锁定你)、矛形歼击舰(戳穿你)、巨口母舰(堵住整条航道)。
 * `half` 是各自的碰撞盒 —— 轮廓差这么远,共用一套判定必然出现
 * "打在船上没反应"或者"打在空处却中了"。
 */
export const BOSS_SPEC = [
  // half 按模型实际包围盒(建模脚本导出时会打印)乘归一化系数算出来,再往里收一点:
  // 冠刺、翼尖、枪尖这些细长件不该吃满判定,否则会出现"打在空处却中了"
  { name: 'CORE CARRIER', hp: 26, glow: 0xff2f6d, pattern: 0, half: { x: 4.6, y: 3.6, z: 4.2 } },
  { name: 'VOID LANCER',  hp: 40, glow: 0xc46bff, pattern: 1, half: { x: 4.4, y: 4.2, z: 5.6 } },
  { name: 'STAR EATER',   hp: 56, glow: 0xffa53a, pattern: 2, half: { x: 4.6, y: 2.6, z: 4.4 } },
];

export type ObstacleKind = 'asteroid' | 'mine' | 'block';

/**
 * 航道障碍物。它们和敌机是两套东西:不会开火、不会追你、也不给连击,
 * 只是横在路上 —— 提供的是"走位压力"而不是"火力压力"。
 *
 * 三种的区别刻意做成形状即规则,玩家不用试错两次才学会:
 * 圆的能打掉(岩块要打几发、雷一发就炸),方的打不动只能绕。
 */
export const OBSTACLE_SPEC: Record<ObstacleKind, {
  /** null = 不可摧毁 */
  hp: number | null;
  score: number;
  /** 相对敌机基础推进速度的倍率 */
  speed: number;
  /** 自转角速度(弧度/秒),给 0 就是不转 */
  spin: number;
  /** 碰撞盒半长。刻意比模型视觉略小 —— 擦过去算过,撞实了才算撞 */
  half: { x: number; y: number; z: number };
  /** 出现权重 */
  weight: number;
}> = {
  asteroid: { hp: 4, score: 60, speed: 0.9, spin: 0.5, half: { x: 1.35, y: 1.2, z: 1.3 }, weight: 4 },
  mine:     { hp: 1, score: 90, speed: 0.8, spin: 1.4, half: { x: 0.9, y: 0.9, z: 0.9 }, weight: 3 },
  block:    { hp: null, score: 0, speed: 0.95, spin: 0.25, half: { x: 1.7, y: 1.15, z: 1.1 }, weight: 3 },
};

export const OBSTACLE = {
  /** 第几波开始出现。第 1 波留给"学会开火和走位" */
  fromWave: 2,
  /** 每波数量 = base + floor(wave / step),再钳到 max */
  base: 2,
  step: 3,
  max: 6,
  /** Boss 波的数量:少给一点,Boss 弹幕本身已经在吃走位了 */
  boss: 2,
  /**
   * 单个障碍物最多占走位半宽的比例。
   *
   * 这条是硬约束不是手感旋钮:超过 1/3,窄屏上一个货舱就能把航道堵到没有落脚点,
   * 那不是难,是无解。模型该多大就多大,进场时按这条缩放。
   */
  maxLaneShare: 0.34,
} as const;

/** 碰撞体尺寸(半长)。模型是扁宽的硬表面,用轴对齐盒比球贴合得多。 */
export const HITBOX = {
  player: { x: 0.62, y: 0.34, z: 1.0 },
  // Y 半高刻意比模型厚:俯视视角下高度差是最难判断的一维,判定薄了就变成"看着中了却没中"
  enemy: { x: 0.72, y: 0.5, z: 0.85 },
  // Boss 的判定盒不在这里 —— 三艘形态不同,各自写在 BOSS_SPEC.half 里
  shot: 0.22,
  power: 0.7,
} as const;

/** 霓虹配色,3D 场景与 DOM 界面共用 */
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

export type PowerKind = 'shield' | 'weapon' | 'life';

export const POWER_COLOR: Record<PowerKind, number> = {
  shield: 0x60f5a8,
  weapon: 0xffb04a,
  life: 0xff5f8a,
};
