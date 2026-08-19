'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { useCoop } from '@/components/CoopProvider';

/**
 * 匹配页。独立路由 —— 刷新不丢、能分享链接,这是它不做成弹层的原因。
 *
 * 流程:下拉选一个在线的人 → 邀请 → 对方在**任何页面**都会收到弹窗 →
 * 接受后两人都在这里看到彼此 → **由房主点开始**,两人一起进游戏。
 */
export default function LobbyPage() {
  const { user, openPanel } = useAuth();
  const { connected, me, online, room, error, doInvite, leave, startGame } = useCoop();
  const [picked, setPicked] = useState<number | ''>('');

  const isHost = !!room && !!me && room.hostId === me.id;
  const ready = !!room && room.players.length === 2;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-4 p-4">
      <header className="flex items-center gap-3">
        <Link href="/neon-strike-2d" className="grid size-10 shrink-0 place-items-center rounded-2xl border border-slate-200 bg-white text-slate-500">
          ←
        </Link>
        <div>
          <h1 className="text-xl font-black text-[#173366]">双人匹配</h1>
          <p className="text-xs font-bold text-slate-400">霓虹突击 2D · 协作模式</p>
        </div>
      </header>

      {!user ? (
        <Panel>
          <p className="text-sm font-bold text-slate-500">联机需要登录后才能用 —— 邀请要知道你是谁。</p>
          <button onClick={() => openPanel()} className="mt-3 min-h-11 w-full rounded-2xl bg-gradient-to-b from-[#43d875] to-[#2cbe60] font-black text-white">
            去登录
          </button>
        </Panel>
      ) : !connected ? (
        <Panel><p className="text-sm font-bold text-slate-500">正在连接联机服务…</p></Panel>
      ) : room ? (
        <Panel>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">房间 {room.id}</p>
          <ul className="mt-3 space-y-2">
            {room.players.map((p) => (
              <li key={p.id} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                <span className="font-bold text-[#173366]">{p.username}</span>
                <span className="text-xs font-bold text-slate-400">{p.host ? '房主' : '队友'}</span>
              </li>
            ))}
            {room.players.length < 2 && (
              <li className="rounded-2xl border border-dashed border-slate-200 px-4 py-3 text-sm font-bold text-slate-400">
                等待对方接受邀请…
              </li>
            )}
          </ul>

          {isHost ? (
            <button
              onClick={startGame}
              disabled={!ready}
              className="mt-4 min-h-12 w-full rounded-2xl bg-gradient-to-b from-[#43d875] to-[#2cbe60] font-black text-white shadow-[0_4px_0_#22994b] disabled:opacity-40 disabled:shadow-none"
            >
              {ready ? '开始游戏' : '等待队友加入'}
            </button>
          ) : (
            <p className="mt-4 text-center text-sm font-bold text-slate-400">等房主开始游戏…</p>
          )}
          <button onClick={leave} className="mt-2 min-h-11 w-full rounded-2xl border border-slate-200 font-bold text-slate-500">
            离开房间
          </button>
        </Panel>
      ) : (
        <Panel>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">在线玩家 {online.length}</p>
          {online.length === 0 ? (
            <p className="mt-3 text-sm font-bold text-slate-400">
              现在没有其他人在线。让朋友也登录进来就能看到彼此。
            </p>
          ) : (
            <>
              <select
                value={picked}
                onChange={(e) => setPicked(e.target.value ? Number(e.target.value) : '')}
                className="mt-3 min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 font-bold text-[#173366]"
              >
                <option value="">选择一个玩家…</option>
                {online.map((u) => <option key={u.id} value={u.id}>{u.username}</option>)}
              </select>
              <button
                onClick={() => picked && doInvite(Number(picked), 'neon-strike-2d')}
                disabled={!picked}
                className="mt-3 min-h-12 w-full rounded-2xl bg-gradient-to-b from-[#43d875] to-[#2cbe60] font-black text-white shadow-[0_4px_0_#22994b] disabled:opacity-40 disabled:shadow-none"
              >
                邀请他一起玩
              </button>
            </>
          )}
        </Panel>
      )}

      {error && <p className="text-center text-sm font-bold text-rose-500">{error}</p>}
    </main>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-white bg-white/90 p-4 shadow-[0_8px_24px_rgba(79,141,130,0.14)] backdrop-blur">
      {children}
    </section>
  );
}
