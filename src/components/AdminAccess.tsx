'use client';

import Link from 'next/link';
import { LogIn, LogOut } from 'lucide-react';
import { useAuth } from './AuthProvider';

export default function AdminAccess({ signedIn, username }: { signedIn: boolean; username?: string }) {
  const { openPanel, logout } = useAuth();

  return (
    <main className="gb-system-page">
      <section className="gb-system-card">
        <div className="gb-state-art gb-state-art--locked"><Link className="gb-state-back" href="/" aria-label="返回首页">‹</Link></div>
        <h1 className="text-2xl font-black">游戏管理后台</h1>
        <p className="mt-3 text-sm font-semibold leading-6 text-slate-300">
          {signedIn ? `当前账号 ${username} 没有管理员权限。` : '请先使用管理员账号登录。'}
        </p>
        <p className="gb-access-help">如需管理后台功能，请使用管理员账号登录</p>
        {signedIn ? (
          <button
            type="button"
            onClick={() => void logout().then(() => openPanel('login'))}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-300 px-5 py-3 font-black text-slate-900 transition active:scale-95"
          >
            <LogOut size={18} /> 切换账号
          </button>
        ) : (
          <button
            type="button"
            onClick={() => openPanel('login')}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-300 px-5 py-3 font-black text-slate-900 transition active:scale-95"
          >
            <LogIn size={18} /> 登录管理员账号
          </button>
        )}
        <Link href="/" className="mt-4 inline-block text-sm font-bold text-slate-300 hover:text-white">
          返回首页
        </Link>
      </section>
    </main>
  );
}
