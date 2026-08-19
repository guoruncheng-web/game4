/**
 * 建表脚本(幂等,可以反复跑)。
 *
 *   node --env-file=.env.local scripts/db/init.mjs
 *
 * 注意:只有 Next 会自动读 .env.local,普通 node 脚本不会,所以必须显式 --env-file。
 */
import { readFileSync } from 'node:fs';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('缺少 DATABASE_URL。先 `vercel env pull` 或手动写进 .env.local,再用 --env-file=.env.local 跑。');
  process.exit(1);
}

const sql = postgres(url, { ssl: url.includes('sslmode=require') ? 'require' : false });
const source = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');

/**
 * neon 的 HTTP 模式一次只吃一条语句,所以要按分号拆开逐条执行。
 *
 * **拆之前必须先剥掉行注释。** 直接 split(';') 的话,注释里只要出现一个半角分号
 * (中文注释里很容易写出来),就会把一条 create table 从中间劈成两半 ——
 * 报错是 "syntax error at end of input",而错误信息里完全看不出真正的原因在注释里。
 */
const statements = source
  .split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n')
  .split(';')
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

for (const statement of statements) {
  await sql.unsafe(statement);
  console.log('✓', statement.split('\n')[0].slice(0, 70));
}

const [{ count }] = await sql.unsafe('select count(*)::int as count from users');
console.log(`\n建表完成,users 表现有 ${count} 条记录`);

await sql.end();
