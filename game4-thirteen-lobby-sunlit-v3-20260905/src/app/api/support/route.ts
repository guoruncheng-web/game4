import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { clientIp, rateLimit, sweepRateLimits } from '@/lib/rate-limit';
import { getRequestUser } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CATEGORIES = new Set(['gameplay', 'fairness', 'account', 'privacy', 'technical', 'other']);
const DIAGNOSTIC_KEYS = new Set([
  'appealCode', 'roomId', 'matchNumber', 'productVersion', 'rulesVersion',
  'protocolVersion', 'networkState', 'platform',
]);

function sanitizedDiagnostic(value: unknown): Record<string, string | number | boolean | null> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const output: Record<string, string | number | boolean | null> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (!DIAGNOSTIC_KEYS.has(key)) continue;
    if (typeof raw === 'string') output[key] = raw.trim().slice(0, 128);
    else if (typeof raw === 'number' && Number.isFinite(raw)) output[key] = raw;
    else if (typeof raw === 'boolean' || raw === null) output[key] = raw;
  }
  return output;
}

export async function GET(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });
  const sql = getSql();
  const requests = await sql`
    select id, game_slug, category, message, diagnostic, status, created_at, updated_at
    from support_requests where user_id = ${user.id}
    order by created_at desc, id desc limit 50
  `;
  return NextResponse.json({ requests }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  sweepRateLimits();
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });
  if (!rateLimit(`support:${user.id}:${clientIp(request)}`, 5, 60 * 60_000)) {
    return NextResponse.json({ error: '提交太频繁，请稍后再试' }, { status: 429 });
  }
  let body: { category?: unknown; message?: unknown; diagnostic?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '请求格式不对' }, { status: 400 });
  }
  const category = typeof body.category === 'string' ? body.category : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!CATEGORIES.has(category)) return NextResponse.json({ error: '反馈分类无效' }, { status: 400 });
  if (message.length < 1 || message.length > 1000) {
    return NextResponse.json({ error: '反馈内容需为 1—1000 个字符' }, { status: 400 });
  }
  const diagnostic = sanitizedDiagnostic(body.diagnostic);
  const sql = getSql();
  const rows = await sql`
    insert into support_requests (user_id, game_slug, category, message, diagnostic)
    values (${user.id}, 'thirteen', ${category}, ${message}, ${sql.json(diagnostic)})
    returning id, status, created_at
  `;
  return NextResponse.json({
    request: {
      id: Number(rows[0].id), status: rows[0].status, createdAt: rows[0].created_at,
    },
  }, { status: 201 });
}
