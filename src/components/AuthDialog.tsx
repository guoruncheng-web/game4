'use client';

import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Copy, KeyRound, LogOut, RefreshCw, ShieldAlert, X } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import Avatar from './Avatar';

export type AuthMode = 'register' | 'login' | 'account';
type User = { uid: number; username: string; avatar: string; avatarUrl?: string | null; isAdmin?: boolean } | null;
/** 一键开号成功后拿到的明文凭据,只在这一次出现 */
type Credentials = { uid: number; username: string; password: string };

/**
 * 账号弹窗:一键注册 + 登录 + 改密码。
 *
 * 产品形态是"后端直接发一对账号密码,前端弹窗让用户自己记住"。
 * 因为没有邮箱也就没有找回流程,所以弹窗必须把"丢了就找不回来"说死,
 * 并且要求用户勾选确认之后才让关 —— 这一步不是仪式感,是这套设计唯一的安全网。
 * 也正因为没有找回,改密码是刚需:登录之后点用户名就能进。
 *
 * 登录连续失败几次后,后端会在响应里带 requireCaptcha,这时这里补出验证码输入框。
 */
export default function AuthDialog({
  initialMode, user, onAuthed, onClose, onLogout, presentation = 'dialog',
}: {
  initialMode: AuthMode;
  user: User;
  onAuthed: (user: Exclude<User, null>, token: string) => void;
  onClose: () => void;
  onLogout: () => void | Promise<void>;
  presentation?: 'dialog' | 'page';
}) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [captchaKey, setCaptchaKey] = useState(() => Date.now());
  const [captcha, setCaptcha] = useState('');
  const [loginNeedsCaptcha, setLoginNeedsCaptcha] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const page = presentation === 'page';

  const refreshCaptcha = useCallback(() => {
    setCaptchaKey(Date.now());
    setCaptcha('');
  }, []);

  /** 凭据还没确认保存时不许关,避免用户手滑把唯一一次看到密码的机会点掉 */
  const requestClose = useCallback(() => {
    if (credentials && !saved) {
      setError('先把账号密码存好,勾上下面那一项再关');
      return;
    }
    onClose();
  }, [credentials, saved, onClose]);

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
      setCredentials({ uid: data.uid, username: data.username, password: data.password });
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
        body: JSON.stringify({ username, password, captcha }),
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
      onClose();
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
      if (user && data.token) onAuthed(user, data.token);
      setNotice('密码改好了,其他设备上的登录状态已经失效');
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      setError('网络不太好,再试一次');
    } finally {
      setLoading(false);
    }
  }

  async function copyCredentials() {
    if (!credentials) return;
    const text = `UID ${credentials.uid}\n账号 ${credentials.username}\n密码 ${credentials.password}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('浏览器不让自动复制,请手动抄下来');
    }
  }

  return (
    <div
      role={page ? 'main' : 'dialog'}
      aria-modal={page ? undefined : 'true'}
      aria-label="账号"
      className={page ? `auth-form-page auth-mode-${mode}` : 'fixed inset-0 z-50 flex items-end justify-center bg-[#0b1a2b]/45 backdrop-blur-sm sm:items-center'}
      onClick={(event) => { if (!page && event.target === event.currentTarget) requestClose(); }}
    >
      {page && (mode === 'register' || mode === 'login') && !credentials && (
        <Image
          src={mode === 'register'
            ? '/concepts/game-box-auth-gate-concept-v1.png'
            : '/assets/game-box/v3/game-box-auth-login-concept-v1.png'}
          alt=""
          fill
          priority
          unoptimized
          sizes="(max-width: 480px) 100vw, 480px"
          className="auth-approved-register-layer"
        />
      )}
      <div
        ref={dialogRef}
        className={page ? 'auth-form-card' : 'w-full max-w-[440px] rounded-t-[2rem] border-4 border-white bg-[#fffdf7] p-5 shadow-[0_-10px_45px_rgba(23,51,102,0.25)] sm:rounded-[2rem]'}
      >
        {credentials ? (
          <CredentialsCard
            credentials={credentials}
            copied={copied}
            saved={saved}
            error={error}
            onCopy={copyCredentials}
            onToggleSaved={() => { setSaved((v) => !v); setError(''); }}
            onDone={requestClose}
          />
        ) : (
          <>
            <div className="auth-mode-header mb-4 flex items-center justify-between">
              {mode === 'account' ? (
                <p className="px-1 text-base font-black text-[#173366]">账号设置</p>
              ) : (
                <div className="auth-tabs flex gap-1 rounded-2xl bg-slate-100 p-1">
                  <TabButton active={mode === 'register'} onClick={() => { setMode('register'); setError(''); }}>
                    一键注册
                  </TabButton>
                  <TabButton active={mode === 'login'} onClick={() => { setMode('login'); setError(''); }}>
                    已有账号
                  </TabButton>
                </div>
              )}
              <button
                type="button"
                onClick={requestClose}
                aria-label="关闭"
                className={page ? 'auth-page-back' : 'grid size-9 place-items-center rounded-full text-slate-400 transition active:scale-90'}
              >
                {page ? <ArrowLeft size={26} /> : <X size={20} />}
              </button>
            </div>

            {mode === 'register' && (
              <div className="auth-register-panel space-y-3">
                <p className="auth-register-intro text-sm font-semibold leading-relaxed text-slate-500">
                  一键创建你的 GAME BOX 账号<br />
                  立即开启精彩的游戏之旅！<br />
                  <strong>账号信息只会显示这一次，请务必保存好！</strong>
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
                  label={loading ? '正在开号…' : '给我一个账号'}
                />
                <div className="auth-register-warning" role="note">
                  <ShieldAlert aria-hidden="true" />
                  <p>本平台不提供邮箱找回功能<br />请务必妥善保存你的账号信息！</p>
                </div>
              </div>
            )}

            {mode === 'login' && (
              <div className="auth-login-panel space-y-3">
                <Field
                  value={username}
                  onChange={setUsername}
                  placeholder="账号，形如 player-7k3m9x"
                  autoComplete="username"
                  label="账号"
                />
                <Field
                  value={password}
                  onChange={setPassword}
                  placeholder="密码"
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
              </div>
            )}

            {mode === 'account' && (
              <div className="space-y-3">
                <div className="rounded-2xl border-2 border-slate-200 bg-white p-4">
                  <p className="text-xs font-bold text-slate-400">当前账号</p>
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
                </div>
                <p className="px-1 font-mono text-xs font-bold text-emerald-600">UID {user?.uid}</p>
                <div className="flex items-center gap-2 px-1 pt-1 text-sm font-black text-[#173366]">
                  <KeyRound size={16} className="text-emerald-500" />
                  修改密码
                </div>
                <p className="px-1 text-xs font-semibold leading-relaxed text-slate-400">
                  开号发的密码是一串随机字符，多半你也没背下来，所以这里不用填旧密码。
                  改完之后其他设备上的登录状态会全部失效。
                </p>
                <Field
                  value={newPassword}
                  onChange={setNewPassword}
                  placeholder="新密码，至少 8 位"
                  type="password"
                  autoComplete="new-password"
                  label="新密码"
                />
                <Field
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  placeholder="再输一次新密码"
                  type="password"
                  autoComplete="new-password"
                  label="确认新密码"
                  onSubmit={submitPasswordChange}
                />
                {error && <ErrorLine text={error} />}
                {notice && <p className="px-1 text-sm font-bold text-emerald-600">{notice}</p>}
                <PrimaryButton
                  onClick={submitPasswordChange}
                  disabled={loading || newPassword.length < 8 || !confirmPassword}
                  label={loading ? '提交中…' : '确认修改'}
                />
                <button
                  type="button"
                  onClick={() => { void onLogout(); }}
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-slate-200 bg-white text-base font-bold text-slate-500 transition active:scale-[0.99]"
                >
                  <LogOut size={18} />
                  退出登录
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function CredentialsCard({
  credentials, copied, saved, error, onCopy, onToggleSaved, onDone,
}: {
  credentials: Credentials;
  copied: boolean;
  saved: boolean;
  error: string;
  onCopy: () => void;
  onToggleSaved: () => void;
  onDone: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-2xl border-2 border-amber-200 bg-amber-50 p-3">
        <ShieldAlert className="mt-0.5 shrink-0 text-amber-500" size={20} />
        <p className="text-sm font-bold leading-relaxed text-amber-700">
          账号开好了。请立刻截图或复制保存 —— 密码只显示这一次，
          <span className="underline decoration-amber-400 decoration-2">没有找回功能，丢了账号就找不回来了。</span>
        </p>
      </div>

      <dl className="space-y-2 rounded-2xl border-2 border-slate-200 bg-white p-4">
        <div className="flex items-baseline gap-3">
          <dt className="w-10 shrink-0 text-xs font-bold text-slate-400">UID</dt>
          <dd className="select-all font-mono text-base font-bold text-emerald-700">{credentials.uid}</dd>
        </div>
        <div className="flex items-baseline gap-3">
          <dt className="w-10 shrink-0 text-xs font-bold text-slate-400">账号</dt>
          <dd className="select-all break-all font-mono text-base font-bold text-slate-800">{credentials.username}</dd>
        </div>
        <div className="flex items-baseline gap-3">
          <dt className="w-10 shrink-0 text-xs font-bold text-slate-400">密码</dt>
          <dd className="select-all break-all font-mono text-base font-bold text-slate-800">{credentials.password}</dd>
        </div>
      </dl>

      <button
        type="button"
        onClick={onCopy}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-emerald-200 bg-emerald-50 text-base font-bold text-emerald-700 transition active:scale-[0.99]"
      >
        {copied ? <Check size={18} /> : <Copy size={18} />}
        {copied ? '已复制到剪贴板' : '复制 UID、账号和密码'}
      </button>

      <label className="flex cursor-pointer items-center gap-2.5 px-1 text-sm font-bold text-slate-600">
        <input type="checkbox" checked={saved} onChange={onToggleSaved} className="size-5 accent-emerald-500" />
        我已经保存好了
      </label>

      {error && <ErrorLine text={error} />}

      <button
        type="button"
        onClick={onDone}
        disabled={!saved}
        className="flex min-h-14 w-full items-center justify-center rounded-2xl bg-gradient-to-b from-[#43d875] to-[#2cbe60] text-lg font-black text-white shadow-[0_8px_0_#22994b] transition active:translate-y-1 active:shadow-[0_4px_0_#22994b] disabled:from-slate-300 disabled:to-slate-300 disabled:shadow-none"
      >
        开始玩
      </button>
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
    <div className="auth-captcha-field">
      <p className="auth-captcha-title">图形验证码</p>
      <div className="auth-captcha-preview">
        <div className="auth-captcha-image">
          <Image
            key={captchaKey}
            src={`/api/auth/captcha?t=${captchaKey}`}
            alt=""
            width={168}
            height={56}
            unoptimized
            onLoad={(event) => { event.currentTarget.style.visibility = 'visible'; }}
            onError={(event) => { event.currentTarget.style.visibility = 'hidden'; }}
          />
        </div>
        <button
          type="button"
          onClick={onRefresh}
          aria-label="刷新验证码"
          className="auth-captcha-refresh"
        >
          <RefreshCw aria-hidden="true" />
        </button>
      </div>
      <label className="auth-captcha-input-label" htmlFor={`auth-captcha-${captchaKey}`}>请输入验证码</label>
      <input
        id={`auth-captcha-${captchaKey}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Enter') onSubmit(); }}
        placeholder=""
        maxLength={6}
        autoComplete="off"
        aria-label="图形验证码"
        className="auth-captcha-input min-h-12 min-w-0 rounded-2xl border-2 border-slate-200 bg-white px-4 text-base font-bold uppercase tracking-[0.2em] text-slate-700 outline-none transition focus:border-emerald-400"
      />
    </div>
  );
}

function Field({
  value, onChange, placeholder, label, type = 'text', autoComplete, onSubmit,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  label: string;
  type?: string;
  autoComplete?: string;
  onSubmit?: () => void;
}) {
  return (
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => { if (event.key === 'Enter' && onSubmit) onSubmit(); }}
      type={type}
      placeholder={placeholder}
      autoComplete={autoComplete}
      aria-label={label}
      maxLength={128}
      className="auth-text-field min-h-12 w-full rounded-2xl border-2 border-slate-200 bg-white px-4 text-base font-semibold text-slate-700 outline-none transition focus:border-emerald-400"
    />
  );
}

function PrimaryButton({ onClick, disabled, label }: { onClick: () => void; disabled: boolean; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="auth-primary-button flex min-h-14 w-full items-center justify-center rounded-2xl bg-gradient-to-b from-[#43d875] to-[#2cbe60] text-lg font-black text-white shadow-[0_8px_0_#22994b] transition active:translate-y-1 active:shadow-[0_4px_0_#22994b] disabled:from-slate-300 disabled:to-slate-300 disabled:shadow-none"
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
