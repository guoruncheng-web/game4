#!/usr/bin/env node
/**
 * 生产构建后生成 PWA 外壳预缓存清单 public/pwa-precache.json。
 *
 * 清单 = Next 构建产物(.next/static,文件名带哈希) + src 里实际引用到的界面图片与图标。
 * 各游戏自己的大素材(public/<slug>/,合计 60MB+)不进清单,仍是玩到才缓存。
 * 由 `pnpm build` 在 next build 之后调用;生成物不入库(见 .gitignore)。
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const root = process.cwd();
const version = /const VERSION = '([^']+)'/.exec(readFileSync(join(root, 'public/sw.js'), 'utf8'))?.[1];
if (!version) throw new Error('public/sw.js 里找不到 VERSION');

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

const files = [];
const staticDir = join(root, '.next/static');
for (const path of walk(staticDir)) {
  if (path.endsWith('.map')) continue;
  files.push({ url: `/_next/static/${relative(staticDir, path).split(sep).join('/')}`, size: statSync(path).size });
}
if (files.length === 0) throw new Error('.next/static 为空,请先运行 next build');

const referenced = new Set();
const ASSET_REF = /\/(?:assets\/game-box|icons)\/[A-Za-z0-9_./-]+\.(?:webp|png|jpe?g|avif|svg)/g;
for (const path of walk(join(root, 'src'))) {
  if (!/\.(tsx?|css)$/.test(path)) continue;
  for (const match of readFileSync(path, 'utf8').matchAll(ASSET_REF)) referenced.add(match[0]);
}
for (const url of [...referenced].sort()) {
  const path = join(root, 'public', url);
  if (existsSync(path)) files.push({ url, size: statSync(path).size });
}

const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
writeFileSync(join(root, 'public/pwa-precache.json'), JSON.stringify({ version, totalBytes, files }));
console.log(`pwa-precache.json: ${version}, ${files.length} files, ${(totalBytes / 1048576).toFixed(1)} MB`);
