import { NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/session';
import { getThirteenHistory } from '@/lib/thirteen-history';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: '未登录或身份凭证无效' }, { status: 401 });
  const limit = Number(new URL(request.url).searchParams.get('limit') ?? 20);
  const matches = await getThirteenHistory(user.id, limit);
  return NextResponse.json({ uid: user.uid, matches }, { headers: { 'Cache-Control': 'no-store' } });
}
