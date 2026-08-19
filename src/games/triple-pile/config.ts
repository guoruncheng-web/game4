/**
 * 叠叠消的全部数值常量。
 *
 * 规矩:任何会被反复调的手感/平衡数字都放这里,不要散落在实现文件里。
 * 数值的来由见 DESIGN.md,改之前先读那边的论证 —— 尤其是槽位数和物理阻尼,
 * 它们不是拍脑袋定的。
 */

/** 逻辑画布尺寸。3D 不按它渲染(直接铺满容器),只用来算 UI 的基准比例 */
export const VIEW = { width: 540, height: 960 } as const;

/** 锅体。视觉半径必须和 physics 的 collider 环内接半径对齐,见 ARCHITECTURE.md §5.3 */
export const POT = {
  /** 内壁半径 */
  radius: 4.2,
  /** 锅底半径(内壁略带锥度,底部收一点) */
  bottomRadius: 4.0,
  /** 内壁高 */
  height: 3.0,
  /**
   * 物理锅壁的内表面半径。**刻意比视觉锅壁的最小半径小一点。**
   *
   * 视觉上的锅是有收口的(锅底窄、锅口宽),而物理锅壁是一圈竖直的墙。
   * 两者取同一个半径的话,底部一圈必然穿帮 —— 物理允许食材走到 4.2,
   * 视觉墙在那个高度却只有 4.0,食材就会插进锅壁里。
   *
   * 宁可物理比视觉紧一点:代价是「看着还有缝却塞不进去」,基本察觉不到;
   * 反过来则是食材明晃晃地穿出锅外,一眼就看见。
   */
  physicsRadius: 3.78,
  /** 锅壁用多少段 cuboid 近似圆(物理) */
  segments: 24,
  /** 锅体旋转面的径向分段(视觉)。48 段在锅口这么大的圆上已经看不出棱 */
  visualSegments: 48,
  /** 单段墙的厚度(半宽) */
  wallThickness: 0.3,
} as const;

/**
 * 汤。**纯视觉,不参与物理、不参与拾取。**
 *
 * 两条硬约束:
 * 1. **必须半透明。** 本作的规则是「看得见就点得到」(DESIGN.md §4.3),
 *    而汤面不参与 raycast —— 汤要是不透明,就会出现「看不见却点得到」,规则一致性直接破掉。
 * 2. **不做浮力。** 浮力会让堆叠不稳定,违反 §7.2「塌落必须局部、小幅」那条手感红线。
 *    食材照常沉底,汤只是罩在上面的一层。
 *
 * 颜色用清汤而不是红汤:ART.md §1 论证过红汤会和肥牛/香肠/蟹棒三类红白食材撞色,
 * 整锅偏红之后它们的对比会掉一档。想换红汤把 color 改成 0x8e2418、opacity 提到 0.8 即可。
 */
export const BROTH = {
  /** 汤面高度(锅底以上)。要低于堆顶,让上层食材露出汤面 —— 那才像一锅正在煮的东西 */
  level: 1.15,
  /** 汤面半径,略小于锅内壁,免得和锅壁穿插 */
  radius: 4.02,
  /** 奶白骨汤。清汤/红汤都试过,白汤是唯一不和任何一类食材撞色的 */
  color: 0xf2ebdc,
  opacity: 0.55,
  /** 法线扰动的滚动速度,两层不同速度错开才不会看出重复 */
  flowA: 0.035,
  flowB: -0.022,

  /**
   * 汤面网格的分段。波浪是靠顶点位移做的,所以这里得够密 ——
   * 太稀会让波峰变成折线。64×20 = 1300 个顶点,每帧重算一遍完全跑得动。
   */
  segments: 64,
  rings: 20,

  /**
   * 落水涟漪的形状参数。
   *
   * 做成一个**向外行进的波包**而不是「不断放大的圆环」:
   * 波前随时间外推,波包中心最高、前后用高斯包络收住,再按距离和时间双重衰减。
   * 真实水面的涟漪是有前后起伏的,一条不断变大的线一眼就假。
   */
  /** 波峰高度 */
  waveAmp: 0.16,
  /** 波前扩散速度(单位/秒) */
  waveSpeed: 2.6,
  /** 波包的空间宽度,越小越像一道窄涟漪 */
  wavePacket: 0.42,
  /** 波包内的振荡频率 */
  waveFreq: 5.5,
  /** 衰减时间常数 */
  waveLife: 0.75,
  /** 同时存在的涟漪数上限。开局一批十几个同时落水,多了既看不清也白算 */
  maxWaves: 8,
  /**
   * 蒸汽粒子数。**设成 0 就完全关掉。**
   *
   * 点精灵做蒸汽很容易假 —— 一堆边缘清晰的小圆点飘上去,谁都看得出是贴片。
   * 所以这里走另一个方向:数量少、个头大、极低透明度、慢,
   * 让它只在锅口上方形成一层几乎看不见的雾感,而不是「一颗颗往上冒的球」。
   * 宁可弱到几乎没有,也不要一眼假。
   */
  steamCount: 9,
  steamRiseSpeed: 0.22,
  steamSize: 2.6,
  steamOpacity: 0.055,
} as const;

/**
 * 相机。DESIGN.md §4.2:俯角 62°,全程不动(不旋转、不缩放、不跟随)。
 *
 * 距离不写死,按容器实际宽高比算出来 —— 竖屏下水平视野远小于垂直视野,
 * 写死距离会让锅在窄屏上被切掉两边。见 stage.ts 的 fitDistance。
 */
export const CAMERA = {
  fov: 55,
  pitchDeg: 62,
  target: [0, 1.0, 0] as const,
  near: 0.5,
  far: 120,
  /** 画面上下留给 HUD 和槽位条的比例,竖直方向只用中间这部分来装锅 */
  verticalUsable: 0.78,
  horizontalUsable: 0.94,
  minDistance: 9,
} as const;

/**
 * 物理。DESIGN.md §7.2 的手感红线:塌落必须是局部的、小幅的。
 * 验收标准是「拿走一个后位移 > 0.3 的物件不超过 4 个」,超了就往上调 friction 和 angularDamping。
 */
export const PHYSICS = {
  gravity: -14,
  restitution: 0.02,
  friction: 0.75,
  linearDamping: 0.6,
  angularDamping: 2.2,
  /** 固定步长。用固定步长而不是可变 dt,否则不同帧率下塌落表现不一致 */
  timeStep: 1 / 60,
  /** 一帧最多补几步,防止切回标签页时一次性追平几百步 */
  maxSubSteps: 3,
} as const;

/** 槽位。7 格是被 DESIGN.md §8.1 的鸽笼不等式选出来的,不要随手改 */
export const TRAY = {
  slots: 7,
  /** 凑齐 3 个后延迟多久才消除,留给玩家看清「是它凑齐了」 */
  clearDelayMs: 120,
  /** 物件飞进槽位的时长 */
  flightMs: 320,
  /** 槽位条在屏幕上的横向半宽(NDC)。整条几乎铺满屏幕宽度 */
  ndcHalfWidth: 0.92,
  /** 槽位条中心的纵向位置(NDC) */
  ndcY: -0.80,
  /** 槽位条平面距相机的距离。物件停在这个距离,底板再往后 0.25 免得 z-fighting */
  distance: 7,
  boardBehind: 0.25,
  /** 占到几格开始告急预警 */
  warnAt: 6,

  /**
   * 槽位条贴图的内部布局。**这些数是量出来的,不是估的** ——
   * 用 assets/source/slot-tray-chroma.png 抠像后扫描格子位置得到,
   * 换贴图必须重新量,否则物件会摆得和画出来的格子对不上。
   */
  layout: {
    /** 内容框宽高比(1856×356) */
    aspect: 5.213,
    /** 首格中心占板宽的比例 */
    firstSlot: 0.0854,
    /** 末格中心占板宽的比例 */
    lastSlot: 0.9130,
    /** 单格宽度占板宽的比例 */
    cellWidth: 0.125,
    /** 格子中心占板高的比例,从上往下量 */
    slotCenterY: 0.5646,
  },
  /** 物件在格子里占多大(按包围球直径 / 格宽)。留一点余量,免得贴着格子边 */
  pieceFill: 0.82,
} as const;

/** 消除表现的时间轴,见 ART.md §4.3 */
export const CLEAR_FX = {
  /** 整段时长。太长会挡住下一次拾取,太短看不清是哪三个消掉了 */
  totalMs: 190,
  /** 鼓起来的峰值缩放 */
  peakScale: 1.18,
} as const;

/** 拾取。DESIGN.md §13:按下给反馈,松手才生效,滑开可取消 */
export const PICK = {
  /** pointerdown 到 pointerup 之间超过这个像素距离就算取消 */
  cancelDistancePx: 12,
  /** 按下时的放大与上浮 */
  pressScale: 1.06,
  pressLift: 0.05,
} as const;

/** 计分,DESIGN.md §11 */
export const SCORE = {
  perClear: 100,
  quickBonus: 50,
  /** 两次消除间隔小于这个值算一次 quick */
  quickWindowMs: 3000,
  perSecondLeft: 10,
  perUnusedPowerup: 200,
} as const;

/** 开局铺堆:分批投放,避免一帧插入上百个刚体造成求解尖峰 */
export const FILL = {
  batchSize: 16,
  batchIntervalMs: 60,
  /** 投放高度(锅底以上) */
  dropHeight: 5.2,
  /** 投放点的水平散布半径 */
  spread: 3.0,
  /** 初速,轻微向下,免得在空中飘 */
  initialVelocityY: -1.5,
} as const;

export type PowerupId = 'takeOut' | 'complete' | 'shuffle';

export const POWERUPS: ReadonlyArray<{ id: PowerupId; label: string; desc: string }> = [
  { id: 'takeOut', label: '移出', desc: '把槽位最左边 3 个退回锅里' },
  { id: 'complete', label: '凑齐', desc: '自动补满数量最多的那一类并消除' },
  { id: 'shuffle', label: '打乱', desc: '锅里所有食材重新堆一次' },
];
