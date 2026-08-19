/**
 * 模型加载。八条鱼 + 一门炮,全部来自 Blender 无头脚本
 * (`tools/blender/fish-hunter/build_models.py` / `build_props.py`)。
 *
 * 两件事必须在这里做完,不能留到运行时:
 *
 * 1. **alphaTest 而不是 transparent。** 鱼的贴图是抠像出来的,轮廓靠 alpha。
 *    走 transparent 的话 Three 会关掉深度写入并按距离排序,几十条鱼互相穿插时
 *    会出现前后闪烁;alphaTest 是直接丢弃片元,深度正常写,永远不会闪。
 * 2. **蒙皮模型必须用 SkeletonUtils.clone。** 普通的 Object3D.clone() 不会
 *    复制骨架绑定,克隆出来的鱼会共用同一副骨骼 —— 表现是几十条鱼像连体婴一样
 *    完全同步地摆尾,而且第一条被销毁后其余全部僵住。
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { FISH_KINDS } from '../config';
import type { FishKindId } from '../config';

const BASE = '/fish-hunter/models';

export type FishAsset = {
  /** 原型。取用时 clone,不要直接加进场景 */
  proto: THREE.Object3D;
  clip: THREE.AnimationClip | null;
};

export type Assets = {
  fish: Record<FishKindId, FishAsset>;
  cannon: THREE.Object3D;
};

export async function loadAssets(): Promise<Assets> {
  const loader = new GLTFLoader();
  const kinds = Object.keys(FISH_KINDS) as FishKindId[];

  const [cannonGltf, ...fishGltfs] = await Promise.all([
    loader.loadAsync(`${BASE}/cannon.glb`),
    ...kinds.map((kind) => loader.loadAsync(`${BASE}/${kind}.glb`)),
  ]);

  const fish = {} as Record<FishKindId, FishAsset>;
  kinds.forEach((kind, i) => {
    const gltf = fishGltfs[i];
    const proto = gltf.scene;
    proto.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.alphaTest = 0.5;
      mat.transparent = false;
      mat.depthWrite = true;
      mat.side = THREE.FrontSide;
      // 鱼身是双片壳,正反两片都贴同一张图。关掉背面剔除会让背面透过来
      mesh.frustumCulled = false; // 蒙皮后的包围盒不随骨骼更新,开着会在边缘被误剔
    });
    fish[kind] = { proto, clip: gltf.animations[0] ?? null };
  });

  return { fish, cannon: cannonGltf.scene };
}

/** 取一条鱼的实例。返回克隆体和它自己的动画混合器 */
export function instantiateFish(asset: FishAsset): {
  object: THREE.Object3D;
  mixer: THREE.AnimationMixer | null;
  action: THREE.AnimationAction | null;
} {
  const object = cloneSkinned(asset.proto);
  if (!asset.clip) return { object, mixer: null, action: null };
  const mixer = new THREE.AnimationMixer(object);
  const action = mixer.clipAction(asset.clip);
  action.play();
  return { object, mixer, action };
}

/**
 * 取一门炮。`accent` 材质按座位染色 —— 必须先 clone 材质,
 * 否则四门炮共享同一个材质实例,改一个颜色四门一起变。
 */
export function instantiateCannon(proto: THREE.Object3D, color: number): {
  object: THREE.Object3D;
  turret: THREE.Object3D | null;
} {
  const object = proto.clone(true);
  object.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    const source = mesh.material as THREE.MeshStandardMaterial;
    const mat = source.clone();
    if (source.name === 'accent') {
      mat.color.setHex(color);
      mat.emissive = new THREE.Color(color).multiplyScalar(0.35);
    }
    mesh.material = mat;
  });
  return { object, turret: object.getObjectByName('turret') ?? null };
}
