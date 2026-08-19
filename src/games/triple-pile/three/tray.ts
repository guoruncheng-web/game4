/**
 * 槽位条的 3D 呈现。
 *
 * 底板是一张贴图(`public/triple-pile/scene/tray.png`,由用户提供的
 * `slot-tray-chroma.png` 抠像而来),**7 个格子是画在这张图里的**,
 * 不是代码摆出来的。所以格子的位置必须从图里量(见 `config.ts` 的 TRAY.layout),
 * 量错了就会出现「物件摆在格子外面」这种一眼看出来但很难定位的问题。
 *
 * 槽位里的物件是**真 3D mesh**(和锅里同一份 geometry),不是 2D 图标 ——
 * 造型完全一致,玩家才能把「槽位里的这个」和「锅里的那个」对上号。
 *
 * 位置每次 resize 重算:槽位要永远贴在屏幕底部,而它是世界坐标里的物件,
 * 只能靠把屏幕 NDC 反投影回世界(见 Stage.ndcToWorld)。
 */

import * as THREE from 'three';
import { TRAY } from '../config';
import type { PieceTypeId } from '../pieces';
import type { PieceAsset } from './assets';
import type { Stage } from './stage';

export class TrayView {
  private readonly board: THREE.Mesh;
  private readonly boardMaterial: THREE.MeshBasicMaterial;
  private readonly geometry: THREE.PlaneGeometry;
  private readonly slots: THREE.Vector3[] = [];
  /** 单个格子的世界宽度,决定物件缩放 */
  private cellWidth = 1;

  private readonly tmpLeft = new THREE.Vector3();
  private readonly tmpRight = new THREE.Vector3();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly stage: Stage,
    private readonly assets: PieceAsset[],
    texture: THREE.Texture,
  ) {
    this.geometry = new THREE.PlaneGeometry(1, 1);
    this.boardMaterial = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      // 物件是不透明的(alphaTest),先画完并写好深度;底板最后画,靠深度测试被挡住。
      // 底板自己不写深度,否则它会挡住紧贴在它前面的物件边缘
      depthWrite: false,
      toneMapped: false,
    });
    this.board = new THREE.Mesh(this.geometry, this.boardMaterial);
    this.board.frustumCulled = false;
    this.board.renderOrder = 1;
    scene.add(this.board);

    for (let i = 0; i < TRAY.slots; i += 1) this.slots.push(new THREE.Vector3());
    this.layout();
  }

  /** resize 后重算底板和 7 个格子的世界坐标 */
  layout() {
    const { camera } = this.stage;
    const { layout } = TRAY;

    // 先量出底板两端在世界里的位置,由此得到板宽
    this.stage.ndcToWorld(-TRAY.ndcHalfWidth, TRAY.ndcY, TRAY.distance, this.tmpLeft);
    this.stage.ndcToWorld(TRAY.ndcHalfWidth, TRAY.ndcY, TRAY.distance, this.tmpRight);
    const boardWidth = this.tmpLeft.distanceTo(this.tmpRight);
    const boardHeight = boardWidth / layout.aspect;
    this.cellWidth = boardWidth * layout.cellWidth;

    // 底板:比物件再往后一点,免得和物件共面打架
    const center = this.tmpLeft.clone().add(this.tmpRight).multiplyScalar(0.5);
    const backward = center.clone().sub(camera.position).normalize().multiplyScalar(TRAY.boardBehind);
    this.board.position.copy(center).add(backward);
    this.board.quaternion.copy(camera.quaternion);
    this.board.scale.set(boardWidth, boardHeight, 1);

    // 格子中心:贴图里量出来的比例,横向沿板宽插值,纵向按 slotCenterY 偏移。
    // slotCenterY 是从图的上边缘往下量的,而世界 Y 向上,所以要取反
    const step = (layout.lastSlot - layout.firstSlot) / (TRAY.slots - 1);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    const dy = (0.5 - layout.slotCenterY) * boardHeight;
    for (let i = 0; i < TRAY.slots; i += 1) {
      const t = layout.firstSlot + step * i;
      this.slots[i].lerpVectors(this.tmpLeft, this.tmpRight, t).addScaledVector(up, dy);
    }
  }

  slotPosition(i: number): THREE.Vector3 {
    return this.slots[Math.min(i, TRAY.slots - 1)];
  }

  /**
   * 某个类型在槽位里的缩放。
   *
   * **按包围球归一化**,不是统一系数:12 个模型的尺寸差了近 40%(蟹棒 1.15 vs 鱼丸 0.84),
   * 直接乘同一个系数会让槽位里大小不一,数起来费劲。归一化之后每格里的东西一样大。
   */
  pieceScale(type: PieceTypeId): number {
    const radius = this.assets[type].radius || 0.5;
    return (this.cellWidth * TRAY.pieceFill) / (radius * 2);
  }

  /**
   * 槽位里的统一陈列姿态:正面朝相机。
   *
   * 这个归位旋转是槽位可读性的全部来源 —— 而且模型的本地 +Z 就是源图的视角
   * (见 ART.md §0.2),所以正面朝相机时玩家看到的就是那张源图本身。
   */
  get displayQuaternion(): THREE.Quaternion {
    return this.stage.camera.quaternion;
  }

  /** 占到 6 格时底板转警示色。玩家的视线在锅里,需要一个不占视线的通道来告知 */
  setWarn(on: boolean) {
    this.boardMaterial.color.setHex(on ? 0xff8a72 : 0xffffff);
  }

  dispose() {
    this.scene.remove(this.board);
    this.geometry.dispose();
    this.boardMaterial.dispose();
  }
}
