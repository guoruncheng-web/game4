/**
 * 特效层。
 *
 * 和 2D 版一样守住那条边界:**特效不做任何判定**。罩住谁、捞中谁一律以服务端
 * 消息为准(DESIGN §3.1),这里只负责把已经发生的事说清楚。
 *
 * 实现上全部是加色混合的简单几何 + 一个统一的时间轴:每个效果注册一个
 * `(k: 0→1) => void` 的推进函数,到点自己回收。不用粒子系统 ——
 * 同屏效果最多几十个,一个数组够了,而粒子系统要么常驻发射器(会越攒越多)、
 * 要么每次新建(比几何本身还贵)。
 */

import * as THREE from 'three';
import { LAYER } from './stage';

type Track = { life: number; age: number; step: (k: number) => void; done: () => void };

/** 圆环:涟漪、冲击波。共用一份几何,省掉每次效果的顶点上传 */
const RING_GEO = new THREE.RingGeometry(0.86, 1, 32);
const DISC_GEO = new THREE.CircleGeometry(1, 24);
const DROP_GEO = new THREE.SphereGeometry(1, 6, 5);

export class Fx {
  private readonly tracks: Track[] = [];

  constructor(private readonly scene: THREE.Scene) {}

  private add(object: THREE.Object3D, life: number, step: (k: number) => void): void {
    this.scene.add(object);
    this.tracks.push({
      life, age: 0, step,
      done: () => {
        object.removeFromParent();
        object.traverse((n) => {
          const mesh = n as THREE.Mesh;
          if (mesh.isMesh) (mesh.material as THREE.Material).dispose();
        });
      },
    });
  }

  private additive(geo: THREE.BufferGeometry, color: number, opacity: number): THREE.Mesh {
    return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      color, transparent: true, opacity,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
  }

  /** 炮口闪光。开炮的第一反馈,必须在按下的那一帧就出现 */
  muzzle(x: number, y: number, angle: number, color: number, level: number): void {
    const flash = this.additive(DISC_GEO, color, 0.9);
    flash.position.set(x + Math.cos(angle) * 42, -(y + Math.sin(angle) * 42), LAYER.fx);
    const size = 16 + level * 2;
    this.add(flash, 0.12, (k) => {
      flash.scale.setScalar(size * (1 + k * 1.6));
      (flash.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k);
    });
  }

  /** 网炸开:涟漪 + 四散的水珠 */
  splash(x: number, y: number, radius: number, color: number): void {
    const ring = this.additive(RING_GEO, color, 0.75);
    ring.position.set(x, -y, LAYER.fishBack);
    this.add(ring, 0.4, (k) => {
      ring.scale.setScalar(radius * (0.5 + k * 1.9));
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.75 * (1 - k);
    });

    const drops = new THREE.Group();
    drops.position.set(x, -y, LAYER.fx);
    const dirs: THREE.Vector3[] = [];
    for (let i = 0; i < 7; i += 1) {
      const drop = this.additive(DROP_GEO, color, 0.85);
      drop.scale.setScalar(3.5);
      drops.add(drop);
      const a = (i / 7) * Math.PI * 2 + Math.random();
      const speed = 70 + Math.random() * 120;
      dirs.push(new THREE.Vector3(Math.cos(a) * speed, Math.sin(a) * speed, 0));
    }
    this.add(drops, 0.34, (k) => {
      drops.children.forEach((child, i) => {
        child.position.copy(dirs[i]).multiplyScalar(k);
        (( child as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - k);
        child.scale.setScalar(3.5 * (1 - k * 0.7));
      });
    });
  }

  /** 捕获光爆。别人捞到的只给一个小闪 —— 画面不能被别人的收益抢走 */
  catchBurst(x: number, y: number, color: number, big: boolean, mine: boolean): void {
    const scale = (big ? 1.7 : 1) * (mine ? 1 : 0.5);

    const glow = this.additive(DISC_GEO, color, mine ? 0.95 : 0.5);
    glow.position.set(x, -y, LAYER.fx);
    this.add(glow, 0.34, (k) => {
      glow.scale.setScalar(26 * scale * (1 + k * 1.6));
      (glow.material as THREE.MeshBasicMaterial).opacity = (mine ? 0.95 : 0.5) * (1 - k);
    });

    const shock = this.additive(RING_GEO, color, 0.85);
    shock.position.set(x, -y, LAYER.fx);
    this.add(shock, 0.42, (k) => {
      shock.scale.setScalar(20 * scale + k * 105 * scale);
      (shock.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - k);
    });

    if (!mine) return;

    const sparks = new THREE.Group();
    sparks.position.set(x, -y, LAYER.fx + 1);
    const count = big ? 16 : 9;
    const dirs: THREE.Vector3[] = [];
    for (let i = 0; i < count; i += 1) {
      const spark = this.additive(DROP_GEO, i % 3 === 0 ? 0xffffff : color, 1);
      spark.scale.setScalar(big ? 5 : 3.4);
      sparks.add(spark);
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.6;
      const speed = 110 + Math.random() * 170;
      dirs.push(new THREE.Vector3(Math.cos(a) * speed, Math.sin(a) * speed, 0));
    }
    this.add(sparks, big ? 0.62 : 0.44, (k) => {
      sparks.children.forEach((child, i) => {
        // 带一点减速,粒子才像被水阻着,而不是在真空里飞
        const ease = 1 - (1 - k) * (1 - k);
        child.position.copy(dirs[i]).multiplyScalar(ease);
        ((child as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 1 - k;
      });
    });
  }

  /** 金币飞向自己的炮台。收益要有去向,直接跳数字会让人不知道钱从哪来 */
  coins(fromX: number, fromY: number, toX: number, toY: number, count: number): void {
    const group = new THREE.Group();
    group.position.z = LAYER.fx + 2;
    const offsets: number[] = [];
    for (let i = 0; i < count; i += 1) {
      const coin = this.additive(DISC_GEO, 0xf7c948, 1);
      coin.scale.setScalar(7);
      group.add(coin);
      offsets.push(i * 0.09);
    }
    this.add(group, 0.62, (k) => {
      group.children.forEach((child, i) => {
        const t = Math.min(1, Math.max(0, (k - offsets[i]) / (1 - offsets[i] || 1)));
        const ease = t * t;
        child.position.set(
          fromX + (toX - fromX) * ease + Math.sin(t * Math.PI) * (i - count / 2) * 6,
          -(fromY + (toY - fromY) * ease) + Math.sin(t * Math.PI) * 30,
          0,
        );
        ((child as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = t >= 1 ? 0 : 1;
        child.scale.setScalar(7 * (1 - t * 0.45));
      });
    });
  }

  /**
   * 大鱼进场的全屏扫光。
   * 金龙和章鱼王是这游戏仅有的两个"事件",不播报的话玩家很可能整条都错过 ——
   * 而它们正是回本的机会。
   */
  alert(width: number, height: number, color: number): void {
    const band = this.additive(DISC_GEO, color, 0.18);
    band.scale.set(width * 0.14, height, 1);
    band.position.set(-width * 0.2, -height / 2, LAYER.fx + 3);
    band.rotation.z = 0.2;
    this.add(band, 0.7, (k) => {
      band.position.x = -width * 0.2 + k * width * 1.4;
      (band.material as THREE.MeshBasicMaterial).opacity = 0.18 * Math.sin(Math.PI * k);
    });
  }

  update(dt: number): void {
    for (let i = this.tracks.length - 1; i >= 0; i -= 1) {
      const track = this.tracks[i];
      track.age += dt;
      const k = Math.min(1, track.age / track.life);
      track.step(k);
      if (k >= 1) {
        track.done();
        this.tracks.splice(i, 1);
      }
    }
  }

  dispose(): void {
    for (const track of this.tracks) track.done();
    this.tracks.length = 0;
  }
}
