import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * 模型与特效贴图的加载。
 *
 * 三个 glb 都由 Blender 产出:玩家战机是手工建模的 .blend 导出,
 * 敌机和 Boss 由 tools/blender/neon-strike/build_models.py 生成。
 * 模型统一机头朝 -Z(glTF 的 Y-up 转换刚好把 Blender 的 +Y 转过来),进引擎不需要再摆正。
 */

const MODEL_BASE = '/neon-strike/models';
const VFX_BASE = '/neon-strike/assets/vfx';

export type Assets = {
  player: THREE.Object3D;
  enemy: THREE.Object3D;
  boss: THREE.Object3D;
  fx: Record<FxTexture, THREE.Texture>;
};

export type FxTexture = 'impact' | 'boom' | 'boomBoss' | 'shield' | 'portal';

const FX_FILES: Record<FxTexture, string> = {
  impact: 'laser-impact.png',
  boom: 'enemy-explosion.png',
  boomBoss: 'boss-explosion.png',
  shield: 'shield-impact.png',
  portal: 'boss-portal.png',
};

/**
 * 把模型按包围盒缩放到指定的机身长度,并把重心挪到原点。
 * 三个模型来自不同流程,原始尺度差了一个数量级,统一归一化之后
 * 游戏里的距离、碰撞盒、镜头参数才有一套能对得上的量纲。
 */
function normalize(root: THREE.Object3D, targetLength: number) {
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const scale = targetLength / Math.max(size.z, 1e-4);
  const wrapper = new THREE.Group();
  root.position.sub(center);
  root.scale.setScalar(1);
  wrapper.add(root);
  wrapper.scale.setScalar(scale);
  // 外面再包一层,是为了让调用方能自由地对整机做缩放和旋转,
  // 不必关心内部这次归一化用掉的 scale。
  const outer = new THREE.Group();
  outer.add(wrapper);
  return outer;
}

/** glTF 默认材质对霓虹风格偏灰,统一压暗底色、拉高金属感,让自发光件跳出来 */
function tuneMaterials(root: THREE.Object3D) {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const raw of list) {
      const material = raw as THREE.MeshStandardMaterial;
      if (!material.isMeshStandardMaterial) continue;
      material.envMapIntensity = 1.1;
      // 自发光件在 Blender 里给的强度是渲染器口径,搬到实时管线要收一收,
      // 否则叠上 Bloom 会糊成一团白。
      if (material.emissiveIntensity > 1) material.emissiveIntensity = 1;
    }
  });
}

function loadModel(loader: GLTFLoader, file: string, length: number): Promise<THREE.Object3D> {
  return new Promise((resolve, reject) => {
    loader.load(`${MODEL_BASE}/${file}`, (gltf) => {
      tuneMaterials(gltf.scene);
      resolve(normalize(gltf.scene, length));
    }, undefined, reject);
  });
}

function loadTexture(loader: THREE.TextureLoader, file: string): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    loader.load(`${VFX_BASE}/${file}`, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      resolve(texture);
    }, undefined, reject);
  });
}

export async function loadAssets(onProgress?: (done: number, total: number) => void): Promise<Assets> {
  const gltf = new GLTFLoader();
  const textureLoader = new THREE.TextureLoader();
  const fxKeys = Object.keys(FX_FILES) as FxTexture[];
  const total = 3 + fxKeys.length;
  let done = 0;
  const tick = <T,>(promise: Promise<T>) => promise.then((value) => {
    onProgress?.(++done, total);
    return value;
  });

  const [player, enemy, boss, ...textures] = await Promise.all([
    tick(loadModel(gltf, 'player-fighter.glb', 2.6)),
    tick(loadModel(gltf, 'enemy-drone.glb', 1.9)),
    tick(loadModel(gltf, 'boss-carrier.glb', 8.4)),
    ...fxKeys.map((key) => tick(loadTexture(textureLoader, FX_FILES[key]))),
  ]);

  const fx = {} as Record<FxTexture, THREE.Texture>;
  fxKeys.forEach((key, i) => { fx[key] = textures[i]; });
  return { player, enemy, boss, fx };
}

/**
 * 复刻一架战机。
 *
 * Object3D.clone() 只复制节点、共享几何和材质,而受击闪白、兵种染色都要按个体改材质,
 * 所以这里把材质也一并克隆掉。敌机走对象池,克隆只在建池时发生一次。
 */
export function cloneShip(proto: THREE.Object3D) {
  const copy = proto.clone(true);
  copy.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map((m) => m.clone())
      : mesh.material.clone();
  });
  return copy;
}

/** 收集一架战机上所有自发光材质(能量件),用于按兵种染色和受击闪烁 */
export function collectGlowMaterials(root: THREE.Object3D) {
  const found: THREE.MeshStandardMaterial[] = [];
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const raw of list) {
      const material = raw as THREE.MeshStandardMaterial;
      if (material.isMeshStandardMaterial && material.emissive.getHex() !== 0x000000) {
        found.push(material);
      }
    }
  });
  return found;
}

/** 收集非自发光的装甲材质,受击闪白改的是它们,不动能量件的颜色 */
export function collectArmorMaterials(root: THREE.Object3D) {
  const found: THREE.MeshStandardMaterial[] = [];
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const raw of list) {
      const material = raw as THREE.MeshStandardMaterial;
      if (material.isMeshStandardMaterial && material.emissive.getHex() === 0x000000) {
        found.push(material);
      }
    }
  });
  return found;
}

/** 释放一棵子树里的几何与材质。整局结束时统一调用,避免反复开局泄漏显存。 */
export function disposeTree(root: THREE.Object3D) {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of list) material?.dispose();
  });
}
