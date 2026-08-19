'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getGame } from '@/games/registry';
import { useCoop } from '@/components/CoopProvider';
import { setFishBridge } from '@/games/fish-hunter/net/bridge';

const meta = getGame('fish-hunter')!;

// 这一款是 Three.js 的(鱼是带骨骼动画的 glb),走 ThreeCanvas 而不是 PhaserCanvas
const ThreeCanvas = dynamic(() => import('@/components/ThreeCanvas'), {
  ssr: false,
  loading: () => <div className="grid h-dvh place-items-center bg-[#021320] text-cyan-200">下网中…</div>,
});

/**
 * 深海捕鱼是盒子里第一款**横屏**游戏(DESIGN.md §4.3)。
 *
 * 方向处理分三层,越往下越兜底:
 *   1. manifest 的 orientation 已从 portrait 改成 any,系统不再锁竖屏;
 *   2. 进来试着 screen.orientation.lock('landscape') —— 只在全屏态生效,
 *      且 **iOS Safari 根本没有这个 API**,所以它是加分项不是依赖项;
 *   3. 真正的兜底是下面这张「请横过手机」引导页。iOS 只能走这条。
 *
 * 单机 / 联机由**当前有没有在一间捕鱼房里**决定,不看 URL 参数:
 * 房间状态本来就在 CoopProvider 里,再用 query 复述一遍就多了一处会对不上的地方。
 */
export default function FishHunterPage() {
  const [portrait, setPortrait] = useState(false);
  const { room, sendGame, onGame, leave } = useCoop();
  const online = room?.game === 'fish-hunter';
  const closed = useRef<(() => void) | null>(null);

  useEffect(() => {
    const check = () => setPortrait(window.innerHeight > window.innerWidth);
    check();
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);

    // 能锁就锁。锁不上(不支持 / 没全屏 / 被拒)都不算错误,别往控制台喷
    const orientation = window.screen?.orientation as
      | (ScreenOrientation & { lock?: (o: string) => Promise<void> })
      | undefined;
    void orientation?.lock?.('landscape').catch(() => {});

    return () => {
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check);
      orientation?.unlock?.();
    };
  }, []);

  /**
   * 桥在 `load()` 里安装,而不是用 effect —— ThreeCanvas 是先 await load()
   * 再 startGame 的,在这里放能保证顺序。差一帧的话游戏取到 null,整局就变单机了。
   */
  const loadGame = useCallback(async () => {
    if (online) {
      setFishBridge({
        send: (data) => sendGame(data),
        listen: (handler) => onGame(handler),
        onClose: (handler) => { closed.current = handler; },
        close: () => { onGame(null); leave(); },
      });
    }
    return import('@/games/fish-hunter');
  }, [online, sendGame, onGame, leave]);

  useEffect(() => () => {
    onGame(null);
    setFishBridge(null);
    closed.current?.();
  }, [onGame]);

  return (
    <main className="relative h-dvh w-screen overflow-hidden bg-[#021320]">
      <ThreeCanvas load={loadGame} />

      <div className="absolute left-3 top-3 z-20 flex items-center gap-2">
        <Link
          href="/"
          className="rounded-full border border-cyan-300/30 bg-[#04202f]/80 px-3 py-1.5 text-sm text-cyan-100 backdrop-blur transition active:scale-95"
        >
          ← 返回
        </Link>
        {!online && (
          <Link
            href="/fish-hunter/lobby"
            className="rounded-full border border-cyan-300/30 bg-[#04202f]/80 px-3 py-1.5 text-sm text-cyan-200/90 backdrop-blur transition active:scale-95"
          >
            联机大厅
          </Link>
        )}
        {online && (
          <span className="rounded-full border border-cyan-300/30 bg-[#04202f]/80 px-3 py-1.5 text-sm text-cyan-200/90 backdrop-blur">
            联机 · {room?.players.length ?? 1}/4 人
          </span>
        )}
      </div>

      {portrait && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-[#021320] px-8 text-center">
          <div>
            <div className="mb-4 text-6xl">📱↻</div>
            <p className="text-xl font-black text-cyan-200">请横过手机</p>
            <p className="mt-2 text-sm text-cyan-100/70">{meta.title}是横屏游戏，横过来才装得下一整片鱼池</p>
          </div>
        </div>
      )}
    </main>
  );
}
