import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { clientIp, rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function areFriends(userId: number, friendId: number) {
  const sql = getSql();
  const rows = await sql`
    select 1 from friendships
    where user_a = least(${userId}::bigint, ${friendId}::bigint)
      and user_b = greatest(${userId}::bigint, ${friendId}::bigint)
    limit 1
  `;
  return rows.length > 0;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });
  const friendId = Number(new URL(request.url).searchParams.get('friendId'));
  if (!Number.isSafeInteger(friendId) || friendId <= 0 || !(await areFriends(user.id, friendId))) {
    return NextResponse.json({ error: '好友不存在' }, { status: 404 });
  }

  const sql = getSql();
  await sql`
    update direct_messages set read_at = now()
    where sender_id = ${friendId} and recipient_id = ${user.id} and read_at is null
  `;
  const rows = (await sql`
    select id, sender_id, recipient_id, content, created_at
    from direct_messages
    where (sender_id = ${user.id} and recipient_id = ${friendId})
       or (sender_id = ${friendId} and recipient_id = ${user.id})
    order by id desc
    limit 100
  `) as Array<{
    id: string; sender_id: string; recipient_id: string; content: string; created_at: string;
  }>;

  return NextResponse.json({
    messages: rows.reverse().map((row) => ({
      id: Number(row.id),
      senderId: Number(row.sender_id),
      recipientId: Number(row.recipient_id),
      content: row.content,
      createdAt: row.created_at,
      mine: Number(row.sender_id) === user.id,
    })),
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });
  if (!rateLimit(`message-send:${user.id}:${clientIp(request)}`, 40, 60_000)) {
    return NextResponse.json({ error: '发送太频繁了' }, { status: 429 });
  }

  let body: { friendId?: unknown; content?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '请求格式不对' }, { status: 400 });
  }
  const friendId = Number(body.friendId);
  const content = typeof body.content === 'string' ? body.content.trim() : '';
  if (!Number.isSafeInteger(friendId) || friendId <= 0 || content.length < 1 || content.length > 500) {
    return NextResponse.json({ error: '消息需为 1—500 个字符' }, { status: 400 });
  }
  if (!(await areFriends(user.id, friendId))) {
    return NextResponse.json({ error: '只能给好友发消息' }, { status: 403 });
  }

  const sql = getSql();
  const rows = (await sql`
    insert into direct_messages (sender_id, recipient_id, content)
    values (${user.id}, ${friendId}, ${content})
    returning id, created_at
  `) as Array<{ id: string; created_at: string }>;
  return NextResponse.json({
    message: {
      id: Number(rows[0].id), senderId: user.id, recipientId: friendId,
      content, createdAt: rows[0].created_at, mine: true,
    },
  });
}
