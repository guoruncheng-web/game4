/**
 * 场上所有食材的渲染。12 个类型 = 12 个 InstancedMesh。
 *
 * **draw call 与物件数量完全脱钩**:无论场上是 18 个还是 120 个,都只有 12 个 draw call。
 * 也正因为如此,才敢给每个类型配一张 512 的写实贴图 —— 贴图数量等于类型数,不等于物件数。
 *
 * 一条硬规矩(ARCHITECTURE.md §5.1):
 * **instance index 一经分配就不变,直到本关结束。**
 * 拿走的物件把矩阵挪到画面外并缩到 0,而不是把最后一个 instance 搬过来补位 ——
 * 后者会让 index 突变,而飞行动画、高亮、粒子都在引用它,一定出错。
 */

import * as THREE from 'three';
import { PICK } from '../config';
import { PIECE_TYPES, type PieceTypeId } from '../pieces';
import type { PieceAsset } from './assets';

/** 藏起来的 instance 挪到这个高度,顺便让 raycast 打不到 */
const HIDDEN_Y = -500;

export type FieldHit = { type: PieceTypeId; instance: number };

export class PieceField {
  private readonly meshes: THREE.InstancedMesh[] = [];
  private readonly used: number[];
  private readonly dirty: boolean[];

  /** 描边高亮:同一 geometry 用 BackSide 再画一遍,零贴图零后处理 */
  private readonly outline: THREE.Mesh;
  private readonly outlineMaterial: THREE.MeshBasicMaterial;

  /**
   * 消除中的物件。
   *
   * **用食材自己的材质,不刷白。** 初版把 color 压黑、emissive 打满,
   * 想让爆炸对 12 类是同一个效果 —— 代价是食材在最后一刻变成一坨纯白团,
   * 一眼就假。现在保持它本来的样子,「亮起来」那一下交给 Vfx 的加色柔光斑。
   */
  private readonly clearing: THREE.Mesh[] = [];

  private readonly tmpMatrix = new THREE.Matrix4();
  private readonly tmpScale = new THREE.Vector3();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly assets: PieceAsset[],
    capacity: number,
  ) {
    this.used = PIECE_TYPES.map(() => 0);
    this.dirty = PIECE_TYPES.map(() => false);

    PIECE_TYPES.forEach((type, i) => {
      const asset = assets[i];
      const mesh = new THREE.InstancedMesh(asset.geometry, asset.material, capacity);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.userData.typeId = type.id;
      /**
       * **必须手动给一个包围球,否则拾取永远命中不了。**
       *
       * InstancedMesh.raycast 会先拿 boundingSphere 做粗筛,而这个球**只在为 null 时
       * 计算一次,之后永久缓存**,不会随实例矩阵更新。下面紧接着要把所有实例藏到
       * (0,-500,0) 且缩放归零 —— 那之后首次 raycast 算出来的就是个位于地下 500 的退化点,
       * 此后每一次射线都在粗筛阶段被判为不相交。
       *
       * 表现极具迷惑性:食材看得见(矩阵后来更新了)但永远点不到,而且不报任何错。
       * 这里直接钉一个覆盖全场(锅 + 槽位)的大球,粗筛恒真,实例级的精确相交照常做。
       */
      mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 60);
      // 先入表再 hide:hide 是按 this.meshes[type] 寻址的,顺序反了就是 undefined
      this.meshes.push(mesh);
      // 全部先藏起来,免得开局第一帧在原点闪出一坨
      for (let k = 0; k < capacity; k += 1) this.hide(type.id, k);
      mesh.instanceMatrix.needsUpdate = true;
      scene.add(mesh);
    });

    this.outlineMaterial = new THREE.MeshBasicMaterial({ color: 0xffd98a, side: THREE.BackSide });
    this.outline = new THREE.Mesh(assets[0].geometry, this.outlineMaterial);
    this.outline.visible = false;
    this.outline.frustumCulled = false;
    scene.add(this.outline);

    for (let i = 0; i < 3; i += 1) {
      const mesh = new THREE.Mesh(assets[0].geometry, assets[0].material);
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.clearing.push(mesh);
      scene.add(mesh);
    }
  }

  /** 某个类型的凸包顶点,给物理建 collider 用 */
  hull(type: PieceTypeId): Float32Array {
    return this.assets[type].hull;
  }

  /** 分配一个 instance。本关内不回收 —— 见文件头的硬规矩 */
  allocate(type: PieceTypeId): number {
    const idx = this.used[type];
    this.used[type] += 1;
    return idx;
  }

  write(type: PieceTypeId, instance: number, pos: THREE.Vector3, quat: THREE.Quaternion, scale = 1) {
    this.tmpScale.setScalar(scale);
    this.tmpMatrix.compose(pos, quat, this.tmpScale);
    this.meshes[type].setMatrixAt(instance, this.tmpMatrix);
    this.dirty[type] = true;
  }

  hide(type: PieceTypeId, instance: number) {
    this.tmpMatrix.makeScale(0, 0, 0);
    this.tmpMatrix.setPosition(0, HIDDEN_Y, 0);
    this.meshes[type].setMatrixAt(instance, this.tmpMatrix);
    this.dirty[type] = true;
  }

  /** 每帧末尾调一次,把这一帧改过的矩阵提交给 GPU */
  commit() {
    this.meshes.forEach((mesh, i) => {
      if (!this.dirty[i]) return;
      mesh.instanceMatrix.needsUpdate = true;
      this.dirty[i] = false;
    });
  }

  // ---------------------------------------------------------------- 拾取与高亮

  raycast(raycaster: THREE.Raycaster): FieldHit | null {
    const hits = raycaster.intersectObjects(this.meshes, false);
    for (const hit of hits) {
      if (hit.instanceId === undefined) continue;
      const type = hit.object.userData.typeId as PieceTypeId | undefined;
      if (type === undefined) continue;
      return { type, instance: hit.instanceId };
    }
    return null;
  }

  /** 按下时的反馈:描边 + 放大 + 上浮。松手才生效,所以这只是「我按到了它」 */
  showOutline(type: PieceTypeId, pos: THREE.Vector3, quat: THREE.Quaternion) {
    this.outline.geometry = this.assets[type].geometry;
    this.outline.position.copy(pos);
    this.outline.position.y += PICK.pressLift;
    this.outline.quaternion.copy(quat);
    this.outline.scale.setScalar(PICK.pressScale);
    this.outline.visible = true;
  }

  hideOutline() {
    this.outline.visible = false;
  }

  // ---------------------------------------------------------------- 消除表现

  showClearing(slot: number, type: PieceTypeId, pos: THREE.Vector3, quat: THREE.Quaternion, scale: THREE.Vector3) {
    const mesh = this.clearing[slot];
    if (!mesh) return;
    mesh.geometry = this.assets[type].geometry;
    mesh.material = this.assets[type].material;
    mesh.position.copy(pos);
    mesh.quaternion.copy(quat);
    mesh.scale.copy(scale);
    mesh.visible = true;
  }

  hideClearing() {
    for (const mesh of this.clearing) mesh.visible = false;
  }

  /** 重开一关:所有 instance 藏起来,分配计数归零 */
  reset() {
    PIECE_TYPES.forEach((type) => {
      for (let k = 0; k < this.used[type.id]; k += 1) this.hide(type.id, k);
      this.used[type.id] = 0;
    });
    this.hideOutline();
    this.hideClearing();
    this.commit();
  }

  /** 注意:geometry 和 material 归 assets 所有,由 disposeAssets 释放,这里不碰 */
  dispose() {
    for (const mesh of this.meshes) {
      this.scene.remove(mesh);
      mesh.dispose();
    }
    this.scene.remove(this.outline);
    for (const mesh of this.clearing) this.scene.remove(mesh);
    this.outlineMaterial.dispose();
  }
}
