'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { getGame } from '@/games/registry';

const meta = getGame('neon-strike')!;
const PhaserCanvas = dynamic(() => import('@/components/PhaserCanvas'), { ssr: false, loading: () => <div className="grid h-dvh place-items-center bg-[#06051b] text-cyan-200">战机启动中…</div> });

export default function NeonStrikePage() {
  return <main aria-label={meta.title} className="fixed inset-0 h-dvh w-screen overflow-hidden bg-[#06051b]">
    <PhaserCanvas load={() => import('@/games/neon-strike')} orientation="portrait" fullscreen />
    <Link href="/" aria-label="返回游戏盒子" className="group absolute left-[calc(0.75rem+env(safe-area-inset-left))] top-[calc(0.75rem+env(safe-area-inset-top))] z-20 grid size-12 place-items-center rounded-full bg-transparent transition active:scale-90">
      <span aria-hidden="true" className="relative block h-5 w-7 opacity-80 transition group-active:opacity-100">
        <span className="absolute left-1 top-1/2 h-0.5 w-5 -translate-y-1/2 rounded-full bg-cyan-100 shadow-[0_0_6px_rgba(103,232,249,0.75)]" />
        <span className="absolute left-1 top-1/2 size-2.5 -translate-y-1/2 rotate-45 border-b-2 border-l-2 border-cyan-100" />
      </span>
    </Link>
  </main>;
}
