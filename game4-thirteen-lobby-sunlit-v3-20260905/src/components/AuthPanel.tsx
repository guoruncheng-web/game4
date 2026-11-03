'use client';

import { Gem, LogOut, UserRound } from 'lucide-react';
import { useAuth } from './AuthProvider';

/**
 * 头部的账号按钮。状态和弹窗都在 AuthProvider / AuthDialog 里,这里只有两颗按钮。
 * 登录后点用户名进账号设置(改密码在那里)。
 */
export default function AuthPanel() {
  const { user, wallet, loading, openPanel, logout } = useAuth();

  // /me 还没回来时先占位,别先渲染"登录"再闪成用户名
  if (loading) {
    return <span className="h-11 w-[4.5rem] rounded-full border border-white/90 bg-white/45" aria-hidden="true" />;
  }

  if (!user) {
    return (
      <button
        type="button"
        onClick={() => openPanel('register')}
        className="flex items-center gap-1.5 rounded-full border border-white/90 bg-white/75 px-3.5 py-2.5 text-sm font-bold text-emerald-600 shadow-sm backdrop-blur transition active:scale-95"
      >
        <UserRound size={18} />
        登录
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      {wallet && (
        <span
          aria-label={`钻石 ${wallet.diamonds.toLocaleString()}`}
          className="hidden min-h-9 items-center gap-1 rounded-full border border-cyan-200 bg-cyan-50 px-2.5 text-xs font-black text-cyan-700 sm:flex"
        >
          <Gem size={14} aria-hidden="true" />{wallet.diamonds.toLocaleString()}
        </span>
      )}
      <button
        type="button"
        onClick={() => openPanel('account')}
        aria-label={`账号 ${user.username},点击管理`}
        className="flex max-w-[10rem] items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-700 transition active:scale-95"
      >
        <span className="text-base" aria-hidden="true">{user.avatar}</span>
        <span className="truncate">{user.username}</span>
      </button>
      <button
        type="button"
        onClick={() => { void logout(); }}
        aria-label="退出登录"
        className="grid size-11 place-items-center rounded-full border border-white/90 bg-white/75 text-slate-400 shadow-sm backdrop-blur transition active:scale-95"
      >
        <LogOut size={20} />
      </button>
    </div>
  );
}
