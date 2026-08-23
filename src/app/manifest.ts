import type { MetadataRoute } from 'next';
import { GAMES } from '@/games/registry';

/**
 * PWA 清单。走 Next 的 metadata route 而不是手写 public/manifest.json,
 * 是为了让快捷方式直接从 registry 生成 —— 新增一款游戏时不必再想起来改这里。
 *
 * 注意 registry 只放纯元数据(见它自己的注释),这里 import 它是安全的:
 * 这个文件在构建期跑,不进客户端包。
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'GAME BOX · 游戏盒子',
    short_name: 'GAME BOX',
    description: '即开即玩的移动端小游戏合集,装到桌面后可离线游玩',
    start_url: '/',
    scope: '/',
    // standalone 而不是 fullscreen:游戏页自己会铺满,首页还需要状态栏显示时间和电量
    display: 'standalone',
    // 'any' 而不是 'portrait':深海捕鱼是横屏的(见它的 DESIGN.md §4.3),方向交给各游戏页自己决定。
    // 竖屏那几款的画布是 aspect-[9/16],本来就不依赖这个锁,改了不受影响
    orientation: 'any',
    background_color: '#0b2032',
    theme_color: '#0b2032',
    lang: 'zh-CN',
    categories: ['games', 'entertainment'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // maskable 单独出一张:安卓会把图标裁成圆形,复用 any 那张会削掉手柄的把手
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    // 长按桌面图标直接进某一款游戏。安卓最多显示 4 个,取前 4 款
    shortcuts: GAMES.slice(0, 4).map((game) => ({
      name: game.title,
      short_name: game.title,
      description: game.tagline,
      url: `/${game.slug}`,
      icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
    })),
  };
}
