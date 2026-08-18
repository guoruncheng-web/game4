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
    <main className="game-box-bg grid min-h-dvh place-items-center px-6 text-center text-[#23304a]">
      <div>
        <div className="mx-auto grid size-20 place-items-center rounded-3xl bg-gradient-to-br from-lime-300 to-emerald-500 text-4xl shadow-[0_10px_28px_rgba(50,201,107,0.3)]">
          🎮
        </div>
        <h1 className="mt-6 text-2xl font-black text-[#173366]">当前没有网络</h1>
        <p className="mt-2 text-sm font-medium text-slate-500">
          这一页还没缓存过。已经玩过的游戏素材留在本地,离线也能直接开。
        </p>
        <Link
          href="/"
          className="mt-7 inline-flex min-h-12 items-center justify-center rounded-2xl bg-gradient-to-b from-[#43d875] to-[#2cbe60] px-7 text-base font-black text-white shadow-[0_6px_0_#22994b] transition active:translate-y-0.5 active:shadow-[0_3px_0_#22994b]"
        >
          回游戏盒子首页
        </Link>
      </div>
    </main>
  );
}
