import * as THREE from 'three';
import { BALL_COLORS } from '../config';
import type { Ball } from '../physics';

/** 球面号码用 Canvas 精确生成，扩散图绝不能负责数字。 */
function ballTexture(id: number) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size / 2;
  const ctx = canvas.getContext('2d')!;
  const striped = id >= 9;
  const color = id === 0 ? '#f4f0e7' : `#${(BALL_COLORS[striped ? id - 8 : id] ?? 0xffffff).toString(16).padStart(6, '0')}`;

  ctx.fillStyle = striped ? '#f4f0e7' : color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (striped) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 34, canvas.width, 60);
  }
  if (id !== 0) {
    // 经纬贴图前后各放一块号码盘，球滚动时总有一面能读到。
    for (const x of [64, 192]) {
      ctx.fillStyle = '#f8f5ed';
      ctx.beginPath();
      ctx.arc(x, 64, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#111419';
      ctx.font = '700 25px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(id), x, 65);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

export class BallView {
  readonly root = new THREE.Group();
  private readonly geometry: THREE.SphereGeometry;
  private readonly meshes = new Map<number, THREE.Mesh>();
  private readonly textures: THREE.CanvasTexture[] = [];
  private readonly materials: THREE.MeshPhysicalMaterial[] = [];

  constructor(private readonly radius: number) {
    this.geometry = new THREE.SphereGeometry(radius, 36, 24);
    for (let id = 0; id <= 15; id++) {
      const map = ballTexture(id);
      const material = new THREE.MeshPhysicalMaterial({
        map,
        roughness: 0.2,
        metalness: 0,
        clearcoat: 0.65,
        clearcoatRoughness: 0.16,
        envMapIntensity: 1.3,
      });
      const mesh = new THREE.Mesh(this.geometry, material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.ballId = id;
      this.meshes.set(id, mesh);
      this.textures.push(map);
      this.materials.push(material);
      this.root.add(mesh);
    }
  }

  sync(balls: Ball[], toWorld: (x: number, y: number, out?: THREE.Vector3) => THREE.Vector3) {
    for (const ball of balls) {
      const mesh = this.meshes.get(ball.id);
      if (!mesh) continue;
      mesh.visible = !ball.potted;
      if (!mesh.visible) continue;
      const previous = mesh.position.clone();
      toWorld(ball.x, ball.y, mesh.position);
      mesh.position.y = this.radius;
      const dx = mesh.position.x - previous.x;
      const dz = mesh.position.z - previous.z;
      const distance = Math.hypot(dx, dz);
      if (distance > 0 && previous.lengthSq() > 0) {
        const axis = new THREE.Vector3(dz, 0, -dx).normalize();
        mesh.rotateOnWorldAxis(axis, distance / this.radius);
      }
    }
  }

  dispose() {
    this.geometry.dispose();
    this.textures.forEach((texture) => texture.dispose());
    this.materials.forEach((material) => material.dispose());
    this.root.removeFromParent();
  }
}
