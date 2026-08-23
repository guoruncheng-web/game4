import { NextResponse } from 'next/server';
import {
  CAPTCHA_COOKIE, MAX_PASSWORD_LENGTH, SESSION_COOKIE, SESSION_MAX_AGE,
  cookieOptions, createSessionToken, normalizeUsername, readCookie, verifyPassword,
} from '@/lib/auth';
import { verifyCaptcha } from '@/lib/captcha';
import { getSql } from '@/lib/db';
import {
  LOGIN_CAPTCHA_THRESHOLD, clearFailures, clientIp, failureCount,
  rateLimit, recordFailure, resetRateLimit, sweepRateLimits,
} from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 登录。
 *
 * 撞库打的就是这个接口,所以除了限流,还有一道**失败到 3 次就必须过图形验证码**的门槛:
 * 正常用户几乎撞不到(自己的密码不会连错三次),脚本则每试一次都得先 OCR 一张图。
 * 计数按 IP 和用户名各记一份,取大的那个 —— 换 IP 撞同一个号、或同一个 IP 撞一堆号,都拦得住。
 */
export async function POST(request: Request) {
  sweepRateLimits();
  const ip = clientIp(request);
  if (!rateLimit(`login:${ip}`, 12, 5 * 60_000)) {
    return NextResponse.json({ error: '尝试太频繁了,过几分钟再试' }, { status: 429 });
  }

  let body: { username?: unknown; password?: unknown; captcha?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '请求格式不对' }, { status: 400 });
  }

  const username = normalizeUsername(body.username);
  const password = typeof body.password === 'string' ? body.password : '';
  if (!username || !password) {
    return NextResponse.json({ error: '账号和密码都要填' }, { status: 400 });
  }
  // 长度先卡死,别让超长密码进到 scrypt 里(那是最廉价的一种 DoS)
  if (username.length > 64 || password.length > MAX_PASSWORD_LENGTH) {
    return NextResponse.json({ error: '账号或密码不对' }, { status: 401 });
  }

  const ipKey = `login-fail:ip:${ip}`;
  const userKey = `login-fail:user:${username}`;
  const failed = Math.max(failureCount(ipKey), failureCount(userKey));
  const needCaptcha = failed >= LOGIN_CAPTCHA_THRESHOLD;

  if (needCaptcha) {
    // 分开两种文案:第一次被要求验证码的人是"还没填",不是"填错了"
    const provided = typeof body.captcha === 'string' && body.captcha.trim() !== '';
    if (!provided) {
      return NextResponse.json(
        { error: '试错次数有点多,请先填一下验证码', code: 'captcha', requireCaptcha: true },
        { status: 400 },
      );
    }
    if (!verifyCaptcha(readCookie(request, CAPTCHA_COOKIE), body.captcha)) {
      return NextResponse.json(
        { error: '验证码不对或已过期', code: 'captcha', requireCaptcha: true },
        { status: 400 },
      );
    }
  }

  const sql = getSql();
  const rows = (await sql`
    select id, password_hash, avatar, token_version from users where username = ${username} limit 1
  `) as Array<{ id: string; password_hash: string; avatar: string; token_version: number }>;

  const user = rows[0];
  // 账号不存在和密码错误返回同一句话,不给撞库的人区分依据
  if (!user || !verifyPassword(password, user.password_hash)) {
    recordFailure(ipKey);
    recordFailure(userKey);
    const nextNeedsCaptcha = Math.max(failureCount(ipKey), failureCount(userKey)) >= LOGIN_CAPTCHA_THRESHOLD;
    return NextResponse.json(
      { error: '账号或密码不对', requireCaptcha: nextNeedsCaptcha },
      { status: 401 },
    );
  }

  await sql`update users set last_login_at = now() where id = ${user.id}`;

  // 登录成功:失败计数和限流桶一起清掉,别让用户被自己之前几次手滑挡在门外
  clearFailures(ipKey);
  clearFailures(userKey);
  resetRateLimit(`login:${ip}`);

  const response = NextResponse.json({ username, avatar: user.avatar });
  response.cookies.set(
    SESSION_COOKIE,
    createSessionToken(Number(user.id), user.token_version),
    cookieOptions(SESSION_MAX_AGE),
  );
  // 验证码用过即焚(nonce 那边已经作废了,这里顺手把 cookie 也清掉)
  if (needCaptcha) response.cookies.set(CAPTCHA_COOKIE, '', cookieOptions(0));
  return response;
}
