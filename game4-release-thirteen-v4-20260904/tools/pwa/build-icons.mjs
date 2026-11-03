/**
 * 生成 PWA 图标(public/icons/*.png)。
 *
 * 图标源是 public/icons/pwa-icon-master-v2.png，产物也全部是 PNG ——
 * 安装到桌面之后，Android 的 maskable 裁切和 iOS 的圆角都只认位图。
 * 母版把手柄收在中央安全区，同一张图可以稳定派生各平台尺寸。
 *
 * 改了图形就重跑一次:
 *   node tools/pwa/build-icons.mjs
 * 产物进仓库,构建时不需要再跑。
 *
 * sharp 是 next 的传递依赖,不是本项目的直接依赖,pnpm 的隔离 node_modules 下
 * 裸 import 'sharp' 未必解析得到,所以这里从 .pnpm 里兜一次底。
 */
import { createRequire } from 'node:module';
import { mkdir, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

async function loadSharp() {
  try {
    return require('sharp');
  } catch {
    const store = join(ROOT, 'node_modules/.pnpm');
    const dir = (await readdir(store)).find((name) => name.startsWith('sharp@'));
    if (!dir) throw new Error('找不到 sharp,先跑 pnpm install');
    return require(join(store, dir, 'node_modules/sharp'));
  }
}

const TARGETS = [
  { file: 'icon-192.png', size: 192 },
  { file: 'icon-512.png', size: 512 },
  { file: 'maskable-512.png', size: 512 },
  { file: 'apple-touch-icon.png', size: 180 },
];

const sharp = await loadSharp();
const outDir = join(ROOT, 'public/icons');
const master = join(outDir, 'pwa-icon-master-v2.png');
await mkdir(outDir, { recursive: true });

for (const target of TARGETS) {
  const output = join(outDir, target.file);
  const info = await sharp(master)
    .resize(target.size, target.size, { fit: 'cover' })
    .png({ compressionLevel: 9 })
    .toFile(output);
  console.log(`✓ public/icons/${target.file}  ${(info.size / 1024).toFixed(1)} KB`);
}
