/** 账号接口的端到端冒烟测试。用法:先起 dev server,再 node scripts/db/e2e-auth.mjs http://127.0.0.1:3100 */
const ORIGIN = process.argv[2] ?? 'http://127.0.0.1:3000';
const BASE = ORIGIN + '/api/auth';
const jar = new Map();

function cookieHeader(name = 'a') {
  const store = jar.get(name) ?? {};
  return Object.entries(store).map(([k, v]) => `${k}=${v}`).join('; ');
}
function absorb(res, name = 'a') {
  const store = jar.get(name) ?? {};
  for (const raw of res.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(';');
    const i = pair.indexOf('=');
    const k = pair.slice(0, i).trim();
    const v = pair.slice(i + 1).trim();
    if (v === '') delete store[k]; else store[k] = v;
  }
  jar.set(name, store);
}
async function call(path, { method = 'GET', body, jarName = 'a', absorbInto } = {}) {
  const res = await fetch((path.startsWith('/api/') ? ORIGIN : BASE) + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookieHeader(jarName) ? { cookie: cookieHeader(jarName) } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  absorb(res, absorbInto ?? jarName);
  const type = res.headers.get('content-type') ?? '';
  const payload = type.includes('json') ? await res.json() : `<${type} ${(await res.arrayBuffer()).byteLength}B>`;
  return { status: res.status, payload, headers: res.headers };
}

let failed = 0;
function check(label, ok, detail) {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? `  ${detail}` : ''}`);
  if (!ok) failed++;
}

let r = await call('/login', { method: 'POST', body: { username: 'test-e2e-1', password: 'Testpass123' } });
check('1 正确密码登录并返回头像',
  r.status === 200 && r.payload.username === 'test-e2e-1' && r.payload.avatar === '🎮',
  JSON.stringify(r.payload));

r = await call('/me');
check('2 /me 认得这条会话和头像',
  r.payload?.user?.username === 'test-e2e-1' && r.payload?.user?.avatar === '🎮',
  JSON.stringify(r.payload));

r = await call('/login', {
  method: 'POST', body: { username: 'test-e2e-2', password: 'Testpass123' }, jarName: 'friend',
});
check('聊天 好友账号登录', r.status === 200, JSON.stringify(r.payload));

r = await call('/api/friends/search?q=test-e2e-2');
const friend = r.payload?.users?.find((item) => item.username === 'test-e2e-2');
check('聊天 可按昵称搜索用户', r.status === 200 && friend && !friend.isFriend, JSON.stringify(r.payload));

r = await call('/api/friends', { method: 'POST', body: { userId: friend?.id } });
check('聊天 发出好友申请', r.status === 200 && r.payload?.request?.recipient?.username === 'test-e2e-2', JSON.stringify(r.payload));

r = await call('/api/friend-requests', { jarName: 'friend' });
const friendRequest = r.payload?.requests?.find((item) => item.sender.username === 'test-e2e-1');
check('聊天 对方收到好友申请', r.status === 200 && friendRequest, JSON.stringify(r.payload));

r = await call('/api/friend-requests', {
  method: 'PATCH', body: { requestId: friendRequest?.id, action: 'accept' }, jarName: 'friend',
});
check('聊天 对方同意后成为好友', r.status === 200 && r.payload?.friend?.username === 'test-e2e-1', JSON.stringify(r.payload));

r = await call('/api/messages', { method: 'POST', body: { friendId: friend?.id, content: '你好，来玩一局！' } });
check('聊天 给好友发送消息', r.status === 200 && r.payload?.message?.mine === true, JSON.stringify(r.payload));

r = await call(`/api/messages?friendId=${r.payload?.message?.senderId}`, { jarName: 'friend' });
check('聊天 好友收到消息',
  r.status === 200 && r.payload?.messages?.some((message) => message.content === '你好，来玩一局！' && !message.mine),
  JSON.stringify(r.payload));

r = await call('/login', { method: 'POST', body: { username: 'test-e2e-1', password: 'a'.repeat(150) }, jarName: 'trash' });
check('3 超长密码被挡在 scrypt 之前', r.status === 401, JSON.stringify(r.payload));

for (let i = 1; i <= 3; i++) {
  r = await call('/login', { method: 'POST', body: { username: 'test-e2e-1', password: 'wrong' }, jarName: 'trash' });
}
check('4 连错三次后要求验证码', r.payload.requireCaptcha === true, JSON.stringify(r.payload));

r = await call('/login', { method: 'POST', body: { username: 'test-e2e-1', password: 'Testpass123' }, jarName: 'trash' });
check('5 密码对也得先过验证码', r.status === 400 && r.payload.code === 'captcha', JSON.stringify(r.payload));

r = await call('/password', { method: 'POST', body: {} });
check('6 改密码不填新密码被拒', r.status === 400, JSON.stringify(r.payload));

r = await call('/password', { method: 'POST', body: { newPassword: 'abc' } });
check('7 新密码太短被拒', r.status === 400, JSON.stringify(r.payload));

r = await call('/password', { method: 'POST', body: { newPassword: 'Testpass123' } });
check('8 新密码不能和旧的一样', r.status === 400, JSON.stringify(r.payload));

const before = { ...(jar.get('a') ?? {}) };
r = await call('/password', { method: 'POST', body: { newPassword: 'Newpass456' } });
check('9 改密码成功', r.status === 200, JSON.stringify(r.payload));
const after = jar.get('a') ?? {};
check('10 改密码后重新下发了会话', before.gb_session !== after.gb_session);

jar.set('old', { gb_session: before.gb_session });
r = await call('/me', { jarName: 'old' });
check('11 改密码作废了旧会话', r.payload.user === null, JSON.stringify(r.payload));

r = await call('/me');
check('12 当前设备还登着', r.payload?.user?.username === 'test-e2e-1', JSON.stringify(r.payload));

const live = { ...(jar.get('a') ?? {}) };
r = await call('/logout', { method: 'POST' });
check('13 登出返回 ok', r.status === 200);
jar.set('afterlogout', { gb_session: live.gb_session });
r = await call('/me', { jarName: 'afterlogout' });
check('14 登出真的作废了 token(不只是清 cookie)', r.payload.user === null, JSON.stringify(r.payload));

r = await call('/password', { method: 'POST', body: { newPassword: 'Another789' }, jarName: 'anon' });
check('15 未登录不能改密码', r.status === 401, JSON.stringify(r.payload));

r = await call('/captcha', { jarName: 'cap' });
check('16 验证码是 PNG 且不缓存',
  r.headers.get('content-type') === 'image/png' && (r.headers.get('cache-control') ?? '').includes('no-store'),
  `${r.headers.get('content-type')} ${r.payload}`);
check('17 验证码 cookie 已下发', Boolean(jar.get('cap')?.gb_captcha));

r = await call('/register', { method: 'POST', body: { captcha: 'ZZZZ' }, jarName: 'cap' });
check('18 注册答错验证码被拒', r.status === 400 && r.payload.code === 'captcha', JSON.stringify(r.payload));

console.log(failed === 0 ? '\n全部通过' : `\n${failed} 项没过`);
process.exit(failed === 0 ? 0 : 1);
