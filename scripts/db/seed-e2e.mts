/**
 * 给 e2e-auth.mjs 铺一个已知密码的测试账号(test-e2e-1 / Testpass123),跑完记得清:
 *
 *   node --experimental-strip-types --env-file=.env.local scripts/db/seed-e2e.mts
 *   node --experimental-strip-types --env-file=.env.local scripts/db/seed-e2e.mts --clean
 *
 * 用 --experimental-strip-types 是为了直接复用 src/lib/auth.ts 里的 hashPassword,
 * 别在测试脚本里另写一份哈希格式 —— 那样测的就不是线上那套了。
 */
import { neon } from '@neondatabase/serverless';
import { hashPassword } from '../../src/lib/auth.ts';

const sql = neon(process.env.DATABASE_URL!);
await sql`delete from users where username like 'test-e2e-%'`;

if (process.argv.includes('--clean')) {
  console.log('测试账号已清理');
} else {
  const rows = (await sql`
    insert into users (username, password_hash, last_login_at)
    values ('test-e2e-1', ${hashPassword('Testpass123')}, now())
    returning id
  `) as Array<{ id: string }>;
  console.log('测试账号已就绪 test-e2e-1 / Testpass123 (id=%s)', rows[0].id);
}
process.exit(0);
