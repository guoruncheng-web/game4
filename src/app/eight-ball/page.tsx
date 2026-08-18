'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { getGame } from '@/games/registry';

const meta = getGame('eight-ball')!;

const PhaserCanvas = dynamic(() => import('@/components/PhaserCanvas'), {
  ssr: false,
  loading: () => <div className="grid h-dvh w-full place-items-center bg-[#0d1a14] text-emerald-200">Racking up…</div>,
});

export default function EightBallPage() {
  return (
    <main
      aria-label={meta.title}
      className="fixed inset-0 flex h-dvh w-screen touch-none items-center justify-center overflow-hidden bg-[#0d1a14]"
    >
      <div className="relative z-10 h-dvh w-screen overflow-hidden">
        <PhaserCanvas load={() => import('@/games/eight-ball')} orientation="portrait" fullscreen />
      </div>
      <Link
        href="/"
        aria-label="返回游戏盒子"
        className="absolute left-[calc(0.75rem+env(safe-area-inset-left))] top-[calc(0.75rem+env(safe-area-inset-top))] z-20 grid size-[52px] place-items-center rounded-[15px] border border-emerald-300/25 bg-[#143427]/85 text-emerald-100 shadow-[0_7px_20px_rgba(0,0,0,0.45)] transition duration-100 hover:brightness-125 active:scale-90"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-[26px]">
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
