import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { GAMES } from '@/games/registry';
import { getRequestUser } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });
  try {
    const sql = getSql();
    const rows = await sql`select slug, enabled, sort_order from game_settings order by sort_order`;
    const settings = new Map(rows.map((row) => [String(row.slug), row]));
    return NextResponse.json({
      games: GAMES.map((game, index) => ({
        slug: game.slug,
        enabled: settings.get(game.slug)?.enabled ?? true,
        sortOrder: Number(settings.get(game.slug)?.sort_order ?? (index + 1) * 10),
      })),
    });
  } catch {
    return NextResponse.json({ games: GAMES.map((game, index) => ({ slug: game.slug, enabled: true, sortOrder: (index + 1) * 10 })) });
  }
}
