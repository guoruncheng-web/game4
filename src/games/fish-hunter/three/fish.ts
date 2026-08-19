/**
 * 一条鱼的实例:模型 + 骨骼动画 + 朝向。
 *
 * 位置仍然由 `sim/fish.ts` 的纯函数每帧求值(DESIGN §3.2),这一层只负责把
 * 算出来的 (x, y, angle) 摆到场景里 —— **3D 化没有改变任何判定**,
 * 换掉的只是"怎么画"。
 */

import * as THREE from 'three';
import type { FishKind } from '../config';
import type { FishAsset } from './assets';
import { instantiateFish } from './assets';
import { LAYER } from './stage';

export class FishActor {
  /** 外层:负责位置和朝向(绕 Z 转) */
  readonly pivot = new THREE.Group();
  /** 内层:负责左右转身(绕 Y 转 180°) */
  private readonly yaw = new THREE.Group();
  private readonly mixer: THREE.AnimationMixer | null;
  private readonly meshes: THREE.Mesh[] = [];
  private flashUntil = 0;

  constructor(asset: FishAsset, spec: FishKind, seed: number) {
    const { object, mixer, action } = instantiateFish(asset);
    this.mixer = mixer;

    // 模型身高归一到 1,这里放大到设计尺寸
    object.scale.setScalar(spec.height);
    this.yaw.add(object);
    this.pivot.add(this.yaw);
    this.pivot.position.z = spec.value >= 80 ? LAYER.fish + 2 : LAYER.fish;

    if (action) {
      // 摆尾快慢跟着游速走。慢吞吞的海龟和窜来窜去的鲨鱼用同一个节奏会立刻露馅
      action.timeScale = Math.min(2.2, Math.max(0.55, spec.speed / 95));
      // **每条鱼从不同的相位起步。** 不这么做的话,同时生成的一群鱼会
      // 分毫不差地一起摆尾,像列队体操
      this.mixer?.setTime((seed % (Math.PI * 2)) / (Math.PI * 2) * 4);
    }

    object.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (mesh.isMesh) this.meshes.push(mesh);
    });
  }

  get object(): THREE.Object3D {
    return this.pivot;
  }

  /**
   * 摆位。
   *
   * angle 是 sim 里的朝向(x 右、**y 下**),而世界坐标把 y 翻了过来,
   * 所以绕 Z 的转角是 -angle。朝左时不用负缩放镜像,而是**整条鱼绕 Y 轴转 180°** ——
   * 模型是双面壳、两面贴同一张图,转过去照样是正的,而且不会像负缩放那样
   * 把法线弄反、让光照翻脸。
   */
  update(x: number, y: number, angle: number, dt: number): void {
    this.pivot.position.x = x;
    this.pivot.position.y = -y;

    const left = Math.cos(angle) < 0;
    this.yaw.rotation.y = left ? Math.PI : 0;
    this.pivot.rotation.z = left ? Math.PI - angle : -angle;

    this.mixer?.update(dt);

    if (this.flashUntil && performance.now() > this.flashUntil) {
      this.flashUntil = 0;
      this.setEmissive(0x000000, 0);
    }
  }

  /** 被网罩住但没捞中:闪一下白。纯表现,不改任何状态 */
  flash(): void {
    if (this.flashUntil) return;
    this.flashUntil = performance.now() + 90;
    this.setEmissive(0xffffff, 0.85);
  }

  private setEmissive(color: number, intensity: number): void {
    for (const mesh of this.meshes) {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (!mat.emissive) continue;
      mat.emissive.setHex(color);
      mat.emissiveIntensity = intensity;
    }
  }

  /**
   * 被捞走:放大 + 淡出。
   *
   * 淡出必须临时打开 transparent —— 平时是 alphaTest 模式(assets.ts 里解释过为什么),
   * 那个模式下改 opacity 是没有效果的。反正只持续 260ms,不会引起排序问题。
   */
  vanish(onDone: () => void): void {
    for (const mesh of this.meshes) {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.transparent = true;
      mat.depthWrite = false;
    }
    const start = performance.now();
    const tick = () => {
      const k = Math.min(1, (performance.now() - start) / 260);
      const scale = 1 + k * 0.5;
      this.yaw.scale.setScalar(scale);
      for (const mesh of this.meshes) {
        (mesh.material as THREE.MeshStandardMaterial).opacity = 1 - k;
      }
      if (k < 1) requestAnimationFrame(tick);
      else onDone();
    };
    tick();
  }

  dispose(): void {
    this.pivot.removeFromParent();
    for (const mesh of this.meshes) {
      (mesh.material as THREE.Material).dispose();
    }
  }
}
