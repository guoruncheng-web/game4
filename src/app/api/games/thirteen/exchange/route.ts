import { NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/session';
import { exchangeDiamondsForThirteenChips, THIRTEEN_CHIPS_PER_DIAMOND } from '@/lib/wallet';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: '未登录或身份凭证无效' }, { status: 401 });
  let body: { diamondAmount?: unknown; idempotencyKey?: unknown };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: '请求格式不对' }, { status: 400 });
  }
  const diamondAmount = Number(body.diamondAmount);
  const idempotencyKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey : '';
  try {
    const result = await exchangeDiamondsForThirteenChips(user.id, diamondAmount, idempotencyKey);
    return NextResponse.json({
      uid: user.uid,
      wallet: {
        diamonds: result.diamonds,
        chips: result.chips,
        reserved: result.reserved,
        totalChips: result.totalChips,
      },
      exchange: {
        spentDiamonds: result.spentDiamonds,
        receivedChips: result.receivedChips,
        rate: THIRTEEN_CHIPS_PER_DIAMOND,
        replayed: result.replayed,
      },
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'exchange_failed';
    const status = code === 'insufficient_diamonds' ? 409 : code.startsWith('invalid_') ? 400 : 500;
    return NextResponse.json({ error: code, code }, { status });
  }
}
