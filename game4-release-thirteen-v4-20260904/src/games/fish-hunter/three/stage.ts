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
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
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
  /** 海底阴影承接面。鱼影投在这里而不是水面上(水面材质不吃阴影) */
  private seabed: THREE.Mesh | null = null;
  /** 浮游微粒。一片干净的底色上只有鱼在动,画面会像贴图;有它水体才"活" */
  private plankton: THREE.Points | null = null;
  /** 粒子的初始位置,漂移动画围绕它摆。和 positions 同一份数据,只读不写 */
  private planktonBase = new Float32Array(0);
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
    // 鱼和炮台投影到海底,去掉"贴在玻璃上"的纸片感;
    // ACES 色调映射把高光压柔和、中间调提起来,画面才有电影感而不是色块感
    this.renderer.shadowMap.enabled = true;
    // r185 起 PCFSoftShadowMap 已弃用,用 PCFShadowMap(带 2×2 滤波,足够柔和)
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
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
    this.buildEnvironment();
    this.buildWater();
    this.buildSeabed();
    this.buildCaustics();
    this.buildPlankton();
    this.resize();
    window.addEventListener('resize', this.onResize);
    this.resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(this.onResize);
    this.resizeObserver?.observe(parent);
  }

  private buildLights(): void {
    // 半球光给水下那种"上亮下暗"的底子,方向光负责让模型有明暗面
    this.scene.add(new THREE.HemisphereLight(0x9fe8ff, 0x03202e, 2.4));

    // 主光必须投影:没有阴影,鱼就像贴在玻璃上的贴纸,这是"3D 感"缺失的头号原因。
    // 阴影相机是光源视角的正交投影,默认 ±5 的范围盖不住 1280×800 的池子,
    // 必须手动扩到整个鱼池。光源 target 指向池心 —— 世界原点在左上角,不在池心
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.target.position.set(GAME_WIDTH / 2, -GAME_HEIGHT / 2, 0);
    key.position.set(GAME_WIDTH / 2 - 260, -GAME_HEIGHT / 2 + 420, 850);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -GAME_WIDTH / 2 - 120;
    key.shadow.camera.right = GAME_WIDTH / 2 + 120;
    key.shadow.camera.top = GAME_HEIGHT / 2 + 120;
    key.shadow.camera.bottom = -GAME_HEIGHT / 2 - 120;
    key.shadow.camera.near = 300;
    key.shadow.camera.far = 1600;
    key.shadow.bias = -0.0004;
    this.scene.add(key.target);
    this.scene.add(key);

    // 背面补冷色轮廓光,把鱼身从背景里"勾"出来。
    // 背景变亮之后这是鱼和背景分层的关键 —— 没有它,鱼会融进背景里
    const rim = new THREE.DirectionalLight(0x66d9ff, 1.3);
    rim.position.set(0.8, -0.6, 0.6);
    this.scene.add(rim);
  }

  /**
   * 程序化环境贴图。没有它,MeshStandardMaterial 的金属/光泽完全是死的,
   * 鱼身是哑光塑料;有了它,鱼鳞有柔和的环境反射,轮廓立刻有立体起伏。
   * RoomEnvironment 一次性渲染进 PMREM,运行时零额外开销。
   */
  private buildEnvironment(): void {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    // 水下不是室内,强度压住 —— 要一层"柔光"而不是"反光";
    // 但太弱会让鱼身变平,0.6 是让鱼鳞有体积感的甜点
    this.scene.environmentIntensity = 0.6;
  }

  private buildWater(): void {
    // 背景是一张竖直渐变。用顶点色而不是贴图 —— 四个顶点就够了,省一次纹理上传
    const geo = new THREE.PlaneGeometry(GAME_WIDTH, GAME_HEIGHT);
    const material = new THREE.MeshBasicMaterial({ color: 0x073453 });
    const plane = new THREE.Mesh(geo, material);
    plane.position.copy(toWorld(GAME_WIDTH / 2, GAME_HEIGHT / 2, LAYER.water));
    this.waterPlane = plane;
    this.scene.add(plane);

    new THREE.TextureLoader().load('/fish-hunter/background-hd.png?v=4', (texture) => {
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

  /**
   * 海底阴影承接面。方向光的影子需要一个接收面才能看见 ——
   * 水面是 MeshBasicMaterial 不吃阴影,所以铺一块 ShadowMaterial 板。
   *
   * **必须用 ShadowMaterial 而不是半透明深蓝板**:半透明深蓝会像一层
   * 雾盖在整个画面上,压暗背景、拉低对比度 —— 画面"平"的头号嫌疑。
   * ShadowMaterial 只在阴影处变暗,其余完全透明,背景通透、阴影清晰。
   * 放在水面(z=-60)之前:水面是不透明材质,阴影板放它后面会被
   * 深度测试整块挡掉。放前面则因鱼在 z=0,阴影板仍在鱼后面。
   */
  private buildSeabed(): void {
    const material = new THREE.ShadowMaterial({ opacity: 0.4 });
    const seabed = new THREE.Mesh(new THREE.PlaneGeometry(GAME_WIDTH, GAME_HEIGHT), material);
    seabed.position.copy(toWorld(GAME_WIDTH / 2, GAME_HEIGHT / 2, LAYER.water + 5));
    seabed.receiveShadow = true;
    this.seabed = seabed;
    this.scene.add(seabed);
  }

  /**
   * 细碎水波光斑。背景图已经烘焙了大光束,这里不再叠大椭圆
   * (第一版那么做过,结果成了横跨半屏的灰蓝色块)。
   * 换成小半径、极低透明度、加色混合的光点,只给水体一层"流动"的微光。
   */
  private buildCaustics(): void {
    const geo = new THREE.CircleGeometry(1, 24);
    for (let i = 0; i < 18; i += 1) {
      const material = new THREE.MeshBasicMaterial({
        color: Math.random() < 0.5 ? 0x8fe3ff : 0x66d9ff,
        transparent: true,
        opacity: 0.05,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const patch = new THREE.Mesh(geo, material);
      const scale = 46 + Math.random() * 120;
      patch.scale.set(scale * (0.5 + Math.random() * 0.7), scale, 1);
      patch.position.set(
        Math.random() * GAME_WIDTH,
        -Math.random() * GAME_HEIGHT,
        LAYER.water + 8,
      );
      patch.userData = {
        baseX: patch.position.x,
        baseY: patch.position.y,
        phase: Math.random() * Math.PI * 2,
      };
      this.scene.add(patch);
      this.caustics.push(patch);
    }
  }

  /**
   * 浮游微粒:几十个极小的加色亮点缓慢漂移,让水体"有内容"。
   * 捕鱼画面最怕一片干净的底色 —— 那会显得鱼像贴在玻璃上。
   * 用 Points + 圆形渐变 sprite,几十个点一次 draw call,便宜。
   */
  private buildPlankton(): void {
    const COUNT = 56;
    const positions = new Float32Array(COUNT * 3);
    const meta = new Float32Array(COUNT * 3); // 相位 / 纵向漂移速度 / 横向漂移速度
    for (let i = 0; i < COUNT; i += 1) {
      positions[i * 3] = Math.random() * GAME_WIDTH;
      positions[i * 3 + 1] = -Math.random() * GAME_HEIGHT;
      positions[i * 3 + 2] = LAYER.fishBack + Math.random() * 6;
      meta[i * 3] = Math.random() * Math.PI * 2;
      meta[i * 3 + 1] = 5 + Math.random() * 9;
      meta[i * 3 + 2] = 3 + Math.random() * 7;
    }
    // 直接持有同一份数组:Float32Array.set 往长度 0 的初始化数组里写会越界
    this.planktonBase = positions;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0x9fe8ff,
      size: 2.6,
      map: makeSoftDotTexture(),
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: false,
    });
    const points = new THREE.Points(geometry, material);
    points.userData.meta = meta;
    this.plankton = points;
    this.scene.add(points);
  }

  /** 光斑漂移。t 用本地时钟就行 —— 它不参与任何判定,不需要和服务端对齐 */
  update(t: number): void {
    for (const patch of this.caustics) {
      const p = patch.userData.phase as number;
      // 幅度压小:细碎光斑只需"流动感",飘太远会重新变成灰蓝色块
      patch.position.x = (patch.userData.baseX as number) + Math.sin(t * 0.00013 + p) * 16;
      patch.position.y = (patch.userData.baseY as number) + Math.cos(t * 0.00009 + p) * 9;
      (patch.material as THREE.MeshBasicMaterial).opacity =
        0.035 + 0.025 * (0.5 + 0.5 * Math.sin(t * 0.0004 + p));
    }

    // 浮游微粒:上下缓漂 + 左右轻摆。直接改 attribute,不重建几何
    const points = this.plankton;
    if (!points) return;
    const position = points.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = position.array as Float32Array;
    const meta = points.userData.meta as Float32Array;
    for (let i = 0; i < arr.length; i += 3) {
      const phase = meta[i];
      const vSpeed = meta[i + 1];
      const hSpeed = meta[i + 2];
      arr[i] = this.planktonBase[i] + Math.cos(t * 0.00007 * hSpeed + phase) * 18;
      arr[i + 1] = this.planktonBase[i + 1] - Math.sin(t * 0.00011 * vSpeed + phase) * 26;
    }
    position.needsUpdate = true;
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
    // 阴影承接面跟着背景一起扩 —— 否则超宽屏时逻辑池外是亮的背景、
    // 池内却多一层压暗,交界处会显出一条缝
    this.seabed?.scale.setScalar(backgroundScale);

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
    if (this.seabed) {
      this.seabed.geometry.dispose();
      (this.seabed.material as THREE.Material).dispose();
      this.seabed = null;
    }
    if (this.plankton) {
      this.plankton.geometry.dispose();
      const material = this.plankton.material as THREE.PointsMaterial;
      material.map?.dispose();
      material.dispose();
      this.plankton = null;
    }
    this.scene.environment?.dispose();
    this.renderer.domElement.remove();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}

/** 一张 32×32 径向渐变圆点,给粒子当 sprite 用。运行时生成,不占素材 */
function makeSoftDotTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 32, 32);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}
