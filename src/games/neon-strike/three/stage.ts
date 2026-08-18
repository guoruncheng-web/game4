import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { SPACE } from '../config';
import { disposeTree } from './assets';

const BACKGROUND = 0x05041a;
/** 两侧结构物的坑位数。再多不会更好看,只会让远处糊成一片 */
const PYLON_COUNT = 10;

/**
 * 渲染舞台:相机、灯光、星空、地格、辉光后期,以及"走位平面能走多大"的换算。
 *
 * 玩法完全不碰 Three.js 的对象,只通过 Stage 拿到场景根节点和 playArea。
 */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly root = new THREE.Group();

  /** 玩家在 z=0 平面上的可走范围,resize 时按实际视锥重算 */
  readonly playArea = { halfX: 5, halfY: 3, centerY: 0 };

  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private stars!: THREE.Points;
  private starVelocity!: Float32Array;
  private streaks!: THREE.LineSegments;
  private pylons: THREE.Object3D[] = [];
  private grids: Array<{ mesh: THREE.Mesh; texture: THREE.Texture }> = [];
  private envTexture?: THREE.Texture;
  private disposables: Array<{ dispose(): void }> = [];

  /** 世界推进速度,用来驱动星空、地格、立柱的流动 */
  private flowSpeed = 26;
  private shakeUntil = 0;
  private shakeAmount = 0;
  private cameraX = 0;

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    // 手机上 DPR 常常是 3,叠上辉光后期会直接把帧率打穿;2 已经看不出锯齿差别了
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.touchAction = 'none';
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(BACKGROUND);
    // 雾是纵深感的主要来源:远处的敌机先从背景色里"浮"出来,再逼近成实体
    this.scene.fog = new THREE.Fog(BACKGROUND, 34, 128);
    this.scene.add(this.root);

    this.camera = new THREE.PerspectiveCamera(SPACE.fov, 1, 0.3, 600);
    this.camera.position.set(0, SPACE.cameraUp, SPACE.cameraBack);
    this.camera.lookAt(0, -SPACE.playerDropY, -SPACE.cameraLookAhead);

    this.setupEnvironment();
    this.setupLights();
    this.setupStars();
    this.setupStreaks();
    this.setupGrids();
    this.setupPylons();

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.72, 0.62, 0.22);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.resize();
  }

  /**
   * 金属材质没有环境贴图会渲染成纯黑,霓虹感全靠反射,所以必须给一份 env。
   * RoomEnvironment 是 three 自带的程序化房间,不需要外部 HDR 文件。
   */
  private setupEnvironment() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.envTexture;
    // 直接用会把暗色装甲提得发灰,压到三成只留高光
    this.scene.environmentIntensity = 0.35;
    pmrem.dispose();
  }

  private setupLights() {
    const hemi = new THREE.HemisphereLight(0x4fd6ff, 0x2a0b3a, 0.85);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight(0xbfefff, 2.1);
    key.position.set(-6, 9, 6);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xff4f8f, 1.5);
    rim.position.set(7, -3, -9);
    this.scene.add(rim);
    const fill = new THREE.DirectionalLight(0x6f7bff, 0.8);
    fill.position.set(3, 2, 12);
    this.scene.add(fill);
  }

  private setupStars() {
    const count = 900;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    this.starVelocity = new Float32Array(count);
    const color = new THREE.Color();
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 190;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 130;
      positions[i * 3 + 2] = -Math.random() * 420;
      // 远近星星给不同的视差速度,平面星空立刻变成有厚度的星海
      this.starVelocity[i] = 0.35 + Math.random() * 1.3;
      color.setHSL(0.5 + Math.random() * 0.22, 0.7, 0.55 + Math.random() * 0.35);
      colors[i * 3] = color.r; colors[i * 3 + 1] = color.g; colors[i * 3 + 2] = color.b;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      size: 0.9, sizeAttenuation: true, vertexColors: true,
      transparent: true, opacity: 0.95, depthWrite: false,
      blending: THREE.AdditiveBlending, fog: false,
    });
    this.stars = new THREE.Points(geometry, material);
    this.stars.frustumCulled = false;
    this.scene.add(this.stars);
    this.disposables.push(geometry, material);
  }

  /** 贴着画面边缘冲过来的光丝,负责把速度感顶起来 */
  private setupStreaks() {
    const count = 180;
    const positions = new Float32Array(count * 6);
    for (let i = 0; i < count; i++) this.seedStreak(positions, i, true);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({
      color: 0x9fe8ff, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    });
    this.streaks = new THREE.LineSegments(geometry, material);
    this.streaks.frustumCulled = false;
    this.scene.add(this.streaks);
    this.disposables.push(geometry, material);
  }

  private seedStreak(positions: Float32Array, i: number, scatter: boolean) {
    // 中间留空:光丝只在画面外圈跑,不然会盖住正前方的敌机
    const angle = Math.random() * Math.PI * 2;
    const radius = 9 + Math.random() * 26;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius * 0.72;
    const z = scatter ? -Math.random() * 180 : -170 - Math.random() * 30;
    const len = 2.5 + Math.random() * 7;
    positions[i * 6] = x; positions[i * 6 + 1] = y; positions[i * 6 + 2] = z;
    positions[i * 6 + 3] = x; positions[i * 6 + 4] = y; positions[i * 6 + 5] = z - len;
  }

  /** 上下两片流动的霓虹地格,是判断"自己在往前飞"最直接的参照物 */
  private setupGrids() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.strokeStyle = 'rgba(120, 235, 255, 0.85)';
    ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, 128, 128);
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.moveTo(64, 0); ctx.lineTo(64, 128); ctx.moveTo(0, 64); ctx.lineTo(128, 64);
    ctx.stroke();

    for (const [y, rotation] of [[-9.5, -Math.PI / 2], [10.5, Math.PI / 2]] as const) {
      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(14, 90);
      const geometry = new THREE.PlaneGeometry(150, 460);
      const material = new THREE.MeshBasicMaterial({
        map: texture, transparent: true, opacity: 0.3,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.x = rotation;
      mesh.position.set(0, y, -190);
      this.scene.add(mesh);
      this.grids.push({ mesh, texture });
      this.disposables.push(geometry, material, texture);
    }
  }

  /**
   * 两侧掠过的巨型结构。星空太远、地格太规则,近处需要有东西"唰"地被甩到身后。
   *
   * 这里先摆一批程序化柱体占位:模型是异步加载的,而加载画面上星空已经在流动了,
   * 那时候两侧空着会显得世界只有一条空管子。模型到位后 setProps 会把它们整批换掉。
   */
  private setupPylons() {
    const geometry = new THREE.BoxGeometry(4, 26, 4);
    const edges = new THREE.EdgesGeometry(geometry);
    const solid = new THREE.MeshStandardMaterial({
      color: 0x0d1030, metalness: 0.9, roughness: 0.45, emissive: 0x120a2c, emissiveIntensity: 1,
    });
    const line = new THREE.LineBasicMaterial({ color: 0x3fd8ff, transparent: true, opacity: 0.55 });
    this.disposables.push(geometry, edges, solid, line);

    for (let i = 0; i < PYLON_COUNT; i++) {
      const group = new THREE.Group();
      group.add(new THREE.Mesh(geometry, solid));
      group.add(new THREE.LineSegments(edges, line));
      this.placePylon(group, i);
      this.scene.add(group);
      this.pylons.push(group);
    }
  }

  /**
   * 换上 Blender 产出的结构物(桁架塔 / 空间站段 / 残骸)。
   *
   * 每个坑位随机挑一种原型、随机绕自身竖轴转一个角度再随机缩放 —— 三个模型撑十个坑位,
   * 靠的就是这三层随机:同一个模型正对着看和侧对着看是两个剪影,玩家不会数出"又是那根"。
   */
  setProps(models: THREE.Object3D[]) {
    if (!models.length) return;
    for (const pylon of this.pylons) {
      this.scene.remove(pylon);
      disposeTree(pylon);
    }
    this.pylons = [];
    // 原型本身不入场,只作克隆源;材质共享,十个实例只有一份贴图和材质开销
    for (let i = 0; i < PYLON_COUNT; i++) {
      // 前几个坑位把三种原型各摆一遍,保证开局就看得全;之后再随机
      const proto = i < models.length ? models[i] : models[Math.floor(Math.random() * models.length)];
      const clone = proto.clone(true);
      const group = new THREE.Group();
      group.add(clone);
      clone.rotation.y = Math.random() * Math.PI * 2;
      // 残骸这类横躺的物件再给一点随意的翻滚,免得整排都水平得像摆出来的
      clone.rotation.z = (Math.random() - 0.5) * 0.5;
      group.scale.setScalar(0.75 + Math.random() * 0.7);
      this.placePylon(group, i);
      this.scene.add(group);
      this.pylons.push(group);
    }
  }

  /** 坑位的摆放规则:左右交替、离航道足够远、纵深上均匀铺开 */
  private placePylon(group: THREE.Object3D, index: number, recycle = false) {
    group.position.set(
      (recycle ? (Math.random() < 0.5 ? -1 : 1) : (index % 2 === 0 ? -1 : 1)) * (16 + Math.random() * 7),
      (Math.random() - 0.5) * 12,
      recycle ? group.position.z - 460 : -40 - index * 42 - Math.random() * 20,
    );
    group.rotation.z = (Math.random() - 0.5) * 0.4;
  }

  /** 世界流速跟着波次走,越到后面越快 */
  setFlowSpeed(value: number) {
    this.flowSpeed = value;
  }

  shake(duration: number, amount: number) {
    this.shakeUntil = Math.max(this.shakeUntil, performance.now() + duration);
    this.shakeAmount = Math.max(this.shakeAmount, amount);
  }

  /** 辉光强度。Boss 爆炸时临时拉高,做整屏过曝 */
  setBloomStrength(value: number) {
    this.bloom.strength = value;
  }

  update(dt: number, playerX: number, playerY: number) {
    const flow = this.flowSpeed * dt;

    const positions = this.stars.geometry.attributes.position as THREE.BufferAttribute;
    const array = positions.array as Float32Array;
    for (let i = 0; i < this.starVelocity.length; i++) {
      array[i * 3 + 2] += flow * this.starVelocity[i];
      if (array[i * 3 + 2] > this.camera.position.z + 6) {
        array[i * 3] = (Math.random() - 0.5) * 190;
        array[i * 3 + 1] = (Math.random() - 0.5) * 130;
        array[i * 3 + 2] -= 430;
      }
    }
    positions.needsUpdate = true;

    const streakPos = this.streaks.geometry.attributes.position as THREE.BufferAttribute;
    const streakArray = streakPos.array as Float32Array;
    for (let i = 0; i < streakArray.length / 6; i++) {
      streakArray[i * 6 + 2] += flow * 3.4;
      streakArray[i * 6 + 5] += flow * 3.4;
      if (streakArray[i * 6 + 5] > this.camera.position.z + 4) this.seedStreak(streakArray, i, false);
    }
    streakPos.needsUpdate = true;

    for (const { texture } of this.grids) texture.offset.y -= flow * 0.0195;

    for (const pylon of this.pylons) {
      pylon.position.z += flow * 1.15;
      if (pylon.position.z > this.camera.position.z + 20) {
        this.placePylon(pylon, 0, true);
      }
    }

    // 镜头带一点横向跟随:纯固定机位在走位时读不出"自己在动",
    // 全跟随又会让战机永远钉在画面正中、失去纵深参照,取一个折中的滞后量。
    this.cameraX += (playerX * SPACE.cameraLag - this.cameraX) * Math.min(1, dt * 5.5);
    const now = performance.now();
    let shakeX = 0, shakeY = 0;
    if (now < this.shakeUntil) {
      shakeX = (Math.random() - 0.5) * this.shakeAmount;
      shakeY = (Math.random() - 0.5) * this.shakeAmount;
    } else {
      this.shakeAmount = 0;
    }
    this.camera.position.set(
      this.cameraX + shakeX,
      SPACE.cameraUp + playerY * 0.16 + shakeY,
      SPACE.cameraBack,
    );
    this.camera.lookAt(
      this.cameraX * 0.5 + playerX * 0.1,
      -SPACE.playerDropY + playerY * 0.42,
      -SPACE.cameraLookAhead,
    );
  }

  render() {
    this.composer.render();
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
    this.recomputePlayArea();
  }

  /**
   * 反推走位范围。
   *
   * 相机是俯视的,z=0 这个平面并不垂直于视线,直接用视锥公式算会偏;
   * 这里改成把候选点投影到 NDC 上二分,要多少留白就写多少留白,
   * 换任何画面比例、任何镜头参数都不用再手调常量。
   */
  private recomputePlayArea() {
    const probe = new THREE.Vector3();
    const camera = this.camera.clone();
    camera.position.set(0, SPACE.cameraUp, SPACE.cameraBack);
    camera.lookAt(0, -SPACE.playerDropY, -SPACE.cameraLookAhead);
    camera.updateMatrixWorld(true);

    const ndc = (x: number, y: number) => {
      probe.set(x, y, SPACE.playerZ).project(camera);
      return probe;
    };
    const search = (limit: number, apply: (v: number) => THREE.Vector3, read: (p: THREE.Vector3) => number) => {
      let lo = 0, hi = 40;
      for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2;
        if (Math.abs(read(apply(mid))) <= limit) lo = mid; else hi = mid;
      }
      return lo;
    };

    const halfX = search(0.88, (v) => ndc(v, 0), (p) => p.x);
    const top = search(0.74, (v) => ndc(0, v), (p) => p.y);
    const bottom = search(0.74, (v) => ndc(0, -v), (p) => p.y);
    this.playArea.halfX = Math.max(2, halfX - SPACE.marginX);
    // 上下不对称:相机俯视让画面下半部分对应的世界空间更矮,分别算再取中点
    const upper = Math.max(1.2, top - SPACE.marginY);
    const lower = Math.max(1.2, bottom - SPACE.marginY);
    this.playArea.centerY = (upper - lower) / 2;
    this.playArea.halfY = (upper + lower) / 2;
  }

  dispose() {
    for (const item of this.disposables) item.dispose();
    this.envTexture?.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
