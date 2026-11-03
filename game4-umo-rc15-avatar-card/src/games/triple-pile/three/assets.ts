/**
 * 12 个食材模型的加载。
 *
 * 模型由 `tools/blender/triple-pile/build_models.py` 无头生成,产物在
 * `public/triple-pile/models/<key>.glb`,贴图内嵌。
 *
 * **模型缺失不做回落。** 食材就是这个游戏本身,少一种就没法开局 ——
 * 与其悄悄回落到一堆看不出是什么的几何体,不如明确报错。
 * (这一点和 neon-strike 的背景结构物不同,那些缺了只是背景素一点。)
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { PIECE_TYPES } from '../pieces';

const MODEL_BASE = '/triple-pile/models';
const SCENE_BASE = '/triple-pile/scene';

export type PieceAsset = {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** 碰撞体用的凸包顶点(扁平 xyz)。建模脚本保证每个模型都是凸体 */
  hull: Float32Array;
  /** 模型包围球半径,拾取音效和塌落判定用得到 */
  radius: number;
};

/**
 * 从 glb 里取出唯一那个 mesh 的 geometry 和 material。
 * 建模脚本一个 glb 只导一个对象,所以这里取到多个就是脚本出了问题,要炸出来。
 */
function extract(scene: THREE.Object3D, key: string): { geometry: THREE.BufferGeometry; material: THREE.Material } {
  const meshes: THREE.Mesh[] = [];
  scene.traverse((node) => {
    if ((node as THREE.Mesh).isMesh) meshes.push(node as THREE.Mesh);
  });
  if (meshes.length !== 1) {
    throw new Error(`[triple-pile] ${key}.glb 里有 ${meshes.length} 个 mesh,期望 1 个`);
  }
  const mesh = meshes[0];
  mesh.updateWorldMatrix(true, false);
  const geometry = mesh.geometry.clone();
  // glTF 的场景层级里可能带着旋转/缩放,烤进顶点,免得 InstancedMesh 用的时候还要补一层变换
  geometry.applyMatrix4(mesh.matrixWorld);
  geometry.computeBoundingSphere();

  const material = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material).clone();
  return { geometry, material };
}

/**
 * 材质统一改成 **alphaTest 裁剪**,不走半透明。
 *
 * 贴图是抠像来的,边缘有 alpha。如果按半透明渲染,场上峰值 120 个实例会引入
 * 深度排序问题(实例之间没有稳定的前后顺序),表现是物件边缘互相穿插闪烁。
 * alphaTest 是二值裁剪,正常写深度,和不透明物件一样排序。
 */
function tuneMaterial(material: THREE.Material) {
  const mat = material as THREE.MeshStandardMaterial;
  mat.transparent = false;
  mat.alphaTest = 0.5;
  mat.depthWrite = true;
  mat.side = THREE.FrontSide;
  if (mat.map) {
    mat.map.colorSpace = THREE.SRGBColorSpace;
    // 物件在锅里会翻滚,各种角度都会出现,各向异性过滤能明显改善斜看时的清晰度
    mat.map.anisotropy = 4;
  }
  mat.needsUpdate = true;
}

function hullPoints(geometry: THREE.BufferGeometry): Float32Array {
  const pos = geometry.getAttribute('position');
  return new Float32Array(pos.array as Float32Array);
}

/**
 * 并行加载 12 个模型。onProgress 传 0~1。
 * 任何一个失败都会整体 reject —— 见文件头,这里不做部分可用。
 */
export type GameAssets = {
  pieces: PieceAsset[];
  /** 槽位条底板贴图。7 个格子是画在图里的,布局量在 config.ts 的 TRAY.layout */
  tray: THREE.Texture;
};

/** 一次把模型和场景贴图都load 完,进度条覆盖全部下载量 */
export async function loadGameAssets(onProgress?: (ratio: number) => void): Promise<GameAssets> {
  const total = PIECE_TYPES.length + 1;
  let done = 0;
  const tick = () => {
    done += 1;
    onProgress?.(done / total);
  };

  const trayTask = new THREE.TextureLoader().loadAsync(`${SCENE_BASE}/tray.png`).then((tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    // 槽位条横跨屏幕,斜着看时各向异性过滤能明显改善清晰度
    tex.anisotropy = 4;
    tick();
    return tex;
  });

  const [pieces, tray] = await Promise.all([loadPieceAssets(tick), trayTask]);
  return { pieces, tray };
}

async function loadPieceAssets(onEach?: () => void): Promise<PieceAsset[]> {
  const loader = new GLTFLoader();

  const tasks = PIECE_TYPES.map(async (type) => {
    const url = `${MODEL_BASE}/${type.key}.glb`;
    const gltf = await loader.loadAsync(url);
    const { geometry, material } = extract(gltf.scene, type.key);
    tuneMaterial(material);
    onEach?.();
    return {
      geometry,
      material,
      hull: hullPoints(geometry),
      radius: geometry.boundingSphere?.radius ?? 0.5,
    } satisfies PieceAsset;
  });

  return Promise.all(tasks);
}

export function disposeAssets(assets: GameAssets) {
  assets.tray.dispose();
  for (const asset of assets.pieces) {
    asset.geometry.dispose();
    const mat = asset.material as THREE.MeshStandardMaterial;
    mat.map?.dispose();
    mat.dispose();
  }
}
