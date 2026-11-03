import type { Metadata, Viewport } from 'next';

/**
 * Ludo 这条路由单独接管状态栏。
 *
 * **为什么不在全站 layout 改。** 装到桌面之后,PWA 顶部那条安全区(刘海/状态栏)
 * 由三处共同决定,而它们在浅色首页和深色棋牌页上要的值正好相反:
 *
 *   1. iOS 的 `statusBarStyle` —— 全站是 `default`(不透明白条)。
 *      这一款是深蓝底,必须 `black-translucent` 才能让页面自己画到状态栏底下;
 *      但首页是浅绿白底,改成透明会让状态栏的白色字直接消失。
 *   2. 安卓的 `themeColor` —— 全站是品牌绿,盖在深蓝页面上会突兀。
 *   3. body 的背景色 —— 状态栏透明之后透出来的是它。页面里那层 `fixed inset-0`
 *      的深色背景就是为这个准备的(见 page.tsx)。
 *
 * 少了任意一条,PWA 顶部都会留一条和页面对不上的色带 —— 用户看到的"很大的白边"
 * 就是第 1 条和第 3 条一起造成的。
 */
export const metadata: Metadata = {
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  themeColor: '#06184c',
  viewportFit: 'cover',
};

export default function LudoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
