import { NextResponse } from 'next/server';
import { getSql } from '@/lib/db';
import { getRequestUser } from '@/lib/session';
import { clientIp, rateLimit, sweepRateLimits } from '@/lib/rate-limit';
import { inspectAvatar, MAX_AVATAR_BYTES } from '@/lib/avatar';
import { avatarUrlFor } from '@/lib/api-contract';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 上传自定义头像。
 *
 * 请求体是**图片原始字节**,不是 multipart —— 图片本来就是浏览器用 canvas 现生成的
 * 一个 Blob,再套一层表单编码只是让两边都多解析一次。Content-Type 只作参考,
 * 真正认格式的是 `inspectAvatar` 里的魔数。
 *
 * 缩放裁剪都在客户端做(见 AvatarUploader),原因写在 `src/lib/avatar.ts` 开头。
 */
export async function POST(request: Request) {
  sweepRateLimits();
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });
  // 按用户和 IP 各限一次:图片要落库,不能让一个人拿脚本刷满磁盘。
  // 正常人换头像一天也用不到几次,这个数是留给"挑了半天来回换"和冒烟测试的余量
  if (!rateLimit(`avatar:${user.id}`, 20, 10 * 60_000)
    || !rateLimit(`avatar-ip:${clientIp(request)}`, 60, 10 * 60_000)) {
    return NextResponse.json({ error: '换得太频繁了,过几分钟再试' }, { status: 429 });
  }

  // 先看声明长度就拒掉超大请求,别等整个 body 读进内存再判
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_AVATAR_BYTES) {
    return NextResponse.json(
      { error: `图片太大了,请控制在 ${Math.floor(MAX_AVATAR_BYTES / 1024)}KB 以内` },
      { status: 413 },
    );
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await request.arrayBuffer());
  } catch {
    return NextResponse.json({ error: '图片没有上传完整,请重试' }, { status: 400 });
  }

  const checked = inspectAvatar(bytes);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
  const { mime, width, height } = checked.value;

  const sql = getSql();
  // 版本号 +1 和图片写入必须同一个事务:先写图后加版本的话,中间崩掉会让所有人
  // 拿着旧 URL 命中 CDN/浏览器里的旧图,而库里已经是新图,再也对不上
  const rows = await sql.begin(async (tx) => {
    await tx`
      insert into user_avatars (user_id, mime, bytes, width, height, updated_at)
      values (${user.id}, ${mime}, ${Buffer.from(bytes)}, ${width}, ${height}, now())
      on conflict (user_id) do update
        set mime = excluded.mime, bytes = excluded.bytes,
            width = excluded.width, height = excluded.height, updated_at = now()
    `;
    // 取绝对值再 +1:之前删过头像的账号版本号是负的(见 schema.sql 里的编码说明),
    // 直接 +1 会从 -3 走到 -2,仍然是"没有头像"
    return tx`
      update users set avatar_version = abs(avatar_version) + 1
      where id = ${user.id}
      returning avatar_version
    `;
  }) as unknown as Array<{ avatar_version: number }>;

  const version = rows[0].avatar_version;
  const response = NextResponse.json({ avatarUrl: avatarUrlFor(user.uid, version), version });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

/**
 * 删掉自定义头像,退回注册时发的 emoji。
 *
 * 版本号取负而不是清零 —— 清零的话下次再传一张图版本号又回到 1,
 * 而浏览器里 `?v=1` 那条 immutable 缓存还在,新头像会被旧图顶掉。
 * 负数一样满足 `avatarUrlFor` 的 `<= 0 → null`,幅度则继续单调递增。
 */
export async function DELETE(request: Request) {
  const user = await getRequestUser(request);
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });

  const sql = getSql();
  const rows = await sql.begin(async (tx) => {
    await tx`delete from user_avatars where user_id = ${user.id}`;
    return tx`
      update users set avatar_version = -abs(avatar_version)
      where id = ${user.id}
      returning avatar_version
    `;
  }) as unknown as Array<{ avatar_version: number }>;

  // 如实回传库里那个负数,别写死 0 —— 前端只看 avatarUrl,但排查问题时这个数要对得上
  const response = NextResponse.json({ avatarUrl: null, version: rows[0].avatar_version });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
