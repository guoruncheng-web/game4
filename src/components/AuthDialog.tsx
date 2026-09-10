'use client';

import Image from 'next/image';
import { ClubBrand } from './ClubArt';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, KeyRound, LogOut, RefreshCw, ShieldAlert, X } from 'lucide-react';
import { apiFetch, type ApiCredentials } from '@/lib/api-client';
import Avatar from './Avatar';
import Field from './AuthTextField';

export type AuthMode = 'register' | 'login' | 'account';
type User = { uid: number; username: string; avatar: string; avatarUrl?: string | null; isAdmin?: boolean } | null;

/** 注册分配 UID 后设置密码；登录兼容 UID 和旧用户名。 */
export default function AuthDialog({
  initialMode, user, onAuthed, onClose, onLogout, onRegistered, initialSetup = false, presentation = 'dialog',
}: {
  initialMode: AuthMode;
  user: User;
  onAuthed: (user: Exclude<User, null>, token: string) => void;
  onClose: (credentials?: ApiCredentials) => void;
  onRegistered?: () => void;
  initialSetup?: boolean;
  onLogout: () => void | Promise<void>;
  presentation?: 'dialog' | 'page';
}) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  // SSR 与客户端首帧必须使用相同 URL；接口自身返回 no-store。
  const [captchaKey, setCaptchaKey] = useState(0);
  const [captcha, setCaptcha] = useState('');
  const [loginNeedsCaptcha, setLoginNeedsCaptcha] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstSetup, setFirstSetup] = useState(initialSetup);
  const dialogRef = useRef<HTMLDivElement>(null);
  const page = presentation === 'page';

  const refreshCaptcha = useCallback(() => {
    setCaptchaKey(Date.now());
    setCaptcha('');
  }, []);

  /** 新账号先设置自己的密码，不能被关闭/刷新流程绕过当前设置页。 */
  const requestClose = useCallback(() => {
    if (firstSetup) {
      setError('请先设置登录密码，并记住你的 UID');
      return;
    }
    onClose();
  }, [firstSetup, onClose]);

  // Esc 关闭 + 打开时把焦点移进弹窗,别让键盘用户还停在背后的页面上
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') requestClose();
    }
    window.addEventListener('keydown', onKeyDown);
    dialogRef.current?.querySelector<HTMLElement>('input, button')?.focus();
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [requestClose]);

  async function submitRegister() {
    if (loading) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ captcha }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? '注册失败');
        refreshCaptcha();
        return;
      }
      setFirstSetup(true);
      setMode('account');
      onRegistered?.();
      onAuthed({
        uid: data.uid, username: data.username, avatar: data.avatar,
        avatarUrl: data.avatarUrl ?? null, isAdmin: data.isAdmin,
      }, data.token);
    } catch {
      setError('网络不太好,再试一次');
      refreshCaptcha();
    } finally {
      setLoading(false);
    }
  }

  async function submitLogin() {
    if (loading) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(/^\d{6}$/.test(username.trim())
          ? { uid: username.trim(), password, captcha }
          : { username: username.trim(), password, captcha }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? '登录失败');
        // 后端说这个 IP/账号试错太多了,补出验证码;每次失败都要换一张
        if (data.requireCaptcha) setLoginNeedsCaptcha(true);
        if (loginNeedsCaptcha || data.requireCaptcha) refreshCaptcha();
        return;
      }
      onAuthed({
        uid: data.uid, username: data.username, avatar: data.avatar,
        avatarUrl: data.avatarUrl ?? null, isAdmin: data.isAdmin,
      }, data.token);
      setLoginNeedsCaptcha(false);
      setPassword('');
      onClose({ uid: data.uid, token: data.token });
    } catch {
      setError('网络不太好,再试一次');
    } finally {
      setLoading(false);
    }
  }

  async function submitPasswordChange() {
    if (loading) return;
    if (newPassword !== confirmPassword) {
      setError('两次输入的新密码不一样');
      return;
    }
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const res = await apiFetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? '修改失败');
        return;
      }
      if (user && data.token) {
        onAuthed(user, data.token);
        if (firstSetup || page) {
          setFirstSetup(false);
          onClose({ uid: user.uid, token: data.token });
          return;
        }
      }
      setNotice('密码改好了,其他设备上的登录状态已经失效');
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      setError('网络不太好,再试一次');
    } finally {
      setLoading(false);
    }
  }


  return (
    <div
      role={page ? 'main' : 'dialog'}
      aria-modal={page ? undefined : 'true'}
      aria-label={mode === 'login' ? '登录' : mode === 'register' ? '注册' : '账号设置'}
      className={page ? `gb-auth-form-page gb-auth-mode-${mode} ${mode !== 'account' ? 'gb-auth-v2' : ''} ${mode === 'account' && firstSetup ? 'gb-auth-setup-v2' : ''}` : 'gb-auth-modal fixed inset-0 z-50 flex items-end justify-center bg-[#0b1a2b]/45 backdrop-blur-sm sm:items-center'}
      onClick={(event) => { if (!page && event.target === event.currentTarget) requestClose(); }}
    >
      {page && (mode !== 'account' || firstSetup) && <nav className="gb-auth-v2-brand" aria-label="GAME BOX">{mode === 'register' && <button type="button" aria-label="返回登录" onClick={() => { setMode('login'); setError(''); }}><ArrowLeft size={22} /></button>}<span className="gb-auth-v2-mark" aria-hidden="true" /><b>GAME BOX</b></nav>}
      {page && <header className={`gb-auth-hero ${mode !== 'account' ? 'gb-auth-reference-hero' : ''} ${firstSetup ? 'gb-auth-setup-hero' : ''}`} aria-label="GAME BOX · 一起玩，更好玩">{mode === 'account' && !firstSetup && <ClubBrand />}</header>}
      <div
        ref={dialogRef}
        className={page ? 'gb-auth-form-card' : 'gb-auth-form-card w-full max-w-[440px] rounded-t-[2rem] border-4 border-white bg-[#fffdf7] p-5 shadow-[0_-10px_45px_rgba(23,51,102,0.25)] sm:rounded-[2rem]'}
      >
        <>
            <div className="gb-auth-title"><h1>{mode === 'login' ? (page ? '回来，一起玩。' : '欢迎回来') : mode === 'register' ? (page ? '你的新玩家身份。' : '免费创建账号') : firstSetup ? '欢迎，新玩家。' : '修改密码'}</h1><p>{mode === 'account' ? (firstSetup ? '完成两步，就可以进入 GAME BOX' : '妥善保管你的账号信息') : mode === 'login' ? '登录你的 GAME BOX 账号' : '免费创建账号，开启一起玩的时光'}</p></div>
            {!page && <div className="gb-auth-mode-header mb-4 flex items-center justify-between">
              {mode === 'account' ? (
                <p className="px-1 text-base font-black text-[#173366]">账号设置</p>
              ) : (
                <div className="gb-auth-tabs flex gap-1 rounded-2xl bg-slate-100 p-1">
                  <TabButton active={mode === 'register'} onClick={() => { setMode('register'); setError(''); }}>
                    一键注册
                  </TabButton>
                  <TabButton active={mode === 'login'} onClick={() => { setMode('login'); setError(''); }}>
                    登录
                  </TabButton>
                </div>
              )}
              <button
                type="button"
                onClick={requestClose}
                aria-label="关闭"
                className={page ? 'gb-auth-page-back' : 'grid size-9 place-items-center rounded-full text-slate-400 transition active:scale-90'}
              >
                {page ? <ArrowLeft size={26} /> : <X size={20} />}
              </button>
            </div>}

            {mode === 'register' && (
              <div className="gb-auth-register-panel space-y-3">
                <p className="gb-auth-register-intro text-sm font-semibold leading-relaxed text-slate-500">
                  <strong>系统自动分配专属 UID</strong>
                </p>
                <CaptchaField
                  value={captcha}
                  captchaKey={captchaKey}
                  onChange={setCaptcha}
                  onRefresh={refreshCaptcha}
                  onSubmit={submitRegister}
                />
                {error && <ErrorLine text={error} />}
                <PrimaryButton
                  onClick={submitRegister}
                  disabled={loading || captcha.length < 4}
                  label={loading ? '正在开号…' : '创建账号'}
                />
                {page && <><p className="gb-auth-v2-helper">创建后设置登录密码，请保存好你的 UID</p><div className="gb-auth-v2-switch">已有账号？<button type="button" className="gb-auth-mode-link" onClick={() => { setMode('login'); setError(''); }}>去登录</button></div></>}
                <div className="gb-auth-register-warning" role="note">
                  <ShieldAlert aria-hidden="true" />
                  <p>请保存账号密码，暂不支持找回</p>
                </div>
              </div>
            )}

            {mode === 'login' && (
              <div className="gb-auth-login-panel space-y-3">
                <Field
                  value={username}
                  onChange={setUsername}
                  placeholder="输入 UID 或用户名"
                  visibleLabel={page ? "账号" : undefined}
                  autoComplete="username"
                  label="UID 或用户名"
                />
                <Field
                  value={password}
                  onChange={setPassword}
                  placeholder="输入密码"
                  visibleLabel={page ? "密码" : undefined}
                  type="password"
                  autoComplete="current-password"
                  label="密码"
                  onSubmit={submitLogin}
                />
                {loginNeedsCaptcha && (
                  <CaptchaField
                    value={captcha}
                    captchaKey={captchaKey}
                    onChange={setCaptcha}
                    onRefresh={refreshCaptcha}
                    onSubmit={submitLogin}
                  />
                )}
                {error && <ErrorLine text={error} />}
                <PrimaryButton
                  onClick={submitLogin}
                  disabled={loading || !username || !password || (loginNeedsCaptcha && captcha.length < 4)}
                  label={loading ? '登录中…' : '登录'}
                />
                {page && <><div className="gb-auth-v2-switch">还没有账号？<button type="button" className="gb-auth-mode-link" onClick={() => { setMode('register'); setError(''); }}>创建账号</button></div><p className="gb-auth-v2-footer">好游戏，和朋友一起。</p></>}
              </div>
            )}

            {mode === 'account' && (
              <div className="space-y-3">
                {firstSetup && <ol className="gb-setup-progress" aria-label="账号设置进度"><li aria-current="step"><b>1</b><span>保存 UID</span></li><li><b>2</b><span>设置密码</span></li></ol>}
                {firstSetup ? <section className="gb-setup-uid" aria-labelledby="gb-setup-uid-title"><div><span id="gb-setup-uid-title">你的登录 UID</span><small>以后使用这个号码登录</small></div><b>{user?.uid}</b><button type="button" onClick={() => { if (!navigator.clipboard) { setError('复制不可用，请长按 UID 保存'); return; } if (user) void navigator.clipboard.writeText(String(user.uid)).then(() => setNotice('UID 已复制')).catch(() => setError('复制失败，请长按 UID 保存')); }} aria-label="复制 UID">复制 UID</button></section> : <div className="rounded-2xl border-2 border-slate-200 bg-white p-4">
                  <p className="text-xs font-bold text-slate-400">登录 UID · 请记住这个号码</p>
                  <p className="gb-login-uid">{user?.uid}</p>
                  <div className="mt-2 flex items-center gap-3">
                    <Avatar
                      emoji={user?.avatar ?? ''}
                      url={user?.avatarUrl}
                      alt="账号头像"
                      className="size-12 rounded-2xl bg-emerald-50 text-2xl"
                    />
                    <p className="select-all break-all font-mono text-base font-bold text-slate-800">
                      {user?.username}
                    </p>
                  </div>
                </div>}

                {!firstSetup && <div className="flex items-center gap-2 px-1 pt-1 text-sm font-black text-[#173366]">
                  <KeyRound size={16} className="text-emerald-500" />
                  修改密码
                </div>}
                <p className="px-1 text-xs font-semibold leading-relaxed text-slate-400">
                  {firstSetup ? '设置登录密码' : '修改后其他设备将退出登录，当前设备会保持登录。'}
                </p>
                <Field
                  value={newPassword}
                  onChange={setNewPassword}
                  placeholder="新密码，至少 8 位"
                  type="password"
                  autoComplete="new-password"
                  label="新密码"
                  visibleLabel={firstSetup ? '新密码' : undefined}
                />
                <Field
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  placeholder="再输一次新密码"
                  type="password"
                  autoComplete="new-password"
                  label="确认新密码"
                  visibleLabel={firstSetup ? '确认新密码' : undefined}
                  onSubmit={submitPasswordChange}
                />
                {error && <ErrorLine text={error} />}
                {notice && <p className="px-1 text-sm font-bold text-emerald-600">{notice}</p>}
                <PrimaryButton
                  onClick={submitPasswordChange}
                  disabled={loading || newPassword.length < 8 || !confirmPassword}
                  label={loading ? '提交中…' : firstSetup ? '设置密码并进入' : '确认修改并进入'}
                />
                {!firstSetup && <button
                  type="button"
                  onClick={async () => { await onLogout(); setMode('login'); setFirstSetup(false); setPassword(''); setNewPassword(''); setConfirmPassword(''); }}
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-slate-200 bg-white text-base font-bold text-slate-500 transition active:scale-[0.99]"
                >
                  <LogOut size={18} />
                  退出登录
                </button>}
              </div>
            )}
        </>
      </div>
    </div>
  );
}

function CaptchaField({
  value, captchaKey, onChange, onRefresh, onSubmit,
}: {
  value: string;
  captchaKey: number;
  onChange: (next: string) => void;
  onRefresh: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="gb-auth-captcha-field">
      <span className="gb-auth-field-icon gb-auth-icon-captcha" aria-hidden="true" />
      <p className="gb-auth-captcha-title">图形验证码</p>
      <div className="gb-auth-captcha-preview">
        <div className="gb-auth-captcha-image">
          <Image
            key={captchaKey}
            src={`/api/auth/captcha?t=${captchaKey}`}
            alt=""
            width={168}
            height={56}
            style={{ width: '100%', height: 'auto' }}
            unoptimized
            onLoad={(event) => { event.currentTarget.style.visibility = 'visible'; }}
            onError={(event) => { event.currentTarget.style.visibility = 'hidden'; }}
          />
        </div>
        <button
          type="button"
          onClick={onRefresh}
          aria-label="刷新验证码"
          className="gb-auth-captcha-refresh"
        >
          <RefreshCw aria-hidden="true" />
        </button>
      </div>
      <label className="gb-auth-captcha-input-label" htmlFor={`gb-auth-captcha-${captchaKey}`}>请输入验证码</label>
      <input
        id={`gb-auth-captcha-${captchaKey}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Enter') onSubmit(); }}
        placeholder="输入图形验证码"
        maxLength={6}
        autoComplete="off"
        aria-label="图形验证码"
        className="gb-auth-captcha-input min-h-12 min-w-0 rounded-2xl border-2 border-slate-200 bg-white px-4 text-base font-bold uppercase tracking-[0.2em] text-slate-700 outline-none transition focus:border-emerald-400"
      />
    </div>
  );
}


function PrimaryButton({ onClick, disabled, label }: { onClick: () => void; disabled: boolean; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="gb-auth-primary-button flex min-h-14 w-full items-center justify-center rounded-2xl bg-gradient-to-b from-[#43d875] to-[#2cbe60] text-lg font-black text-white shadow-[0_8px_0_#22994b] transition active:translate-y-1 active:shadow-[0_4px_0_#22994b] disabled:from-slate-300 disabled:to-slate-300 disabled:shadow-none"
    >
      {label}
    </button>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-xl px-4 py-2 text-sm font-bold transition ${
        active ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400'
      }`}
    >
      {children}
    </button>
  );
}

function ErrorLine({ text }: { text: string }) {
  return <p className="px-1 text-sm font-bold text-rose-500">{text}</p>;
}
