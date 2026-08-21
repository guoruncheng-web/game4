/**
 * 运行时生成的贴图:棋盘、棋子、骰子面。
 *
 * 棋盘直接复用 `render/boardTexture.ts` 画好的 canvas —— 那一层不依赖引擎,
 * 换渲染器时不该重画(它画的是"这张盘长什么样",和用什么渲染没关系)。
 *
 * 棋子和骰子用 `Graphics.generateTexture()` 现生成,不走素材文件:
 * 它们是四种纯色 + 六个点数的组合,出图反而更麻烦,而且改颜色要重新出一遍。
 */

import * as Phaser from 'phaser';
import { PIECES_PER_SEAT, SEATS } from '../config';
import { BOARD_PX, SEAT_HEX, drawBoardCanvas } from '../render/boardTexture';

export const TEX = {
  board: 'ludo-board',
  shadow: 'ludo-shadow',
  pawn: (seat: number) => `ludo-pawn-${seat}`,
  die: (face: number) => `ludo-die-${face}`,
} as const;

/**
 * 棋子贴图的尺寸。**竖长,不是正方形。**
 *
 * UI 里的棋子是侧视的立体棋子:底座落在格子中心,头伸到格子上方 ——
 * 高度大约是宽度的 1.4 倍。画成正方形贴图里居中的俯视圆片,它就只是一个色斑,
 * 既显得小又看不出是棋子(实测截图里就是这个问题)。
 */
const PAWN_W = 96;
const PAWN_H = 134;
const DIE_PX = 128;

export function buildTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists(TEX.board)) {
    scene.textures.addCanvas(TEX.board, drawBoardCanvas());
  }
  buildShadow(scene);
  for (let seat = 0; seat < SEATS; seat += 1) buildPawn(scene, seat);
  for (let face = 1; face <= 6; face += 1) buildDie(scene, face);
}

/**
 * 棋子:俯视看到的是一个带高光的圆盘 + 一圈深色描边。
 *
 * **不画成侧视的塔形。** 棋盘是正俯视的,侧视棋子会和棋盘的视角打架 ——
 * 那正是 3D 版里最别扭的一点:棋子立着、棋盘躺着。
 */
/**
 * 棋子的落地阴影。**独立一张贴图,不画进棋子里。**
 *
 * 棋子的锚点在底座、身子往上伸,阴影若画在棋子贴图内会被裁掉大半;
 * 更重要的是:棋子跳起来的时候**阴影应该留在地面并缩小**,而不是跟着一起飞。
 * 分开之后这两件事都成立,立体感也是从这儿来的。
 */
function buildShadow(scene: Phaser.Scene): void {
  if (scene.textures.exists(TEX.shadow)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const w = 128;
  const h = 64;
  // 由内到外逐层变淡,近似一圈软阴影 —— Graphics 没有径向渐变填充
  for (let i = 10; i >= 1; i -= 1) {
    g.fillStyle(0x000000, 0.055);
    g.fillEllipse(w / 2, h / 2, (w * 0.92 * i) / 10, (h * 0.92 * i) / 10);
  }
  g.generateTexture(TEX.shadow, w, h);
  g.destroy();
}

function buildPawn(scene: Phaser.Scene, seat: number): void {
  const key = TEX.pawn(seat);
  if (scene.textures.exists(key)) return;

  const base = Phaser.Display.Color.IntegerToColor(SEAT_HEX[seat]);
  const rim = base.clone().darken(56).color;
  const body = base.color;
  const lit = base.clone().lighten(42).color;
  const shade = base.clone().darken(26).color;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);

  const cx = PAWN_W / 2;
  // 各部件的纵向位置(从贴图顶部往下算)
  const headR = PAWN_W * 0.30;
  const headY = headR + PAWN_H * 0.06;
  const baseY = PAWN_H * 0.86;
  const baseRx = PAWN_W * 0.44;
  const baseRy = PAWN_H * 0.10;

  /**
   * **侧视的立体棋子:圆头 → 收腰 → 底座。**
   * 深色描边是必需的 —— 待出场的棋子停在自己那块同色基地上,
   * 没有描边就是"红棋子放在红底上",整块基地看着只有几个色斑。
   */
  // 描边层:整体先画一遍深色,再在里面画小一圈本色,得到均匀的轮廓线
  const outline = (inset: number, color: number) => {
    g.fillStyle(color, 1);
    // 底座
    g.fillEllipse(cx, baseY, (baseRx - inset) * 2, (baseRy - inset * 0.5) * 2);
    // 腰:上窄下宽
    g.fillPoints([
      new Phaser.Geom.Point(cx - PAWN_W * 0.13 + inset, headY + headR * 0.5),
      new Phaser.Geom.Point(cx + PAWN_W * 0.13 - inset, headY + headR * 0.5),
      new Phaser.Geom.Point(cx + baseRx - inset, baseY),
      new Phaser.Geom.Point(cx - baseRx + inset, baseY),
    ], true);
    // 头
    g.fillCircle(cx, headY, headR - inset);
  };
  outline(0, rim);
  outline(PAWN_W * 0.055, body);

  // 腰部往下压一点暗色,分出底座和身体
  g.fillStyle(shade, 0.55);
  g.fillEllipse(cx, baseY - baseRy * 0.35, (baseRx - PAWN_W * 0.055) * 1.7, baseRy * 0.9);

  // 高光偏左上,和棋盘金边的受光方向一致
  g.fillStyle(lit, 0.9);
  g.fillEllipse(cx - headR * 0.3, headY - headR * 0.34, headR * 0.78, headR * 0.5);
  g.fillStyle(0xffffff, 0.85);
  g.fillCircle(cx - headR * 0.34, headY - headR * 0.4, headR * 0.17);

  g.generateTexture(key, PAWN_W, PAWN_H);
  g.destroy();
}

/** 骰子的六个面。白底圆角 + 黑点 */
function buildDie(scene: Phaser.Scene, face: number): void {
  const key = TEX.die(face);
  if (scene.textures.exists(key)) return;

  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0xffffff, 1);
  g.fillRoundedRect(4, 4, DIE_PX - 8, DIE_PX - 8, 22);
  g.lineStyle(4, 0xd8dde8, 1);
  g.strokeRoundedRect(4, 4, DIE_PX - 8, DIE_PX - 8, 22);

  // 点位:三行三列的九宫格,每个点数取其中几个位置
  const a = DIE_PX * 0.3;
  const b = DIE_PX * 0.5;
  const c = DIE_PX * 0.7;
  const spots: Record<number, Array<[number, number]>> = {
    1: [[b, b]],
    2: [[a, a], [c, c]],
    3: [[a, a], [b, b], [c, c]],
    4: [[a, a], [c, a], [a, c], [c, c]],
    5: [[a, a], [c, a], [b, b], [a, c], [c, c]],
    6: [[a, a], [c, a], [a, b], [c, b], [a, c], [c, c]],
  };
  g.fillStyle(0x24304a, 1);
  for (const [x, y] of spots[face]) g.fillCircle(x, y, DIE_PX * 0.085);

  g.generateTexture(key, DIE_PX, DIE_PX);
  g.destroy();
}

export { BOARD_PX, PIECES_PER_SEAT, SEAT_HEX };
