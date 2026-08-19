import { NextResponse } from 'next/server';
import { invite } from '@/lib/coop';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { getCurrentUser } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** 四种拒绝理由分开报,前端才能给出有用的提示,而不是笼统的「邀请失败」 */
const REASONS: Record<string, string> = {
  self: '不能邀请自己',
  busy: '对方正在游戏中',
  offline: '对方已经离线了',
  already: '你已经在一个房间里了',
};

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  if (!rateLimit(`coop-invite:${user.id}:${clientIp(request)}`, 20, 60_000)) {
    return NextResponse.json({ error: '邀请太频繁,歇一会儿' }, { status: 429 });
  }

  const body = (await request.json().catch(() => null)) as { userId?: unknown } | null;
  const target = Number(body?.userId);
  if (!Number.isInteger(target) || target <= 0) {
    return NextResponse.json({ error: '参数不对' }, { status: 400 });
  }

  const result = await invite(user.id, target);
  if (!result.ok) return NextResponse.json({ error: REASONS[result.reason] }, { status: 409 });
  return NextResponse.json({ room: result.room });
}
