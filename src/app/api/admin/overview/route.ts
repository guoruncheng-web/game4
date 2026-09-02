import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { getRequestUser } from '@/lib/session';
import { GAMES } from '@/games/registry';
import { avatarUrlFor } from '@/lib/api-contract';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const admin = await getRequestUser(request);
  if (!admin?.isAdmin) return NextResponse.json({ error: '无权访问后台' }, { status: 403 });
  const query = new URL(request.url).searchParams.get('q')?.trim().toLowerCase() ?? '';
  const sql = getSql();
  const [counts, users, settings] = await Promise.all([
    sql`
      select
        (select count(*)::int from users) as users,
        (select count(*)::int from users where suspended_at is not null) as suspended,
        (select count(*)::int from friendships) as friendships,
        (select count(*)::int from direct_messages) as messages
    `,
    sql`
      select id, uid, username, avatar, avatar_version, is_admin, suspended_at, created_at, last_login_at
      from users
      where ${query === ''} or strpos(username, ${query}) > 0
      order by created_at desc
      limit 100
    `,
    sql`select slug, enabled, sort_order from game_settings order by sort_order, slug`,
  ]);
  const settingMap = new Map(settings.map((row) => [String(row.slug), row]));
  return NextResponse.json({
    stats: counts[0],
    users: users.map((row) => ({
      id: Number(row.id), uid: row.uid, username: row.username, avatar: row.avatar,
      avatarUrl: avatarUrlFor(Number(row.uid), Number(row.avatar_version)),
      isAdmin: row.is_admin, suspendedAt: row.suspended_at,
      createdAt: row.created_at, lastLoginAt: row.last_login_at,
    })),
    games: GAMES.map((game, index) => {
      const setting = settingMap.get(game.slug);
      return {
        slug: game.slug, title: game.title, tagline: game.tagline,
        enabled: setting?.enabled ?? true,
        sortOrder: Number(setting?.sort_order ?? (index + 1) * 10),
      };
    }).sort((a, b) => a.sortOrder - b.sortOrder),
  });
}
