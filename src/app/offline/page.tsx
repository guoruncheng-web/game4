import Link from 'next/link';

export const metadata = { title: '离线 · GAME BOX' };

/**
 * 断网且请求的页面没缓存过时,Service Worker 会回落到这张页。
 *
 * 它必须是纯静态的:这时候网络已经不通了,任何数据请求都只会再失败一次。
 * 已经玩过的游戏在本地有素材缓存,所以这里给的是"回首页试试"而不是"请联网"。
 */
export default function OfflinePage() {
  return (
    <main className="gb-system-page">
      <div className="gb-system-card">
        <div className="gb-state-art gb-state-art--offline" aria-hidden="true" />
        <h1 className="mt-6 text-2xl font-black text-[#173366]">当前没有网络</h1>
        <p className="mt-2 text-sm font-medium text-slate-500">
          请联网后重试。连接恢复后即可验证登录状态，继续游戏。
        </p>
        <Link
          href="/"
          className="mt-7 inline-flex min-h-12 items-center justify-center rounded-2xl bg-gradient-to-b from-[#43d875] to-[#2cbe60] px-7 text-base font-black text-white shadow-[0_6px_0_#22994b] transition active:translate-y-0.5 active:shadow-[0_3px_0_#22994b]"
        >
          重新连接
        </Link>
      </div>
    </main>
  );
}
