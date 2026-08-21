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
  const dark = base.clone().darken(38).color;
  const light = base.clone().lighten(28).color;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const c = PAWN_PX / 2;

  // 落地阴影,让棋子看着是"放在"格子上而不是"贴在"上面
  g.fillStyle(0x000000, 0.28);
  g.fillEllipse(c, c + PAWN_PX * 0.06, PAWN_PX * 0.78, PAWN_PX * 0.7);
  g.fillStyle(dark, 1);
  g.fillCircle(c, c, PAWN_PX * 0.42);
  g.fillStyle(base.color, 1);
  g.fillCircle(c, c, PAWN_PX * 0.35);
  // 高光偏左上,和棋盘那套糖果塑料材质对齐
  g.fillStyle(light, 0.85);
  g.fillEllipse(c - PAWN_PX * 0.09, c - PAWN_PX * 0.11, PAWN_PX * 0.26, PAWN_PX * 0.18);
  g.fillStyle(0xffffff, 0.55);
  g.fillCircle(c - PAWN_PX * 0.1, c - PAWN_PX * 0.12, PAWN_PX * 0.05);

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
