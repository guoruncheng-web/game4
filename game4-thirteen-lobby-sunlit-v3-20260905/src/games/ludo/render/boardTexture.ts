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
/**
 * 金框的厚度。**棋盘要为它留出画布,不能画在格子上** ——
 * 上一版把框直接描在贴图边界上,结果最外圈的路径格被压掉了一截。
 */
export const FRAME_PX = Math.round(CELL_PX * 0.34);
/** 贴图总边长 = 格子区 + 两侧金框 */
export const BOARD_PX = GRID * CELL_PX + FRAME_PX * 2;

/** 路径格的米白与描边。稿子里格线很细,靠明度差而不是粗线区分 */
const CREAM = '#f7f0dd';
const LINE = 'rgba(150,120,60,.42)';
/** 金色描边体系 —— UI 的"质感"主要来自它:基地卡片、棋盘外框、安全星都用这一套 */
const GOLD_LIGHT = '#ffe9a3';
const GOLD = '#d9a327';
const GOLD_DARK = '#8a5f12';

/**
 * 四个基地方块的左上角(行, 列)。6×6 一块。
 * 座位序:红(左下) 绿(左上) 黄(右上) 蓝(右下)
 */
export const BASE_ORIGIN: Cell[] = [[9, 0], [0, 0], [0, 9], [9, 9]];

/**
 * 基地内部的版式。**全部按基地方块的左上角推算,四家共用同一套行距。**
 *
 * 早先是"棋子行写死坐标,其余各行往上推"—— 结果红方为了给骰子让位比别家高 0.45 格,
 * 分数条就压到了棋子上(截图里棋子那排正贴着分数条底边)。
 * 从方块本身推算之后,四家必然一致,加一行也只用改这一处。
 *
 * **这些数是「格子下标」,不是「到基地顶边的距离」。**
 * `toScreen()` 收到 row 之后会 +0.5 取格心 —— 也就是说 `piecesRow: 4` 的实际中心
 * 落在距顶边 4.5 格处。早先按"距离"来定这几个数,每一行都比预期低了半格,
 * 于是骰子的下沿越过棋盘内沿 9px(截图里的"骰子显示在外面")。
 *
 * 可用范围:基地 6 格,卡片四周留 0.16 格 → 0.16 ~ 5.84。
 * 各元素的实际占位(已含 +0.5 和自身高度):
 *   头像  0.20~1.90   分数条 2.03~2.88   棋子 3.03~4.34   骰子 4.56~5.34
 *
 * 棋子是竖长的(高 1.31 格、锚点在底座),所以它往上伸 1.07 格、往下只有 0.24 格 ——
 * 改 piecesRow 时这一条最容易忘。
 */
export const PANEL = {
  avatarRow: 0.55,
  /** 名字和头像同一行,在它右侧 */
  nameRow: 0.55,
  scoreRow: 1.95,
  piecesRow: 3.6,
  diceRow: 4.45,
  /** 头像直径(格) */
  avatarSize: 1.7,
  /** 分数条高(格) */
  scoreHeight: 0.85,
  /** 骰子边长(格) */
  diceSize: 0.78,
  centerCol: 3.0,
  /** 四颗棋子在基地里的横向位置(相对左上角的列偏移) */
  pieceCols: [1.15, 2.35, 3.65, 4.85],
} as const;

/** 基地里棋子的停放位。由 BASE_ORIGIN + PANEL 算出来,不再手写 */
export const VIEW_BASE_SLOTS: Cell[][] = BASE_ORIGIN.map(([r0, c0]) =>
  PANEL.pieceCols.map((dc) => [r0 + PANEL.piecesRow, c0 + dc] as Cell));

/** '#rrggbb' → [r,g,b] */
function Phaser2Color(css: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(css.slice(i, i + 2), 16)) as [number, number, number];
}

/** 按比例加亮(>1)或压暗(<1) */
function shade([r, g, b]: [number, number, number], k: number): string {
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

function cellRect(ctx: CanvasRenderingContext2D, cell: Cell, fill: string): void {
  const [row, col] = cell;
  const x = col * CELL_PX + FRAME_PX;
  const y = row * CELL_PX + FRAME_PX;
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, CELL_PX, CELL_PX);
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, CELL_PX - 2, CELL_PX - 2);
}

/** ★ 安全格。灰色实心,不抢路径格的注意力 */
function star(ctx: CanvasRenderingContext2D, cell: Cell): void {
  const [row, col] = cell;
  const cx = (col + 0.5) * CELL_PX + FRAME_PX;
  const cy = (row + 0.5) * CELL_PX + FRAME_PX;
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
  ctx.fillStyle = GOLD;
  ctx.fill();
  ctx.strokeStyle = GOLD_DARK;
  ctx.lineWidth = 2;
  ctx.stroke();
}

/** 入场格上的前进箭头。**新手全靠它知道自己往哪边走** */
function arrow(ctx: CanvasRenderingContext2D, cell: Cell, next: Cell, color: string): void {
  const [row, col] = cell;
  const cx = (col + 0.5) * CELL_PX + FRAME_PX;
  const cy = (row + 0.5) * CELL_PX + FRAME_PX;
  const len = CELL_PX * 0.32;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.atan2(next[0] - row, next[1] - col));
  ctx.beginPath();
  ctx.moveTo(len, 0);
  ctx.lineTo(-len * 0.55, -len * 0.72);
  ctx.lineTo(-len * 0.55, len * 0.72);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255,255,255,.85)';
  ctx.stroke();
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
  // 基地做成**圆角卡片 + 金色描边**,四周留一点缝露出米白。
  // 齐边的纯色方块看着像色块拼图,而卡片 + 金边是这套 UI 质感的主要来源
  BASE_ORIGIN.forEach(([r0, c0], seat) => {
    const pad = CELL_PX * 0.16;
    const x = c0 * CELL_PX + pad + FRAME_PX;
    const y = r0 * CELL_PX + pad + FRAME_PX;
    const side = 6 * CELL_PX - pad * 2;
    const radius = CELL_PX * 0.42;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, side, side, radius);
    // 顶部略亮、底部略暗的竖向渐变,给一点体积
    const fill = ctx.createLinearGradient(x, y, x, y + side);
    const c = Phaser2Color(SEAT_CSS[seat]);
    fill.addColorStop(0, shade(c, 1.14));
    fill.addColorStop(0.45, SEAT_CSS[seat]);
    fill.addColorStop(1, shade(c, 0.84));
    ctx.fillStyle = fill;
    ctx.fill();

    const rim = ctx.createLinearGradient(x, y, x + side, y + side);
    rim.addColorStop(0, GOLD_LIGHT);
    rim.addColorStop(0.5, GOLD);
    rim.addColorStop(1, GOLD_DARK);
    ctx.strokeStyle = rim;
    ctx.lineWidth = CELL_PX * 0.14;
    ctx.stroke();
    ctx.restore();
  });

  // 基地里的棋子槽。**棋子出场之后槽还在** —— 稿子就是这样,
  // 空槽让人一眼看出"这家还有几颗没出来",而不是一片纯色什么都读不到
  for (let seat = 0; seat < SEATS; seat += 1) {
    const [r0, c0] = BASE_ORIGIN[seat];
    for (const dc of PANEL.pieceCols) {
      const x = (c0 + dc + 0.5) * CELL_PX + FRAME_PX;
      const y = (r0 + PANEL.piecesRow + 0.5) * CELL_PX + FRAME_PX;
      ctx.beginPath();
      ctx.arc(x, y, CELL_PX * 0.4, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,.3)';
      ctx.fill();
    }
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
    arrow(ctx, RING[at], RING[(at + 1) % RING.length], shade(Phaser2Color(SEAT_CSS[seat]), 0.72));
  }

  // 中央终点:四个三角,颜色对着各家的终点道
  const cx = (CENTER[1] + 0.5) * CELL_PX + FRAME_PX;
  const cy = (CENTER[0] + 0.5) * CELL_PX + FRAME_PX;
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

  // 外框:金色圆角厚框。上一版改成细深色边,结果整张盘"没质感" ——
  // 这套 UI 的立体感就是靠金边撑起来的,不能省
  const w = FRAME_PX;
  const rim = ctx.createLinearGradient(0, 0, BOARD_PX, BOARD_PX);
  rim.addColorStop(0, GOLD_LIGHT);
  rim.addColorStop(0.25, GOLD);
  rim.addColorStop(0.6, GOLD_LIGHT);
  rim.addColorStop(1, GOLD_DARK);
  ctx.strokeStyle = rim;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.roundRect(w / 2, w / 2, BOARD_PX - w, BOARD_PX - w, CELL_PX * 0.5);
  ctx.stroke();

  return canvas;
}
