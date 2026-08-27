'use client';

import Link from 'next/link';
import CocosCanvas from '@/components/CocosCanvas';

export default function UmoPage() {
  return (
    <main className="fixed inset-0 h-dvh w-full overflow-hidden bg-[#040816]">
      <CocosCanvas
        src="/umo/game/index.html?umoTransport=ws"
        title="UMO"
        gameId="umo"
        readyOnLoad
        loadingText="正在加载 UMO…"
      />
      <Link
        href="/"
        aria-label="返回游戏盒子"
        className="absolute left-[calc(.75rem+env(safe-area-inset-left))] top-[calc(.75rem+env(safe-area-inset-top))] z-20 rounded-xl border border-teal-200/20 bg-[#071022]/80 px-3 py-2 text-sm font-black text-teal-100 shadow-lg backdrop-blur transition active:scale-95"
      >
        ← 游戏盒子
      </Link>
    </main>
  );
}
