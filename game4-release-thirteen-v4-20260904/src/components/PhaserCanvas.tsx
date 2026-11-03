'use client';

import { useEffect, useRef } from 'react';
import type Phaser from 'phaser';
import type { GameModule } from '@/games/types';

type Props = {
  /** 动态加载游戏入口模块,例如 () => import('@/games/star-runner') */
  load: () => Promise<GameModule>;
  /** 竖屏游戏使用独立画布比例，默认保持现有横屏行为。 */
  orientation?: 'landscape' | 'portrait';
  /** 沉浸式页面移除卡片边框，并尽量占满整个视口。 */
  fullscreen?: boolean;
};

/**
 * 所有游戏共用的 Phaser 挂载容器。
 *
 * Phaser 只能在浏览器里跑(它在模块顶层就会碰 window),所以:
 * 1. 游戏页用 dynamic(..., { ssr: false }) 加载本组件;
 * 2. 本组件再在 useEffect 里动态 import 具体游戏。
 */
export default function PhaserCanvas({ load, orientation = 'landscape', fullscreen = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const { startGame } = await load();
      if (cancelled || !containerRef.current || gameRef.current) return;
      gameRef.current = startGame(containerRef.current);
    })();

    return () => {
      cancelled = true;
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
    // load 由调用方以内联箭头函数传入,身份每次渲染都会变,
    // 这里刻意只在挂载时跑一次,避免游戏被反复重建。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      className={
        fullscreen
          ? 'h-dvh w-screen touch-none overflow-hidden [&>canvas]:block'
          : orientation === 'portrait'
          ? 'aspect-[9/16] max-h-[78dvh] w-full max-w-[440px] touch-none overflow-hidden rounded-xl border border-slate-700/70 shadow-2xl shadow-indigo-950/50 [&>canvas]:block [&>canvas]:h-full [&>canvas]:w-full'
          : 'aspect-[8/5] w-full max-w-5xl overflow-hidden rounded-xl border border-slate-700/70 shadow-2xl shadow-indigo-950/50 [&>canvas]:block [&>canvas]:h-full [&>canvas]:w-full'
      }
    />
  );
}
