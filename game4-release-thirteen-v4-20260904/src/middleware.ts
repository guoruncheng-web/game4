import { NextResponse, type NextRequest } from 'next/server';
import { createApiAccessToken, SESSION_COOKIE } from '@/lib/auth';
import { resolveGameCredentials, resolveSession } from '@/lib/session';
import { getSql } from '@/lib/db';
import { GAMES } from '@/games/registry';

/**
 * 登录守卫:游戏路由必须登录才能进。
 *
 * 后台增加封禁后，这里必须解析完整会话并比对 token_version；否则被封用户仍能凭旧
 * cookie 进入纯前端游戏。游戏上下架也在导航入口检查，不能只把首页按钮变灰。
 *
 * 放行清单用的是排除式匹配,新增一款游戏不需要回来改这里 —— 只要它是个页面路由,默认就是要登录的。
 */
export const config = {
  // node:crypto 要 Node 运行时(Next 16 的 middleware 支持,不必退回 Edge)
  runtime: 'nodejs',
  matcher: [
    /*
     * 排除:api、Next 的构建产物、图标与素材、PWA 的几个固定文件,以及任何带扩展名的静态文件。
     * 剩下的页面路由(/star-runner、/eight-ball…)全部经过这里。
     */
    '/((?!api/|_next/|icons/|assets/|concepts/|manifest\\.webmanifest|sw\\.js|.*\\..*).*)',
  ],
};

/** 不需要登录也能打开的页面 */
const PUBLIC_PATHS = new Set(['/', '/offline', '/admin', '/umo', '/thirteen']);
const GAME_SLUGS = new Set(GAMES.map((game) => game.slug));

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const slug = pathname.split('/')[1];
  const isGame = GAME_SLUGS.has(slug);
  const rawUid = request.nextUrl.searchParams.get('uid');
  const rawToken = request.nextUrl.searchParams.get('token');
  const hasGameCredential = rawUid !== null || rawToken !== null;
  const urlUser = hasGameCredential
    ? await resolveGameCredentials(rawUid, rawToken).catch(() => null)
    : null;
  if (hasGameCredential && !urlUser) {
    const target = new URL('/', request.url);
    target.searchParams.set('login', '1');
    target.searchParams.set('from', pathname);
    target.searchParams.set('reason', 'invalid-game-token');
    return NextResponse.redirect(target);
  }
  const cookieUser = await resolveSession(request.cookies.get(SESSION_COOKIE)?.value).catch(() => null);
  const user = urlUser ?? cookieUser;

  // 直接输入游戏地址时，也把当前登录用户规范化到带 uid/token 的游戏 URL。
  if (isGame && user && !hasGameCredential) {
    const target = request.nextUrl.clone();
    target.searchParams.set('uid', String(user.uid));
    target.searchParams.set('token', createApiAccessToken(user.id, user.uid, user.tokenVersion));
    return NextResponse.redirect(target);
  }

  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  if (user) {
    if (GAME_SLUGS.has(slug)) {
      try {
        const sql = getSql();
        const rows = await sql`select enabled from game_settings where slug = ${slug} limit 1`;
        if (rows[0]?.enabled === false) {
          const target = new URL('/', request.url);
          target.searchParams.set('unavailable', slug);
          return NextResponse.redirect(target);
        }
      } catch {
        // 运营配置查询失败时不拖垮所有游戏，首页 API 也采用同样的开放回退。
      }
    }
    return NextResponse.next();
  }

  // 弹回首页并把登录面板叫出来;from 记着他本来要去哪,登录成功后自动送过去
  const target = request.nextUrl.clone();
  target.pathname = '/';
  target.search = `?login=1&from=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(target);
}
