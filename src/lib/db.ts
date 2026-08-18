import { neon } from '@neondatabase/serverless';

/**
 * Neon(Postgres)的连接句柄。
 *
 * 刻意做成懒初始化的函数,而不是模块顶层 `const sql = neon(...)`:
 * Next 在构建时会执行模块顶层代码,而构建环境里不一定有 DATABASE_URL,
 * 顶层初始化会让 `next build` 直接崩掉。
 *
 * 也刻意不用 Proxy 包一层(那是另一种常见的懒加载写法)——
 * Proxy 会拦截属性探测,某些库拿它做适配器检查时会静默卡死。
 */
let cached: ReturnType<typeof neon> | null = null;

export function getSql() {
  if (!cached) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL 未配置:先跑 vercel env pull 或在 .env.local 里补上');
    cached = neon(url);
  }
  return cached;
}
