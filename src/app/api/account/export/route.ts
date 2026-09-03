import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { getRequestUser } from '@/lib/session';
import { getThirteenHistory } from '@/lib/thirteen-history';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });
  const sql = getSql();
  const [wallet, transactions, friends, messages, supportRequests, thirteenMatches] = await Promise.all([
    sql`select diamonds_available, updated_at from platform_wallets where user_id = ${user.id}`,
    sql`
      select scope, game_slug, currency, kind, available_delta, reserved_delta, metadata, created_at
      from wallet_transactions where user_id = ${user.id} order by id
    `,
    sql`
      select u.uid, u.username, f.created_at
      from friendships f
      join users u on u.id = case when f.user_a = ${user.id} then f.user_b else f.user_a end
      where f.user_a = ${user.id} or f.user_b = ${user.id}
      order by f.created_at
    `,
    sql`
      select sender.uid as sender_uid, recipient.uid as recipient_uid, d.content, d.created_at, d.read_at
      from direct_messages d
      join users sender on sender.id = d.sender_id
      join users recipient on recipient.id = d.recipient_id
      where d.sender_id = ${user.id} or d.recipient_id = ${user.id}
      order by d.id
    `,
    sql`
      select id, game_slug, category, message, diagnostic, status, created_at, updated_at
      from support_requests where user_id = ${user.id} order by id
    `,
    getThirteenHistory(user.id, 50),
  ]);
  const payload = {
    exportedAt: new Date().toISOString(),
    account: { uid: user.uid, username: user.username, avatar: user.avatar },
    wallet: wallet[0] ?? { diamonds_available: 0 },
    transactions,
    friends,
    messages,
    supportRequests,
    thirteenMatches,
  };
  const response = NextResponse.json(payload);
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('Content-Disposition', `attachment; filename="game4-${user.uid}-export.json"`);
  return response;
}
