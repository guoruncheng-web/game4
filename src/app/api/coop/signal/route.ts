import { NextResponse } from 'next/server';
import { drainSignals, markConnected, memberOf, pushSignal } from '@/lib/coop';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { getCurrentUser } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** SDP 一条能有几 KB,ICE candidate 很小。给 64KB 上限,够用且挡得住乱塞 */
const MAX_PAYLOAD = 64 * 1024;
const KINDS = new Set(['offer', 'answer', 'ice']);

/** 投递一条信令给房间里的另一方 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  // 握手期间 ICE candidate 会密集地来一批,给的额度要宽
  if (!rateLimit(`coop-sig-w:${user.id}:${clientIp(request)}`, 200, 60_000)) {
    return NextResponse.json({ error: '请求过于频繁' }, { status: 429 });
  }

  const body = (await request.json().catch(() => null)) as
    | { roomId?: unknown; kind?: unknown; payload?: unknown }
    | null;
  const roomId = Number(body?.roomId);
  const kind = String(body?.kind ?? '');
  if (!Number.isInteger(roomId) || roomId <= 0 || !KINDS.has(kind)) {
    return NextResponse.json({ error: '参数不对' }, { status: 400 });
  }
  if (JSON.stringify(body?.payload ?? null).length > MAX_PAYLOAD) {
    return NextResponse.json({ error: '信令过大' }, { status: 413 });
  }
  // 不校验房间归属的话,任何登录用户都能往别人的房间里塞信令
  if (!(await memberOf(user.id, roomId))) {
    return NextResponse.json({ error: '房间不存在' }, { status: 403 });
  }

  await pushSignal(roomId, user.id, kind, body?.payload ?? null);
  return NextResponse.json({ ok: true });
}

/**
 * 取走发给我的信令。**取完即删**,所以同一条只会被读到一次。
 * connected=1 顺带把房间推进到 connected —— 省掉一个单独的路由。
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: '未登录' }, { status: 401 });
  if (!rateLimit(`coop-sig-r:${user.id}:${clientIp(request)}`, 200, 60_000)) {
    return NextResponse.json({ error: '请求过于频繁' }, { status: 429 });
  }

  const url = new URL(request.url);
  const roomId = Number(url.searchParams.get('roomId'));
  if (!Number.isInteger(roomId) || roomId <= 0) {
    return NextResponse.json({ error: '参数不对' }, { status: 400 });
  }
  if (!(await memberOf(user.id, roomId))) {
    return NextResponse.json({ error: '房间不存在' }, { status: 403 });
  }

  if (url.searchParams.get('connected') === '1') await markConnected(user.id, roomId);
  return NextResponse.json({ signals: await drainSignals(roomId, user.id) });
}
