import { NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/session';
import { ensureWalletSnapshot } from '@/lib/wallet';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: '未登录或身份凭证无效' }, { status: 401 });
  const wallet = await ensureWalletSnapshot(user.id);
  return NextResponse.json({
    uid: user.uid,
    wallet,
    economyMode: 'free-v1',
    capabilities: { exchange: false, stakes: false, diamondSpending: false },
  }, { headers: { 'Cache-Control': 'no-store' } });
}
