'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  Gamepad2,
  Hand,
  Hourglass,
  Play,
  Sparkles,
  Star,
  UserRound,
  UsersRound,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

const upcomingGames = [
  {
    image: '/assets/game-box/coming-soon-forest.png',
    alt: '开满鲜花的神秘森林传送门',
    accent: 'text-violet-500',
  },
  {
    image: '/assets/game-box/coming-soon-ocean.png',
    alt: '藏在珊瑚之间的海底宝箱',
    accent: 'text-cyan-500',
  },
];

export default function Home() {
  const [muted, setMuted] = useState(false);
  const [bestScore, setBestScore] = useState(0);
  const [fruitBestScore, setFruitBestScore] = useState(0);
  const [neonBestScore, setNeonBestScore] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const storedScore = Number(localStorage.getItem('star-runner-best') || 0);
      const storedFruitScore = Number(localStorage.getItem('fruit-slasher-best') || 0);
      const storedNeonScore = Number(localStorage.getItem('neon-strike-best') || 0);
      const storedMuted = localStorage.getItem('game-box-muted') === 'true';
      setBestScore(Number.isFinite(storedScore) ? storedScore : 0);
      setFruitBestScore(Number.isFinite(storedFruitScore) ? storedFruitScore : 0);
      setNeonBestScore(Number.isFinite(storedNeonScore) ? storedNeonScore : 0);
      setMuted(storedMuted);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function toggleSound() {
    setMuted((current) => {
      const next = !current;
      localStorage.setItem('game-box-muted', String(next));
      return next;
    });
  }

  return (
    <main className="game-box-bg min-h-dvh text-[#23304a]">
      <div className="mx-auto min-h-dvh w-full max-w-[480px] pb-[calc(6.5rem+env(safe-area-inset-bottom))] shadow-[0_0_80px_rgba(64,197,154,0.12)]">
        <header className="flex items-center justify-between px-5 pb-5 pt-[calc(1.1rem+env(safe-area-inset-top))]">
          <Link href="/" className="flex items-center gap-2.5" aria-label="游戏盒子首页">
            <span className="grid size-11 place-items-center rounded-2xl border-2 border-white bg-gradient-to-br from-lime-300 to-emerald-500 text-white shadow-[0_8px_20px_rgba(50,201,107,0.3)]">
              <Gamepad2 size={25} strokeWidth={2.7} aria-hidden="true" />
            </span>
            <span className="text-xl font-black tracking-[-0.04em] text-[#173366]">
              GAME <span className="text-[#32b85d]">BOX</span>
            </span>
          </Link>

          <button
            type="button"
            onClick={toggleSound}
            aria-label={muted ? '打开音效' : '关闭音效'}
            aria-pressed={muted}
            className="grid size-11 place-items-center rounded-full border border-white/90 bg-white/75 text-emerald-600 shadow-sm backdrop-blur transition active:scale-95"
          >
            {muted ? <VolumeX size={22} /> : <Volume2 size={22} />}
          </button>
        </header>

        <section className="px-5 pb-5 pt-1">
          <p className="text-[1.75rem] font-black tracking-[-0.04em] text-[#173366]">
            今晚玩点什么？
          </p>
          <p className="mt-1 text-sm font-semibold text-emerald-600">即开即玩 · 无需下载</p>
        </section>

        <section className="px-4" aria-labelledby="featured-game">
          <article className="overflow-hidden rounded-[2rem] border-4 border-white bg-[#fffdf7] shadow-[0_16px_45px_rgba(63,156,125,0.18)] ring-1 ring-sky-200/70">
            <div className="relative aspect-[16/9] overflow-hidden bg-sky-300">
              <Image
                src="/assets/game-box/star-runner-cover.png"
                alt="绿色小方块跳过草地平台收集星星"
                fill
                priority
                sizes="(max-width: 480px) 100vw, 480px"
                className="object-cover"
              />
              <span className="absolute left-4 top-4 inline-flex items-center gap-1 rounded-full bg-white/90 px-3 py-1.5 text-xs font-bold text-emerald-700 shadow-sm backdrop-blur">
                <Sparkles size={14} /> 精选游戏
              </span>
            </div>

            <div className="p-5">
              <h1 id="featured-game" className="text-2xl font-black tracking-tight text-[#173366]">
                STAR RUNNER
              </h1>
              <p className="mt-1 text-sm font-medium text-slate-500">收集星星，躲开炸弹</p>

              <div className="mt-4 flex flex-wrap gap-2">
                <Tag icon={<Gamepad2 size={15} />} label="平台跳跃" color="violet" />
                <Tag icon={<UsersRound size={15} />} label="单人" color="sky" />
                <Tag icon={<Hand size={15} />} label="支持触屏" color="green" />
              </div>

              <div className="my-5 flex items-center gap-2 border-y border-dashed border-slate-200 py-4">
                <Star className="fill-amber-300 text-amber-400" size={25} strokeWidth={2.5} />
                <span className="text-sm font-semibold text-slate-600">最高分</span>
                <strong className="ml-1 text-2xl font-black tabular-nums text-emerald-600">
                  {bestScore.toLocaleString('zh-CN')}
                </strong>
              </div>

              <Link
                href="/star-runner"
                className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-[#43d875] to-[#2cbe60] px-5 text-lg font-black text-white shadow-[0_8px_0_#22994b,0_12px_24px_rgba(50,201,107,0.28)] transition active:translate-y-1 active:shadow-[0_4px_0_#22994b]"
              >
                <Play size={22} className="fill-current" />
                立即开始
              </Link>
            </div>
          </article>
        </section>

        <section className="px-4 pb-5 pt-8" aria-labelledby="more-games">
          <div className="mb-3 flex items-center gap-2 px-1">
            <Gamepad2 className="text-emerald-600" size={22} />
            <h2 id="more-games" className="text-xl font-black text-[#173366]">更多游戏</h2>
            <span className="h-px flex-1 bg-gradient-to-r from-sky-200 to-transparent" />
          </div>

          <div className="space-y-3">
            <Link
              href="/neon-strike"
              className="flex items-center gap-4 rounded-3xl border border-white bg-[#0c1235] p-2.5 shadow-[0_8px_24px_rgba(70,66,190,0.24)] transition active:scale-[0.99]"
            >
              <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-2xl bg-[radial-gradient(circle_at_50%_30%,#713cff,#090820_70%)] text-5xl shadow-inner">🚀</div>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-black text-cyan-300">霓虹突击</p>
                <p className="mt-0.5 text-sm font-bold text-indigo-100">自动射击，突破敌军波次</p>
                <p className="mt-2 text-xs font-bold text-pink-400">最高分 {neonBestScore}</p>
              </div>
              <span className="grid size-11 place-items-center rounded-2xl bg-cyan-300/10 text-cyan-300"><Play size={21} className="fill-current" /></span>
            </Link>
            <Link
              href="/fruit-slasher"
              className="flex items-center gap-4 rounded-3xl border border-white bg-white/90 p-2.5 shadow-[0_8px_24px_rgba(79,141,130,0.14)] backdrop-blur transition active:scale-[0.99]"
            >
              <div className="relative size-24 shrink-0 overflow-hidden rounded-2xl bg-[#071326]">
                <Image
                  src="/fruit-slasher/concepts/gameplay-concept-portrait-v2.png"
                  alt="月夜竹林中挥动刀光切开水果"
                  fill
                  sizes="96px"
                  className="object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-black text-orange-500">水果切切乐</p>
                <p className="mt-0.5 text-sm font-bold text-slate-600">滑动切水果，避开炸弹</p>
                <p className="mt-2 text-xs font-bold text-amber-600">最高分 {fruitBestScore}</p>
              </div>
              <span className="grid size-11 place-items-center rounded-2xl bg-orange-50 text-orange-500">
                <Play size={21} className="fill-current" />
              </span>
            </Link>
            {upcomingGames.map((game) => (
              <article
                key={game.image}
                className="flex items-center gap-4 rounded-3xl border border-white bg-white/85 p-2.5 shadow-[0_8px_24px_rgba(79,141,130,0.11)] backdrop-blur"
              >
                <div className="relative size-24 shrink-0 overflow-hidden rounded-2xl bg-white">
                  <Image src={game.image} alt={game.alt} fill sizes="96px" className="object-cover" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-lg font-black ${game.accent}`}>神秘新作</p>
                  <p className="mt-0.5 text-sm font-bold text-slate-600">敬请期待</p>
                </div>
                <span className={`grid size-11 place-items-center rounded-2xl bg-slate-50 ${game.accent}`}>
                  <Hourglass size={21} />
                </span>
              </article>
            ))}
          </div>
        </section>

        <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto flex w-full max-w-[480px] border-t border-white/90 bg-white/90 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_28px_rgba(47,104,97,0.1)] backdrop-blur-xl" aria-label="主导航">
          <Link href="/" aria-current="page" className="flex min-h-20 flex-1 flex-col items-center justify-center gap-1 font-bold text-emerald-600">
            <Gamepad2 size={24} strokeWidth={2.5} />
            <span className="text-xs">游戏</span>
          </Link>
          <button type="button" className="flex min-h-20 flex-1 cursor-default flex-col items-center justify-center gap-1 font-bold text-slate-400" aria-label="我的功能尚未开放">
            <UserRound size={24} />
            <span className="text-xs">我的</span>
          </button>
        </nav>
      </div>
    </main>
  );
}

type TagProps = {
  icon: ReactNode;
  label: string;
  color: 'violet' | 'sky' | 'green';
};

const tagColors = {
  violet: 'border-violet-200 bg-violet-50 text-violet-600',
  sky: 'border-sky-200 bg-sky-50 text-sky-600',
  green: 'border-emerald-200 bg-emerald-50 text-emerald-600',
};

function Tag({ icon, label, color }: TagProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-bold ${tagColors[color]}`}>
      {icon}
      {label}
    </span>
  );
}
