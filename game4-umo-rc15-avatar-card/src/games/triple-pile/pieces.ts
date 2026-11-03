/**
 * 12 个火锅食材的元数据。
 *
 * 造型不再由代码生成:模型是 `tools/blender/triple-pile/build_models.py` 从
 * `assets/source/*-chroma.png` 那 12 张正视图渲染低模 + 平面投影贴图产出的,
 * 成品在 `public/triple-pile/models/*.glb`。所以这里只剩「玩法和物理需要知道的事」。
 *
 * 碰撞体也不在这里写了 —— 运行时直接对模型顶点求凸包(见 three/assets.ts)。
 * 建模脚本保证 12 个模型全部是凸体,这样凸包就是精确的碰撞体,
 * 而不是一个需要单独维护、还会和视觉对不上的近似形状。
 */

export type PieceTypeId = number;

export type PieceType = {
  id: PieceTypeId;
  /** 代码里用的稳定标识,同时是 glb 文件名和源图文件名的前缀 */
  key: string;
  /** 展示名 */
  name: string;
  /**
   * 消除粒子的颜色(sRGB)。从各自贴图里挑的主色 ——
   * 只用于粒子和分数飘字,不参与模型渲染,模型的颜色全在贴图里。
   */
  color: number;
};

/**
 * 顺序即 id。**不要重排** —— 存档里没存类型,但关卡生成、TYPE_ORDER 都按 id 索引。
 */
export const PIECE_TYPES: readonly PieceType[] = [
  { id: 0, key: 'beef-roll', name: '肥牛卷', color: 0xd8443f },
  { id: 1, key: 'lettuce', name: '生菜', color: 0x6ab52f },
  { id: 2, key: 'tofu', name: '豆腐', color: 0xf0e8d2 },
  { id: 3, key: 'shiitake', name: '香菇', color: 0x6b4a34 },
  { id: 4, key: 'corn', name: '玉米', color: 0xf2c318 },
  { id: 5, key: 'lotus-root', name: '藕片', color: 0xf3d9b8 },
  { id: 6, key: 'sausage', name: '香肠', color: 0xc8392e },
  { id: 7, key: 'crab-stick', name: '蟹棒', color: 0xe8543a },
  { id: 8, key: 'napa-cabbage', name: '白菜', color: 0x9dc45a },
  { id: 9, key: 'fish-ball', name: '鱼丸', color: 0xeee2cc },
  { id: 10, key: 'tofu-skin-roll', name: '腐竹卷', color: 0xe0a63c },
  { id: 11, key: 'dumpling', name: '饺子', color: 0xe8dcbc },
] as const;

export const PIECE_COUNT = PIECE_TYPES.length;

export function pieceType(id: PieceTypeId): PieceType {
  return PIECE_TYPES[id];
}

/**
 * 所有类型统一质量。
 *
 * 这不是物理真实性,是**稳定性旋钮**:刚体求解器在高质量比下会明显抖动 ——
 * 一个很轻的物件被压在很重的物件下面时,接触冲量会来回震荡。
 * 12 个模型的体积差了好几倍(蟹棒 vs 藕片),按密度给会直接违反
 * DESIGN.md §5.2「任意两类质量比 ≤ 2:1」那条,所以干脆全部钉死成同一个质量。
 */
export const PIECE_MASS = 0.73;

/**
 * 类型入场顺序:**从最好认排到最难认**。
 * 关卡的类型数增加时按这个顺序取前 N 个(DESIGN.md §9)。
 *
 * 排序依据是「有没有一个独立于颜色的特征」:
 * 肥牛的红白斑马纹、藕片的孔、香菇的白十字都是灰度下也成立的;
 * 而鱼丸/饺子/豆腐三样都是浅米白的团块,彼此最容易混,所以压到最后 ——
 * 它们只在第 10 关之后才会同时出现。
 */
export const TYPE_ORDER: readonly PieceTypeId[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
