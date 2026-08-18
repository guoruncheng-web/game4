'use client';

import { useEffect, useRef } from 'react';
import type { ThreeGameModule } from '@/games/types';

type Props = {
  /** 动态加载游戏入口模块,例如 () => import('@/games/neon-strike') */
  load: () => Promise<ThreeGameModule>;
};

/**
 * Three.js 游戏的挂载容器。
 *
 * 和 PhaserCanvas 是同一套隔离思路:WebGL 只能在浏览器里跑,所以
 * 1. 游戏页用 dynamic(..., { ssr: false }) 加载本组件;
 * 2. 本组件再在 useEffect 里动态 import 具体游戏。
 *
 * 和 PhaserCanvas 的区别在于画布尺寸:Phaser 用固定逻辑分辨率 + FIT 缩放,
 * 3D 游戏直接按容器实际像素渲染,视野由相机的 aspect 决定,所以这里只负责铺满。
 */
export default function ThreeCanvas({ load }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<{ destroy(): void } | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const { startGame } = await load();
      if (cancelled || !containerRef.current || gameRef.current) return;
      gameRef.current = startGame(containerRef.current);
    })();

    return () => {
      cancelled = true;
      gameRef.current?.destroy();
      gameRef.current = null;
    };
    // load 由调用方以内联箭头函数传入,身份每次渲染都会变,
    // 这里刻意只在挂载时跑一次,避免游戏被反复重建。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} className="relative h-dvh w-screen touch-none overflow-hidden" />;
}
