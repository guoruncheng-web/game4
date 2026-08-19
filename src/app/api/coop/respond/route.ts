import { NextResponse } from 'next/server';
import { respond } from '@/lib/coop';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { getCurrentUser } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 接受 / 拒绝邀请。只有受邀方能调,且只对 pending 生效 —— 判定在 lib/coop.ts 里 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  if (!rateLimit(`coop-respond:${user.id}:${clientIp(request)}`, 30, 60_000)) {
    return NextResponse.json({ error: '请求过于频繁' }, { status: 429 });
  }

  const body = (await request.json().catch(() => null)) as { roomId?: unknown; accept?: unknown } | null;
  const roomId = Number(body?.roomId);
  if (!Number.isInteger(roomId) || roomId <= 0) {
    return NextResponse.json({ error: '参数不对' }, { status: 400 });
  }

  const room = await respond(user.id, roomId, body?.accept === true);
  // 房间不在了或者已经被处理过 —— 最常见的原因是邀请方等不及取消了
  if (!room) return NextResponse.json({ error: '这个邀请已经失效了' }, { status: 409 });
  return NextResponse.json({ room });
}
