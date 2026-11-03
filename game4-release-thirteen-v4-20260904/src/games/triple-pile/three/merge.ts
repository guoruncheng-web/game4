/**
 * 顶点色几何体的合并工具。
 *
 * 食材造型不再由代码生成(改成 Blender 出的 glb,见 three/assets.ts),
 * 这里只剩场景静物 —— 锅体和桌面 —— 在用:它们是一堆基本几何体拼出来的,
 * 合并成一个 mesh 才能保住 draw call 预算。
 *
 * 两个坑:
 * 1. **merge 前统一 toNonIndexed()** —— 混合 indexed / non-indexed 会产生错误索引。
 * 2. **顶点色不做 sRGB → Linear 自动转换**,写进 color attribute 前必须自己转,
 *    跳过的表现是颜色明显发白,很容易被误判成「配色没调好」。
 */

import * as THREE from 'three';

export type Part = {
  geo: THREE.BufferGeometry;
  color: number;
  /** 逐三角的明度系数,长度 = 三角数 */
  faceTint?: number[];
};

const tmpColor = new THREE.Color();

/** sRGB 十六进制 → linear 的 r/g/b */
function linear(hex: number): [number, number, number] {
  tmpColor.setHex(hex, THREE.SRGBColorSpace);
  return [tmpColor.r, tmpColor.g, tmpColor.b];
}

/**
 * 把若干部件合并成一个非索引的 BufferGeometry,带顶点色。
 * 只处理 position / normal / color 三个属性 —— 本作没有贴图,uv 是纯浪费。
 */
export function mergeParts(parts: Part[]): THREE.BufferGeometry {
  const flat = parts.map((p) => ({ ...p, geo: p.geo.index ? p.geo.toNonIndexed() : p.geo }));
  let total = 0;
  for (const p of flat) total += p.geo.getAttribute('position').count;

  const position = new Float32Array(total * 3);
  const normal = new Float32Array(total * 3);
  const color = new Float32Array(total * 3);

  let offset = 0;
  for (const part of flat) {
    const pos = part.geo.getAttribute('position') as THREE.BufferAttribute;
    const nor = part.geo.getAttribute('normal') as THREE.BufferAttribute | undefined;
    const count = pos.count;
    position.set(pos.array as Float32Array, offset * 3);
    if (nor) normal.set(nor.array as Float32Array, offset * 3);
    const [r, g, b] = linear(part.color);
    for (let i = 0; i < count; i += 1) {
      // faceTint 是逐三角的,所以按 i/3 取
      const k = part.faceTint ? part.faceTint[Math.floor(i / 3)] ?? 1 : 1;
      color[(offset + i) * 3 + 0] = r * k;
      color[(offset + i) * 3 + 1] = g * k;
      color[(offset + i) * 3 + 2] = b * k;
    }
    offset += count;
    // 中间产物用完即弃,只有合并后的那一个会活到运行时
    part.geo.dispose();
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(position, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  out.setAttribute('color', new THREE.BufferAttribute(color, 3));
  out.computeBoundingSphere();
  return out;
}

