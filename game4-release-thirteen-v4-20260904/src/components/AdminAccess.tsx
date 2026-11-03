'use client';

import Link from 'next/link';
import { LockKeyhole, LogIn, LogOut } from 'lucide-react';
import { useAuth } from './AuthProvider';

export default function AdminAccess({ signedIn, username }: { signedIn: boolean; username?: string }) {
  const { openPanel, logout } = useAuth();

  return (
    <main className="grid min-h-[100dvh] place-items-center bg-[radial-gradient(circle_at_top,#263c75_0,#111a38_42%,#080d20_100%)] px-5 text-white">
      <section className="w-full max-w-md rounded-[2rem] border border-white/15 bg-white/10 p-7 text-center shadow-2xl backdrop-blur-xl">
        <div className="mx-auto mb-5 grid size-16 place-items-center rounded-2xl bg-amber-300 text-slate-900 shadow-lg">
          <LockKeyhole size={30} />
        </div>
        <h1 className="text-2xl font-black">游戏管理后台</h1>
        <p className="mt-3 text-sm font-semibold leading-6 text-slate-300">
          {signedIn ? `当前账号 ${username} 没有管理员权限。` : '请先使用管理员账号登录。'}
        </p>
        {signedIn ? (
          <button
            type="button"
            onClick={() => void logout().then(() => openPanel('login'))}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-300 px-5 py-3 font-black text-slate-900 transition active:scale-95"
          >
            <LogOut size={18} /> 切换管理员账号
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
          返回游戏首页
        </Link>
      </section>
    </main>
  );
}
