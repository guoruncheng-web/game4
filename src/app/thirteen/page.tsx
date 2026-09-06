'use client';

import Link from 'next/link';
import CocosCanvas from '@/components/CocosCanvas';

const INTERACTIVE_SCENES = [
  'R02Lobby', 'R05Tutorial', 'R06Settings', 'R07Result', 'R08Stake',
  'O01ReconnectAutoplay', 'O03BlockingError',
] as const;

export default function ThirteenPage() {
  return (
    <main className="fixed inset-0 h-dvh w-full overflow-hidden bg-[#061f25]">
      <CocosCanvas
        src="/thirteen/game/index.html?locale=zh-CN&return=/&build=matching-sunlit-v1-rc2"
        title="Chặt Heo! 西贡牌局"
        gameId="thirteen"
        interactiveScenes={INTERACTIVE_SCENES}
        backdropClassName="bg-[#061f25]"
        showLoadingOverlay={false}
      >
        <Link
          href="/"
          aria-label="返回游戏盒子"
          title="返回游戏盒子"
          data-game-ready-control="home"
          className="absolute right-[calc(.5rem+env(safe-area-inset-right))] top-1/2 z-20 grid h-14 w-10 -translate-y-1/2 place-items-center rounded-xl border border-amber-100/25 bg-[#102a2f]/88 text-xl font-black text-amber-100 shadow-lg backdrop-blur transition hover:bg-[#102a2f] active:scale-90"
        >
          <span aria-hidden="true">⌂</span>
        </Link>
      </CocosCanvas>
    </main>
  );
}
