import postgres from 'postgres';

/**
 * Postgres 连接句柄。
 *
 * 用 `postgres`(porsager)而不是 `@neondatabase/serverless`:
 * 后者的 `neon()` 走的是 Neon 私有的 HTTP 协议,**连不了普通 Postgres** ——
 * 而数据库已经从 Neon(us-east-1)迁到了应用同机的容器里。
 *
 * 这次迁移是实测驱动的:从阿里云节点查 Neon 稳定在 **222ms/次**(首次 744ms),
 * 而 getCurrentUser() 是每个需要登录的请求都要走一次的,等于每次页面加载凭空加 222ms。
 * 同机之后是 1ms 级。
 *
 * 两个驱动的模板字符串用法一致(``sql`select ...`` 返回行数组),所以业务代码没动。
 *
 * 仍然刻意做成懒初始化的函数,而不是模块顶层 `const sql = postgres(...)`:
 * Next 在构建时会执行模块顶层代码,而构建环境里不一定有 DATABASE_URL,
 * 顶层初始化会让 `next build` 直接崩掉。
 */
let cached: ReturnType<typeof postgres> | null = null;

export function getSql() {
  if (!cached) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL 未配置:先跑 vercel env pull 或在 .env.local 里补上');
    cached = postgres(url, {
      // 同机连接不需要 TLS;连 Neon 之类的托管库时靠 URL 里的 sslmode=require 打开
      ssl: url.includes('sslmode=require') ? 'require' : false,
      // Next 的每个请求都可能查库,连接池小一点就够,别把数据库的连接数吃光
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  return cached;
}
