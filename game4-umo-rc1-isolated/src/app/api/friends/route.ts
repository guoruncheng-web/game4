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
  unread_count: string | number;
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
      latest.created_at as last_message_at,
      (
        select count(*)::int from direct_messages unread
        where unread.sender_id = friend.id
          and unread.recipient_id = ${user.id}
          and unread.read_at is null
      ) as unread_count
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
      unreadCount: Number(row.unread_count),
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

  const friendship = await sql`
    select 1 from friendships
    where user_a = least(${user.id}::bigint, ${targetId}::bigint)
      and user_b = greatest(${user.id}::bigint, ${targetId}::bigint)
    limit 1
  `;
  if (friendship.length > 0) {
    return NextResponse.json({ error: '你们已经是好友了' }, { status: 409 });
  }

  const reverse = await sql`
    select id from friend_requests
    where sender_id = ${targetId} and recipient_id = ${user.id} and status = 'pending'
    limit 1
  `;
  if (reverse.length > 0) {
    return NextResponse.json({ error: '对方已经向你发来申请，请到申请列表处理' }, { status: 409 });
  }

  const requests = (await sql`
    insert into friend_requests (sender_id, recipient_id)
    values (${user.id}, ${targetId})
    on conflict (sender_id, recipient_id) where status = 'pending'
    do update set created_at = friend_requests.created_at
    returning id
  `) as Array<{ id: string }>;
  return NextResponse.json({
    request: {
      id: Number(requests[0].id),
      recipient: { id: Number(target[0].id), username: target[0].username, avatar: target[0].avatar },
    },
  });
}
