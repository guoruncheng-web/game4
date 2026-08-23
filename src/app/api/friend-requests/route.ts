import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { getCurrentUser } from '@/lib/session';
import { clientIp, rateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });
  const sql = getSql();
  const rows = (await sql`
    select r.id, r.created_at, u.id as sender_id, u.username, u.avatar
    from friend_requests r
    join users u on u.id = r.sender_id
    where r.recipient_id = ${user.id} and r.status = 'pending'
    order by r.created_at desc
    limit 50
  `) as Array<{
    id: string; created_at: string; sender_id: string; username: string; avatar: string;
  }>;
  return NextResponse.json({
    requests: rows.map((row) => ({
      id: Number(row.id), createdAt: row.created_at,
      sender: { id: Number(row.sender_id), username: row.username, avatar: row.avatar },
    })),
  });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });
  if (!rateLimit(`friend-response:${user.id}:${clientIp(request)}`, 40, 10 * 60_000)) {
    return NextResponse.json({ error: '操作太频繁了' }, { status: 429 });
  }

  let body: { requestId?: unknown; action?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '请求格式不对' }, { status: 400 });
  }
  const requestId = Number(body.requestId);
  const action = body.action;
  if (!Number.isSafeInteger(requestId) || requestId <= 0 || (action !== 'accept' && action !== 'reject')) {
    return NextResponse.json({ error: '操作参数不对' }, { status: 400 });
  }

  const sql = getSql();
  const rows = (await sql.begin(async (transaction) => {
    const updated = (await transaction`
      update friend_requests
      set status = ${action === 'accept' ? 'accepted' : 'rejected'}, responded_at = now()
      where id = ${requestId} and recipient_id = ${user.id} and status = 'pending'
      returning sender_id
    `) as Array<{ sender_id: string }>;
    if (!updated[0]) return [];
    if (action === 'accept') {
      await transaction`
        insert into friendships (user_a, user_b)
        values (
          least(${user.id}::bigint, ${updated[0].sender_id}::bigint),
          greatest(${user.id}::bigint, ${updated[0].sender_id}::bigint)
        )
        on conflict do nothing
      `;
    }
    return updated;
  })) as Array<{ sender_id: string }>;

  if (!rows[0]) return NextResponse.json({ error: '申请不存在或已处理' }, { status: 404 });
  if (action === 'reject') return NextResponse.json({ ok: true });

  const friends = (await sql`
    select id, username, avatar from users where id = ${rows[0].sender_id} limit 1
  `) as Array<{ id: string; username: string; avatar: string }>;
  return NextResponse.json({
    friend: { id: Number(friends[0].id), username: friends[0].username, avatar: friends[0].avatar },
  });
}
