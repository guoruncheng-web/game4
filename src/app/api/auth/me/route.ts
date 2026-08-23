import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json({
    user: user ? { username: user.username, avatar: user.avatar } : null,
  });
}
