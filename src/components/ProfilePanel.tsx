'use client';

import Link from 'next/link';
import { KeyRound, LogIn, UserRound } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from './AuthProvider';
import { apiFetch } from '@/lib/api-client';
import AvatarUploader from './AvatarUploader';

export default function ProfilePanel() {
  const { user, wallet, openPanel, logout, updateAccessToken } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [passwordOpen, setPasswordOpen] = useState(false);

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
      <section className="profile-lodge profile-lodge--empty grid min-h-[55dvh] place-items-center px-6 text-center">
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
    <section className="profile-lodge profile-lodge--player">
      <div className="profile-player-identity">
        <AvatarUploader />
        <p className="profile-player-name">{user.username}</p>
        <p className="profile-player-uid">UID: {user.uid}</p>
      </div>

      <div className="profile-player-stats" aria-label="游戏资产">
        <span><b>—</b><small>星星总数</small></span>
        <span><b>—</b><small>游戏场次</small></span>
        <span><b>{(wallet?.diamonds ?? 0).toLocaleString()}</b><small>钻石数量</small></span>
      </div>

      <div className="profile-scene-actions">
        <button type="button" onClick={() => setNotice('账号没有绑定邮箱，请妥善保存账号和密码。')} aria-label="账号安全" />
        <button type="button" onClick={() => setPasswordOpen(true)} aria-label="修改密码" />
        {user.isAdmin ? <Link href="/admin" aria-label="进入管理后台" /> : <span aria-hidden="true" />}
      </div>

      {passwordOpen && <div className="profile-password-panel space-y-3 rounded-3xl border-2 border-white bg-white/90 p-4 shadow-xl">
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
        <button type="button" onClick={() => setPasswordOpen(false)} className="min-h-10 w-full rounded-2xl bg-slate-100 font-black text-slate-500">返回玩家小屋</button>
      </div>}

      {!passwordOpen && notice && <p className="profile-scene-notice">{notice}</p>}

      <button type="button" onClick={() => { void logout(); }} className="profile-scene-logout" aria-label="退出登录" />
    </section>
  );
}
