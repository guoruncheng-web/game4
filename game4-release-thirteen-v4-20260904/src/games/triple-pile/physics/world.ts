/**
 * Rapier 封装。这一层只负责「铺堆」和「拿走之后塌下来」两件事。
 *
 * 关键前提(和 tumble-stack 的根本差异):**本作从不查询接触对**。
 * 消除判定在 game/tray-logic.ts 里,是纯 JS 计数,和物理完全解耦。
 * 所以这里**鼓励刚体休眠** —— 堆静止后 Rapier 自动跳过整个 island,
 * 这是满堆 120 个凸体还能跑满 60fps 的主要依据。
 */

import RAPIER from '@dimforge/rapier3d-compat';
import { FILL, PHYSICS, POT } from '../config';
import { PIECE_MASS, pieceType, type PieceTypeId } from '../pieces';

export type Pose = {
  x: number; y: number; z: number;
  qx: number; qy: number; qz: number; qw: number;
};

let ready: Promise<void> | null = null;

/** Rapier 的 WASM 只需要初始化一次,重复进出游戏页不该重复付这个代价 */
export function initPhysics(): Promise<void> {
  ready ??= RAPIER.init();
  return ready;
}

export class Physics {
  private world: RAPIER.World;
  /** rigidBody.handle → pieceId,拾取和塌落回调都靠它反查 */
  private readonly handleToPiece = new Map<number, number>();
  private readonly pieceToBody = new Map<number, RAPIER.RigidBody>();
  private accumulator = 0;

  constructor() {
    this.world = new RAPIER.World({ x: 0, y: PHYSICS.gravity, z: 0 });
    this.world.timestep = PHYSICS.timeStep;
    this.buildPot();
  }

  /**
   * 锅壁用 24 段 cuboid 拼成环。
   * **不能用 cylinder collider** —— Rapier 的圆柱是实心凸体,内侧不能当容器用。
   */
  private buildPot() {
    const floor = RAPIER.ColliderDesc.cuboid(POT.radius + 1, 0.25, POT.radius + 1)
      .setTranslation(0, -0.25, 0)
      .setFriction(PHYSICS.friction)
      .setRestitution(PHYSICS.restitution);
    this.world.createCollider(floor, this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed()));

    // 内表面落在 physicsRadius 上,而不是视觉半径 —— 原因见 config.ts 的注释
    const half = Math.tan(Math.PI / POT.segments) * POT.physicsRadius;
    for (let i = 0; i < POT.segments; i += 1) {
      const a = (i / POT.segments) * Math.PI * 2;
      const desc = RAPIER.ColliderDesc.cuboid(half, POT.height, POT.wallThickness)
        .setTranslation(
          Math.cos(a) * (POT.physicsRadius + POT.wallThickness),
          POT.height - 0.25,
          Math.sin(a) * (POT.physicsRadius + POT.wallThickness),
        )
        // 墙面法线朝向圆心:cuboid 的局部 +Z 是径向,绕 Y 转 (π/2 - a) 把它对准方位角 a
        .setRotation(quatFromAxisY(Math.PI / 2 - a))
        .setFriction(PHYSICS.friction)
        .setRestitution(PHYSICS.restitution);
      this.world.createCollider(desc, this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed()));
    }
  }

  /**
   * 建一个食材刚体。pieceId 是本局内的唯一编号。
   * hull 是模型顶点(three/assets.ts 从 glb 里取的)。建模脚本保证每个模型都是凸体,
   * 所以凸包就是精确的碰撞体 —— 视觉和碰撞不可能对不上。
   */
  addPiece(pieceId: number, type: PieceTypeId, hull: Float32Array, x: number, y: number, z: number) {
    const meta = pieceType(type);
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y, z)
      .setRotation(randomQuat())
      .setLinvel(0, FILL.initialVelocityY, 0)
      .setLinearDamping(PHYSICS.linearDamping)
      .setAngularDamping(PHYSICS.angularDamping);
    const body = this.world.createRigidBody(bodyDesc);

    const desc = RAPIER.ColliderDesc.convexHull(hull);
    if (!desc) {
      // 静默跳过会变成「这一关少一个物件」,直接破坏 3 的倍数,所以必须炸出来
      throw new Error(`[triple-pile] 类型 ${meta.key} 的凸包 collider 创建失败`);
    }
    // 用 setMass 而不是 setDensity:12 个模型的体积差好几倍,按密度给会让质量比远超 2:1,
    // 而高质量比会让求解器在堆叠时抖动(见 pieces.ts 的 PIECE_MASS)
    desc.setMass(PIECE_MASS).setFriction(PHYSICS.friction).setRestitution(PHYSICS.restitution);
    this.world.createCollider(desc, body);

    this.handleToPiece.set(body.handle, pieceId);
    this.pieceToBody.set(pieceId, body);
  }

  /**
   * 拿走一个物件。
   * **必须真的移除刚体**,不能只设成 kinematic 或 disabled ——
   * 留着它会让它在飞行途中继续参与碰撞,把堆撞散。
   */
  removePiece(pieceId: number) {
    const body = this.pieceToBody.get(pieceId);
    if (!body) return;
    this.handleToPiece.delete(body.handle);
    this.pieceToBody.delete(pieceId);
    this.world.removeRigidBody(body);
  }

  has(pieceId: number) {
    return this.pieceToBody.has(pieceId);
  }

  pose(pieceId: number): Pose | null {
    const body = this.pieceToBody.get(pieceId);
    if (!body) return null;
    const t = body.translation();
    const r = body.rotation();
    return { x: t.x, y: t.y, z: t.z, qx: r.x, qy: r.y, qz: r.z, qw: r.w };
  }

  /** 把某个物件重新抛起来。「打乱」和「移出」道具都用它 */
  relocate(pieceId: number, x: number, y: number, z: number) {
    const body = this.pieceToBody.get(pieceId);
    if (!body) return;
    body.setTranslation({ x, y, z }, true);
    body.setRotation(randomQuat(), true);
    body.setLinvel({ x: 0, y: FILL.initialVelocityY, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    body.wakeUp();
  }

  /** 场上还活着的物件 id */
  aliveIds(): number[] {
    return [...this.pieceToBody.keys()];
  }

  /**
   * 固定步长推进。用固定步长而不是可变 dt,否则不同帧率下塌落表现不一致。
   * maxSubSteps 是为了防止切回标签页时一次性追平几百步 —— 那会让整锅炸开。
   */
  step(dtSeconds: number) {
    this.accumulator += dtSeconds;
    let steps = 0;
    while (this.accumulator >= PHYSICS.timeStep && steps < PHYSICS.maxSubSteps) {
      this.world.step();
      this.accumulator -= PHYSICS.timeStep;
      steps += 1;
    }
    // 落后太多就直接丢弃,不做补帧
    if (this.accumulator > PHYSICS.timeStep * PHYSICS.maxSubSteps) this.accumulator = 0;
  }

  /** 暂停恢复后调,把攒下的时间丢掉 */
  resetClock() {
    this.accumulator = 0;
  }

  dispose() {
    this.handleToPiece.clear();
    this.pieceToBody.clear();
    // WASM 侧的内存不归 GC 管,漏了会在反复进出游戏页之后表现为卡顿
    this.world.free();
  }
}

// ---------------------------------------------------------------- 工具

function quatFromAxisY(angle: number) {
  return { x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) };
}

/** 随机朝向。物件是被倒进锅里的,姿态本来就该是随机的 */
function randomQuat() {
  const u1 = Math.random(), u2 = Math.random(), u3 = Math.random();
  const s1 = Math.sqrt(1 - u1), s2 = Math.sqrt(u1);
  return {
    x: s1 * Math.sin(2 * Math.PI * u2),
    y: s1 * Math.cos(2 * Math.PI * u2),
    z: s2 * Math.sin(2 * Math.PI * u3),
    w: s2 * Math.cos(2 * Math.PI * u3),
  };
}
