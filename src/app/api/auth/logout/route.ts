import { NextResponse } from 'next/server';
import { SESSION_COOKIE, cookieOptions } from '@/lib/auth';
import { getSql } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 登出。
 *
 * 除了清 cookie,还把库里的 token_version +1 —— 否则那条已经发出去的签名 token
 * 在 30 天内一直有效,谁抄走了它就一直登着,"退出登录"只是本机眼不见为净。
 */
export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, '', cookieOptions(0));

  try {
    const user = await getCurrentUser();
    if (user) {
      const sql = getSql();
      await sql`update users set token_version = token_version + 1 where id = ${user.id}`;
    }
  } catch (error) {
    // 作废失败不该挡住登出:cookie 已经清了,本机层面用户确实已经退出
    console.error('[auth] 登出时作废会话失败', error);
  }

  return response;
}
