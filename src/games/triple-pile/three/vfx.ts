/**
 * 粒子与冲击波。整个文件只有 3 个 draw call(主粒子 / 火花 / 冲击波环)。
 *
 * 唯一的外部资源是那张 64×64 的软圆点 —— 运行时用 CanvasTexture 画出来,
 * 不占任何静态文件。这是本作允许的唯一一处「贴图」。
 */

import * as THREE from 'three';

const MAIN_CAPACITY = 180;
const SPARK_CAPACITY = 120;

function softDot(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.65)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

type Pool = {
  points: THREE.Points;
  geometry: THREE.BufferGeometry;
  material: THREE.PointsMaterial;
  position: Float32Array;
  color: Float32Array;
  velocity: Float32Array;
  life: Float32Array;
  maxLife: Float32Array;
  capacity: number;
  cursor: number;
};

function makePool(scene: THREE.Scene, capacity: number, texture: THREE.Texture, additive: boolean, size: number): Pool {
  const position = new Float32Array(capacity * 3);
  const color = new Float32Array(capacity * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
  const material = new THREE.PointsMaterial({
    size, map: texture, vertexColors: true, transparent: true,
    depthWrite: false, sizeAttenuation: true,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  scene.add(points);
  // 一开始全部塞到画面外,免得开局第一帧在原点闪一片
  for (let i = 0; i < capacity; i += 1) position[i * 3 + 1] = -500;
  return {
    points, geometry, material, position, color,
    velocity: new Float32Array(capacity * 3),
    life: new Float32Array(capacity),
    maxLife: new Float32Array(capacity),
    capacity, cursor: 0,
  };
}

const tmp = new THREE.Color();

export class Vfx {
  private readonly texture: THREE.Texture;
  private readonly main: Pool;
  private readonly spark: Pool;
  private readonly ring: THREE.Mesh;
  private readonly ringGeometry: THREE.RingGeometry;
  private readonly ringMaterial: THREE.MeshBasicMaterial;
  private ringLife = 0;

  /** 消除时的柔光斑,三个一组(一次消三个) */
  private readonly flashes: THREE.Mesh[] = [];
  private readonly flashGeometry: THREE.PlaneGeometry;
  private readonly flashMaterial: THREE.MeshBasicMaterial;
  private readonly flashLife = new Float32Array(3);
  private readonly flashMax = new Float32Array(3);
  private flashCursor = 0;

  constructor(private readonly scene: THREE.Scene) {
    this.texture = softDot();
    // 颗粒尺寸:食材本身约 1 个单位,0.26 的粒子有食材的四分之一大 —— 那不是颗粒,是团。
    // 压到 0.09 才读得出「碎屑」,数量相应提上去
    this.main = makePool(scene, MAIN_CAPACITY, this.texture, false, 0.09);
    this.spark = makePool(scene, SPARK_CAPACITY, this.texture, true, 0.065);

    this.ringGeometry = new THREE.RingGeometry(0.86, 1, 24);
    this.ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xffd98a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.ring = new THREE.Mesh(this.ringGeometry, this.ringMaterial);
    this.ring.visible = false;
    this.ring.frustumCulled = false;
    scene.add(this.ring);

    this.flashGeometry = new THREE.PlaneGeometry(1, 1);
    this.flashMaterial = new THREE.MeshBasicMaterial({
      map: this.texture, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, toneMapped: false, color: 0xffe6b8,
    });
    for (let i = 0; i < 3; i += 1) {
      const mesh = new THREE.Mesh(this.flashGeometry, this.flashMaterial);
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 2;
      this.flashes.push(mesh);
      scene.add(mesh);
    }
  }

  /**
   * 食材砸进汤里溅起的汤滴。
   *
   * **波浪不在这里** —— 涟漪是汤面本身的顶点位移(见 stage.ts 的 splash),
   * 不是铺在汤面上的一圈环。用环 mesh 做涟漪既假(它就是个贴片),
   * 又会和半透明的汤面共面叠出暗环。
   */
  splash(x: number, y: number, z: number, strength: number) {
    const power = THREE.MathUtils.clamp(strength, 0.25, 1.6);
    // 数量随力度走,最少也有两三滴,否则轻轻落下时会显得「什么都没发生」
    const drops = Math.round(3 + power * 5);
    for (let k = 0; k < drops; k += 1) {
      this.emit(this.main, x, y, z, 0xfff6e8, 1.1 + power * 1.4, 0.34);
    }
  }

  private emit(pool: Pool, x: number, y: number, z: number, hex: number, speed: number, life: number) {
    const i = pool.cursor;
    pool.cursor = (pool.cursor + 1) % pool.capacity;
    pool.position[i * 3 + 0] = x;
    pool.position[i * 3 + 1] = y;
    pool.position[i * 3 + 2] = z;
    tmp.setHex(hex, THREE.SRGBColorSpace);
    pool.color[i * 3 + 0] = tmp.r;
    pool.color[i * 3 + 1] = tmp.g;
    pool.color[i * 3 + 2] = tmp.b;
    // 球面均匀方向
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const s = speed * (0.5 + Math.random() * 0.7);
    pool.velocity[i * 3 + 0] = Math.sin(phi) * Math.cos(theta) * s;
    pool.velocity[i * 3 + 1] = Math.abs(Math.cos(phi)) * s + 0.6;
    pool.velocity[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * s;
    pool.life[i] = life;
    pool.maxLife[i] = life;
  }

  /**
   * 三消爆炸。碎屑取该类型的基色,这样炸出来的还是「那样食材」的颜色。
   * 闪光单独走一层加色的柔光斑,而不是把食材本身刷成纯白 ——
   * 刷白会让它在最后一刻变成一坨白团,那正是「假」的来源。
   */
  burst(pos: THREE.Vector3, hex: number) {
    for (let i = 0; i < 22; i += 1) this.emit(this.main, pos.x, pos.y, pos.z, hex, 1.9, 0.42);
    for (let i = 0; i < 10; i += 1) this.emit(this.spark, pos.x, pos.y, pos.z, 0xfff0c0, 3.0, 0.26);
    this.flash(pos);
  }

  /** 一团快速涨开又消失的柔光,正对相机 */
  flash(pos: THREE.Vector3) {
    const slot = this.flashCursor;
    this.flashCursor = (this.flashCursor + 1) % this.flashes.length;
    const mesh = this.flashes[slot];
    mesh.position.copy(pos);
    mesh.visible = true;
    this.flashLife[slot] = 0.18;
    this.flashMax[slot] = 0.18;
  }

  /** 拾取飞行的尾迹 */
  trail(pos: THREE.Vector3, hex: number) {
    this.emit(this.main, pos.x, pos.y, pos.z, hex, 0.5, 0.22);
  }

  private ringQuaternion = new THREE.Quaternion();
  /** 冲击波环要正对相机,由外部每帧灌入相机朝向 */
  faceCamera(q: THREE.Quaternion) {
    this.ringQuaternion.copy(q);
  }

  update(dt: number) {
    for (const pool of [this.main, this.spark]) {
      let alive = false;
      for (let i = 0; i < pool.capacity; i += 1) {
        if (pool.life[i] <= 0) continue;
        alive = true;
        pool.life[i] -= dt;
        if (pool.life[i] <= 0) {
          pool.position[i * 3 + 1] = -500;
          continue;
        }
        pool.velocity[i * 3 + 1] -= 6 * dt;
        pool.position[i * 3 + 0] += pool.velocity[i * 3 + 0] * dt;
        pool.position[i * 3 + 1] += pool.velocity[i * 3 + 1] * dt;
        pool.position[i * 3 + 2] += pool.velocity[i * 3 + 2] * dt;
      }
      if (alive) {
        pool.geometry.getAttribute('position').needsUpdate = true;
        pool.geometry.getAttribute('color').needsUpdate = true;
      }
      pool.material.opacity = 1;
    }

    for (let i = 0; i < this.flashes.length; i += 1) {
      if (this.flashLife[i] <= 0) continue;
      this.flashLife[i] -= dt;
      const t = Math.max(this.flashLife[i] / this.flashMax[i], 0);
      const mesh = this.flashes[i];
      if (this.flashLife[i] <= 0) {
        mesh.visible = false;
        continue;
      }
      // 涨得快、收得也快;正对相机
      mesh.quaternion.copy(this.ringQuaternion);
      mesh.scale.setScalar(0.5 + (1 - t) * 2.1);
      this.flashMaterial.opacity = t * t;
    }

    if (this.ringLife > 0) {
      this.ringLife -= dt;
      const t = Math.max(this.ringLife / 0.12, 0);
      this.ring.visible = true;
      this.ring.scale.setScalar(0.2 + (1 - t) * 1.2);
      this.ringMaterial.opacity = t * 0.8;
    } else if (this.ring.visible) {
      this.ring.visible = false;
    }
  }

  reset() {
    for (const pool of [this.main, this.spark]) {
      pool.life.fill(0);
      for (let i = 0; i < pool.capacity; i += 1) pool.position[i * 3 + 1] = -500;
      pool.geometry.getAttribute('position').needsUpdate = true;
    }
    this.ringLife = 0;
    this.ring.visible = false;
    this.flashLife.fill(0);
    for (const mesh of this.flashes) mesh.visible = false;
  }

  dispose() {
    for (const pool of [this.main, this.spark]) {
      this.scene.remove(pool.points);
      pool.geometry.dispose();
      pool.material.dispose();
    }
    this.scene.remove(this.ring);
    this.ringGeometry.dispose();
    this.ringMaterial.dispose();
    for (const mesh of this.flashes) this.scene.remove(mesh);
    this.flashGeometry.dispose();
    this.flashMaterial.dispose();
    this.texture.dispose();
  }
}
