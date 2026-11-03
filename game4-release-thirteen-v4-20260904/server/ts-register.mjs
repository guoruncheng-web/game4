/**
 * 装上 TS 解析钩子。用法:
 *   node --import ./server/ts-register.mjs server/ws.mjs
 *
 * 为什么要单独一个文件:register() 必须在被钩的模块加载**之前**跑完,
 * 写在 ws.mjs 顶部是来不及的(它自己的 import 会先于任何语句求值)。
 */
import { register } from 'node:module';

register('./ts-resolve.mjs', import.meta.url);
