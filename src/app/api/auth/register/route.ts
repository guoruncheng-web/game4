import { NextResponse } from 'next/server';
import {
  CAPTCHA_COOKIE, SESSION_COOKIE, SESSION_MAX_AGE, cookieOptions, createSessionToken,
  createApiAccessToken, generateAvatar, generatePassword, generateUid, generateUsername,
  hashPassword, readCookie,
} from '@/lib/auth';
import { verifyCaptcha } from '@/lib/captcha';
import { getSql } from '@/lib/db';
import { clientIp, rateLimit, sweepRateLimits } from '@/lib/rate-limit';
import { REGISTRATION_DIAMOND_GRANT } from '@/lib/wallet';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 一键开号:后端直接生成用户名和密码,明文**只在这一次响应里**返回给前端弹窗。
 * 数据库里只留 scrypt 哈希,所以这串密码丢了就真的找不回来了。
 */
export async function POST(request: Request) {
  sweepRateLimits();
  const ip = clientIp(request);
  if (!rateLimit(`register:${ip}`, 5, 10 * 60_000)) {
    return NextResponse.json({ error: '注册太频繁了,过几分钟再试' }, { status: 429 });
  }

  let body: { captcha?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '请求格式不对' }, { status: 400 });
  }

  if (!verifyCaptcha(readCookie(request, CAPTCHA_COOKIE), body.captcha)) {
    return NextResponse.json({ error: '验证码不对或已过期', code: 'captcha' }, { status: 400 });
  }

  const password = generatePassword();
  const generatedAvatar = generateAvatar();
  const passwordHash = hashPassword(password);
  const sql = getSql();

  // 用户名是随机生成的,极小概率撞库,撞了就换一个再来
  let username = '';
  let uid = 0;
  let avatar = '';
  let userId: number | null = null;
  let tokenVersion = 0;
  for (let attempt = 0; attempt < 20 && userId === null; attempt++) {
    username = generateUsername();
    uid = generateUid();
    try {
      const rows = (await sql`
        with created_user as (
          insert into users (uid, username, password_hash, avatar, last_login_at)
          values (${uid}, ${username}, ${passwordHash}, ${generatedAvatar}, now())
          returning id, uid, avatar, token_version
        ), platform_wallet as (
          insert into platform_wallets (user_id, diamonds_available)
          select id, ${REGISTRATION_DIAMOND_GRANT} from created_user
          returning user_id
        ), grants as (
          insert into wallet_transactions
            (idempotency_key, user_id, scope, game_slug, currency, kind, available_delta, metadata)
          select 'welcome:platform:' || id, id, 'platform', null, 'diamond', 'grant', ${REGISTRATION_DIAMOND_GRANT},
            jsonb_build_object('reason', 'registration_welcome_v1')
          from created_user
        )
        select id, uid, avatar, token_version from created_user
      `) as Array<{ id: string; uid: number; avatar: string; token_version: number }>;
      // bigserial 回来是字符串
      userId = rows[0] ? Number(rows[0].id) : null;
      avatar = rows[0]?.avatar ?? '';
      uid = rows[0]?.uid ?? 0;
      tokenVersion = rows[0]?.token_version ?? 0;
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (!message.includes('duplicate key')) {
        console.error('[auth] 注册写库失败', error);
        return NextResponse.json({ error: '服务器开小差了,稍后再试' }, { status: 500 });
      }
    }
  }

  if (userId === null) {
    return NextResponse.json({ error: '生成账号失败,请重试' }, { status: 500 });
  }

  const response = NextResponse.json({
    uid,
    username,
    password,
    avatar,
    // 一键开号发的是随机 emoji,这一刻不可能有自定义头像
    avatarUrl: null,
    isAdmin: false,
    wallet: { diamonds: REGISTRATION_DIAMOND_GRANT },
    token: createApiAccessToken(userId, uid, tokenVersion),
  });
  response.headers.set('Cache-Control', 'no-store');
  response.cookies.set(
    SESSION_COOKIE,
    createSessionToken(userId, tokenVersion),
    cookieOptions(SESSION_MAX_AGE),
  );
  // 验证码用过即焚
  response.cookies.set(CAPTCHA_COOKIE, '', cookieOptions(0));
  return response;
}
