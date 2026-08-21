/**
 * 棋盘底图。
 *
 * **贴图是从 `sim/layout.ts` 的数据画出来的,不是一张事先做好的图。**
 * 这一条是刻意的:画面和几何一旦分成两份维护,迟早对不上 ——
 * 而"棋子看着在格子外面"这种错,查起来极其费劲。数据画图之后,
 * 换棋盘尺寸、挪安全格、改终点道长度,画面自动跟着变,不可能不一致。
 *
 * 运行时必须一直使用这张由几何数据生成的贴图。概念图可以决定材质和配色，
 * 但不能作为棋盘纹理直接覆盖，否则基地孔、路径格和棋子锚点会各用一套坐标。
 */

import * as THREE from 'three';
import { HOME_LEN, SEATS } from '../config';
import { ENTRY, SAFE, cellTint } from '../sim/board';
import type { Cell } from '../sim/layout';
import { CENTER, GRID, HOME_PATH, RING, toWorld } from '../sim/layout';
import { LAYER } from './stage';

/** 四家的颜色。座位序与规则一致:红(左下)、绿(左上)、黄(右上)、蓝(右下)。 */
export const SEAT_HEX = [0xe83b32, 0x20aa3e, 0xf6c514, 0x1671cf];
const SEAT_CSS = SEAT_HEX.map((c) => `#${c.toString(16).padStart(6, '0')}`);

/** 一格在贴图里的像素边长。15 格 × 64 = 960,手机上绰绰有余 */
const CELL_PX = 64;
const SIZE = GRID * CELL_PX;

const CREAM = '#f6efe0';
const LINE = '#c9bda4';

/**
 * 竞品参考图的基地把头像和分数放在上半部，四颗棋子横排在下半部。
 * 这里只改变 Three.js 表现锚点，不改变 sim 的棋局规则和路径坐标。
 */
export const VIEW_BASE_SLOTS: Cell[][] = [
  [[12.1, 1.15], [12.1, 2.35], [12.1, 3.65], [12.1, 4.85]], // 红:左下（给骰子操作区留出完整空间）
  [[3.55, 1.15], [3.55, 2.35], [3.55, 3.65], [3.55, 4.85]], // 绿:左上
  [[3.55, 10.15], [3.55, 11.35], [3.55, 12.65], [3.55, 13.85]], // 黄:右上
  [[12.55, 10.15], [12.55, 11.35], [12.55, 12.65], [12.55, 13.85]], // 蓝:右下
];

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
}

function glossyFill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.08, color);
  g.addColorStop(0.72, color);
  g.addColorStop(1, '#000000');
  ctx.save();
  roundedRect(ctx, x, y, w, h, Math.min(9, w * 0.12));
  ctx.fillStyle = g;
  ctx.globalAlpha = 0.18;
  ctx.fill();
  ctx.restore();
}

function cellRect(ctx: CanvasRenderingContext2D, cell: Cell, fill: string): void {
  const [row, col] = cell;
  const x = col * CELL_PX + 2;
  const y = row * CELL_PX + 2;
  const size = CELL_PX - 4;
  const gradient = ctx.createLinearGradient(x, y, x, y + size);
  gradient.addColorStop(0, fill === CREAM ? '#fffdf4' : fill);
  gradient.addColorStop(0.72, fill);
  gradient.addColorStop(1, fill === CREAM ? '#e8dcc4' : fill);
  ctx.save();
  ctx.shadowColor = 'rgba(37,25,8,.35)';
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 2;
  roundedRect(ctx, x, y, size, size, 6);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = fill === CREAM ? LINE : 'rgba(70,35,10,.48)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.55)';
  ctx.lineWidth = 1.5;
  roundedRect(ctx, x + 3, y + 3, size - 6, size - 6, 4);
  ctx.stroke();
  ctx.restore();
}

/** ★ 安全格标记 */
function star(ctx: CanvasRenderingContext2D, cell: Cell): void {
  const [row, col] = cell;
  const cx = (col + 0.5) * CELL_PX;
  const cy = (row + 0.5) * CELL_PX;
  const outer = CELL_PX * 0.3;
  const inner = outer * 0.45;
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = 'rgba(120,120,120,0.45)';
  ctx.fill();
}

/** 入场格上的前进方向箭头 —— 新手全靠它知道往哪边走 */
function arrow(ctx: CanvasRenderingContext2D, cell: Cell, next: Cell, color: string): void {
  const [row, col] = cell;
  const cx = (col + 0.5) * CELL_PX;
  const cy = (row + 0.5) * CELL_PX;
  const dx = next[1] - col;
  const dy = next[0] - row;
  const len = CELL_PX * 0.28;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.atan2(dy, dx));
  ctx.beginPath();
  ctx.moveTo(len, 0);
  ctx.lineTo(-len * 0.6, -len * 0.7);
  ctx.lineTo(-len * 0.6, len * 0.7);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.globalAlpha = 0.9;
  ctx.fill();
  ctx.restore();
}

function makeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;

  // 金色厚框底，让棋盘与设计稿的糖果塑料 UI 属于同一套材质。
  const frame = ctx.createLinearGradient(0, 0, SIZE, SIZE);
  frame.addColorStop(0, '#fff19a');
  frame.addColorStop(0.12, '#d98a11');
  frame.addColorStop(0.5, '#ffce43');
  frame.addColorStop(0.88, '#b76508');
  frame.addColorStop(1, '#ffe77c');
  ctx.fillStyle = frame;
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.strokeStyle = '#6f3505';
  ctx.lineWidth = 12;
  ctx.strokeRect(6, 6, SIZE - 12, SIZE - 12);

  const corners: Array<[number, number, number]> = [
    [9, 0, 0], // 红:左下(row 起点, col 起点, 座位)
    [0, 0, 1], // 绿:左上
    [0, 9, 2], // 黄:右上
    [9, 9, 3], // 蓝:右下
  ];
  for (const [r0, c0, seat] of corners) {
    const x = c0 * CELL_PX + 3;
    const y = r0 * CELL_PX + 3;
    const side = 6 * CELL_PX - 6;
    const baseGradient = ctx.createLinearGradient(x, y, x + side, y + side);
    baseGradient.addColorStop(0, SEAT_CSS[seat]);
    baseGradient.addColorStop(0.55, SEAT_CSS[seat]);
    baseGradient.addColorStop(1, SEAT_CSS[seat]);
    ctx.save();
    roundedRect(ctx, x, y, side, side, 12);
    ctx.fillStyle = baseGradient;
    ctx.fill();
    glossyFill(ctx, x, y, side, side, SEAT_CSS[seat]);
    ctx.strokeStyle = 'rgba(69,34,3,.65)';
    ctx.lineWidth = 4;
    ctx.stroke();
    // 基地保持整块阵营色：头像、名字和分数由 HUD 叠在上半部，棋子在下半部横排。
    ctx.strokeStyle = 'rgba(255,255,255,.28)';
    ctx.lineWidth = 3;
    roundedRect(ctx, x + 8, y + 8, side - 16, side - 16, 10);
    ctx.stroke();
    ctx.restore();
  }
  // 基地槽位圈
  for (let seat = 0; seat < SEATS; seat += 1) {
    for (const cell of VIEW_BASE_SLOTS[seat]) {
      const [row, col] = cell;
      ctx.beginPath();
      ctx.arc((col + 0.5) * CELL_PX, (row + 0.5) * CELL_PX, CELL_PX * 0.36, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(5,14,30,.32)';
      ctx.globalAlpha = 1;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.28)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }

  // 外圈:默认米白,入场格上各家的颜色
  RING.forEach((cell, i) => {
    const owner = cellTint(i);
    cellRect(ctx, cell, owner >= 0 ? SEAT_CSS[owner] : CREAM);
  });
  // 安全格 ★
  for (const index of SAFE) star(ctx, RING[index]);
  // 入场格上的前进箭头。新手全靠它知道自己该往哪边走
  for (let seat = 0; seat < SEATS; seat += 1) {
    const at = ENTRY[seat];
    arrow(ctx, RING[at], RING[(at + 1) % RING.length], 'rgba(255,255,255,0.95)');
  }

  // 终点道
  for (let seat = 0; seat < SEATS; seat += 1) {
    for (const cell of HOME_PATH[seat]) cellRect(ctx, cell, SEAT_CSS[seat]);
  }

  // 中心终点:四个三角
  const c0 = (CENTER[1]) * CELL_PX;
  const r0 = (CENTER[0]) * CELL_PX;
  const cx = c0 + CELL_PX / 2;
  const cy = r0 + CELL_PX / 2;
  const half = CELL_PX * 1.5;
  const quad: Array<[number, number, number, number, number]> = [
    [cx - half, cy + half, cx + half, cy + half, 0], // 下 红
    [cx - half, cy - half, cx - half, cy + half, 1], // 左 绿
    [cx - half, cy - half, cx + half, cy - half, 2], // 上 黄
    [cx + half, cy - half, cx + half, cy + half, 3], // 右 蓝
  ];
  for (const [x1, y1, x2, y2, seat] of quad) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.closePath();
    ctx.fillStyle = SEAT_CSS[seat];
    ctx.fill();
  }

  // 最后压一圈金色包边，避免角区和边缘格把外框盖掉。
  ctx.save();
  ctx.strokeStyle = '#6f3505';
  ctx.lineWidth = 14;
  ctx.strokeRect(7, 7, SIZE - 14, SIZE - 14);
  ctx.strokeStyle = '#ffd759';
  ctx.lineWidth = 6;
  ctx.strokeRect(15, 15, SIZE - 30, SIZE - 30);
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** 只裁掉棋盘四个外角；不能按白色抠图，否则米白路径格也会被误删。 */
function makeRoundedAlpha(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.roundRect(1, 1, 254, 254, 22);
  ctx.fill();
  return new THREE.CanvasTexture(canvas);
}

export class BoardView {
  readonly mesh: THREE.Mesh;
  private readonly frame: THREE.Mesh;

  constructor(scene: THREE.Scene) {
    const material = new THREE.MeshBasicMaterial({
      map: makeTexture(),
      alphaMap: makeRoundedAlpha(),
      transparent: true,
      alphaTest: 0.01,
    });
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(GRID, GRID),
      material,
    );
    this.mesh.position.set(0, 0, LAYER.board);
    const outline = new THREE.Shape();
    const half = (GRID + 0.34) / 2;
    const radius = 0.8;
    outline.moveTo(-half + radius, -half);
    outline.lineTo(half - radius, -half);
    outline.quadraticCurveTo(half, -half, half, -half + radius);
    outline.lineTo(half, half - radius);
    outline.quadraticCurveTo(half, half, half - radius, half);
    outline.lineTo(-half + radius, half);
    outline.quadraticCurveTo(-half, half, -half, half - radius);
    outline.lineTo(-half, -half + radius);
    outline.quadraticCurveTo(-half, -half, -half + radius, -half);
    this.frame = new THREE.Mesh(
      new THREE.ShapeGeometry(outline),
      new THREE.MeshStandardMaterial({ color: 0xf5b822, roughness: 0.24, metalness: 0.42 }),
    );
    this.frame.position.set(0, 0, -0.04);
    scene.add(this.frame);
    scene.add(this.mesh);
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.frame.removeFromParent();
    this.mesh.geometry.dispose();
    const mat = this.mesh.material as THREE.MeshBasicMaterial;
    mat.map?.dispose();
    mat.alphaMap?.dispose();
    mat.dispose();
    this.frame.geometry.dispose();
    (this.frame.material as THREE.Material).dispose();
  }
}

/** 一格的世界坐标,给棋子层用 */
export function worldOf(cell: Cell): { x: number; y: number } {
  return toWorld(cell, 1);
}

export { HOME_LEN };
