/**
 * 建表脚本(幂等,可以反复跑)。
 *
 *   node --env-file=.env.local scripts/db/init.mjs
 *
 * 注意:只有 Next 会自动读 .env.local,普通 node 脚本不会,所以必须显式 --env-file。
 */
import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('缺少 DATABASE_URL。先 `vercel env pull` 或手动写进 .env.local,再用 --env-file=.env.local 跑。');
  process.exit(1);
}

const sql = neon(url);
const source = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');

// neon 的 HTTP 模式一次只吃一条语句,按分号拆开逐条执行
const statements = source
  .split(';')
  .map((s) => s.trim())
  .filter((s) => s.length > 0 && !s.split('\n').every((line) => line.trim().startsWith('--')));

for (const statement of statements) {
  await sql.query(statement);
  console.log('✓', statement.split('\n').filter((l) => !l.trim().startsWith('--'))[0].slice(0, 70));
}

const [{ count }] = await sql.query('select count(*)::int as count from users');
console.log(`\n建表完成,users 表现有 ${count} 条记录`);
