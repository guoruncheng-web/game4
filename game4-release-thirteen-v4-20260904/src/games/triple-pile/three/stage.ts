/**
 * 渲染舞台:renderer、相机、灯光、锅体、桌面。
 *
 * 相机全程不动(DESIGN.md §4.2)。本作要求玩家建立「哪个东西在哪」的空间记忆,
 * 任何相机变换都会毁掉这份记忆 —— 这是设计决定,不是偷懒,即使有人提「能不能转一转」也不加。
 * resize 时唯一变的是**距离**,因为竖屏的水平视野远窄于垂直视野,写死距离会把锅切掉两边。
 */

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { BROTH, CAMERA, POT } from '../config';

/** ART.md §2.1 */
const LIGHT = {
  keyIntensity: 0.78,
  keyColor: 0xffe8cc,
  keyDir: [1.8, 6.0, 2.4] as const,
  fillIntensity: 0.24,
  fillColor: 0x7a5a9a,
  fillDir: [-2.6, 1.2, -3.0] as const,
  ambientIntensity: 0.30,
  ambientColor: 0x4a3020,
};

/** 桌面底图。它是屏幕空间的背景,不是 3D 平面 —— 见 buildScenery 的说明 */
const TABLETOP = '/triple-pile/scene/tabletop.jpg';

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;

  private readonly disposables: Array<{ dispose(): void }> = [];
  private broth: THREE.Mesh | null = null;
  /** 汤面的基准顶点(未被波浪扰动的原位),每帧从它出发重算 */
  private brothBase: Float32Array | null = null;
  /** 活着的涟漪。x/z 是落点,age 是已经扩散了多久 */
  private readonly waves: Array<{ x: number; z: number; age: number; power: number }> = [];
  private brothNormal: THREE.Texture | null = null;
  private steam: THREE.Points | null = null;
  private steamSeed: Float32Array | null = null;
  /** 汤面是否被扰动过。没涟漪时靠它避免每帧空转一遍复位 */
  private brothDisturbed = false;
  private elapsed = 0;

  constructor(private readonly container: HTMLElement) {
    // alpha:true —— 桌面底图铺在画布**背后**(CSS 背景),画布本身要透出去
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    // 手机上 DPR 常常是 3,而本作满堆时的瓶颈已经在 CPU(Rapier)上,
    // 再让 GPU 多画 2.25 倍的片元没有任何收益
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.touchAction = 'none';
    container.appendChild(this.renderer.domElement);

    // 不设 scene.background:背景由容器的 CSS 背景图提供
    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, 1, CAMERA.near, CAMERA.far);

    const key = new THREE.DirectionalLight(LIGHT.keyColor, LIGHT.keyIntensity);
    key.position.set(...LIGHT.keyDir);
    const fill = new THREE.DirectionalLight(LIGHT.fillColor, LIGHT.fillIntensity);
    fill.position.set(...LIGHT.fillDir);
    const ambient = new THREE.AmbientLight(LIGHT.ambientColor, LIGHT.ambientIntensity);
    this.scene.add(key, fill, ambient);

    // 环境光照(IBL)。没有它,金属材质在没有反射源的场景里会直接发黑 ——
    // 铜锅的质感几乎全部来自这一层。食材的 MeshStandardMaterial 也会跟着受益。
    // RoomEnvironment 是 Three 自带的程序化房间,不需要任何贴图文件。
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
    this.scene.environment = envRT.texture;
    this.scene.environmentIntensity = 0.55;
    this.disposables.push(envRT.texture, pmrem);

    this.buildScenery();
    this.resize();
  }

  // ---------------------------------------------------------------- 场景

  /**
   * 桌面走**屏幕空间背景图**,不是 3D 平面。
   *
   * 素材(`tabletop.jpg`)是一张正俯视的照片式渲染,而相机是 62° 斜俯视 ——
   * 把它贴成 3D 地面会立刻暴露透视不一致。当成背景板就没有这个问题:
   * 背景板没有透视,只有锅和食材是 3D 的,这正是参考图那种「实拍桌面 + 立体锅」的合成感。
   *
   * 用 CSS 背景而不是 Three 里的全屏面片,还省掉一次全屏绘制和一张常驻显存的贴图。
   */
  private buildScenery() {
    this.container.style.backgroundImage = `url(${TABLETOP})`;
    this.container.style.backgroundSize = 'cover';
    this.container.style.backgroundPosition = 'center';
    this.container.style.backgroundRepeat = 'no-repeat';

    const { geometry, material } = buildPot();
    this.scene.add(new THREE.Mesh(geometry, material));
    this.disposables.push(geometry, material);

    this.buildBroth();
  }

  /**
   * 汤面:一个圆盘 + 滚动的程序化法线扰动 + 一小撮蒸汽粒子。
   *
   * 半透明是硬要求(见 config.ts 的 BROTH):不透明的汤会挡住沉在下面的食材,
   * 而它们仍然点得到 —— 那就破了「看得见就点得到」这条规则。
   *
   * `depthWrite: false`:食材是不透明的,先画完写好深度;汤面最后画、只混合不写深度,
   * 于是浸在汤里的那一截食材会被汤色罩住,露出汤面的那一截保持原色。
   */
  private buildBroth() {
    this.brothNormal = noiseNormalTexture(128);
    // 用 RingGeometry 而不是 CircleGeometry:圆盘只有一圈扇形三角、中间没有径向分环,
    // 没法做顶点位移。内半径取一个极小值,视觉上仍然是个满圆
    const geometry = new THREE.RingGeometry(0.001, BROTH.radius, BROTH.segments, BROTH.rings);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, BROTH.level, 0);
    this.brothBase = new Float32Array(geometry.getAttribute('position').array as Float32Array);
    const material = new THREE.MeshStandardMaterial({
      color: BROTH.color,
      transparent: true,
      opacity: BROTH.opacity,
      depthWrite: false,
      // 奶白汤是浑浊的,不该像清水那样镜面反光
      roughness: 0.42,
      metalness: 0.0,
      normalMap: this.brothNormal,
      normalScale: new THREE.Vector2(0.35, 0.35),
    });
    this.broth = new THREE.Mesh(geometry, material);
    this.broth.renderOrder = 0.5;
    this.scene.add(this.broth);
    this.disposables.push(geometry, material, this.brothNormal);

    // 蒸汽:少量、慢、低透明度。它的作用是「这锅是热的」,不是特效表演,
    // 多了会糊住食材 —— 而食材的可辨识度是这个游戏的命根子。
    // BROTH.steamCount 设 0 就整个关掉
    if (BROTH.steamCount <= 0) return;
    const positions = new Float32Array(BROTH.steamCount * 3);
    this.steamSeed = new Float32Array(BROTH.steamCount * 3);
    for (let i = 0; i < BROTH.steamCount; i += 1) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * BROTH.radius * 0.85;
      this.steamSeed[i * 3] = Math.cos(a) * r;
      this.steamSeed[i * 3 + 1] = Math.random();
      this.steamSeed[i * 3 + 2] = Math.sin(a) * r;
    }
    const steamGeo = new THREE.BufferGeometry();
    steamGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const steamMat = new THREE.PointsMaterial({
      color: 0xffffff, size: BROTH.steamSize, transparent: true, opacity: BROTH.steamOpacity,
      depthWrite: false, sizeAttenuation: true, map: softDot(64),
    });
    this.steam = new THREE.Points(steamGeo, steamMat);
    this.steam.frustumCulled = false;
    this.scene.add(this.steam);
    this.disposables.push(steamGeo, steamMat);
    if (steamMat.map) this.disposables.push(steamMat.map);
  }

  /**
   * 有东西砸进汤里。这里只管**波浪**,溅起的汤滴在 Vfx 里。
   *
   * 波浪做成汤面自身的顶点位移,而不是铺一圈环 mesh:
   * 环 mesh 本质是贴片,一眼假,而且和半透明的汤面共面会叠出暗环。
   */
  splash(x: number, z: number, power: number) {
    // 同时最多留几圈,多了既看不清也白算。挤掉最老的那一圈
    if (this.waves.length >= BROTH.maxWaves) this.waves.shift();
    this.waves.push({ x, z, age: 0, power: THREE.MathUtils.clamp(power, 0.25, 1.6) });
  }

  /**
   * 单圈涟漪在离落点 dist 处的高度。
   *
   * 形状是一个**向外行进的波包**:波前半径 = 波速 × 时间,波包中心最高,
   * 前后用高斯包络收住,再按距离和时间双重衰减。
   * 这比「一个不断放大的圆环」像水得多 —— 水面的涟漪是有前后起伏的,不是一条线。
   */
  private waveAt(w: { age: number; power: number }, dist: number): number {
    const front = w.age * BROTH.waveSpeed;
    const d = dist - front;
    if (Math.abs(d) > BROTH.wavePacket * 3) return 0;
    const env = Math.exp(-(d * d) / (2 * BROTH.wavePacket * BROTH.wavePacket));
    const decay = Math.exp(-w.age / BROTH.waveLife) / (1 + dist * 0.55);
    return w.power * BROTH.waveAmp * env * decay * Math.sin(d * BROTH.waveFreq);
  }

  /** 每帧推进汤面的流动、波浪和蒸汽。暂停时不调,汤就静止 —— 那正好是「暂停」该有的样子 */
  update(dt: number) {
    this.elapsed += dt;
    if (this.brothNormal) {
      // 两层速度不同的滚动错开,避免看出贴图在平移
      this.brothNormal.offset.set(this.elapsed * BROTH.flowA, this.elapsed * BROTH.flowB);
    }
    this.updateWaves(dt);

    if (this.steam && this.steamSeed && BROTH.steamCount > 0) {
      const pos = this.steam.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < BROTH.steamCount; i += 1) {
        const phase = (this.steamSeed[i * 3 + 1] + this.elapsed * BROTH.steamRiseSpeed * 0.25) % 1;
        // 越往上越飘散,同时半径向外张开一点 —— 直上直下是「假」的主要来源
        const spread = 1 + phase * 0.9;
        pos.setXYZ(
          i,
          this.steamSeed[i * 3] * spread + Math.sin(this.elapsed * 0.35 + i * 2.1) * 0.4,
          BROTH.level + phase * 2.6,
          this.steamSeed[i * 3 + 2] * spread + Math.cos(this.elapsed * 0.29 + i * 1.7) * 0.4,
        );
      }
      pos.needsUpdate = true;
    }
  }

  // ---------------------------------------------------------------- 尺寸

  /**
   * 保持俯角不变,只调距离,让锅在当前宽高比下完整可见。
   * 竖屏 9:16 下横向是瓶颈,横屏下纵向是瓶颈,取两者的较大值。
   */
  private fitDistance(aspect: number): number {
    const tanHalf = Math.tan((CAMERA.fov * Math.PI) / 360);
    const pitch = (CAMERA.pitchDeg * Math.PI) / 180;
    // 锅在画面上的竖直半高:俯视时圆盘被压扁成 R·sin(俯角),再加上锅沿的高度
    const neededH = POT.radius * Math.sin(pitch) + POT.height * Math.cos(pitch) + 0.6;
    const neededW = POT.radius + 0.5;
    const dv = neededH / (tanHalf * CAMERA.verticalUsable);
    const dh = neededW / (tanHalf * aspect * CAMERA.horizontalUsable);
    return Math.max(dv, dh, CAMERA.minDistance);
  }

  resize() {
    const w = Math.max(this.container.clientWidth, 1);
    const h = Math.max(this.container.clientHeight, 1);
    this.renderer.setSize(w, h, false);
    const aspect = w / h;
    this.camera.aspect = aspect;

    const pitch = (CAMERA.pitchDeg * Math.PI) / 180;
    const d = this.fitDistance(aspect);
    const [tx, ty, tz] = CAMERA.target;
    this.camera.position.set(tx, ty + Math.sin(pitch) * d, tz + Math.cos(pitch) * d);
    this.camera.lookAt(tx, ty, tz);
    this.camera.updateProjectionMatrix();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * 按当前所有涟漪重算汤面的顶点高度和法线。
   *
   * 法线必须一起算 —— 只推顶点不改法线的话,平打光下的水面几乎看不出起伏,
   * 白白付了顶点位移的代价。这里用**解析梯度**:每个顶点对每圈涟漪取径向导数
   * (用一次有限差分),按方向累加成梯度向量,法线就是 (-gx, 1, -gz) 归一化。
   */
  private updateWaves(dt: number) {
    if (!this.broth || !this.brothBase) return;

    for (let i = this.waves.length - 1; i >= 0; i -= 1) {
      this.waves[i].age += dt;
      if (this.waves[i].age > BROTH.waveLife * 2.2) this.waves.splice(i, 1);
    }

    const geo = this.broth.geometry;
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const nor = geo.getAttribute('normal') as THREE.BufferAttribute;
    const base = this.brothBase;

    // 没有涟漪时只需要把汤面复位一次,之后就别再空转
    if (this.waves.length === 0) {
      if (!this.brothDisturbed) return;
      this.brothDisturbed = false;
      for (let i = 0; i < pos.count; i += 1) {
        pos.setY(i, base[i * 3 + 1]);
        nor.setXYZ(i, 0, 1, 0);
      }
      pos.needsUpdate = true;
      nor.needsUpdate = true;
      return;
    }
    this.brothDisturbed = true;

    const EPS = 0.06;
    for (let i = 0; i < pos.count; i += 1) {
      const x = base[i * 3];
      const z = base[i * 3 + 2];
      let y = 0;
      let gx = 0;
      let gz = 0;
      for (const w of this.waves) {
        const dx = x - w.x;
        const dz = z - w.z;
        const dist = Math.hypot(dx, dz);
        const h = this.waveAt(w, dist);
        if (h === 0) continue;
        y += h;
        // 径向导数 → 拆回 xz 分量
        const dh = (this.waveAt(w, dist + EPS) - h) / EPS;
        const inv = dist > 1e-4 ? 1 / dist : 0;
        gx += dh * dx * inv;
        gz += dh * dz * inv;
      }
      pos.setY(i, base[i * 3 + 1] + y);
      const len = Math.hypot(-gx, 1, -gz) || 1;
      nor.setXYZ(i, -gx / len, 1 / len, -gz / len);
    }
    pos.needsUpdate = true;
    nor.needsUpdate = true;
  }

  /**
   * 把一个屏幕 NDC 坐标反投影成相机前方 dist 处的世界坐标。
   * 槽位条靠它定位 —— 槽位必须永远贴在屏幕底部,而它又是 3D 物件,
   * 所以位置得每次 resize 重算。
   */
  ndcToWorld(ndcX: number, ndcY: number, dist: number, out = new THREE.Vector3()): THREE.Vector3 {
    out.set(ndcX, ndcY, 0.5).unproject(this.camera);
    out.sub(this.camera.position).normalize().multiplyScalar(dist).add(this.camera.position);
    return out;
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

// ---------------------------------------------------------------- 锅

/**
 * 铜锅:一条剖面绕 Y 轴旋转出来的 `LatheGeometry`。
 *
 * 为什么不是「圆柱 + 圆环 + 提手」拼的:
 * - 拼出来的锅沿是 `TorusGeometry`,径向分段少的时候截面是多边形,边缘全是硬棱;
 * - 各部件之间的接缝没有过渡,读起来是几个零件而不是一口锅。
 *
 * 旋转体一次性描述整条剖面(锅底 → 圆角 → 内壁 → 卷边 → 外壁),
 * 法线连续,分段数一处控制。**贴图到位后 UV 也直接从这条剖面算**,不用重建几何。
 *
 * 材质是 `MeshStandardMaterial` 而不是 Lambert:金属感需要高光和环境反射,
 * 而 Lambert 两样都没有 —— 那正是初版那口锅显得像纸筒的原因。
 */
function buildPot(): { geometry: THREE.BufferGeometry; material: THREE.Material } {
  // 剖面点 (半径, 高度),自锅心向外、由低到高
  const profile: Array<[number, number]> = [
    [0.00, 0.000],
    // 锅底必须平到 physicsRadius 之外,否则贴着锅壁的食材会从底部一圈穿出去 ——
    // 那正是第一版看到的「生菜卡在锅沿上」
    [POT.physicsRadius + 0.02, 0.000],
    [POT.physicsRadius + 0.14, 0.075],
    [POT.physicsRadius + 0.26, 0.30],
    [POT.physicsRadius + 0.34, 0.90],
    [(POT.bottomRadius + POT.radius) / 2, POT.height * 0.55],
    [POT.radius - 0.04, POT.height - 0.22],
    [POT.radius, POT.height - 0.02],
    // 卷边:向外翻出去再收回来,给锅口一道亮边
    [POT.radius + 0.13, POT.height + 0.10],
    [POT.radius + 0.22, POT.height + 0.04],
    [POT.radius + 0.20, POT.height - 0.14],
    // 外壁只做一小截:62° 俯视下再往下就被锅口挡住了
    [POT.radius + 0.06, POT.height - 0.85],
  ];

  const geometry = new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    POT.visualSegments,
  );

  // 顶点色做明度梯度:锅底最暗,越靠锅口越亮,卷边最亮。
  // 这是「深锅」这个体积感的主要来源 —— 纯色内壁怎么打光都是平的。
  const pos = geometry.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const low = new THREE.Color().setHex(0x4a2c12, THREE.SRGBColorSpace);
  const mid = new THREE.Color().setHex(0x9a6330, THREE.SRGBColorSpace);
  const high = new THREE.Color().setHex(0xd8a256, THREE.SRGBColorSpace);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i += 1) {
    const t = THREE.MathUtils.clamp(pos.getY(i) / POT.height, 0, 1);
    if (t < 0.55) tmp.copy(low).lerp(mid, t / 0.55);
    else tmp.copy(mid).lerp(high, (t - 0.55) / 0.45);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    // 半金属:纯金属(1.0)在只有 RoomEnvironment 的场景里会太脏,
    // 0.55 既有金属反光又保得住顶点色的铜调
    metalness: 0.55,
    roughness: 0.34,
    // 锅是个碗,内外两面都要画
    side: THREE.DoubleSide,
  });
  return { geometry, material };
}

// ---------------------------------------------------------------- 程序化贴图

/**
 * 程序化法线贴图,给汤面做扰动。
 * 先画一层平滑噪声当高度图,再求梯度转成法线 —— 128² 一次性生成,不占任何静态资源。
 */
function noiseNormalTexture(size: number): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // 高度图:几十个半透明的软圆点叠出来的低频起伏
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 90; i += 1) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 6 + Math.random() * 22;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const bright = Math.random() > 0.5;
    g.addColorStop(0, bright ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.22)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  const height = ctx.getImageData(0, 0, size, size).data;
  const out = ctx.createImageData(size, size);
  const at = (x: number, y: number) => height[(((y + size) % size) * size + ((x + size) % size)) * 4];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      // Sobel 的简化版:左右/上下差分即梯度
      const dx = (at(x + 1, y) - at(x - 1, y)) / 255;
      const dy = (at(x, y + 1) - at(x, y - 1)) / 255;
      const i = (y * size + x) * 4;
      out.data[i] = Math.round((-dx * 0.5 + 0.5) * 255);
      out.data[i + 1] = Math.round((-dy * 0.5 + 0.5) * 255);
      out.data[i + 2] = 255;
      out.data[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  return tex;
}

/** 蒸汽用的软圆点 */
function softDot(size: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
