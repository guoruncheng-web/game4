/**
 * 扫描 public/ludo/ 生成资源清单 → src/games/ludo/assets.ts
 *
 *   node tools/art/ludo/gen_manifest.mjs
 *
 * **加载页的职责是把所有素材预热进缓存**(DESIGN §2 ①):玩家在这一页等一次,
 * 后面创建房间、进棋盘就不用再等。手写清单迟早会漏 —— 加了张图忘了往数组里补,
 * 表现就是"某个界面第一次打开会闪一下白",而且极难联想到是清单漏了。
 * 所以清单由脚本生成,**加了素材就重跑一遍**。
 */
import { readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = 'public/ludo';
const OUT = 'src/games/ludo/assets.ts';

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      // raw/ 是按钮原图的备份,不进运行时
      return name === 'raw' ? [] : walk(full);
    }
    return [full];
  });
}

const files = walk(ROOT)
  .map((f) => '/' + relative('public', f).split(/[\\/]/).join('/'))
  .filter((f) => /\.(png|jpe?g|webp|glb|wav|mp3|ogg|js|wasm|efk|efkefc|efkmat|efkmodel)$/i.test(f))
  .sort();

const images = files.filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
const blobs = files.filter((f) => !/\.(png|jpe?g|webp)$/i.test(f));

writeFileSync(OUT, `/**
 * 资源清单 —— **由 tools/art/ludo/gen_manifest.mjs 生成,不要手改。**
 * 加了素材就重跑一遍脚本。加载页按这份清单预热缓存(DESIGN §2 ①)。
 */

/** 图片:用 Image() 预解码,进内存也进 HTTP 缓存 */
export const LUDO_IMAGES: string[] = ${JSON.stringify(images, null, 2)};

/** 模型、音频与 Effekseer 运行时:fetch 一遍进 HTTP 缓存,解码交给各自的运行时 */
export const LUDO_BLOBS: string[] = ${JSON.stringify(blobs, null, 2)};

export const LUDO_ASSET_COUNT = ${files.length};
`);

console.log(`清单已生成 → ${OUT}`);
console.log(`  图片 ${images.length} 个,模型/音频 ${blobs.length} 个,共 ${files.length}`);
