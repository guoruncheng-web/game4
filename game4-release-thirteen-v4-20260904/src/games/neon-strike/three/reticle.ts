import * as THREE from 'three';
import { AIM } from '../config';

const IDLE = 0x54ecff;
const LOCKED = 0xffb04a;

/**
 * 准星与锁定框。
 *
 * 解决的是纵深射击的老问题:相机在战机后上方俯视,玩家在屏幕上看到的"对齐"
 * 和世界坐标里的对齐差着一个视差,没有参照物就只能靠猜。
 * 这两个环画在弹道本身上(战机正前方的两个纵深),等于把不可见的弹道显形出来 ——
 * 它不是"辅助信息",它就是真值:敌机穿过环心 = 子弹必然经过它。
 *
 * 双环而不是单环:一近一远两个圈在透视下形成一条通道,玩家能读出弹道的方向,
 * 单个圈只能读出一个点。
 */
export class Reticle {
  private group = new THREE.Group();
  private near: THREE.Mesh;
  private far: THREE.Mesh;
  /** 锁定框贴在目标机身上,四个角标,不用整圈——整圈会盖住敌机本体 */
  private lock = new THREE.Group();
  private lockMaterial: THREE.MeshBasicMaterial;
  private materials: THREE.MeshBasicMaterial[] = [];
  private disposables: Array<{ dispose(): void }> = [];
  private spin = 0;

  constructor(private readonly parent: THREE.Object3D) {
    this.near = this.makeRing(0.42, 0.5, 24);
    this.far = this.makeRing(0.72, 0.8, 32);
    // 远环加四道刻度,让"通道"的朝向在快速走位时也读得出来
    const ticks = this.makeTicks(0.92, 1.25);
    this.far.add(ticks);

    this.lockMaterial = new THREE.MeshBasicMaterial({
      color: LOCKED, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false,
    });
    this.disposables.push(this.lockMaterial);
    this.buildLockCorners();
    this.lock.visible = false;

    this.group.add(this.near, this.far, this.lock);
    this.group.renderOrder = 5;
    parent.add(this.group);
  }

  private makeRing(inner: number, outer: number, segments: number) {
    const geometry = new THREE.RingGeometry(inner, outer, segments);
    const material = new THREE.MeshBasicMaterial({
      color: IDLE, transparent: true, opacity: 0.5, side: THREE.DoubleSide,
      // 关掉深度测试:准星被敌机挡住的瞬间恰恰是最需要看清它的时候
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false,
    });
    this.materials.push(material);
    this.disposables.push(geometry, material);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    return mesh;
  }

  private makeTicks(inner: number, outer: number) {
    const group = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const geometry = new THREE.PlaneGeometry(outer - inner, 0.05);
      const material = new THREE.MeshBasicMaterial({
        color: IDLE, transparent: true, opacity: 0.45,
        blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false,
      });
      this.materials.push(material);
      this.disposables.push(geometry, material);
      const tick = new THREE.Mesh(geometry, material);
      const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
      tick.position.set(Math.cos(angle) * (inner + outer) / 2, Math.sin(angle) * (inner + outer) / 2, 0);
      tick.rotation.z = angle;
      tick.frustumCulled = false;
      group.add(tick);
    }
    return group;
  }

  private buildLockCorners() {
    const arm = 0.55, thick = 0.09, reach = 1.15;
    for (let i = 0; i < 4; i++) {
      const sx = i % 2 === 0 ? -1 : 1;
      const sy = i < 2 ? 1 : -1;
      const horizontal = new THREE.PlaneGeometry(arm, thick);
      const vertical = new THREE.PlaneGeometry(thick, arm);
      this.disposables.push(horizontal, vertical);
      const h = new THREE.Mesh(horizontal, this.lockMaterial);
      const v = new THREE.Mesh(vertical, this.lockMaterial);
      h.position.set(sx * (reach - arm / 2), sy * reach, 0);
      v.position.set(sx * reach, sy * (reach - arm / 2), 0);
      h.frustumCulled = false;
      v.frustumCulled = false;
      this.lock.add(h, v);
    }
  }

  /**
   * @param x/@param y  战机所在的走位平面坐标,弹道从这里出发
   * @param baseZ       战机所在的纵深
   * @param target      当前软锁定的目标位置,没有就传 null
   */
  update(dt: number, x: number, y: number, baseZ: number, target: THREE.Vector3 | null) {
    this.spin += dt * (target ? 2.6 : 0.7);
    this.near.position.set(x, y, baseZ - AIM.nearZ);
    this.far.position.set(x, y, baseZ - AIM.farZ);
    this.far.rotation.z = this.spin;

    const color = target ? LOCKED : IDLE;
    // 锁定时整体提亮并轻微脉动:开火有没有咬住目标,余光就能读出来
    const pulse = target ? 0.72 + Math.sin(this.spin * 3) * 0.14 : 0.42;
    for (const material of this.materials) {
      material.color.setHex(color);
      material.opacity = pulse;
    }
    this.near.scale.setScalar(target ? 1.18 : 1);

    this.lock.visible = !!target;
    if (target) {
      this.lock.position.copy(target);
      // 距离越远角标越大,抵消透视缩小,始终看得见
      const depth = Math.max(1, baseZ - target.z);
      this.lock.scale.setScalar(0.55 + depth * 0.016);
      this.lockMaterial.opacity = pulse;
    }
  }

  dispose() {
    this.parent.remove(this.group);
    for (const item of this.disposables) item.dispose();
  }
}
