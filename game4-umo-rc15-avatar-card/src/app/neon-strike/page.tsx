'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { getGame } from '@/games/registry';

const meta = getGame('neon-strike')!;

const ThreeCanvas = dynamic(() => import('@/components/ThreeCanvas'), {
  ssr: false,
  loading: () => <div className="grid h-dvh place-items-center bg-[#05041a] text-cyan-200">战机启动中…</div>,
});

/**
 * 3D 版不再需要 2D 那套"按 Scale.FIT 复刻画布坐标"的定位数学:
 * HUD 本身就是 DOM,返回按钮和它同在一个文档流里,直接钉在左上角即可。
 * 游戏内的暂停按钮排在它下面(见 ui/style.ts 的 .ns3-pause)。
 */
export default function NeonStrikePage() {
  return (
    <main aria-label={meta.title} className="fixed inset-0 h-dvh w-screen overflow-hidden bg-[#05041a]">
      <ThreeCanvas load={() => import('@/games/neon-strike')} />
      <Link
        href="/"
        aria-label="返回游戏盒子"
        className="absolute left-4 top-3.5 z-20 grid size-10 place-items-center rounded-full border border-cyan-400/50 bg-[#09283a]/70 text-cyan-100 opacity-85 backdrop-blur-sm transition hover:opacity-100 active:scale-90"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="size-5 drop-shadow-[0_0_5px_rgba(103,232,249,0.85)]">
          <path
            d="M19 12H5m0 0 6-6m-6 6 6 6"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Link>
    </main>
  );
}
