'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { getGame } from '@/games/registry';

const meta = getGame('fruit-slasher')!;

const PhaserCanvas = dynamic(() => import('@/components/PhaserCanvas'), {
  ssr: false,
  loading: () => <div className="grid h-dvh w-full place-items-center bg-[#071326] text-slate-300">加载中…</div>,
});

export default function FruitSlasherPage() {
  return (
    <main
      aria-label={meta.title}
      className="fixed inset-0 flex h-dvh w-screen touch-none items-center justify-center overflow-hidden bg-[#071326] bg-cover bg-center"
      style={{ backgroundImage: "url('/fruit-slasher/assets/backgrounds/dojo-night-v1.png')" }}
    >
      <div className="relative z-10 h-dvh w-screen overflow-hidden">
        <PhaserCanvas
          load={() => import('@/games/fruit-slasher')}
          orientation="portrait"
          fullscreen
        />
      </div>
      <Link
        href="/"
        aria-label="返回游戏盒子"
        className="absolute left-[calc(0.75rem+env(safe-area-inset-left))] top-[calc(0.75rem+env(safe-area-inset-top))] z-20 grid size-[52px] place-items-center overflow-hidden rounded-[15px] text-[#fff0c8] shadow-[0_7px_20px_rgba(0,0,0,0.4)] transition duration-100 hover:brightness-110 active:scale-90"
      >
        <span
          aria-hidden="true"
          className="absolute inset-0 scale-[1.09] bg-[url('/fruit-slasher/assets/ui/back-button-v2.png')] bg-cover bg-center"
        />
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          className="relative size-[27px] drop-shadow-[0_1px_1px_rgba(0,0,0,0.65)]"
        >
          <path
            d="M19 12H5m0 0 6-6m-6 6 6 6"
            stroke="currentColor"
            strokeWidth="2.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Link>
    </main>
  );
}
