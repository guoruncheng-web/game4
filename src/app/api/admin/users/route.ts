import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { clientIp, rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

export async function PATCH(request: Request) {
  const admin = await getCurrentUser();
  if (!admin?.isAdmin) return NextResponse.json({ error: '无权操作' }, { status: 403 });
  if (!rateLimit(`admin-user:${admin.id}:${clientIp(request)}`, 60, 60_000)) {
    return NextResponse.json({ error: '操作太频繁' }, { status: 429 });
  }
  let body: { userId?: unknown; action?: unknown };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: '请求格式不对' }, { status: 400 });
  }
  const userId = Number(body.userId);
  if (!Number.isSafeInteger(userId) || userId <= 0 || (body.action !== 'suspend' && body.action !== 'restore')) {
    return NextResponse.json({ error: '操作参数不对' }, { status: 400 });
  }
  if (userId === admin.id) return NextResponse.json({ error: '不能封禁自己的账号' }, { status: 400 });
  const sql = getSql();
  const rows = await sql`
    update users
    set suspended_at = ${body.action === 'suspend' ? sql`now()` : null},
        token_version = token_version + 1
    where id = ${userId} and is_admin = false
    returning id, suspended_at
  `;
  if (!rows[0]) return NextResponse.json({ error: '用户不存在或为管理员' }, { status: 404 });
  return NextResponse.json({ ok: true, suspendedAt: rows[0].suspended_at });
}
