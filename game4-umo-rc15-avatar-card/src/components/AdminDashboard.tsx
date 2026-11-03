'use client';

import Link from 'next/link';
import { Ban, Gamepad2, MessageCircle, RefreshCw, Search, ShieldCheck, Users, UserX } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

type Stats = { users: number; suspended: number; friendships: number; messages: number };
type ManagedUser = {
  id: number; username: string; avatar: string; isAdmin: boolean;
  suspendedAt: string | null; createdAt: string; lastLoginAt: string | null;
};
type ManagedGame = { slug: string; title: string; tagline: string; enabled: boolean; sortOrder: number };

export default function AdminDashboard({ adminName }: { adminName: string }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [games, setGames] = useState<ManagedGame[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (search = '') => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/overview?q=${encodeURIComponent(search)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? '加载失败');
      setStats(data.stats);
      setUsers(data.users);
      setGames(data.games);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function updateUser(user: ManagedUser) {
    const action = user.suspendedAt ? 'restore' : 'suspend';
    if (action === 'suspend' && !window.confirm(`确认封禁 ${user.username}？其现有会话会立即失效。`)) return;
    const response = await fetch('/api/admin/users', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, action }),
    });
    const data = await response.json();
    if (!response.ok) { setError(data.error ?? '操作失败'); return; }
    await load(query);
  }

  async function updateGame(game: ManagedGame, patch: Partial<ManagedGame>) {
    const next = { ...game, ...patch };
    setGames((current) => current.map((item) => item.slug === game.slug ? next : item));
    const response = await fetch('/api/admin/games', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: next.slug, enabled: next.enabled, sortOrder: next.sortOrder }),
    });
    if (!response.ok) {
      const data = await response.json();
      setError(data.error ?? '游戏配置保存失败');
      await load(query);
    }
  }

  return (
    <main className="min-h-dvh bg-[#eef9f4] text-[#203148]">
      <header className="bg-[#0b2032] px-5 pb-8 pt-[calc(1.25rem+env(safe-area-inset-top))] text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div>
            <p className="text-xs font-black tracking-[0.18em] text-emerald-300">GAME BOX ADMIN</p>
            <h1 className="mt-1 text-2xl font-black">运营管理后台</h1>
            <p className="mt-1 text-xs font-semibold text-slate-400">管理员：{adminName}</p>
          </div>
          <Link href="/" className="rounded-2xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-bold">返回首页</Link>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-7 px-4 py-6">
        {error && <div className="rounded-2xl bg-rose-50 p-3 text-sm font-bold text-rose-600">{error}</div>}
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat icon={<Users />} label="用户" value={stats?.users} />
          <Stat icon={<UserX />} label="已封禁" value={stats?.suspended} />
          <Stat icon={<ShieldCheck />} label="好友关系" value={stats?.friendships} />
          <Stat icon={<MessageCircle />} label="聊天消息" value={stats?.messages} />
        </section>

        <section className="rounded-3xl bg-white p-4 shadow-sm md:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-xl font-black">游戏管理</h2><p className="text-xs font-semibold text-slate-400">控制游戏在首页是否可进入</p></div>
            <Gamepad2 className="text-emerald-500" />
          </div>
          <div className="space-y-2">
            {games.map((game) => (
              <div key={game.slug} className="grid gap-3 rounded-2xl border border-slate-100 p-3 md:grid-cols-[1fr_100px] md:items-center">
                <div><p className="font-black">{game.title}</p><p className="text-xs font-semibold text-slate-400">/{game.slug} · {game.tagline}</p></div>
                <button type="button" onClick={() => { void updateGame(game, { enabled: !game.enabled }); }} className={`min-h-10 rounded-xl text-sm font-black ${game.enabled ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                  {game.enabled ? '已上架' : '已下架'}
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl bg-white p-4 shadow-sm md:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-xl font-black">用户管理</h2><p className="text-xs font-semibold text-slate-400">最多显示最近 100 个匹配账号</p></div>
            <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); void load(query); }}>
              <label className="flex items-center gap-2 rounded-xl bg-slate-100 px-3"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索用户名" className="w-36 bg-transparent py-2 text-sm outline-none" /></label>
              <button className="grid size-10 place-items-center rounded-xl bg-[#0b2032] text-white" aria-label="搜索"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button>
            </form>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="text-xs text-slate-400"><tr><th className="pb-3">账号</th><th>身份</th><th>注册时间</th><th>最后登录</th><th className="text-right">操作</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="py-3"><span className="mr-2 text-xl">{user.avatar}</span><span className="font-mono font-bold">{user.username}</span></td>
                    <td>{user.isAdmin ? <span className="text-emerald-600">管理员</span> : user.suspendedAt ? <span className="text-rose-500">已封禁</span> : '玩家'}</td>
                    <td>{new Date(user.createdAt).toLocaleDateString('zh-CN')}</td>
                    <td>{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString('zh-CN') : '从未'}</td>
                    <td className="text-right"><button type="button" disabled={user.isAdmin} onClick={() => { void updateUser(user); }} className={`inline-flex min-h-9 items-center gap-1 rounded-xl px-3 text-xs font-black disabled:opacity-30 ${user.suspendedAt ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-500'}`}><Ban size={14} />{user.suspendedAt ? '解封' : '封禁'}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value?: number }) {
  return <div className="rounded-3xl bg-white p-4 shadow-sm"><span className="text-emerald-500">{icon}</span><p className="mt-3 text-2xl font-black">{value ?? '—'}</p><p className="text-xs font-bold text-slate-400">{label}</p></div>;
}
