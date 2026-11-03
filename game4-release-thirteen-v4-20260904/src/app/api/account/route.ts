import { NextResponse } from 'next/server';
import { SESSION_COOKIE, cookieOptions, verifyPassword } from '@/lib/auth';
import { getSql } from '@/lib/db';
import { clientIp, rateLimit, sweepRateLimits } from '@/lib/rate-limit';
import { getRequestUser } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function DELETE(request: Request) {
  sweepRateLimits();
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });
  if (!rateLimit(`account-delete:${user.id}:${clientIp(request)}`, 3, 60 * 60_000)) {
    return NextResponse.json({ error: '操作太频繁，请稍后再试' }, { status: 429 });
  }
  let body: { password?: unknown; confirmation?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '请求格式不对' }, { status: 400 });
  }
  const password = typeof body.password === 'string' ? body.password : '';
  if (body.confirmation !== `DELETE ${user.uid}`) {
    return NextResponse.json({ error: `请输入 DELETE ${user.uid} 确认注销` }, { status: 400 });
  }
  const sql = getSql();
  const rows = await sql`select password_hash from users where id = ${user.id} limit 1`;
  if (!rows[0]?.password_hash || !verifyPassword(password, rows[0].password_hash)) {
    return NextResponse.json({ error: '密码不正确' }, { status: 403 });
  }

  await sql.begin(async (transaction) => {
    await transaction`
      update thirteen_match_players
      set user_id = null, public_uid = null, display_name = '已注销玩家', avatar = ''
      where user_id = ${user.id}
    `;
    await transaction`delete from users where id = ${user.id}`;
  });

  const response = NextResponse.json({ ok: true, deletedUid: user.uid });
  response.headers.set('Cache-Control', 'no-store');
  response.cookies.set(SESSION_COOKIE, '', cookieOptions(0));
  return response;
}
