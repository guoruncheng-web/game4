/**
 * 渲染舞台:渲染器、相机、灯光。
 *
 * **相机用正交,而且正对棋盘。** 棋盘是一张 15×15 的格子网,玩家要能一眼数清格子、
 * 判断"我这颗再走 3 格到哪"。一旦有透视,靠外侧的格子就会被压扁,数格子变成猜格子。
 * 3D 在这一款换来的是棋子的体积感和骰子的翻滚,不是视角。
 *
 * 世界坐标 = `layout.toWorld()` 给的那套:棋盘中心是原点,一格边长 1,+x 右 +y 上。
 * 所有摆位一律走那个函数,**不要在这一层另算一套坐标**。
 */

import * as THREE from 'three';
import { GRID } from '../sim/layout';

/** 棋盘外再留一圈,免得贴边 */
const MARGIN = 0.1;
export const VIEW = GRID + MARGIN * 2;

/** 分层用的 z */
export const LAYER = {
  board: 0,
  highlight: 0.05,
  piece: 0.1,
  dice: 1.2,
} as const;

export class Stage {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.OrthographicCamera;
  readonly renderer: THREE.WebGLRenderer;
  private readonly parent: HTMLElement;
  private readonly onResize = () => this.resize();

  constructor(parent: HTMLElement) {
    this.parent = parent;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setClearColor(0x0a1f5c, 1);
    // DPR 封到 2:再高看不出差别,填充率却是平方级涨
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    const canvas = this.renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.touchAction = 'manipulation';
    parent.append(canvas);

    // 概念图使用接近正视的完整方盘。正交相机保证四边等长、格子大小一致，
    // 玩家数格和点击棋子时不会受到透视压缩干扰。
    const half = VIEW / 2;
    this.camera = new THREE.OrthographicCamera(-half, half, half, -half, 0.1, 100);
    this.camera.position.set(0, 0, 22);
    this.camera.lookAt(0, 0, 0);
    this.scene.add(this.camera);

    // 半球光给底子,方向光负责让棋子有明暗面 —— 全靠环境光的话棋子会是一坨没有体积的色块
    this.scene.add(new THREE.HemisphereLight(0xdff1ff, 0x1a2a52, 2.2));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(-3, 5, 8);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x8fc4ff, 0.6);
    fill.position.set(4, -3, 5);
    this.scene.add(fill);

    this.resize();
    window.addEventListener('resize', this.onResize);
  }

  /**
   * 铺满容器,并**保证整张棋盘完整可见**。
   * 比例不一致时沿短边留白而不是裁掉 —— 裁掉意味着某一家的基地跑到屏幕外,那家就没法玩了。
   */
  resize(): void {
    const w = this.parent.clientWidth || window.innerWidth;
    const h = this.parent.clientHeight || window.innerHeight;
    // 对局稿把棋盘放在两排玩家卡之间，而不是整屏画布的正中央。
    // WebGL 只占这块正方形区域，可避免竖屏下棋盘被 HUD 推到屏幕外或截断。
    const size = Math.max(280, Math.min(w - 10, h * 0.54));
    const top = Math.max(176, Math.min(h * 0.231, h - size - 180));
    const canvas = this.renderer.domElement;
    canvas.style.position = 'absolute';
    canvas.style.left = `${Math.round((w - size) / 2)}px`;
    canvas.style.top = `${Math.round(top)}px`;
    // setPixelRatio 后 canvas.width/height 是物理像素；若不明确写 CSS 尺寸，
    // 浏览器会把 2× DPR 的物理像素当 CSS 像素，棋盘因此被放大两倍。
    canvas.style.width = `${Math.round(size)}px`;
    canvas.style.height = `${Math.round(size)}px`;
    canvas.style.zIndex = '1';
    this.renderer.setSize(size, size, false);

    const half = VIEW / 2;
    this.camera.left = -half;
    this.camera.right = half;
    this.camera.top = half;
    this.camera.bottom = -half;
    this.camera.updateProjectionMatrix();
  }

  /** 屏幕坐标 → 世界坐标(z=0 平面)。点棋子要用 */
  pointerToWorld(clientX: number, clientY: number): THREE.Vector2 {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const u = (clientX - rect.left) / rect.width;
    const v = (clientY - rect.top) / rect.height;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(u * 2 - 1, 1 - v * 2), this.camera);
    const hit = new THREE.Vector3();
    if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), hit)) {
      return new THREE.Vector2(Number.NaN, Number.NaN);
    }
    return new THREE.Vector2(hit.x, hit.y);
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  destroy(): void {
    window.removeEventListener('resize', this.onResize);
    this.renderer.domElement.remove();
    this.renderer.dispose();
  }
}
