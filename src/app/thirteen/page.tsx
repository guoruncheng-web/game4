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
        className="absolute left-[calc(.75rem+env(safe-area-inset-left))] top-[calc(.75rem+env(safe-area-inset-top))] z-20 rounded-xl border border-amber-100/20 bg-[#102a2f]/85 px-3 py-2 text-sm font-black text-amber-100 shadow-lg backdrop-blur transition active:scale-95"
      >
        ← 游戏盒子
      </Link>
    </main>
  );
}
