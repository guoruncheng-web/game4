/**
 * 棋盘底图。**纯 canvas 2D,不依赖任何渲染引擎。**
 *
 * 画的是"这张盘长什么样",和用什么渲染无关 —— 换引擎时这一层不该重写。
 * 图**从 `sim/layout.ts` 的数据画出来**:换棋盘尺寸、挪安全格、改终点道长度,
 * 画面自动跟着变,不可能和几何对不上。
 *
 * 风格对齐 `image/gameplay-competitor-layout-concept-v2.png`:**扁平、清晰、细描边**。
 * 早先那版是"金色厚框 + 糖果塑料光泽 + 基地内白色圆角框 + 槽位圈",两处不对:
 *   1. 厚金框吃掉可视面积,而手机上格子本来就小;
 *   2. 基地里现在要放头像、名字、分数条和一排待出场的棋子(GameScene.buildBasePanels),
 *      白色内框和槽位圈会和它们互相打架 —— 稿子里的基地就是**一整块纯阵营色**。
 */

import { SEATS } from '../config';
import { ENTRY, SAFE, cellTint } from '../sim/board';
import type { Cell } from '../sim/layout';
import { CENTER, GRID, HOME_PATH, RING } from '../sim/layout';

/** 四家的颜色。座位序与规则一致:红(左下)、绿(左上)、黄(右上)、蓝(右下) */
export const SEAT_HEX = [0xe83b32, 0x20aa3e, 0xf6c514, 0x1671cf];
const SEAT_CSS = SEAT_HEX.map((c) => `#${c.toString(16).padStart(6, '0')}`);

/** 贴图里一格的像素边长。15 格 × 64 = 960,渲染层按自己的显示尺寸再缩放 */
export const CELL_PX = 64;
export const BOARD_PX = GRID * CELL_PX;

/** 路径格的米白与描边。稿子里格线很细,靠明度差而不是粗线区分 */
const CREAM = '#f4ecd8';
const LINE = 'rgba(60,44,20,.34)';
const FRAME = '#3b2a12';

/**
 * 基地里棋子的停放位。**上半部让给头像和分数条,棋子横排在下半部** ——
 * 这是稿子的排法,也是 GameScene 摆头像/名字/分数条时的锚点。
 */
export const VIEW_BASE_SLOTS: Cell[][] = [
  [[12.1, 1.15], [12.1, 2.35], [12.1, 3.65], [12.1, 4.85]], // 红:左下
  [[3.55, 1.15], [3.55, 2.35], [3.55, 3.65], [3.55, 4.85]], // 绿:左上
  [[3.55, 10.15], [3.55, 11.35], [3.55, 12.65], [3.55, 13.85]], // 黄:右上
  [[12.55, 10.15], [12.55, 11.35], [12.55, 12.65], [12.55, 13.85]], // 蓝:右下
];

function cellRect(ctx: CanvasRenderingContext2D, cell: Cell, fill: string): void {
  const [row, col] = cell;
  const x = col * CELL_PX;
  const y = row * CELL_PX;
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, CELL_PX, CELL_PX);
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, CELL_PX - 2, CELL_PX - 2);
}

/** ★ 安全格。灰色实心,不抢路径格的注意力 */
function star(ctx: CanvasRenderingContext2D, cell: Cell): void {
  const [row, col] = cell;
  const cx = (col + 0.5) * CELL_PX;
  const cy = (row + 0.5) * CELL_PX;
  const outer = CELL_PX * 0.3;
  const inner = outer * 0.44;
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = 'rgba(96,88,74,.55)';
  ctx.fill();
}

/** 入场格上的前进箭头。**新手全靠它知道自己往哪边走** */
function arrow(ctx: CanvasRenderingContext2D, cell: Cell, next: Cell): void {
  const [row, col] = cell;
  const cx = (col + 0.5) * CELL_PX;
  const cy = (row + 0.5) * CELL_PX;
  const len = CELL_PX * 0.26;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.atan2(next[0] - row, next[1] - col));
  ctx.beginPath();
  ctx.moveTo(len, 0);
  ctx.lineTo(-len * 0.55, -len * 0.72);
  ctx.lineTo(-len * 0.55, len * 0.72);
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();
}

export function drawBoardCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = BOARD_PX;
  canvas.height = BOARD_PX;
  const ctx = canvas.getContext('2d')!;

  // 底:米白。十字臂里没有被格子覆盖的地方也是这个色
  ctx.fillStyle = CREAM;
  ctx.fillRect(0, 0, BOARD_PX, BOARD_PX);

  // 四个基地:**一整块纯阵营色**,不加内框、不加槽位圈
  const corners: Array<[number, number, number]> = [
    [9, 0, 0], // 红:左下
    [0, 0, 1], // 绿:左上
    [0, 9, 2], // 黄:右上
    [9, 9, 3], // 蓝:右下
  ];
  for (const [r0, c0, seat] of corners) {
    ctx.fillStyle = SEAT_CSS[seat];
    ctx.fillRect(c0 * CELL_PX, r0 * CELL_PX, 6 * CELL_PX, 6 * CELL_PX);
  }

  // 外圈:默认米白,入场格是各家的颜色
  RING.forEach((cell, i) => {
    const owner = cellTint(i);
    cellRect(ctx, cell, owner >= 0 ? SEAT_CSS[owner] : CREAM);
  });

  // 终点道
  for (let seat = 0; seat < SEATS; seat += 1) {
    for (const cell of HOME_PATH[seat]) cellRect(ctx, cell, SEAT_CSS[seat]);
  }

  // ★ 安全格
  for (const index of SAFE) star(ctx, RING[index]);

  // 入场箭头
  for (let seat = 0; seat < SEATS; seat += 1) {
    const at = ENTRY[seat];
    arrow(ctx, RING[at], RING[(at + 1) % RING.length]);
  }

  // 中央终点:四个三角,颜色对着各家的终点道
  const cx = (CENTER[1] + 0.5) * CELL_PX;
  const cy = (CENTER[0] + 0.5) * CELL_PX;
  const half = CELL_PX * 1.5;
  const quads: Array<[number, number, number, number, number]> = [
    [cx - half, cy + half, cx + half, cy + half, 0], // 下 红
    [cx - half, cy - half, cx - half, cy + half, 1], // 左 绿
    [cx - half, cy - half, cx + half, cy - half, 2], // 上 黄
    [cx + half, cy - half, cx + half, cy + half, 3], // 右 蓝
  ];
  for (const [x1, y1, x2, y2, seat] of quads) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.closePath();
    ctx.fillStyle = SEAT_CSS[seat];
    ctx.fill();
  }
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 2;
  ctx.strokeRect(cx - half, cy - half, half * 2, half * 2);

  // 外框:细的深色描边,不做厚金框
  ctx.strokeStyle = FRAME;
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, BOARD_PX - 10, BOARD_PX - 10);

  return canvas;
}
