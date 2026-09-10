import Link from 'next/link';

/** 宿主按需加载阶段；不覆盖引擎已经显示的游戏画面。 */
export default function GameLoading() {
  return <div className="gb-system-page" role="status"><section className="gb-system-card"><div className="gb-state-art gb-state-art--loading" aria-hidden="true" /><h1>正在进入游戏</h1><p>请稍候，精彩马上开始…</p><Link href="/">返回游戏盒子</Link></section></div>;
}
