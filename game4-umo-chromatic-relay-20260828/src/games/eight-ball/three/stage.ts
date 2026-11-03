import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { BALL_R, PALETTE, PLAY, PLAY_HEIGHT, PLAY_WIDTH } from '../config';
import type { Ball } from '../physics';
import { BallView } from './balls';
import { makeClothTexture, makeFloorTexture, makeWoodTexture } from './textures';

const WORLD_SCALE = 1.27 / PLAY_WIDTH;
const TABLE_W = PLAY_WIDTH * WORLD_SCALE;
const TABLE_H = PLAY_HEIGHT * WORLD_SCALE;
const BALL_RADIUS = BALL_R * WORLD_SCALE;
const CENTER_X = (PLAY.left + PLAY.right) / 2;
const CENTER_Y = (PLAY.top + PLAY.bottom) / 2;

function disposeTree(root: THREE.Object3D) {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((material) => material?.dispose());
  });
}

export class Stage {
  readonly canvas: HTMLCanvasElement;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(38, 1, 0.02, 40);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly balls = new BallView(BALL_RADIUS);
  private readonly raycaster = new THREE.Raycaster();
  private readonly tablePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly aimLine: THREE.Line;
  private readonly ghost: THREE.Mesh;
  private tableRoot: THREE.Object3D | null = null;
  private cueRoot: THREE.Object3D | null = null;
  private environment: THREE.Texture | null = null;
  private readonly generatedTextures: THREE.Texture[] = [];
  private resizeObserver: ResizeObserver;

  constructor(private readonly parent: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.canvas = this.renderer.domElement;
    this.canvas.className = 'eb3-canvas';
    parent.prepend(this.canvas);

    this.scene.background = new THREE.Color(0x090d0b);
    this.scene.fog = new THREE.FogExp2(0x090d0b, 0.07);
    this.camera.position.set(0, 3.35, 3.65);
    this.camera.lookAt(0, 0, -0.12);

    const ambient = new THREE.HemisphereLight(0xe9c98e, 0x07140d, 0.72);
    this.scene.add(ambient);
    const key = new THREE.SpotLight(0xffd697, 34, 9, Math.PI / 3.2, 0.55, 1.35);
    key.position.set(0, 3.8, 0);
    key.target.position.set(0, 0, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    this.scene.add(key, key.target);
    const rim = new THREE.PointLight(0x2bbf7b, 4.5, 6, 2);
    rim.position.set(-2.2, 1.1, -1.5);
    this.scene.add(rim);

    this.scene.add(this.makeFloor(), this.makeCloth(), this.balls.root);
    this.tableRoot = this.makeFallbackTable();
    this.scene.add(this.tableRoot);

    const lineGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.aimLine = new THREE.Line(lineGeometry, new THREE.LineBasicMaterial({ color: 0xf5e7be, transparent: true, opacity: 0.78 }));
    this.aimLine.visible = false;
    this.scene.add(this.aimLine);
    this.ghost = new THREE.Mesh(
      new THREE.RingGeometry(BALL_RADIUS * 0.78, BALL_RADIUS, 32),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, side: THREE.DoubleSide }),
    );
    this.ghost.rotation.x = -Math.PI / 2;
    this.ghost.visible = false;
    this.scene.add(this.ghost);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(parent);
    this.resize();
  }

  async load() {
    const loader = new GLTFLoader();
    const textureLoader = new THREE.TextureLoader();
    const model = (url: string) => new Promise<THREE.Object3D | null>((resolve) => {
      loader.load(url, (gltf) => resolve(gltf.scene), undefined, () => resolve(null));
    });
    const environment = new Promise<THREE.Texture | null>((resolve) => {
      textureLoader.load('/eight-ball/textures/env.webp', resolve, undefined, () => resolve(null));
    });
    const [table, cue, env] = await Promise.all([
      model('/eight-ball/models/table.glb'), model('/eight-ball/models/cue.glb'), environment,
    ]);
    if (table) {
      if (this.tableRoot) { this.scene.remove(this.tableRoot); disposeTree(this.tableRoot); }
      this.tableRoot = table;
      this.tuneModel(table);
      this.scene.add(table);
    }
    this.cueRoot = cue ?? this.makeFallbackCue();
    this.tuneModel(this.cueRoot);
    this.scene.add(this.cueRoot);
    this.cueRoot.visible = false;
    if (env) {
      env.mapping = THREE.EquirectangularReflectionMapping;
      env.colorSpace = THREE.SRGBColorSpace;
      this.environment = env;
      this.scene.environment = env;
    }
  }

  private tuneModel(root: THREE.Object3D) {
    root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const raw of materials) {
        const material = raw as THREE.MeshStandardMaterial;
        if (material.isMeshStandardMaterial) material.envMapIntensity = 1.05;
      }
    });
  }

  private makeFloor() {
    const texture = makeFloorTexture(7);
    this.generatedTextures.push(texture);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 12),
      new THREE.MeshStandardMaterial({ map: texture, color: 0x604735, roughness: 0.72 }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = -0.752;
    mesh.receiveShadow = true;
    return mesh;
  }

  private makeCloth() {
    const texture = makeClothTexture(4);
    this.generatedTextures.push(texture);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(TABLE_W, TABLE_H),
      new THREE.MeshStandardMaterial({ map: texture, color: PALETTE.cloth, roughness: 0.88 }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = -0.001;
    mesh.receiveShadow = true;
    return mesh;
  }

  private makeFallbackTable() {
    const root = new THREE.Group();
    const wood = makeWoodTexture(1);
    this.generatedTextures.push(wood);
    const material = new THREE.MeshStandardMaterial({ map: wood, color: PALETTE.rail, roughness: 0.38 });
    const rail = 0.16;
    const height = 0.1;
    for (const [w, d, x, z] of [
      [TABLE_W + rail * 2, rail, 0, -TABLE_H / 2 - rail / 2],
      [TABLE_W + rail * 2, rail, 0, TABLE_H / 2 + rail / 2],
      [rail, TABLE_H, -TABLE_W / 2 - rail / 2, 0],
      [rail, TABLE_H, TABLE_W / 2 + rail / 2, 0],
    ]) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, height, d), material);
      mesh.position.set(x, height / 2, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      root.add(mesh);
    }
    return root;
  }

  private makeFallbackCue() {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.015, 1.47, 18),
      new THREE.MeshStandardMaterial({ color: 0xa96b33, roughness: 0.36 }),
    );
    mesh.rotation.x = Math.PI / 2;
    mesh.position.z = 0.735;
    const root = new THREE.Group();
    root.add(mesh);
    return root;
  }

  toWorld(x: number, y: number, out = new THREE.Vector3()) {
    return out.set((x - CENTER_X) * WORLD_SCALE, BALL_RADIUS, (y - CENTER_Y) * WORLD_SCALE);
  }

  toTable(clientX: number, clientY: number) {
    const rect = this.canvas.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(pointer, this.camera);
    const hit = this.raycaster.ray.intersectPlane(this.tablePlane, new THREE.Vector3());
    if (!hit) return null;
    return { x: hit.x / WORLD_SCALE + CENTER_X, y: hit.z / WORLD_SCALE + CENTER_Y };
  }

  syncBalls(balls: Ball[]) { this.balls.sync(balls, this.toWorld.bind(this)); }

  setAim(cue: Ball, angle: number, power: number, visible: boolean) {
    const start = this.toWorld(cue.x, cue.y);
    const length = 0.72;
    const end = start.clone().add(new THREE.Vector3(Math.cos(angle) * length, 0, Math.sin(angle) * length));
    const positions = this.aimLine.geometry.getAttribute('position') as THREE.BufferAttribute;
    positions.setXYZ(0, start.x, 0.008, start.z);
    positions.setXYZ(1, end.x, 0.008, end.z);
    positions.needsUpdate = true;
    this.aimLine.visible = visible;
    this.ghost.visible = visible;
    this.ghost.position.set(end.x, 0.01, end.z);
    if (this.cueRoot) {
      this.cueRoot.visible = visible;
      this.cueRoot.position.set(start.x, BALL_RADIUS * 1.08, start.z);
      // 模型从杆头沿 +Z 延伸；杆身必须落在击球方向的反向。
      this.cueRoot.rotation.y = -angle - Math.PI / 2;
      this.cueRoot.translateZ(BALL_RADIUS * 1.6 + power * 0.18);
    }
  }

  resize() {
    const width = Math.max(1, this.parent.clientWidth);
    const height = Math.max(1, this.parent.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    // 横屏时稍微抬高镜头，仍保证整张球桌可见。
    this.camera.position.set(0, width > height ? 4.1 : 3.35, width > height ? 3.9 : 3.65);
    this.camera.lookAt(0, 0, -0.12);
    this.camera.updateProjectionMatrix();
  }

  render() { this.renderer.render(this.scene, this.camera); }

  dispose() {
    this.resizeObserver.disconnect();
    this.balls.dispose();
    if (this.tableRoot) disposeTree(this.tableRoot);
    if (this.cueRoot) disposeTree(this.cueRoot);
    this.generatedTextures.forEach((texture) => texture.dispose());
    this.environment?.dispose();
    (this.aimLine.geometry as THREE.BufferGeometry).dispose();
    (this.aimLine.material as THREE.Material).dispose();
    this.ghost.geometry.dispose();
    (this.ghost.material as THREE.Material).dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }
}
