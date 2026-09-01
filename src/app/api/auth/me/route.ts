import { NextResponse } from 'next/server';
import { createApiAccessToken } from '@/lib/auth';
import { getCurrentUser, getRequestUser } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // Cookie 是首次加载/刷新票据的启动凭据；若已有 Bearer，也允许无缝续签。
  const user = await getRequestUser(request) ?? await getCurrentUser();
  const response = NextResponse.json({
    user: user ? {
      uid: user.uid, username: user.username, avatar: user.avatar, isAdmin: user.isAdmin,
    } : null,
    token: user ? createApiAccessToken(user.id, user.uid, user.tokenVersion) : null,
  });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
