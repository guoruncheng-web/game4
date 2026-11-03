import Link from 'next/link';
import type { ReactNode } from 'react';

type Props = {
  title: string;
  /** 操作说明等副标题 */
  subtitle?: string;
  children: ReactNode;
};

/** 所有游戏页共用的外壳:标题 + 返回盒子首页的入口。 */
export default function GameShell({ title, subtitle, children }: Props) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-slate-950 p-6">
      <header className="flex w-full max-w-5xl items-baseline justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-100">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
        </div>
        <Link
          href="/"
          className="shrink-0 rounded-lg border border-slate-700/70 px-3 py-1.5 text-sm text-slate-300 transition-colors hover:border-slate-500 hover:text-slate-100"
        >
          ← 返回游戏盒子
        </Link>
      </header>

      {children}
    </main>
  );
}
