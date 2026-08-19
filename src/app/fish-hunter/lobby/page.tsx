'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { useCoop } from '@/components/CoopProvider';

/**
 * 捕鱼大厅:开放房列表(DESIGN.md §4.2)。
 *
 * 和霓虹突击的匹配页有两处根本不同:
 *   1. **不是定向邀请**,是列出所有还有空座的房,谁都能补进去;
 *   2. **没有「开始」按钮** —— 占到座位就直接进池子,鱼一直在游,人随进随打。
 *      所以这一页只负责把人送进房,送进去之后由 CoopProvider 自动跳转到游戏页。
 *
 * 这一页保持竖屏可用:选房是普通网页交互,没必要跟着游戏一起强制横屏。
 */
export default function FishLobbyPage() {
  const { user } = useAuth();
  const { connected, fishRooms, createFishRoom, joinFishRoom, refreshFishRooms, error } = useCoop();

  useEffect(() => {
    if (connected) refreshFishRooms();
  }, [connected, refreshFishRooms]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col gap-4 bg-[#04202f] p-5">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-black text-cyan-200">深海捕鱼 · 大厅</h1>
          <p className="mt-1 text-sm text-cyan-100/60">一池鱼最多四个人一起打</p>
        </div>
        <Link href="/" className="shrink-0 text-sm text-cyan-100/70">
          ← 返回
        </Link>
      </header>

      {!user && (
        <p className="rounded-2xl border border-amber-300/30 bg-amber-400/10 p-4 text-sm text-amber-200">
          联机需要先登录。也可以
          <Link href="/fish-hunter" className="mx-1 underline">
            直接单人开一局
          </Link>
          ——单人的金币存在本机，和账号不互通。
        </p>
      )}

      {user && !connected && (
        <p className="rounded-2xl border border-cyan-300/20 bg-cyan-400/5 p-4 text-sm text-cyan-100/70">正在连接联机服务…</p>
      )}

      {error && (
        <p className="rounded-2xl border border-rose-300/30 bg-rose-400/10 p-4 text-sm text-rose-200">{error}</p>
      )}

      {user && connected && (
        <>
          <button
            type="button"
            onClick={createFishRoom}
            className="min-h-14 rounded-2xl bg-gradient-to-b from-[#2ee6c8] to-[#16b8a0] text-lg font-black text-[#04202f] shadow-[0_4px_0_#0d8a78] active:translate-y-0.5"
          >
            开一间新房
          </button>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-cyan-100/70">还有空座的房</p>
              <button type="button" onClick={refreshFishRooms} className="text-sm text-cyan-300/80">
                刷新
              </button>
            </div>

            {fishRooms.length === 0 && (
              <p className="rounded-2xl border border-cyan-300/15 bg-white/5 p-4 text-sm text-cyan-100/50">
                现在没人开房。开一间吧——别人能在这里看到并加进来。
              </p>
            )}

            {fishRooms.map((r) => (
              <button
                key={r.id}
                type="button"
                disabled={r.count >= r.max}
                onClick={() => joinFishRoom(r.id)}
                className="flex items-center justify-between rounded-2xl border border-cyan-300/20 bg-white/5 p-4 text-left transition active:scale-[0.99] disabled:opacity-40"
              >
                <span className="min-w-0">
                  <span className="block truncate font-bold text-cyan-100">{r.names.join('、')}</span>
                  <span className="mt-0.5 block text-xs text-cyan-100/50">房号 {r.id}</span>
                </span>
                <span className="shrink-0 text-sm font-black text-cyan-300">
                  {r.count}/{r.max} 人
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
