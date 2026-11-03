import { NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: '未登录或身份凭证无效' }, { status: 401 });
  return NextResponse.json({
    error: '钻石兑换牌币功能已退役',
    code: 'exchange_retired',
    economyMode: 'free-v1',
  }, { status: 410, headers: { 'Cache-Control': 'no-store' } });
}
