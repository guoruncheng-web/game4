/**
 * 提升或撤销管理员：
 *   node --env-file=.env.local scripts/db/set-admin.mjs player-xxxxxx
 *   node --env-file=.env.local scripts/db/set-admin.mjs player-xxxxxx --revoke
 */
import postgres from 'postgres';

const username = process.argv[2]?.trim().toLowerCase();
if (!username) {
  console.error('请提供用户名');
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL 未配置');
const sql = postgres(url, { ssl: url.includes('sslmode=require') ? 'require' : false });
const enabled = !process.argv.includes('--revoke');
const rows = await sql`
  update users set is_admin = ${enabled}
  where username = ${username}
  returning id, username, is_admin
`;
if (!rows[0]) {
  console.error(`用户不存在：${username}`);
  await sql.end();
  process.exit(1);
}
console.log(`${rows[0].username} 管理员权限：${rows[0].is_admin ? '已启用' : '已撤销'}`);
await sql.end();
