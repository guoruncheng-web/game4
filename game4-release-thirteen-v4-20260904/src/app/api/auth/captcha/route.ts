import { NextResponse } from 'next/server';
import { CAPTCHA_COOKIE, cookieOptions } from '@/lib/auth';
import { CAPTCHA_TTL_SECONDS, generateCode, renderCaptchaPng, sealCaptcha } from '@/lib/captcha';
import { clientIp, rateLimit, sweepRateLimits } from '@/lib/rate-limit';

/** node:crypto 和 zlib 都要 Node 运行时,不能跑在 Edge 上 */
export const runtime = 'nodejs';
/** 每次请求都要出一张新图,绝对不能被任何一层缓存住 */
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  sweepRateLimits();
  if (!rateLimit(`captcha:${clientIp(request)}`, 30, 60_000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const code = generateCode();
  const png = renderCaptchaPng(code);
  const response = new NextResponse(new Uint8Array(png), {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'no-store, max-age=0',
    },
  });
  // 答案不落库,只把 HMAC 签名放进 httpOnly cookie
  response.cookies.set(CAPTCHA_COOKIE, sealCaptcha(code), cookieOptions(CAPTCHA_TTL_SECONDS));
  return response;
}
