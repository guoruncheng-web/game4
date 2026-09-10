'use client';

import Link from 'next/link';
import { LogIn, LogOut, UserRound } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from './AuthProvider';
import { apiFetch } from '@/lib/api-client';
import AvatarUploader from './AvatarUploader';
import Avatar from './Avatar';
import { ClubIcon } from './ClubArt';
import AuthTextField from './AuthTextField';

export default function ProfilePanel() {
  const { user, wallet, openPanel, logout, updateAccessToken } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);

  function closePassword() {
    if (loading) return;
    setPasswordOpen(false);
    setNewPassword('');
    setConfirmPassword('');
    setError('');
  }

  async function changePassword() {
    if (loading || newPassword.length < 8 || !confirmPassword) return;
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
      <section className="gb-profile-lodge gb-profile-lodge--empty grid min-h-[55dvh] place-items-center px-6 text-center">
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
    <section className="gb-profile-lodge gb-profile-lodge--player">
      <div className="gb-profile-player-identity">
        <button type="button" className="gb-profile-avatar-link" onClick={() => setAvatarOpen(true)} aria-label="修改头像"><Avatar emoji={user.avatar} url={user.avatarUrl} /></button>
        <div><p className="gb-profile-player-name">{user.username}</p><p className="gb-profile-player-uid">UID {user.uid}</p></div>
        <button type="button" className="gb-profile-edit-link" onClick={() => setAvatarOpen(true)} aria-label="打开头像设置">›</button>
      </div>

      {avatarOpen && <div className="gb-profile-editor-page" role="dialog" aria-modal="true" aria-label="头像设置"><header><button type="button" onClick={() => setAvatarOpen(false)} aria-label="返回我的">‹</button><h2>我的头像</h2><p>展示个性，让好友更容易找到你</p></header><div className="gb-profile-editor-body"><AvatarUploader /></div></div>}

      <div className="gb-profile-player-stats" aria-label="游戏资产">
        <span><ClubIcon name="diamond" /><b>{wallet ? wallet.diamonds.toLocaleString() : '—'}</b><small>钻石</small></span>
        <span><ClubIcon name="games" /><b>—</b><small>我的游戏</small></span>
        <span><ClubIcon name="profile" /><b>—</b><small>我的好友</small></span>
      </div>

      <div className="gb-profile-scene-actions">
        <button type="button" onClick={() => setNotice('账号没有绑定邮箱，请妥善保存账号和密码。')} aria-label="账号安全"><ClubIcon name="security" /><span>账号安全</span></button>
        <button type="button" onClick={() => { setError(''); setNotice(''); setPasswordOpen(true); }} aria-label="修改密码"><ClubIcon name="password" /><span>修改密码</span></button>
        {user.isAdmin ? <Link href="/admin" aria-label="进入管理后台"><ClubIcon name="games" /><span>管理后台</span></Link> : null}
      </div>

      {passwordOpen && <div className="gb-profile-password-panel gb-password-v2" role="dialog" aria-modal="true" aria-label="修改密码">
        <header className="gb-password-header"><button type="button" onClick={closePassword} disabled={loading} aria-label="返回我的">‹</button><span>账号安全</span><span className="gb-auth-v2-mark" aria-hidden="true" /></header>
        <div className="gb-password-v2-heading"><ClubIcon name="security" /><h2>给账号一份安心。</h2><p>设置新密码，保护你的游戏时光。</p></div>
        <p className="gb-password-v2-caption">正在修改的账号</p>
        <div className="gb-password-account"><Avatar emoji={user.avatar} url={user.avatarUrl} /><span>{user.username}<small>UID {user.uid}</small></span></div>
        <div className="gb-password-field-row"><AuthTextField visibleLabel="新密码" type="password" value={newPassword} onChange={setNewPassword} autoComplete="new-password" placeholder="请输入新密码（至少 8 位）" label="新密码" /></div>
        <div className="gb-password-field-row"><AuthTextField visibleLabel="确认新密码" type="password" value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" placeholder="请再次输入新密码" label="确认新密码" onSubmit={() => { void changePassword(); }} /></div>
        {error && <p role="alert" className="gb-password-v2-error">{error}</p>}
        {notice && <p role="status" className="gb-password-v2-success">{notice}</p>}
        <p className="gb-password-warning">修改成功后，其他设备需要重新登录。当前设备保持登录。</p>
        <button type="button" onClick={() => { void changePassword(); }} disabled={loading || newPassword.length < 8 || !confirmPassword} className="min-h-12 w-full rounded-2xl bg-emerald-500 font-black text-white shadow-[0_5px_0_#22994b] active:translate-y-1 active:shadow-none disabled:bg-slate-300 disabled:shadow-none">
          {loading ? '正在保存…' : '保存新密码'}
        </button>
        <button type="button" onClick={closePassword} disabled={loading} className="min-h-10 w-full rounded-2xl bg-slate-100 font-black text-slate-500">返回我的</button>
      </div>}

      {!passwordOpen && notice && <p className="gb-profile-scene-notice">{notice}</p>}

      <button type="button" onClick={() => { void logout(); }} className="gb-profile-scene-logout" aria-label="退出登录"><LogOut size={20} /><span>退出登录</span></button>
    </section>
  );
}
