import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type AvatarRow = { mime: string; bytes: Buffer | Uint8Array; avatar_version: number };

/**
 * 按 uid 取头像图片。
 *
 * **这是公开接口,不校验登录。** 它被 `<img src>` 加载,而 img 请求带不上
 * `Authorization` 头(`apiFetch` 那套凭据在这里用不上);头像和用户名一样是
 * 站内公开信息 —— 好友列表、聊天、后台本来就都在展示别人的头像。
 * 换句话说这里泄露的信息量,等于"这个 uid 存在且换过头像",和搜索接口一致。
 *
 * 缓存:URL 里带了 `?v=<avatar_version>`,内容不会变,所以直接发 immutable 一年。
 * 版本号对不上时按 302 送到正确的 URL,而不是直接把新图塞给旧 URL ——
 * 否则那张旧 URL 会把新图 immutable 缓存住,下次再换头像就刷不掉了。
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ uid: string }> },
) {
  const { uid: rawUid } = await params;
  if (!/^\d{6}$/.test(rawUid)) return new NextResponse(null, { status: 404 });
  const uid = Number(rawUid);

  const sql = getSql();
  const rows = (await sql`
    select a.mime, a.bytes, u.avatar_version
    from users u
    join user_avatars a on a.user_id = u.id
    where u.uid = ${uid} and u.suspended_at is null and u.avatar_version > 0
    limit 1
  `) as AvatarRow[];
  const row = rows[0];
  if (!row) return new NextResponse(null, { status: 404 });

  const requested = new URL(request.url).searchParams.get('v');
  if (requested !== String(row.avatar_version)) {
    return NextResponse.redirect(new URL(`/api/avatar/${uid}?v=${row.avatar_version}`, request.url), 302);
  }

  const body = Buffer.isBuffer(row.bytes) ? row.bytes : Buffer.from(row.bytes);
  // ETag 直接用版本号:内容和版本号一一对应,不必再去算内容哈希
  const etag = `"avatar-${uid}-${row.avatar_version}"`;
  if (request.headers.get('if-none-match') === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  }

  return new NextResponse(new Uint8Array(body), {
    headers: {
      'Content-Type': row.mime,
      'Content-Length': String(body.byteLength),
      'Cache-Control': 'public, max-age=31536000, immutable',
      ETag: etag,
      // 上传时已经按魔数认过格式,但浏览器仍然不该拿 Content-Type 之外的东西去猜
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
    },
  });
}
