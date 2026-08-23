import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { clientIp, rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type FriendRow = {
  id: string;
  username: string;
  avatar: string;
  last_message: string | null;
  last_message_at: string | null;
};

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });

  const sql = getSql();
  const rows = (await sql`
    select
      friend.id,
      friend.username,
      friend.avatar,
      latest.content as last_message,
      latest.created_at as last_message_at
    from friendships f
    join users friend on friend.id = case when f.user_a = ${user.id} then f.user_b else f.user_a end
    left join lateral (
      select content, created_at
      from direct_messages
      where (sender_id = ${user.id} and recipient_id = friend.id)
         or (sender_id = friend.id and recipient_id = ${user.id})
      order by id desc
      limit 1
    ) latest on true
    where f.user_a = ${user.id} or f.user_b = ${user.id}
    order by latest.created_at desc nulls last, f.created_at desc
  `) as FriendRow[];

  return NextResponse.json({
    friends: rows.map((row) => ({
      id: Number(row.id),
      username: row.username,
      avatar: row.avatar,
      lastMessage: row.last_message,
      lastMessageAt: row.last_message_at,
    })),
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });
  if (!rateLimit(`friend-add:${user.id}:${clientIp(request)}`, 20, 10 * 60_000)) {
    return NextResponse.json({ error: '添加得太频繁了，稍后再试' }, { status: 429 });
  }

  let body: { userId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '请求格式不对' }, { status: 400 });
  }
  const targetId = Number(body.userId);
  if (!Number.isSafeInteger(targetId) || targetId <= 0 || targetId === user.id) {
    return NextResponse.json({ error: '不能添加这个用户' }, { status: 400 });
  }

  const sql = getSql();
  const target = (await sql`
    select id, username, avatar from users where id = ${targetId} limit 1
  `) as Array<{ id: string; username: string; avatar: string }>;
  if (!target[0]) return NextResponse.json({ error: '用户不存在' }, { status: 404 });

  await sql`
    insert into friendships (user_a, user_b)
    values (
      least(${user.id}::bigint, ${targetId}::bigint),
      greatest(${user.id}::bigint, ${targetId}::bigint)
    )
    on conflict do nothing
  `;
  return NextResponse.json({
    friend: { id: Number(target[0].id), username: target[0].username, avatar: target[0].avatar },
  });
}
