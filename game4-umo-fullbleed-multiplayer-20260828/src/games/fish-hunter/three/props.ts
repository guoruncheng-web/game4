/**
 * 炮台与炮弹。
 *
 * 炮台模型只有一份几何,四个座位靠 `accent` 材质染色(assets.ts)。
 * 瞄准只转 `turret` 节点 —— 底座是焊在池边的,整体转会把底座也转起来。
 */

import * as THREE from 'three';
import { SEATS, SEAT_COLORS } from '../config';
import { instantiateCannon } from './assets';
import { LAYER } from './stage';

/** 手机横屏仍要能一眼认出的显示尺寸 */
const CANNON_SCALE = 60;

export class CannonActor {
  readonly object: THREE.Object3D;
  private readonly turret: THREE.Object3D | null;
  private readonly up: boolean;
  private recoil = 0;

  constructor(proto: THREE.Object3D, seat: number) {
    const spec = SEATS[seat];
    const { object } = instantiateCannon(proto, SEAT_COLORS[seat]);
    this.object = object;
    this.up = spec.up;

    // 导入模型在手机上缩小后只剩一个暗圆盘，炮管几乎看不见。隐藏 GLB 的网格，
    // 保留它的根节点和资源契约，实际显示改用固定朝向相机的高对比炮台。
    object.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh) mesh.visible = false;
    });
    this.turret = this.buildReadableCannon(object, SEAT_COLORS[seat]);
    object.scale.setScalar(CANNON_SCALE);
    object.position.set(spec.x, -spec.y, LAYER.cannon);
    // 上排座位整体倒过来:模型的炮口是朝 +Y 造的(build_props.py 的坐标系说明)
    if (!spec.up) object.rotation.z = Math.PI;
  }

  private buildReadableCannon(root: THREE.Object3D, color: number): THREE.Group {
    const base = new THREE.Group();
    const dark = new THREE.MeshBasicMaterial({ color: 0x061b29, side: THREE.DoubleSide });
    const steel = new THREE.MeshBasicMaterial({ color: 0xb8d2df, side: THREE.DoubleSide });
    const rim = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
    const glow = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });

    const outer = new THREE.Mesh(new THREE.CircleGeometry(1.28, 32), steel);
    outer.position.z = 0.04;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.12, 32), dark);
    disc.position.z = 0.06;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.88, 1.08, 32), rim);
    ring.position.z = 0.08;
    const hub = new THREE.Mesh(new THREE.CircleGeometry(0.35, 24), glow);
    hub.position.z = 0.1;
    base.add(outer, disc, ring, hub);
    root.add(base);

    const barrel = new THREE.Group();
    const outline = new THREE.Mesh(new THREE.BoxGeometry(0.72, 2.15, 0.08), steel);
    outline.position.set(0, 1.08, 0.12);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 2.02, 0.09), dark);
    body.position.set(0, 1.08, 0.15);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.72, 0.1), rim);
    stripe.position.set(0, 1.1, 0.19);
    const muzzleOuter = new THREE.Mesh(new THREE.CircleGeometry(0.43, 24), steel);
    muzzleOuter.position.set(0, 2.13, 0.2);
    const muzzle = new THREE.Mesh(new THREE.CircleGeometry(0.28, 20), glow);
    muzzle.position.set(0, 2.13, 0.22);
    barrel.add(outline, body, stripe, muzzleOuter, muzzle);
    root.add(barrel);
    return barrel;
  }

  /**
   * 瞄准。
   *
   * 模型静止时炮口朝 +Y,而 sim 里"朝上"是 angle = -π/2,
   * 所以要转的角度是 `-angle - π/2`。上排座位整体已经转了 180°,
   * 它的局部坐标里同样成立 —— 这也是为什么倒转要放在父节点上而不是揉进这里。
   */
  aim(angle: number): void {
    if (!this.turret) return;
    const local = this.up ? -angle - Math.PI / 2 : Math.PI / 2 - angle;
    this.turret.rotation.z = local;
  }

  /** 开炮后坐。数值很小 —— 大了会让炮管看着要飞出去 */
  kick(): void {
    this.recoil = 1;
  }

  update(dt: number): void {
    if (this.recoil <= 0) return;
    this.recoil = Math.max(0, this.recoil - dt * 6);
    if (this.turret) this.turret.scale.setScalar(1 - this.recoil * 0.09);
  }

  dispose(): void {
    this.object.removeFromParent();
    this.object.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      // 隐藏的 GLB 网格仍与资源原型共享 geometry；只释放本实例新建的可见几何。
      if (mesh.visible) mesh.geometry.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) material.dispose();
    });
  }
}

/**
 * 炮弹。一颗自发光的球 + 一圈外晕。
 *
 * 用球而不是模型:它在屏幕上只有十几像素,任何造型都看不出来,
 * 而且同屏最多几十颗,几何越简单越好。
 */
export function makeBullet(color: number, level: number): THREE.Object3D {
  const group = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(5 + level * 0.5, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(9 + level * 0.9, 12, 8),
    new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.45,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }),
  );
  group.add(core, halo);
  group.position.z = LAYER.bullet;
  return group;
}
