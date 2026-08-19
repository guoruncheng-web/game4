/**
 * 一局(一关)的运行时。
 *
 * 状态机:filling → playing →(paused)→ cleared | failed
 *
 * 分层约定:本文件负责「什么时候发生什么」,
 * 具体的槽位规则在 tray-logic.ts(纯函数),渲染在 three/,物理在 physics/。
 * 三消判定不查物理,物理不知道有槽位这回事。
 */

import * as THREE from 'three';
import { BROTH, CLEAR_FX, FILL, PICK, SCORE, TRAY, type PowerupId } from '../config';
import { buildDropOrder, type Level } from '../levels';
import { pieceType, type PieceTypeId } from '../pieces';
import { Physics } from '../physics/world';
import type { PieceField } from '../three/field';
import type { Stage } from '../three/stage';
import type { TrayView } from '../three/tray';
import type { Vfx } from '../three/vfx';
import {
  dominantType, findTriple, insert, isStuck, removeAt, takeOutLeft, type TraySlot,
} from './tray-logic';
import { sfxClear, sfxPick, sfxPowerup, sfxSlot, sfxSplash, sfxTumble, sfxWarn } from '../sfx';

export type SessionPhase = 'filling' | 'playing' | 'cleared' | 'failed';

export type Result = {
  won: boolean;
  score: number;
  /** 本关实际用时 */
  elapsedMs: number;
  remainMs: number;
  unusedPowerups: number;
};

export type SessionEvents = {
  onHud: (state: HudState) => void;
  onFinish: (result: Result) => void;
  onFloat: (text: string) => void;
  /** 第一次三消完成,用来关掉开局提示 */
  onFirstClear: () => void;
};

export type HudState = {
  remainMs: number;
  totalMs: number;
  left: number;
  trayCount: number;
  warn: boolean;
  powerups: Record<PowerupId, boolean>;
};

type PieceState = 'pot' | 'flying' | 'tray' | 'clearing' | 'gone';

type Piece = {
  id: number;
  type: PieceTypeId;
  /** InstancedMesh 里的下标,本关内分配后永不改变 */
  instance: number;
  state: PieceState;
  /** 当前世界位置与朝向,飞行和槽位阶段由动画驱动 */
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  scale: number;
  /** 飞行动画 */
  flightT: number;
  from: THREE.Vector3;
  fromQuat: THREE.Quaternion;
  /** 在槽位里的下标 */
  slot: number;
  /** 消除动画 */
  clearT: number;
  clearSlot: number;
  /** 上一帧的高度,用来检测「穿过汤面」这一瞬间 */
  prevY: number;
  /** 已经溅过水了。浮回汤面以上会重置,免得在汤面附近抖动时反复溅 */
  splashed: boolean;
};

const tmpVec = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class Session {
  phase: SessionPhase = 'filling';

  private readonly physics = new Physics();
  private readonly pieces: Piece[] = [];
  private tray: TraySlot[] = [];
  /** 已投放到第几个 */
  private spawned = 0;
  private readonly order: PieceTypeId[];
  private fillTimer = 0;

  private remainMs: number;
  private elapsedMs = 0;
  private score = 0;
  private lastClearAt = -Infinity;
  private firstClearDone = false;

  private readonly powerupsLeft: Record<PowerupId, number> = { takeOut: 1, complete: 1, shuffle: 1 };

  /** 等待消除的那一组:延迟 120ms 是给玩家看清「是它凑齐了」的时间 */
  private pendingClear: { indices: number[]; timer: number } | null = null;
  private warnOn = false;
  /** 告急脉冲的倒计时。玩家视线在锅里,这一声是唯一不占视线的预警通道 */
  private warnPulse = 0;
  /** 不受暂停影响的累计时间,只用来给落水音效限流 */
  private elapsedTotal = 0;
  private lastSplashSfx = -Infinity;

  // 拾取
  private readonly raycaster = new THREE.Raycaster();
  private pressCandidate: Piece | null = null;
  private pressX = 0;
  private pressY = 0;

  constructor(
    private readonly level: Level,
    private readonly stage: Stage,
    private readonly field: PieceField,
    private readonly trayView: TrayView,
    private readonly vfx: Vfx,
    private readonly events: SessionEvents,
  ) {
    this.remainMs = level.timeMs;
    this.order = buildDropOrder(level);
  }

  // ---------------------------------------------------------------- 主循环

  update(dtSeconds: number) {
    this.elapsedTotal += dtSeconds * 1000;
    if (this.phase === 'filling') this.updateFill(dtSeconds);

    this.physics.step(dtSeconds);

    if (this.phase === 'playing') {
      this.remainMs -= dtSeconds * 1000;
      this.elapsedMs += dtSeconds * 1000;
      if (this.remainMs <= 0) {
        this.remainMs = 0;
        this.finish(false);
      }
    }

    this.syncPot(dtSeconds);
    this.updateFlying(dtSeconds);
    this.updateTrayPieces(dtSeconds);
    this.updatePendingClear(dtSeconds);
    this.updateClearing(dtSeconds);

    if (this.warnOn && this.phase === 'playing') {
      this.warnPulse -= dtSeconds * 1000;
      if (this.warnPulse <= 0) {
        this.warnPulse = 800;
        sfxWarn();
      }
    }

    this.vfx.faceCamera(this.stage.camera.quaternion);
    this.vfx.update(dtSeconds);
    this.field.commit();
    this.emitHud();
  }

  /** 分批投放。一帧插入上百个刚体会造成一次求解尖峰,表现是开局卡一下 */
  private updateFill(dt: number) {
    this.fillTimer -= dt * 1000;
    if (this.fillTimer > 0) return;
    this.fillTimer = FILL.batchIntervalMs;

    const end = Math.min(this.spawned + FILL.batchSize, this.order.length);
    for (; this.spawned < end; this.spawned += 1) {
      const type = this.order[this.spawned];
      const id = this.pieces.length;
      const instance = this.field.allocate(type);
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * FILL.spread;
      this.physics.addPiece(id, type, this.field.hull(type), Math.cos(a) * r, FILL.dropHeight + Math.random() * 1.5, Math.sin(a) * r);
      this.pieces.push({
        id, type, instance, state: 'pot',
        pos: new THREE.Vector3(), quat: new THREE.Quaternion(), scale: 1,
        flightT: 0, from: new THREE.Vector3(), fromQuat: new THREE.Quaternion(),
        slot: -1, clearT: 0, clearSlot: -1,
        prevY: FILL.dropHeight, splashed: false,
      });
    }

    if (this.spawned >= this.order.length) this.phase = 'playing';
  }

  /** 锅里的物件:位置完全由物理决定,这里只是把结果抄进 instance 矩阵,顺便看谁砸进汤里了 */
  private syncPot(dt: number) {
    for (const piece of this.pieces) {
      if (piece.state !== 'pot') continue;
      const pose = this.physics.pose(piece.id);
      if (!pose) continue;
      piece.pos.set(pose.x, pose.y, pose.z);
      piece.quat.set(pose.qx, pose.qy, pose.qz, pose.qw);
      this.field.write(piece.type, piece.instance, piece.pos, piece.quat, 1);
      this.checkSplash(piece, dt);
    }
  }

  /**
   * 穿过汤面的那一瞬间溅水。
   *
   * 用「上一帧在汤面之上、这一帧在之下」来判定,而不是查物理的接触 ——
   * 汤根本没有碰撞体(它是纯视觉的,见 config.ts 的 BROTH),物理不知道有汤这回事。
   *
   * 力度取下坠速度(由两帧的高度差估),所以轻轻滑进去和整个砸下去的动静不一样。
   */
  private checkSplash(piece: Piece, dt: number) {
    const y = piece.pos.y;
    const crossed = piece.prevY > BROTH.level && y <= BROTH.level;
    if (crossed && !piece.splashed && dt > 0) {
      const speed = (piece.prevY - y) / dt;
      const power = Math.min(speed * 0.12, 1.6);
      // 波浪是汤面自身的顶点位移(Stage),溅起的汤滴是粒子(Vfx),两层分开
      this.stage.splash(piece.pos.x, piece.pos.z, power);
      this.vfx.splash(piece.pos.x, BROTH.level, piece.pos.z, power);
      piece.splashed = true;
      // 开局一批十几个同时落水,一人一声会糊成噪音 —— 限流,只让最响的那几声出来
      const now = this.elapsedTotal;
      if (now - this.lastSplashSfx > 70) {
        this.lastSplashSfx = now;
        sfxSplash(power / 1.6);
      }
    }
    // 浮回汤面以上一点才允许再溅,免得贴着汤面抖动时反复触发
    if (y > BROTH.level + 0.35) piece.splashed = false;
    piece.prevY = y;
  }

  private updateFlying(dt: number) {
    for (const piece of this.pieces) {
      if (piece.state !== 'flying') continue;
      piece.flightT = Math.min(piece.flightT + (dt * 1000) / TRAY.flightMs, 1);
      const t = piece.flightT;
      const target = this.trayView.slotPosition(piece.slot);
      // 二次贝塞尔,控制点在中点上方
      tmpVec.copy(piece.from).add(target).multiplyScalar(0.5);
      tmpVec.y += 1.8;
      const mt = 1 - t;
      piece.pos.set(
        mt * mt * piece.from.x + 2 * mt * t * tmpVec.x + t * t * target.x,
        mt * mt * piece.from.y + 2 * mt * t * tmpVec.y + t * t * target.y,
        mt * mt * piece.from.z + 2 * mt * t * tmpVec.z + t * t * target.z,
      );
      piece.quat.slerpQuaternions(piece.fromQuat, this.trayView.displayQuaternion, t);
      piece.scale = 1 + (this.trayView.pieceScale(piece.type) - 1) * t;
      this.field.write(piece.type, piece.instance, piece.pos, piece.quat, piece.scale);
      if (t % 0.2 < 0.06) this.vfx.trail(piece.pos, pieceType(piece.type).color);

      if (t >= 1) {
        piece.state = 'tray';
        sfxSlot();
        this.afterLanded();
      }
    }
  }

  /** 槽位里的物件跟着自己的格子走。消除后右侧整体左移,就是靠这里的插值表现出来的 */
  private updateTrayPieces(dt: number) {
    const k = Math.min(dt * 14, 1);
    for (const piece of this.pieces) {
      if (piece.state !== 'tray') continue;
      const target = this.trayView.slotPosition(piece.slot);
      piece.pos.lerp(target, k);
      piece.quat.copy(this.trayView.displayQuaternion);
      piece.scale = this.trayView.pieceScale(piece.type);
      this.field.write(piece.type, piece.instance, piece.pos, piece.quat, piece.scale);
    }
  }

  private updatePendingClear(dt: number) {
    if (!this.pendingClear) return;
    this.pendingClear.timer -= dt * 1000;
    if (this.pendingClear.timer > 0) return;
    const { indices } = this.pendingClear;
    this.pendingClear = null;
    this.doClear(indices);
  }

  /**
   * 消除动画。
   *
   * 形状是「先鼓一下,再被压扁着弹没」:前 40% 微微涨大,后 60% 纵向压扁、横向再撑开一点,
   * 同时绕自身轴快速转小半圈。**不刷白** —— 食材保持它本来的样子,
   * 「亮起来」那一下由 Vfx 的加色柔光斑负责(见 field.ts 的说明)。
   */
  private updateClearing(dt: number) {
    let any = false;
    for (const piece of this.pieces) {
      if (piece.state !== 'clearing') continue;
      any = true;
      piece.clearT = Math.min(piece.clearT + (dt * 1000) / CLEAR_FX.totalMs, 1);
      const t = piece.clearT;
      const base = this.trayView.pieceScale(piece.type);

      let sx: number;
      let sy: number;
      if (t < 0.4) {
        const k = t / 0.4;
        sx = 1 + (CLEAR_FX.peakScale - 1) * k;
        sy = sx;
      } else {
        const k = (t - 0.4) / 0.6;
        // 压扁 + 横向外扩,读起来像「被弹掉」而不是「被缩没」
        sy = CLEAR_FX.peakScale * (1 - k) * (1 - k);
        sx = CLEAR_FX.peakScale * (1 + k * 0.5) * (1 - k);
      }
      tmpQuat.setFromAxisAngle(UP, t * Math.PI * 0.6);
      tmpQuat.multiplyQuaternions(piece.quat, tmpQuat);
      tmpScale.set(Math.max(sx, 0) * base, Math.max(sy, 0) * base, Math.max(sx, 0) * base);
      this.field.showClearing(piece.clearSlot, piece.type, piece.pos, tmpQuat, tmpScale);

      if (t >= 1) {
        piece.state = 'gone';
        this.vfx.burst(piece.pos, pieceType(piece.type).color);
      }
    }
    if (!any) this.field.hideClearing();
  }

  // ---------------------------------------------------------------- 拾取

  /**
   * 按下:只给反馈,不生效。
   * 判定放在松手,并要求两点之间移动小于 12px —— 这样误触时可以「滑开再松手」取消。
   */
  pointerDown(clientX: number, clientY: number, rect: DOMRect) {
    if (this.phase !== 'playing') return;
    const piece = this.pick(clientX, clientY, rect);
    if (!piece) return;
    this.pressCandidate = piece;
    this.pressX = clientX;
    this.pressY = clientY;
    this.field.showOutline(piece.type, piece.pos, piece.quat);
  }

  pointerMove(clientX: number, clientY: number) {
    if (!this.pressCandidate) return;
    if (Math.hypot(clientX - this.pressX, clientY - this.pressY) > PICK.cancelDistancePx) {
      this.pressCandidate = null;
      this.field.hideOutline();
    }
  }

  pointerUp(clientX: number, clientY: number, rect: DOMRect) {
    const candidate = this.pressCandidate;
    this.pressCandidate = null;
    this.field.hideOutline();
    if (!candidate || this.phase !== 'playing') return;
    if (Math.hypot(clientX - this.pressX, clientY - this.pressY) > PICK.cancelDistancePx) return;
    // 松手时再确认一次命中的还是它 —— 中途堆可能塌过
    const now = this.pick(clientX, clientY, rect);
    if (!now || now.id !== candidate.id) return;
    this.take(candidate);
  }

  private pick(clientX: number, clientY: number, rect: DOMRect): Piece | null {
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.stage.camera);
    const hit = this.field.raycast(this.raycaster);
    if (!hit) return null;
    const piece = this.pieces.find((p) => p.state === 'pot' && p.type === hit.type && p.instance === hit.instance);
    return piece ?? null;
  }

  /** 拿走一个物件 */
  private take(piece: Piece) {
    if (this.tray.length + this.countIncoming() >= TRAY.slots) return;

    // 塌落音效的强度用附近还剩几个来近似
    let near = 0;
    for (const other of this.pieces) {
      if (other.state !== 'pot' || other.id === piece.id) continue;
      if (other.pos.distanceTo(piece.pos) < 1.6) near += 1;
    }

    // 必须真的移除刚体:留着它(哪怕设成 kinematic)会让它在飞行途中继续参与碰撞,把堆撞散
    this.physics.removePiece(piece.id);
    piece.state = 'flying';
    piece.flightT = 0;
    piece.from.copy(piece.pos);
    piece.fromQuat.copy(piece.quat);
    // 目标格子按插入规则预先算出来,这样飞行途中就能看到它往哪去
    piece.slot = insert(this.tray, { pieceId: piece.id, type: piece.type }).index;

    sfxPick();
    if (near > 0) sfxTumble(near);
  }

  /** 正在飞的物件也占格子,否则连点会超收 */
  private countIncoming() {
    let n = 0;
    for (const p of this.pieces) if (p.state === 'flying') n += 1;
    return n;
  }

  /** 落进槽位之后:真正写进 tray 数组,并判断三消 / 死局 */
  private afterLanded() {
    const landed = this.pieces.filter((p) => p.state === 'tray' && !this.tray.some((s) => s.pieceId === p.id));
    for (const piece of landed) {
      const result = insert(this.tray, { pieceId: piece.id, type: piece.type });
      this.tray = result.tray;
    }
    this.reindexTray();

    if (this.pendingClear) return;
    const triple = findTriple(this.tray);
    if (triple) {
      this.pendingClear = { indices: triple, timer: TRAY.clearDelayMs };
      return;
    }
    if (isStuck(this.tray, TRAY.slots)) this.finish(false);
  }

  private reindexTray() {
    this.tray.forEach((slot, i) => {
      const piece = this.pieces[slot.pieceId];
      if (piece) piece.slot = i;
    });
    const warn = this.tray.length >= TRAY.warnAt;
    if (warn !== this.warnOn) {
      this.warnOn = warn;
      this.trayView.setWarn(warn);
      this.warnPulse = warn ? 0 : Infinity;
    }
  }

  private doClear(indices: number[]) {
    const slots = indices.map((i) => this.tray[i]).filter(Boolean);
    if (slots.length < 3) return;
    this.tray = removeAt(this.tray, indices);
    this.reindexTray();

    slots.forEach((slot, i) => {
      const piece = this.pieces[slot.pieceId];
      if (!piece) return;
      piece.state = 'clearing';
      piece.clearT = 0;
      piece.clearSlot = i;
      this.field.hide(piece.type, piece.instance);
    });

    const now = this.elapsedMs;
    const quick = now - this.lastClearAt < SCORE.quickWindowMs;
    this.lastClearAt = now;
    this.score += SCORE.perClear + (quick ? SCORE.quickBonus : 0);
    sfxClear();
    this.events.onFloat(quick ? `+${SCORE.perClear + SCORE.quickBonus}` : `+${SCORE.perClear}`);

    if (!this.firstClearDone) {
      this.firstClearDone = true;
      this.events.onFirstClear();
    }

    // 消完之后可能又凑齐一组(移出道具退回后会出现),继续排队
    const next = findTriple(this.tray);
    if (next) this.pendingClear = { indices: next, timer: TRAY.clearDelayMs };
    else if (this.remaining() === 0) this.finish(true);
    else if (isStuck(this.tray, TRAY.slots)) this.finish(false);
  }

  /** 还没被消掉的物件数(锅里 + 槽位 + 飞行中) */
  private remaining(): number {
    let n = 0;
    for (const p of this.pieces) if (p.state !== 'gone' && p.state !== 'clearing') n += 1;
    return n;
  }

  private finish(won: boolean) {
    if (this.phase === 'cleared' || this.phase === 'failed') return;
    this.phase = won ? 'cleared' : 'failed';
    const unused = Object.values(this.powerupsLeft).reduce((a, b) => a + b, 0);
    let score = this.score + unused * SCORE.perUnusedPowerup;
    if (won) score += Math.floor(this.remainMs / 1000) * SCORE.perSecondLeft;
    this.events.onFinish({
      won, score, elapsedMs: this.elapsedMs, remainMs: Math.max(this.remainMs, 0), unusedPowerups: unused,
    });
  }

  // ---------------------------------------------------------------- 道具

  canUse(id: PowerupId): boolean {
    if (this.phase !== 'playing' || this.powerupsLeft[id] <= 0) return false;
    if (id === 'takeOut') return this.tray.length > 0;
    if (id === 'shuffle') return this.potPieces().length > 0;
    // 凑齐:锅里得真有同类可取,而且槽位要放得下 —— 凭空生成会破坏 3 的倍数
    const type = dominantType(this.tray);
    if (type === null) return false;
    const need = 3 - this.tray.filter((s) => s.type === type).length;
    const available = this.potPieces().filter((p) => p.type === type).length;
    return need > 0 && available >= need && this.tray.length + need <= TRAY.slots;
  }

  use(id: PowerupId) {
    if (!this.canUse(id)) return;
    this.powerupsLeft[id] -= 1;
    sfxPowerup();
    if (id === 'takeOut') this.useTakeOut();
    else if (id === 'shuffle') this.useShuffle();
    else this.useComplete();
  }

  /**
   * 移出:把最左边 3 个**退回锅里**。
   * 退回而不是丢弃是硬性的 —— 丢弃会让该类型的剩余总数不再是 3 的倍数,直接崩关。
   */
  private useTakeOut() {
    const { removed, tray } = takeOutLeft(this.tray, 3);
    this.tray = tray;
    this.reindexTray();
    for (const slot of removed) {
      const piece = this.pieces[slot.pieceId];
      if (!piece) continue;
      piece.state = 'pot';
      piece.slot = -1;
      piece.scale = 1;
      piece.prevY = FILL.dropHeight;
      piece.splashed = false;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * FILL.spread;
      this.physics.addPiece(piece.id, piece.type, this.field.hull(piece.type), Math.cos(a) * r, FILL.dropHeight, Math.sin(a) * r);
    }
  }

  /** 凑齐:从锅里取最上面的同类补满 3 个。必须真的从锅里取,不能凭空生成 */
  private useComplete() {
    const type = dominantType(this.tray);
    if (type === null) return;
    const need = 3 - this.tray.filter((s) => s.type === type).length;
    const candidates = this.potPieces()
      .filter((p) => p.type === type)
      .sort((a, b) => b.pos.y - a.pos.y)
      .slice(0, need);
    for (const piece of candidates) this.take(piece);
  }

  /** 打乱:所有物件重新抛起落下。数量一个不变,天然安全 */
  private useShuffle() {
    for (const piece of this.potPieces()) {
      piece.prevY = FILL.dropHeight;
      piece.splashed = false;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * FILL.spread;
      this.physics.relocate(piece.id, Math.cos(a) * r, FILL.dropHeight + Math.random() * 1.2, Math.sin(a) * r);
    }
  }

  private potPieces(): Piece[] {
    return this.pieces.filter((p) => p.state === 'pot');
  }

  // ---------------------------------------------------------------- 杂项

  private emitHud() {
    this.events.onHud({
      remainMs: Math.max(this.remainMs, 0),
      totalMs: this.level.timeMs,
      left: this.remaining(),
      trayCount: this.tray.length,
      warn: this.warnOn,
      powerups: {
        takeOut: this.canUse('takeOut'),
        complete: this.canUse('complete'),
        shuffle: this.canUse('shuffle'),
      },
    });
  }

  /** 暂停恢复:把攒下的时间丢掉,不做补帧 —— 一次 3 秒的补帧会让整锅炸开 */
  resetClock() {
    this.physics.resetClock();
  }

  dispose() {
    this.physics.dispose();
  }
}
