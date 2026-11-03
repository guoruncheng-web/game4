/** 后台管理冒烟测试。先 seed-e2e，再把 test-e2e-1 提升为管理员。 */
const ORIGIN = process.argv[2] ?? 'http://127.0.0.1:3000';
const jars = new Map();
const credentials = new Map();
let failed = 0;

async function call(path, { method = 'GET', body, jar = 'admin' } = {}) {
  const identity = credentials.get(jar);
  const response = await fetch(ORIGIN + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(jars.get(jar) ? { cookie: jars.get(jar) } : {}),
      ...(identity ? {
        'X-Game-UID': String(identity.uid),
        Authorization: `Bearer ${identity.token}`,
      } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const cookie = response.headers.getSetCookie?.().find((item) => item.startsWith('gb_session='));
  if (cookie) jars.set(jar, cookie.split(';')[0]);
  const data = await response.json();
  if (data?.uid && data?.token) credentials.set(jar, { uid: data.uid, token: data.token });
  if (data?.user?.uid && data?.token) credentials.set(jar, { uid: data.user.uid, token: data.token });
  return { status: response.status, data };
}
function check(label, ok, detail) {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` ${detail}` : ''}`);
  if (!ok) failed++;
}

let result = await call('/api/auth/login', { method: 'POST', body: { username: 'test-e2e-1', password: 'Testpass123' } });
check('管理员登录', result.status === 200 && result.data.uid === 880001 && result.data.isAdmin === true, JSON.stringify(result.data));
result = await call('/api/auth/login', { method: 'POST', body: { username: 'test-e2e-2', password: 'Testpass123' }, jar: 'user' });
check('普通用户登录', result.status === 200 && !result.data.isAdmin, JSON.stringify(result.data));

result = await call('/api/admin/overview');
const managedUser = result.data.users?.find((user) => user.username === 'test-e2e-2');
check('管理员读取概览', result.status === 200 && managedUser?.uid === 880002 && result.data.games?.length >= 8);
result = await call('/api/admin/overview', { jar: 'user' });
check('普通用户被后台拒绝', result.status === 403);

result = await call('/api/admin/users', { method: 'PATCH', body: { userId: managedUser?.id, action: 'suspend' } });
check('封禁普通用户', result.status === 200);
result = await call('/api/auth/me', { jar: 'user' });
check('封禁立即作废旧会话', result.data.user === null, JSON.stringify(result.data));
result = await call('/api/admin/users', { method: 'PATCH', body: { userId: managedUser?.id, action: 'restore' } });
check('解封普通用户', result.status === 200);

result = await call('/api/admin/games', { method: 'PATCH', body: { slug: 'star-runner', enabled: false, sortOrder: 10 } });
check('下架游戏', result.status === 200);
result = await call('/api/games');
check('公开游戏状态生效', result.data.games?.find((game) => game.slug === 'star-runner')?.enabled === false);
await call('/api/admin/games', { method: 'PATCH', body: { slug: 'star-runner', enabled: true, sortOrder: 10 } });

console.log(failed === 0 ? '\n后台测试全部通过' : `\n${failed} 项没过`);
process.exit(failed === 0 ? 0 : 1);
