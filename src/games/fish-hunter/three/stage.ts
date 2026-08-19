/**
 * 渲染舞台:渲染器、相机、灯光、水体背景。
 *
 * **坐标系是这一层最重要的约定。**
 * `sim/` 那边是一套 2D 像素坐标:x 向右 0..1280,**y 向下** 0..800(炮台在 y≈742)。
 * Three 里 y 向上。所以约定:世界坐标 = (simX, -simY, z),z 只用来分层。
 * 全场只在 `toWorld` 这一个地方做这次翻转,别处一律用 sim 坐标思考 ——
 * 两套坐标系混用是这类改造最容易埋的雷。
 *
 * 相机用**正交**而不是透视:玩法判定全是 2D 圆形(网罩住谁、鱼在哪),
 * 一旦有透视,屏幕上看到的位置就不等于判定用的位置,越靠边差得越多。
 * 正交相机下"看到的"和"算的"永远是同一套坐标。3D 换来的是模型的体积感和骨骼动画,
 * 不是透视。
 */

import * as THREE from 'three';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';

/** 分层用的 z。数越大越靠近相机 */
export const LAYER = {
  water: -60,
  caustics: -40,
  fishBack: -10,
  fish: 0,
  bullet: 20,
  fx: 30,
  cannon: 40,
} as const;

export function toWorld(x: number, y: number, z = 0): THREE.Vector3 {
  return new THREE.Vector3(x, -y, z);
}

export class Stage {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.OrthographicCamera;
  readonly renderer: THREE.WebGLRenderer;
  private readonly parent: HTMLElement;
  private readonly caustics: THREE.Mesh[] = [];
  private waterPlane: THREE.Mesh | null = null;
  /** 上排座位(2/3)整个相机转 180°,自己那门炮就永远在屏幕下方 */
  private flipped = false;
  private readonly onResize = () => this.resize();
  private readonly resizeObserver: ResizeObserver | null;

  constructor(parent: HTMLElement) {
    this.parent = parent;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setClearColor(0x021320, 1);
    // 2.5 能覆盖主流高 DPR 横屏手机；鱼贴图已经升到 1024，继续卡 2 会被浏览器二次放大。
    this.renderer.setPixelRatio(Math.min(2.5, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    parent.append(this.renderer.domElement);
    this.renderer.domElement.style.display = 'block';
    // setSize(..., false) 只改绘图缓冲。若不单独固定 CSS 尺寸，DPR=2 时 canvas
    // 会以 2 倍宽高参与布局再被父容器裁掉，所有视觉与 pointer 坐标都会错位。
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.touchAction = 'none';

    // 相机本体放在鱼池中心，投影范围使用相对中心的对称坐标。
    // 这样上排座位旋转 180° 时会真正绕鱼池中心转，而不是绕世界原点把画面甩偏。
    this.camera = new THREE.OrthographicCamera(
      -GAME_WIDTH / 2, GAME_WIDTH / 2,
      GAME_HEIGHT / 2, -GAME_HEIGHT / 2,
      1, 2000,
    );
    this.camera.position.set(GAME_WIDTH / 2, -GAME_HEIGHT / 2, 800);
    this.scene.add(this.camera);

    this.buildLights();
    this.buildWater();
    this.resize();
    window.addEventListener('resize', this.onResize);
    this.resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(this.onResize);
    this.resizeObserver?.observe(parent);
  }

  private buildLights(): void {
    // 半球光给水下那种"上亮下暗"的底子,方向光负责让模型有明暗面
    this.scene.add(new THREE.HemisphereLight(0x9fe8ff, 0x03202e, 2.1));
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(-0.4, 1, 1.6);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x66d9ff, 0.7);
    rim.position.set(0.8, -0.6, 0.6);
    this.scene.add(rim);
  }

  private buildWater(): void {
    // 背景是一张竖直渐变。用顶点色而不是贴图 —— 四个顶点就够了,省一次纹理上传
    const geo = new THREE.PlaneGeometry(GAME_WIDTH, GAME_HEIGHT);
    const material = new THREE.MeshBasicMaterial({ color: 0x073453 });
    const plane = new THREE.Mesh(geo, material);
    plane.position.copy(toWorld(GAME_WIDTH / 2, GAME_HEIGHT / 2, LAYER.water));
    this.waterPlane = plane;
    this.scene.add(plane);

    new THREE.TextureLoader().load('/fish-hunter/background-hd.png?v=2', (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.magFilter = THREE.LinearFilter;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.generateMipmaps = true;
      texture.anisotropy = 8;
      material.color.setHex(0xffffff);
      material.map = texture;
      material.needsUpdate = true;
    });

    // 背景图本身已经带水纹和光束，不再叠加程序化大椭圆。
    // 两套焦散同时存在会变成截图里那种横跨半屏的灰蓝色块。
  }

  /** 光斑漂移。t 用本地时钟就行 —— 它不参与任何判定,不需要和服务端对齐 */
  update(t: number): void {
    for (const patch of this.caustics) {
      const p = patch.userData.phase as number;
      patch.position.x = (patch.userData.baseX as number) + Math.sin(t * 0.00013 + p) * 90;
      patch.position.y = (patch.userData.baseY as number) + Math.cos(t * 0.00009 + p) * 26;
      (patch.material as THREE.MeshBasicMaterial).opacity = 0.045 + 0.035 * (0.5 + 0.5 * Math.sin(t * 0.0004 + p));
    }
  }

  /**
   * 铺满容器,同时**保证 1280×800 的鱼池完整可见**。
   *
   * 容器比例和鱼池不一致时,沿短边留白而不是裁掉 —— 裁掉意味着某个座位的炮台
   * 跑到屏幕外,那个人就没法玩了。这一点比"铺满好看"重要得多。
   */
  resize(): void {
    // mobile Safari 在旋转和地址栏收起的过渡期里，clientWidth/clientHeight
    // 可能仍是旋转前的逻辑尺寸；renderer 会按 CSS 实际边界被拉伸，导致相机
    // 仍按旧比例投影（炮台就会被挤到左下角）。getBoundingClientRect 是最终
    // 参与合成的尺寸，优先用它，和 pointerToSim 的坐标基准也完全一致。
    const rect = this.parent.getBoundingClientRect();
    const w = Math.round(rect.width) || this.parent.clientWidth || window.innerWidth;
    const h = Math.round(rect.height) || this.parent.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);

    const want = GAME_WIDTH / GAME_HEIGHT;
    const got = w / h;
    let viewW = GAME_WIDTH;
    let viewH = GAME_HEIGHT;
    if (got > want) viewW = GAME_HEIGHT * got;   // 屏幕更宽 → 左右多露一点水
    else viewH = GAME_WIDTH / got;               // 屏幕更高 → 上下多露一点水

    // 背景按 cover 铺满相机视野。鱼和炮台仍使用 1280×800 逻辑坐标，
    // 只有背景放大，因此超宽手机不会出现黑边，也不会拉伸玩法坐标。
    // 高清图是 16:10，与逻辑鱼池同宽高比；统一缩放即可完整铺满扩展视野。
    const backgroundScale = Math.max(viewW / GAME_WIDTH, viewH / GAME_HEIGHT);
    this.waterPlane?.scale.setScalar(backgroundScale);

    this.camera.left = -viewW / 2;
    this.camera.right = viewW / 2;
    this.camera.top = viewH / 2;
    this.camera.bottom = -viewH / 2;
    this.camera.updateProjectionMatrix();
  }

  /**
   * 上排座位把相机倒过来。
   *
   * **转相机而不是转坐标**:鱼、网、金币的位置全是服务端那套共享坐标,
   * 一旦在本地重映射,自己画的弹道和服务端算的落点就会对不上。
   * 3D 这边比 2D 还省事 —— HUD 挂在 DOM 上,不用跟着反转补正。
   */
  setFlipped(flipped: boolean): void {
    this.flipped = flipped;
    this.camera.rotation.z = flipped ? Math.PI : 0;
  }

  /** 屏幕坐标 → sim 坐标。瞄准要用 */
  pointerToSim(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const u = (clientX - rect.left) / rect.width;
    const v = (clientY - rect.top) / rect.height;
    let x = this.camera.left + u * (this.camera.right - this.camera.left);
    let y = this.camera.top - v * (this.camera.top - this.camera.bottom);
    if (this.flipped) {
      x = -x;
      y = -y;
    }
    return {
      x: this.camera.position.x + x,
      y: -(this.camera.position.y + y),
    };
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  destroy(): void {
    window.removeEventListener('resize', this.onResize);
    this.resizeObserver?.disconnect();
    if (this.waterPlane) {
      this.waterPlane.geometry.dispose();
      const material = this.waterPlane.material as THREE.MeshBasicMaterial;
      material.map?.dispose();
      material.dispose();
      this.waterPlane = null;
    }
    this.renderer.domElement.remove();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
