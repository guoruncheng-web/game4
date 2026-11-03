'use client';

import Link from 'next/link';
import { CheckCircle2, Gem, KeyRound, LayoutDashboard, LogIn, LogOut, ShieldCheck, UserRound } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from './AuthProvider';
import { apiFetch } from '@/lib/api-client';
import Avatar from './Avatar';
import AvatarUploader from './AvatarUploader';

export default function ProfilePanel() {
  const { user, wallet, openPanel, logout, updateAccessToken } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function changePassword() {
    if (loading) return;
    if (newPassword !== confirmPassword) {
      setError('两次输入的新密码不一样');
      return;
    }
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const response = await apiFetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? '修改失败');
        return;
      }
      if (data.token) updateAccessToken(data.token);
      setNewPassword('');
      setConfirmPassword('');
      setNotice('密码已修改，其他设备上的登录状态已失效');
    } catch {
      setError('网络不太好，请重试');
    } finally {
      setLoading(false);
    }
  }

  if (!user) {
    return (
      <section className="grid min-h-[55dvh] place-items-center px-6 text-center">
        <div>
          <span className="mx-auto grid size-20 place-items-center rounded-[2rem] bg-emerald-50 text-emerald-500"><UserRound size={38} /></span>
          <h1 className="mt-5 text-2xl font-black text-[#173366]">登录你的游戏账号</h1>
          <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-500">登录后可管理个人资料、好友消息和账号安全。</p>
          <button type="button" onClick={() => openPanel('register')} className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-2xl bg-emerald-500 px-8 font-black text-white shadow-[0_6px_0_#22994b] active:translate-y-1 active:shadow-none">
            <LogIn size={18} /> 登录 / 注册
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-5 px-4 pb-6">
      <div>
        <h1 className="text-[1.75rem] font-black tracking-[-0.04em] text-[#173366]">我的</h1>
        <p className="mt-1 text-sm font-semibold text-emerald-600">个人资料与账号安全</p>
      </div>

      <div className="overflow-hidden rounded-[2rem] border-4 border-white bg-gradient-to-br from-emerald-400 to-cyan-500 p-5 text-white shadow-[0_16px_40px_rgba(47,180,135,0.24)]">
        <div className="flex items-center gap-4">
          <Avatar
            emoji={user.avatar}
            url={user.avatarUrl}
            alt="我的头像"
            className="size-20 rounded-[1.6rem] border-4 border-white/70 bg-white text-4xl shadow-lg"
          />
          <div className="min-w-0">
            <p className="text-xs font-black text-white/75">游戏账号</p>
            <p className="mt-1 truncate font-mono text-xl font-black">{user.username}</p>
            <p className="mt-1 font-mono text-sm font-black text-white/80">UID {user.uid}</p>
            <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-xs font-bold"><CheckCircle2 size={13} /> 已登录</p>
          </div>
        </div>
        <div className="mt-5 border-t border-white/25 pt-4">
          <AvatarUploader />
        </div>
      </div>

      {wallet && (
        <div aria-label="游戏资产">
          <div className="rounded-3xl border-2 border-cyan-100 bg-cyan-50 p-4 text-cyan-800 shadow-sm">
            <p className="flex items-center gap-1.5 text-xs font-black"><Gem size={16} />钻石</p>
            <p className="mt-1 text-xl font-black tabular-nums">{wallet.diamonds.toLocaleString()}</p>
          </div>
        </div>
      )}

      <div className="rounded-3xl border-2 border-white bg-white/80 p-4 shadow-sm">
        <div className="flex items-center gap-2 text-base font-black text-[#173366]"><ShieldCheck size={19} className="text-emerald-500" />账号安全</div>
        <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-400">账号没有绑定邮箱，无法找回密码。请妥善保存账号和密码；修改密码后，其他设备会自动退出。</p>
      </div>

      {user.isAdmin && (
        <Link href="/admin" className="flex min-h-14 items-center justify-between rounded-3xl border-2 border-emerald-200 bg-emerald-50 px-4 font-black text-emerald-700 shadow-sm">
          <span className="flex items-center gap-2"><LayoutDashboard size={20} />进入管理后台</span>
          <span aria-hidden="true">→</span>
        </Link>
      )}

      <div className="space-y-3 rounded-3xl border-2 border-white bg-white/80 p-4 shadow-sm">
        <div className="flex items-center gap-2 text-base font-black text-[#173366]"><KeyRound size={18} className="text-emerald-500" />修改密码</div>
        <label className="block">
          <span className="mb-1 block px-1 text-xs font-bold text-slate-500">新密码</span>
          <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" placeholder="至少 8 位" className="min-h-12 w-full rounded-2xl border-2 border-slate-100 bg-white px-3 text-sm font-bold outline-none focus:border-emerald-300" />
        </label>
        <label className="block">
          <span className="mb-1 block px-1 text-xs font-bold text-slate-500">确认新密码</span>
          <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" placeholder="再输入一次" className="min-h-12 w-full rounded-2xl border-2 border-slate-100 bg-white px-3 text-sm font-bold outline-none focus:border-emerald-300" />
        </label>
        {error && <p className="px-1 text-sm font-bold text-rose-500">{error}</p>}
        {notice && <p className="px-1 text-sm font-bold text-emerald-600">{notice}</p>}
        <button type="button" onClick={() => { void changePassword(); }} disabled={loading || newPassword.length < 8 || !confirmPassword} className="min-h-12 w-full rounded-2xl bg-emerald-500 font-black text-white shadow-[0_5px_0_#22994b] active:translate-y-1 active:shadow-none disabled:bg-slate-300 disabled:shadow-none">
          {loading ? '提交中…' : '确认修改'}
        </button>
      </div>

      <button type="button" onClick={() => { void logout(); }} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-rose-100 bg-white/80 font-black text-rose-500">
        <LogOut size={18} />退出登录
      </button>
    </section>
  );
}
