'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { getGame } from '@/games/registry';

const meta = getGame('neon-strike-2d')!;
const PhaserCanvas = dynamic(() => import('@/components/PhaserCanvas'), { ssr: false, loading: () => <div className="grid h-dvh place-items-center bg-[#06051b] text-cyan-200">战机启动中…</div> });

/**
 * HUD 贴图(ns-hud-frame)左上角画了一个虚线圆,那个位置就是留给返回按钮的。
 * 圆心在 540×960 逻辑画布里的 (41.3, 42.3),直径约 68。
 *
 * 按钮是 DOM 元素、画布是 canvas,两者坐标系不同,所以这里用 CSS 复刻一遍
 * Phaser 的 Scale.FIT + CENTER_BOTH:--u 是"一个逻辑像素在屏幕上的实际大小",
 * 之后所有位置和尺寸都乘它,按钮就会始终钉在那个圆圈里,不随视口比例漂走。
 */
const CANVAS = { w: 540, h: 960 };
const BACK_SLOT = { x: 41.3, y: 42.3, size: 60 };

const unit = `min(calc(100vw / ${CANVAS.w}), calc(100dvh / ${CANVAS.h}))`;
const slotStyle: CSSProperties = {
  '--u': unit,
  left: `calc((100vw - ${CANVAS.w} * var(--u)) / 2 + ${BACK_SLOT.x} * var(--u))`,
  top: `calc((100dvh - ${CANVAS.h} * var(--u)) / 2 + ${BACK_SLOT.y} * var(--u))`,
  width: `calc(${BACK_SLOT.size} * var(--u))`,
  height: `calc(${BACK_SLOT.size} * var(--u))`,
  transform: 'translate(-50%, -50%)',
} as CSSProperties;

export default function NeonStrike2dPage() {
  return <main aria-label={meta.title} className="fixed inset-0 h-dvh w-screen overflow-hidden bg-[#06051b]">
    <PhaserCanvas load={() => import('@/games/neon-strike-2d')} orientation="portrait" fullscreen />
    <div className="pointer-events-none absolute z-20" style={slotStyle}>
      <Link
        href="/"
        aria-label="返回游戏盒子"
        className="pointer-events-auto grid size-full place-items-center rounded-full text-cyan-100 opacity-85 transition hover:opacity-100 active:scale-90"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          className="size-1/2 drop-shadow-[0_0_5px_rgba(103,232,249,0.85)]"
        >
          <path
            d="M19 12H5m0 0 6-6m-6 6 6 6"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Link>
    </div>
  </main>;
}
