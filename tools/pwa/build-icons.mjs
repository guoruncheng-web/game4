/**
 * 生成 PWA 图标(public/icons/*.png)。
 *
 * 图标源是这里内联的一段 SVG,但**产物一律是 PNG** —— 安装到桌面之后,
 * 图标由系统渲染,Android 的 maskable 裁切和 iOS 的圆角都只认位图,
 * 而且 iOS 至今不吃 manifest 里的 svg。所以这里用 sharp 一次性栅格化出所有尺寸。
 *
 * 改了图形就重跑一次:
 *   node tools/pwa/build-icons.mjs
 * 产物进仓库,构建时不需要再跑。
 *
 * sharp 是 next 的传递依赖,不是本项目的直接依赖,pnpm 的隔离 node_modules 下
 * 裸 import 'sharp' 未必解析得到,所以这里从 .pnpm 里兜一次底。
 */
import { createRequire } from 'node:module';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
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

/** 品牌绿,和首页的主按钮、logo 用的是同一组渐变 */
const GREEN_TOP = '#4fe07f';
const GREEN_BOTTOM = '#25a552';

/**
 * @param inset 图形相对画布的内缩比例。maskable 图标会被系统裁成圆形/水滴形,
 *              必须把主体压在中心 80% 的安全区里,否则手柄的把手会被削掉。
 */
function svg(size, { inset, radius, background }) {
  const pad = size * inset;
  const glyph = size - pad * 2;
  // lucide gamepad-2 的路径,原始 viewBox 是 24×24
  const scale = glyph / 24;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${GREEN_TOP}"/>
      <stop offset="1" stop-color="${GREEN_BOTTOM}"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${radius}" fill="${background}"/>
  <g transform="translate(${pad} ${pad}) scale(${scale})" fill="none" stroke="#ffffff"
     stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
    <path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z"/>
    <path d="M6 11h4M8 9v4"/>
    <path d="M15 12h.01M18 10h.01"/>
  </g>
</svg>`;
}

const TARGETS = [
  // 常规图标:自带圆角,给不做裁切的系统用
  { file: 'icon-192.png', size: 192, inset: 0.17, radiusRatio: 0.22, background: 'url(#g)' },
  { file: 'icon-512.png', size: 512, inset: 0.17, radiusRatio: 0.22, background: 'url(#g)' },
  // maskable:满幅铺色 + 更深的内缩,交给系统裁形状
  { file: 'maskable-512.png', size: 512, inset: 0.27, radiusRatio: 0, background: 'url(#g)' },
  // iOS 主屏图标:iOS 自己加圆角,画布必须是不透明的方图
  { file: 'apple-touch-icon.png', size: 180, inset: 0.17, radiusRatio: 0, background: 'url(#g)' },
];

const sharp = await loadSharp();
const outDir = join(ROOT, 'public/icons');
await mkdir(outDir, { recursive: true });

for (const target of TARGETS) {
  const markup = svg(target.size, {
    inset: target.inset,
    radius: target.size * target.radiusRatio,
    background: target.background,
  });
  const png = await sharp(Buffer.from(markup)).png({ compressionLevel: 9 }).toBuffer();
  await writeFile(join(outDir, target.file), png);
  console.log(`✓ public/icons/${target.file}  ${(png.length / 1024).toFixed(1)} KB`);
}
