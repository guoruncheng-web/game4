'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { getGame } from '@/games/registry';

const meta = getGame('triple-pile')!;

const ThreeCanvas = dynamic(() => import('@/components/ThreeCanvas'), {
  ssr: false,
  loading: () => <div className="grid h-dvh place-items-center bg-[#1a120c] text-amber-200">正在烧这一锅…</div>,
});

/**
 * 和 neon-strike 一样走 Three 这一路:HUD 本身是 DOM,
 * 返回按钮和它同在一个文档流里,直接钉在左上角。
 * 游戏内的暂停键刻意排在右上角(见 ui/hud.ts)—— 两个圆钮叠在左上角是必然的误触。
 */
export default function TriplePilePage() {
  return (
    <main aria-label={meta.title} className="fixed inset-0 h-dvh w-screen overflow-hidden bg-[#1a120c]">
      <ThreeCanvas load={() => import('@/games/triple-pile')} />
      <Link
        href="/"
        aria-label="返回游戏盒子"
        className="absolute left-3 top-2.5 z-20 size-[46px] bg-[url('/triple-pile/ui/button-back.png')] bg-contain bg-center bg-no-repeat transition active:scale-90"
      />
    </main>
  );
}
