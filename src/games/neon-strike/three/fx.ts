import * as THREE from 'three';
import type { Assets, FxTexture } from './assets';

type Flash = {
  sprite: THREE.Sprite;
  /** 剩余时间 / 总时长,用来插值缩放和淡出 */
  life: number;
  total: number;
  from: number;
  to: number;
  spin: number;
};

const SPARK_COUNT = 700;

/**
 * 3D 特效池。
 *
 * 和 2D 版一样,所有特效对象一次性建好复用 —— 每次命中都 new 一个 Sprite/材质的话,
 * 一秒十几次就会攒出可感知的卡顿。这里的贴图沿用原来手绘的那套辉光图:
 * 全是黑底,加法混合下黑色即透明,不需要抠图。
 */
export class Fx {
  private flashes: Flash[] = [];
  private cursor = 0;
  private materials: Record<FxTexture, THREE.SpriteMaterial>;

  private sparks: THREE.Points;
  private sparkPos: Float32Array;
  private sparkVel: Float32Array;
  private sparkLife: Float32Array;
  private sparkColor: Float32Array;
  private sparkCursor = 0;

  private disposables: Array<{ dispose(): void }> = [];

  constructor(private readonly parent: THREE.Object3D, assets: Assets) {
    this.materials = {} as Record<FxTexture, THREE.SpriteMaterial>;
    for (const key of Object.keys(assets.fx) as FxTexture[]) {
      const material = new THREE.SpriteMaterial({
        map: assets.fx[key], blending: THREE.AdditiveBlending,
        transparent: true, depthWrite: false, depthTest: true, fog: false,
      });
      this.materials[key] = material;
      this.disposables.push(material);
    }

    // 每个池位都得有自己的材质实例:透明度是逐个特效在变的,共享材质会让整池一起淡出
    for (let i = 0; i < 26; i++) {
      const sprite = new THREE.Sprite(this.materials.impact.clone());
      sprite.visible = false;
      sprite.frustumCulled = false;
      parent.add(sprite);
      this.disposables.push(sprite.material);
      this.flashes.push({ sprite, life: 0, total: 1, from: 1, to: 1, spin: 0 });
    }

    this.sparkPos = new Float32Array(SPARK_COUNT * 3);
    this.sparkVel = new Float32Array(SPARK_COUNT * 3);
    this.sparkLife = new Float32Array(SPARK_COUNT);
    this.sparkColor = new Float32Array(SPARK_COUNT * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.sparkPos, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.sparkColor, 3));
    const material = new THREE.PointsMaterial({
      size: 0.42, sizeAttenuation: true, vertexColors: true,
      transparent: true, opacity: 0.95, depthWrite: false,
      blending: THREE.AdditiveBlending, fog: false,
    });
    this.sparks = new THREE.Points(geometry, material);
    this.sparks.frustumCulled = false;
    parent.add(this.sparks);
    this.disposables.push(geometry, material);
    // 未激活的粒子塞到画面外,不能留在原点,否则会在世界中心堆出一个亮团
    for (let i = 0; i < SPARK_COUNT; i++) this.sparkPos[i * 3 + 1] = 9999;
  }

  /** 从池里取一张特效贴图。取满一轮就复用最旧的,顶多截断一个正在淡出的特效。 */
  private take(texture: FxTexture, x: number, y: number, z: number, from: number, to: number, duration: number) {
    const slot = this.flashes[this.cursor++ % this.flashes.length];
    const material = slot.sprite.material as THREE.SpriteMaterial;
    material.map = this.materials[texture].map;
    material.needsUpdate = true;
    slot.sprite.position.set(x, y, z);
    slot.sprite.scale.setScalar(from);
    slot.sprite.material.opacity = 1;
    slot.sprite.material.rotation = Math.random() * Math.PI * 2;
    slot.sprite.visible = true;
    slot.life = duration;
    slot.total = duration;
    slot.from = from;
    slot.to = to;
    slot.spin = (Math.random() - 0.5) * 2.2;
    return slot;
  }

  laserImpact(x: number, y: number, z: number, boss: boolean) {
    const size = boss ? 2.4 : 1.5;
    this.take('impact', x, y, z, size * 0.7, size * 1.25, boss ? 0.13 : 0.17)
      .sprite.material.opacity = boss ? 0.7 : 0.95;
  }

  explosion(x: number, y: number, z: number, boss: boolean) {
    this.take(boss ? 'boomBoss' : 'boom', x, y, z, boss ? 4 : 1.6, boss ? 11 : 4.2, boss ? 0.62 : 0.33);
    // 外圈再叠一层更慢更大的冲击波,拉出层次
    this.take('boom', x, y, z, boss ? 3 : 1.2, boss ? 18 : 6, boss ? 0.78 : 0.42)
      .sprite.material.opacity = 0.45;
    this.burst(x, y, z, boss ? 90 : 26, boss ? 16 : 8, boss);
  }

  shieldImpact(x: number, y: number, z: number) {
    this.take('shield', x, y, z, 3.2, 4.4, 0.32).sprite.material.opacity = 0.9;
  }

  portal(x: number, y: number, z: number) {
    this.take('portal', x, y, z, 2, 16, 0.75).sprite.material.opacity = 0.85;
  }

  /** 火花爆发。boss=true 时颜色偏暖、速度更快 */
  burst(x: number, y: number, z: number, count: number, speed: number, hot = false) {
    for (let i = 0; i < count; i++) {
      const i3 = (this.sparkCursor % SPARK_COUNT) * 3;
      const index = this.sparkCursor % SPARK_COUNT;
      this.sparkCursor++;
      this.sparkPos[i3] = x; this.sparkPos[i3 + 1] = y; this.sparkPos[i3 + 2] = z;
      // 球面均匀取向,再乘一个随机速度,爆开的形状才是球不是十字
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const v = speed * (0.35 + Math.random() * 0.65);
      this.sparkVel[i3] = Math.sin(phi) * Math.cos(theta) * v;
      this.sparkVel[i3 + 1] = Math.sin(phi) * Math.sin(theta) * v;
      this.sparkVel[i3 + 2] = Math.cos(phi) * v;
      this.sparkLife[index] = 0.35 + Math.random() * (hot ? 0.55 : 0.3);
      const tint = hot
        ? [1, 0.45 + Math.random() * 0.5, 0.2]
        : [0.35 + Math.random() * 0.65, 0.85, 1];
      this.sparkColor[i3] = tint[0]; this.sparkColor[i3 + 1] = tint[1]; this.sparkColor[i3 + 2] = tint[2];
    }
  }

  /**
   * @param drift 世界整体的推进量。火花要跟着战场一起往身后掠,
   *              否则爆炸残骸会诡异地悬停在原地不动。
   */
  update(dt: number, drift: number) {
    for (const slot of this.flashes) {
      if (slot.life <= 0) continue;
      slot.life -= dt;
      if (slot.life <= 0) { slot.sprite.visible = false; continue; }
      const t = 1 - slot.life / slot.total;
      slot.sprite.scale.setScalar(slot.from + (slot.to - slot.from) * t);
      slot.sprite.material.opacity = (1 - t) * (1 - t);
      slot.sprite.material.rotation += slot.spin * dt;
      slot.sprite.position.z += drift;
    }

    let alive = false;
    for (let i = 0; i < SPARK_COUNT; i++) {
      if (this.sparkLife[i] <= 0) continue;
      alive = true;
      this.sparkLife[i] -= dt;
      const i3 = i * 3;
      if (this.sparkLife[i] <= 0) { this.sparkPos[i3 + 1] = 9999; continue; }
      this.sparkPos[i3] += this.sparkVel[i3] * dt;
      this.sparkPos[i3 + 1] += this.sparkVel[i3 + 1] * dt;
      this.sparkPos[i3 + 2] += this.sparkVel[i3 + 2] * dt + drift;
      // 阻尼,让火花有"炸开然后散尽"的收束感
      const damp = Math.max(0, 1 - dt * 2.2);
      this.sparkVel[i3] *= damp; this.sparkVel[i3 + 1] *= damp; this.sparkVel[i3 + 2] *= damp;
    }
    if (alive) {
      (this.sparks.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (this.sparks.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  /** 重开一局要把上一局残留的特效清干净,不然新局第一帧会闪出旧爆炸 */
  reset() {
    for (const slot of this.flashes) { slot.life = 0; slot.sprite.visible = false; }
    for (let i = 0; i < SPARK_COUNT; i++) { this.sparkLife[i] = 0; this.sparkPos[i * 3 + 1] = 9999; }
    (this.sparks.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose() {
    for (const slot of this.flashes) this.parent.remove(slot.sprite);
    this.parent.remove(this.sparks);
    for (const item of this.disposables) item.dispose();
  }
}
