import { NextResponse } from 'next/server';
import { leave } from '@/lib/coop';
import { getCurrentUser } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 退出房间。局末、断线、关页面都要调。
 *
 * **不限流**:这个接口漏调一次的代价是双方一直卡在 busy、谁也邀请不了谁,
 * 而且当事人完全看不出问题在哪。宁可让它被多调几次 —— 它本来就是幂等的。
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  await leave(user.id);
  return NextResponse.json({ ok: true });
}
