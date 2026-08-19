'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getGame } from '@/games/registry';

const meta = getGame('fish-hunter')!;

const PhaserCanvas = dynamic(() => import('@/components/PhaserCanvas'), {
  ssr: false,
  loading: () => <div className="grid h-dvh place-items-center bg-[#021320] text-cyan-200">下网中…</div>,
});

/**
 * 深海捕鱼是盒子里第一款**横屏**游戏(DESIGN.md §4.3)。
 *
 * 方向处理分三层,越往下越兜底:
 *   1. manifest 的 orientation 已从 portrait 改成 any,系统不再锁竖屏;
 *   2. 进来试着 screen.orientation.lock('landscape') —— 只在全屏态生效,
 *      且 **iOS Safari 根本没有这个 API**,所以它是加分项不是依赖项;
 *   3. 真正的兜底是下面这张「请横过手机」引导页。iOS 只能走这条。
 */
export default function FishHunterPage() {
  const [portrait, setPortrait] = useState(false);

  useEffect(() => {
    const check = () => setPortrait(window.innerHeight > window.innerWidth);
    check();
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);

    // 能锁就锁。锁不上(不支持 / 没全屏 / 被拒)都不算错误,别往控制台喷
    const orientation = window.screen?.orientation as
      | (ScreenOrientation & { lock?: (o: string) => Promise<void> })
      | undefined;
    void orientation?.lock?.('landscape').catch(() => {});

    return () => {
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check);
      orientation?.unlock?.();
    };
  }, []);

  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-[#021320]">
      <PhaserCanvas load={() => import('@/games/fish-hunter')} fullscreen />

      <Link
        href="/"
        className="absolute left-3 top-3 z-20 rounded-full border border-cyan-300/30 bg-[#04202f]/80 px-3 py-1.5 text-sm text-cyan-100 backdrop-blur transition active:scale-95"
      >
        ← 返回
      </Link>

      {portrait && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-[#021320] px-8 text-center">
          <div>
            <div className="mb-4 text-6xl">📱↻</div>
            <p className="text-xl font-black text-cyan-200">请横过手机</p>
            <p className="mt-2 text-sm text-cyan-100/70">{meta.title}是横屏游戏，横过来才装得下一整片鱼池</p>
          </div>
        </div>
      )}
    </main>
  );
}
