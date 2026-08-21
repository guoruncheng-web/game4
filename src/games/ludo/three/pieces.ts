/**
 * 棋子:16 颗,四家各 4 颗。
 *
 * 造型是车削出来的塑料棋子(底座 + 腰身 + 圆头),不是模型文件 ——
 * 一颗棋子在屏幕上最大也就四十几像素,建模的收益极低。
 * 等 `tools/blender/ludo/build_models.py` 出了 glb 再换,接口不用变。
 *
 * **移动必须一格一格走完,不能直接瞬移到落点。**
 * 玩家要靠"数着格子过去"来确认这一步走对了;瞬移之后没人能核对棋子是不是走了 5 格,
 * 撞子也会变得莫名其妙 —— 明明看着没碰到,对方却回家了。
 */

import * as THREE from 'three';
import { PIECES_PER_SEAT, SEATS, TRACK } from '../config';
import { cellOfStep } from '../sim/layout';
import type { Cell } from '../sim/layout';
import { BASE } from '../sim/rules';
import { SEAT_HEX, VIEW_BASE_SLOTS, worldOf } from './board';
import { LAYER } from './stage';

/** 一颗棋子走一格的时长(毫秒) */
const STEP_MS = 120;
/** 被撞回基地的飞回时长 */
const KNOCK_MS = 420;

function pawnGeometry(): THREE.BufferGeometry {
  // 车削轮廓:底盘 → 收腰 → 圆头。单位是格
  const profile = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.36, 0.0),
    new THREE.Vector2(0.36, 0.07),
    new THREE.Vector2(0.24, 0.12),
    new THREE.Vector2(0.15, 0.31),
    new THREE.Vector2(0.20, 0.40),
    new THREE.Vector2(0.23, 0.53),
    new THREE.Vector2(0.17, 0.62),
    new THREE.Vector2(0.0, 0.67),
  ];
  const geo = new THREE.LatheGeometry(profile, 20);
  // 车削是绕 y 轴的,而棋盘平铺在 xy 平面上,要把棋子立起来
  geo.rotateX(Math.PI / 2);
  return geo;
}

type Anim =
  | { kind: 'walk'; path: Cell[]; index: number; t: number }
  | { kind: 'knock'; from: Cell; to: Cell; t: number; landingAtBase: boolean }
  | null;

export class PieceView {
  readonly mesh: THREE.Mesh;
  private anim: Anim = null;
  private readonly material: THREE.MeshStandardMaterial;
  private atBase = true;
  private highlighted = false;

  constructor(readonly seat: number, readonly index: number, geometry: THREE.BufferGeometry) {
    this.material = new THREE.MeshStandardMaterial({
      color: SEAT_HEX[seat],
      roughness: 0.35,
      metalness: 0.05,
    });
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.position.z = LAYER.piece;
    this.place(VIEW_BASE_SLOTS[seat][index]);
  }

  /** 直接摆到某一格(开局、重连、被撞落地都用这个) */
  place(cell: Cell): void {
    const { x, y } = worldOf(cell);
    this.mesh.position.set(x, y, LAYER.piece);
  }

  /** 一格一格走过去 */
  walk(from: number, to: number): void {
    const path: Cell[] = [];
    for (let step = from + 1; step <= to; step += 1) {
      path.push(cellOfStep(this.seat, Math.min(step, TRACK + 5)));
    }
    if (!path.length) return;
    this.anim = { kind: 'walk', path, index: 0, t: 0 };
  }

  /** 出子:从基地跳到入场格 */
  launch(): void {
    this.atBase = false;
    this.applyScale();
    this.anim = {
      kind: 'knock',
      from: VIEW_BASE_SLOTS[this.seat][this.index],
      to: cellOfStep(this.seat, 0),
      t: 0,
      landingAtBase: false,
    };
  }

  /** 被撞:飞回基地 */
  knockBack(fromStep: number): void {
    this.anim = {
      kind: 'knock',
      from: fromStep === BASE ? VIEW_BASE_SLOTS[this.seat][this.index] : cellOfStep(this.seat, fromStep),
      to: VIEW_BASE_SLOTS[this.seat][this.index],
      t: 0,
      landingAtBase: true,
    };
  }

  get busy(): boolean {
    return this.anim !== null;
  }

  /** 高亮:轮到自己且这颗能走时抬起来一点 */
  setHighlight(on: boolean): void {
    this.highlighted = on;
    this.material.emissive.setHex(on ? 0xffffff : 0x000000);
    this.material.emissiveIntensity = on ? 0.12 : 0;
    this.applyScale();
  }

  setAtBase(on: boolean): void {
    this.atBase = on;
    this.applyScale();
  }

  private applyScale(): void {
    // 红方基地还承载回合徽章和骰子；缩小其待机棋子，确保四枚都完整露出。
    const baseScale = this.seat === 0 ? 0.82 : 1.24;
    this.mesh.scale.setScalar((this.atBase ? baseScale : 1) * (this.highlighted ? 1.08 : 1));
  }

  update(dt: number): void {
    const anim = this.anim;
    if (!anim) return;

    if (anim.kind === 'walk') {
      anim.t += dt;
      while (anim.t >= STEP_MS && anim.index < anim.path.length) {
        anim.t -= STEP_MS;
        this.place(anim.path[anim.index]);
        anim.index += 1;
      }
      if (anim.index >= anim.path.length) {
        this.place(anim.path[anim.path.length - 1]);
        this.anim = null;
        return;
      }
      // 格与格之间做插值 + 一点跳跃感,不然像在滑
      const prev = anim.index === 0 ? null : anim.path[anim.index - 1];
      const next = anim.path[anim.index];
      const k = anim.t / STEP_MS;
      const a = prev ? worldOf(prev) : worldOf(next);
      const b = worldOf(next);
      this.mesh.position.set(
        a.x + (b.x - a.x) * k,
        a.y + (b.y - a.y) * k,
        LAYER.piece + Math.sin(Math.PI * k) * 0.18,
      );
      return;
    }

    anim.t += dt;
    const k = Math.min(1, anim.t / KNOCK_MS);
    const a = worldOf(anim.from);
    const b = worldOf(anim.to);
    // 抛物线飞回去,比直线读起来更像"被撞飞"
    this.mesh.position.set(
      a.x + (b.x - a.x) * k,
      a.y + (b.y - a.y) * k,
      LAYER.piece + Math.sin(Math.PI * k) * 0.9,
    );
    if (k >= 1) {
      this.place(anim.to);
      this.atBase = anim.landingAtBase;
      this.applyScale();
      this.anim = null;
    }
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.material.dispose();
  }
}

export class PieceLayer {
  readonly pieces: PieceView[][] = [];
  private readonly geometry = pawnGeometry();

  constructor(scene: THREE.Scene) {
    for (let seat = 0; seat < SEATS; seat += 1) {
      const row: PieceView[] = [];
      for (let i = 0; i < PIECES_PER_SEAT; i += 1) {
        const piece = new PieceView(seat, i, this.geometry);
        scene.add(piece.mesh);
        row.push(piece);
      }
      this.pieces.push(row);
    }
  }

  get busy(): boolean {
    return this.pieces.some((row) => row.some((p) => p.busy));
  }

  /** 把整盘棋子摆到给定局面(不做动画)。开局和重连用 */
  sync(board: number[][]): void {
    for (let seat = 0; seat < SEATS; seat += 1) {
      for (let i = 0; i < PIECES_PER_SEAT; i += 1) {
        const step = board[seat][i];
        this.pieces[seat][i].place(
          step === BASE ? VIEW_BASE_SLOTS[seat][i] : cellOfStep(seat, Math.min(step, TRACK + 5)),
        );
        this.pieces[seat][i].setAtBase(step === BASE);
      }
    }
  }

  update(dt: number): void {
    for (const row of this.pieces) for (const p of row) p.update(dt);
  }

  /** 世界坐标附近的棋子,用来做点击命中 */
  pick(x: number, y: number, seat: number): PieceView | null {
    let best: PieceView | null = null;
    let bestDist = 0.55; // 半格出头,手指点得到
    for (const piece of this.pieces[seat]) {
      const dx = piece.mesh.position.x - x;
      const dy = piece.mesh.position.y - y;
      const dist = Math.hypot(dx, dy);
      if (dist < bestDist) { bestDist = dist; best = piece; }
    }
    return best;
  }

  dispose(): void {
    for (const row of this.pieces) for (const p of row) p.dispose();
    this.geometry.dispose();
  }
}
