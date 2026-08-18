import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, readSessionToken } from '@/lib/auth';

/**
 * 登录守卫:游戏路由必须登录才能进。
 *
 * 这里**只验签名和过期,不查数据库** —— 每次导航都往 Neon 打一次往返太贵,
 * 而这一层的职责只是"把没登录的人挡在门外"。真正的会话撤销(token_version 比对)
 * 在 `getCurrentUser()` 里,所有读用户数据的接口都会走到那一步。
 * 也就是说:被登出的 token 还能推开这扇门,但推开之后什么用户数据都拿不到。
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
const PUBLIC_PATHS = new Set(['/', '/offline']);

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next();

  if (readSessionToken(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }

  // 弹回首页并把登录面板叫出来;from 记着他本来要去哪,登录成功后自动送过去
  const target = request.nextUrl.clone();
  target.pathname = '/';
  target.search = `?login=1&from=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(target);
}
