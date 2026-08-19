/**
 * 让 Node 能直接 import 浏览器侧那份 `src/games/**` 的 TS 源码。
 *
 * 背景:深海捕鱼的模拟层(`src/games/fish-hunter/sim/`)两端共用同一份代码
 * (见它的 DESIGN.md §3.5)。Node 24 本身能剥离类型,但**解析规则和打包器不一样**:
 * 打包器接受 `import './config'`,Node 的 ESM 要求写全扩展名,于是直接 import 会报
 * ERR_MODULE_NOT_FOUND。
 *
 * 两种解法里选了这个:
 *   A. 在源码里把扩展名写全(`'./config.ts'`)—— 要开 allowImportingTsExtensions,
 *      而且会让浏览器侧的写法变得不像这个仓库里的其它代码;
 *   B. 给 Node 挂一个 resolve 钩子把扩展名补上 —— 源码保持原样,代价是 30 行。
 *
 * 选 B。用法见 server/ts-register.mjs。
 */

import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';

const RELATIVE = /^\.{1,2}\//;

export async function resolve(specifier, context, next) {
  // 只管相对路径,包名一律交回 Node —— 别把 node_modules 的解析也接管了
  if (RELATIVE.test(specifier) && context.parentURL?.startsWith('file:')) {
    const base = dirname(fileURLToPath(context.parentURL));
    for (const suffix of ['.ts', '/index.ts']) {
      const candidate = resolvePath(base, specifier + suffix);
      if (existsSync(candidate)) {
        // 不指定 format:交给 Node 自己按 .ts 后缀走类型剥离。
        // 写死 'module' 会绕过剥离,表现是 "Unexpected token 'export'" ——
        // 因为它真的把带类型标注的源码当普通 JS 解析了
        return { url: pathToFileURL(candidate).href, shortCircuit: true };
      }
    }
  }
  return next(specifier, context);
}
