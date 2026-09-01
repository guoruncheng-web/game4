import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { getRequestUser } from '@/lib/session';
import { getGame } from '@/games/registry';

export const runtime = 'nodejs';

export async function PATCH(request: Request) {
  const admin = await getRequestUser(request);
  if (!admin?.isAdmin) return NextResponse.json({ error: '无权操作' }, { status: 403 });
  let body: { slug?: unknown; enabled?: unknown; sortOrder?: unknown };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: '请求格式不对' }, { status: 400 });
  }
  const slug = typeof body.slug === 'string' ? body.slug : '';
  const enabled = body.enabled;
  const sortOrder = Number(body.sortOrder);
  if (!getGame(slug) || typeof enabled !== 'boolean' || !Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 9999) {
    return NextResponse.json({ error: '游戏配置不对' }, { status: 400 });
  }
  const sql = getSql();
  await sql`
    insert into game_settings (slug, enabled, sort_order, updated_at)
    values (${slug}, ${enabled}, ${sortOrder}, now())
    on conflict (slug) do update
    set enabled = excluded.enabled, sort_order = excluded.sort_order, updated_at = now()
  `;
  return NextResponse.json({ ok: true });
}
