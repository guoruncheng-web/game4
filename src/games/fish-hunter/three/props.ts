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

/** 炮台模型的底座半径是 1,这里放大到设计尺寸 */
const CANNON_SCALE = 46;

export class CannonActor {
  readonly object: THREE.Object3D;
  private readonly turret: THREE.Object3D | null;
  private readonly up: boolean;
  private recoil = 0;

  constructor(proto: THREE.Object3D, seat: number) {
    const spec = SEATS[seat];
    const { object, turret } = instantiateCannon(proto, SEAT_COLORS[seat]);
    this.object = object;
    this.turret = turret;
    this.up = spec.up;

    object.scale.setScalar(CANNON_SCALE);
    object.position.set(spec.x, -spec.y, LAYER.cannon);
    // 上排座位整体倒过来:模型的炮口是朝 +Y 造的(build_props.py 的坐标系说明)
    if (!spec.up) object.rotation.z = Math.PI;
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
