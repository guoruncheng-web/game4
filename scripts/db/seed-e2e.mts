/**
 * 给 e2e-auth.mjs 铺一个已知密码的测试账号(test-e2e-1 / Testpass123),跑完记得清:
 *
 *   node --experimental-strip-types --env-file=.env.local scripts/db/seed-e2e.mts
 *   node --experimental-strip-types --env-file=.env.local scripts/db/seed-e2e.mts --clean
 *
 * 用 --experimental-strip-types 是为了直接复用 src/lib/auth.ts 里的 hashPassword,
 * 别在测试脚本里另写一份哈希格式 —— 那样测的就不是线上那套了。
 */
import postgres from 'postgres';
import { hashPassword } from '../../src/lib/auth.ts';

const sql = postgres(process.env.DATABASE_URL!, { ssl: process.env.DATABASE_URL!.includes('sslmode=require') ? 'require' : false });
await sql`delete from users where username like 'test-e2e-%'`;

if (process.argv.includes('--clean')) {
  console.log('测试账号已清理');
} else {
  const passwordHash = hashPassword('Testpass123');
  const rows = (await sql`
    insert into users (username, password_hash, last_login_at)
    values
      ('test-e2e-1', ${passwordHash}, now()),
      ('test-e2e-2', ${passwordHash}, now())
    returning id, username
  `) as Array<{ id: string; username: string }>;
  console.log('测试账号已就绪 %s', rows.map((row) => `${row.username}(id=${row.id})`).join(', '));
}
process.exit(0);
