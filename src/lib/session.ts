import { cookies } from 'next/headers';

export type CurrentUser = { uid: number; username: string; avatar: string; avatarUrl: string | null; isAdmin: boolean };
export type GatewaySession = { user: CurrentUser | null; token: string | null };

/** 前端只消费网关登录结果，不持有数据库连接或签发密钥。 */
export async function gatewaySession(headers: HeadersInit): Promise<GatewaySession> {
  try {
    const response = await fetch(`${process.env.BACKEND_GATEWAY_URL ?? 'http://127.0.0.1:7100'}/api/auth/me`, {
      headers, cache: 'no-store', signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return { user: null, token: null };
    return await response.json() as GatewaySession;
  } catch { return { user: null, token: null }; }
}
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const cookie = (await cookies()).get('gb_session')?.value;
  if (!cookie) return null;
  return (await gatewaySession({ cookie: `gb_session=${encodeURIComponent(cookie)}` })).user;
}
