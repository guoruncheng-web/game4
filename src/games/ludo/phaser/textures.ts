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
  pawn: (seat: number) => `ludo-pawn-${seat}`,
  die: (face: number) => `ludo-die-${face}`,
} as const;

/** 棋子贴图的像素边长。够 2 倍屏用 */
const PAWN_PX = 96;
const DIE_PX = 128;

export function buildTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists(TEX.board)) {
    scene.textures.addCanvas(TEX.board, drawBoardCanvas());
  }
  for (let seat = 0; seat < SEATS; seat += 1) buildPawn(scene, seat);
  for (let face = 1; face <= 6; face += 1) buildDie(scene, face);
}

/**
 * 棋子:俯视看到的是一个带高光的圆盘 + 一圈深色描边。
 *
 * **不画成侧视的塔形。** 棋盘是正俯视的,侧视棋子会和棋盘的视角打架 ——
 * 那正是 3D 版里最别扭的一点:棋子立着、棋盘躺着。
 */
function buildPawn(scene: Phaser.Scene, seat: number): void {
  const key = TEX.pawn(seat);
  if (scene.textures.exists(key)) return;

  const base = Phaser.Display.Color.IntegerToColor(SEAT_HEX[seat]);
  const rim = base.clone().darken(52).color;
  const body = base.color;
  const lit = base.clone().lighten(40).color;
  const shade = base.clone().darken(24).color;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const c = PAWN_PX / 2;

  // 落地阴影
  g.fillStyle(0x000000, 0.34);
  g.fillEllipse(c, c + PAWN_PX * 0.33, PAWN_PX * 0.6, PAWN_PX * 0.17);

  /**
   * **真正的立体棋子:底座 → 收腰 → 圆头。**
   * 早先画成"圆片 + 一小截底座",在同色基地上读不出这是一颗棋子,整盘看着像色斑。
   * 参考 UI 里的棋子有明确的三段轮廓和深色描边,那正是"有质感"的来源。
   */
  // 底座
  g.fillStyle(rim, 1);
  g.fillEllipse(c, c + PAWN_PX * 0.28, PAWN_PX * 0.56, PAWN_PX * 0.2);
  g.fillStyle(shade, 1);
  g.fillEllipse(c, c + PAWN_PX * 0.26, PAWN_PX * 0.48, PAWN_PX * 0.16);

  // 收腰:上窄下宽的梯形
  g.fillStyle(rim, 1);
  g.fillPoints([
    new Phaser.Geom.Point(c - PAWN_PX * 0.11, c - PAWN_PX * 0.02),
    new Phaser.Geom.Point(c + PAWN_PX * 0.11, c - PAWN_PX * 0.02),
    new Phaser.Geom.Point(c + PAWN_PX * 0.2, c + PAWN_PX * 0.26),
    new Phaser.Geom.Point(c - PAWN_PX * 0.2, c + PAWN_PX * 0.26),
  ], true);
  g.fillStyle(body, 1);
  g.fillPoints([
    new Phaser.Geom.Point(c - PAWN_PX * 0.085, c - PAWN_PX * 0.02),
    new Phaser.Geom.Point(c + PAWN_PX * 0.085, c - PAWN_PX * 0.02),
    new Phaser.Geom.Point(c + PAWN_PX * 0.17, c + PAWN_PX * 0.23),
    new Phaser.Geom.Point(c - PAWN_PX * 0.17, c + PAWN_PX * 0.23),
  ], true);

  // 圆头
  g.fillStyle(rim, 1);
  g.fillCircle(c, c - PAWN_PX * 0.12, PAWN_PX * 0.235);
  g.fillStyle(body, 1);
  g.fillCircle(c, c - PAWN_PX * 0.12, PAWN_PX * 0.2);
  // 高光偏左上,和棋盘的金边受光方向一致
  g.fillStyle(lit, 0.92);
  g.fillEllipse(c - PAWN_PX * 0.06, c - PAWN_PX * 0.18, PAWN_PX * 0.15, PAWN_PX * 0.1);
  g.fillStyle(0xffffff, 0.8);
  g.fillCircle(c - PAWN_PX * 0.07, c - PAWN_PX * 0.19, PAWN_PX * 0.032);

  g.generateTexture(key, PAWN_PX, PAWN_PX);
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
