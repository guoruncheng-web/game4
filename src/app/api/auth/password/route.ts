import { NextResponse } from 'next/server';
import {
  SESSION_COOKIE, SESSION_MAX_AGE, cookieOptions, createSessionToken,
  createApiAccessToken, hashPassword, validatePassword, verifyPassword,
} from '@/lib/auth';
import { getSql } from '@/lib/db';
import { getRequestUser } from '@/lib/session';
import { clientIp, rateLimit, sweepRateLimits } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 改密码。
 *
 * 一键开号发的是一串随机字符,不给改的话用户就永远只能靠注册那次的截图 —— 这是刚需。
 * **不验旧密码**:发的密码是随机串,多数人根本没记住,只是存了截图;
 * 逼他们把旧密码抄回来反而挡住正常改密。改密码的凭据就是这条已登录的会话 cookie。
 *   代价:会话被盗 = 账号可被顶掉。所以会话 cookie 必须 httpOnly + sameSite,
 *   限流也要留着(下面按 IP 每 10 分钟 8 次)。
 * 改完把 token_version +1(踢掉所有旧会话),再给当前这台设备重新下发一条新 token。
 */
export async function POST(request: Request) {
  sweepRateLimits();
  if (!rateLimit(`password:${clientIp(request)}`, 8, 10 * 60_000)) {
    return NextResponse.json({ error: '操作太频繁了,过几分钟再试' }, { status: 429 });
  }

  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });

  let body: { newPassword?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '请求格式不对' }, { status: 400 });
  }

  const invalid = validatePassword(body.newPassword);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
  const newPassword = body.newPassword as string;

  const sql = getSql();
  const rows = (await sql`
    select password_hash from users where id = ${user.id} limit 1
  `) as Array<{ password_hash: string }>;
  const stored = rows[0]?.password_hash;
  if (!stored) return NextResponse.json({ error: '账号不存在' }, { status: 401 });
  if (verifyPassword(newPassword, stored)) {
    return NextResponse.json({ error: '新密码不能和当前密码一样' }, { status: 400 });
  }

  const updated = (await sql`
    update users
       set password_hash = ${hashPassword(newPassword)},
           token_version = token_version + 1
     where id = ${user.id}
    returning token_version
  `) as Array<{ token_version: number }>;

  const response = NextResponse.json({
    ok: true,
    token: createApiAccessToken(user.id, user.uid, updated[0].token_version),
  });
  response.headers.set('Cache-Control', 'no-store');
  // 自己这条会话刚被上面那次 +1 作废了,重新下发一条
  response.cookies.set(
    SESSION_COOKIE,
    createSessionToken(user.id, updated[0].token_version),
    cookieOptions(SESSION_MAX_AGE),
  );
  return response;
}
