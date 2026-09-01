import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { getRequestUser } from '@/lib/session';
import { clientIp, rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });
  if (!rateLimit(`user-search:${user.id}:${clientIp(request)}`, 60, 60_000)) {
    return NextResponse.json({ error: '搜索太频繁了' }, { status: 429 });
  }

  const query = new URL(request.url).searchParams.get('q')?.trim().toLowerCase() ?? '';
  if (query.length < 2 || query.length > 64) {
    return NextResponse.json({ users: [] });
  }

  const sql = getSql();
  const rows = (await sql`
    select
      u.id,
      u.uid,
      u.username,
      u.avatar,
      exists (
        select 1 from friendships f
        where f.user_a = least(${user.id}, u.id)
          and f.user_b = greatest(${user.id}, u.id)
      ) as is_friend,
      exists (
        select 1 from friend_requests r
        where r.sender_id = ${user.id} and r.recipient_id = u.id and r.status = 'pending'
      ) as request_sent,
      exists (
        select 1 from friend_requests r
        where r.sender_id = u.id and r.recipient_id = ${user.id} and r.status = 'pending'
      ) as request_received
    from users u
    where u.id <> ${user.id}
      and (strpos(u.username, ${query}) > 0 or u.uid::text = ${query})
    order by case when u.uid::text = ${query} or u.username = ${query} then 0 else 1 end, u.username
    limit 20
  `) as Array<{
    id: string; uid: number; username: string; avatar: string; is_friend: boolean;
    request_sent: boolean; request_received: boolean;
  }>;

  return NextResponse.json({
    users: rows.map((row) => ({
      id: Number(row.id), uid: row.uid, username: row.username, avatar: row.avatar,
      isFriend: row.is_friend, requestSent: row.request_sent, requestReceived: row.request_received,
    })),
  });
}
