'use client';

import Link from 'next/link';
import CocosCanvas from '@/components/CocosCanvas';

export default function ThirteenPage() {
  return (
    <main className="fixed inset-0 h-dvh w-full overflow-hidden bg-[#061f25]">
      <CocosCanvas
        src="/thirteen/game/index.html?locale=zh-CN&return=/"
        title="Chặt Heo! 西贡牌局"
        gameId="thirteen"
        backdropClassName="bg-[#061f25]"
        showLoadingOverlay={false}
      />
      <Link
        href="/"
        aria-label="返回游戏盒子"
        title="返回游戏盒子"
        className="absolute right-[calc(.5rem+env(safe-area-inset-right))] top-1/2 z-20 grid h-14 w-10 -translate-y-1/2 place-items-center rounded-xl border border-amber-100/25 bg-[#102a2f]/88 text-xl font-black text-amber-100 shadow-lg backdrop-blur transition hover:bg-[#102a2f] active:scale-90"
      >
        <span aria-hidden="true">⌂</span>
      </Link>
    </main>
  );
}
