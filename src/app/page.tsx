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
import AuthPanel from '@/components/AuthPanel';
import { useAuth } from '@/components/AuthProvider';
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
  const { user, openPanel } = useAuth();
  /**
   * 首页喇叭是全站的总开关,所以它看的是"实际有没有声音",而不只是 muted 那一个键。
   * 游戏里的音量滑条能拖到 0,拖到 0 之后 muted 仍然是 false ——
   * 只看 muted 的话,首页会显示"有声音"却怎么点都不响,用户没有任何办法救回来。
   */
  const [silent, setSilent] = useState(false);
  const [bestScore, setBestScore] = useState(0);
  const [fruitBestScore, setFruitBestScore] = useState(0);
  const [neonBestScore, setNeonBestScore] = useState(0);
  const [neon2dBestScore, setNeon2dBestScore] = useState(0);
  /** 叠叠消是关卡制,没有最高分,卡片上显示的是「已解锁到第几关」 */
  const [pileLevel, setPileLevel] = useState(1);
  /** 捕鱼没有分数,卡片上显示的是钱包余额(单机模式那份,存在本机) */
  const [fishCoins, setFishCoins] = useState(500);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const storedScore = Number(localStorage.getItem('star-runner-best') || 0);
      const storedFruitScore = Number(localStorage.getItem('fruit-slasher-best') || 0);
      const storedNeonScore = Number(localStorage.getItem('neon-strike-best') || 0);
      // 2D 初代版本走自己的 key,两版存档互不覆盖
      const storedNeon2dScore = Number(localStorage.getItem('neon-strike-2d-best') || 0);
      // 叠叠消存的是 JSON,解析失败就当作只解锁了第 1 关 —— 首页不该因为一条脏数据白屏
      let storedPileLevel = 1;
      try {
        const raw = localStorage.getItem('triple-pile-progress');
        const parsed = raw ? (JSON.parse(raw) as { unlocked?: number }) : null;
        if (parsed && Number.isFinite(Number(parsed.unlocked))) {
          storedPileLevel = Math.min(Math.max(Math.floor(Number(parsed.unlocked)), 1), 12);
        }
      } catch {
        storedPileLevel = 1;
      }
      const rawCoins = localStorage.getItem('fish-hunter-wallet');
      const storedCoins = rawCoins === null ? 500 : Number(rawCoins);
      const storedMuted = localStorage.getItem('game-box-muted') === 'true';
      const rawVolume = localStorage.getItem('game-box-volume');
      const storedVolume = rawVolume === null ? 1 : Number(rawVolume);
      const storedSilent = storedMuted || !(Number.isFinite(storedVolume) && storedVolume > 0);
      setBestScore(Number.isFinite(storedScore) ? storedScore : 0);
      setFruitBestScore(Number.isFinite(storedFruitScore) ? storedFruitScore : 0);
      setNeonBestScore(Number.isFinite(storedNeonScore) ? storedNeonScore : 0);
      setNeon2dBestScore(Number.isFinite(storedNeon2dScore) ? storedNeon2dScore : 0);
      setPileLevel(storedPileLevel);
      setFishCoins(Number.isFinite(storedCoins) ? storedCoins : 500);
      setSilent(storedSilent);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function toggleSound() {
    setSilent((current) => {
      const next = !current;
      localStorage.setItem('game-box-muted', String(next));
      // 开声音时顺手把被拖到 0 的音量拉回来,否则这一下点了等于没点
      if (!next) {
        const raw = localStorage.getItem('game-box-volume');
        const volume = raw === null ? 1 : Number(raw);
        if (!Number.isFinite(volume) || volume <= 0) localStorage.setItem('game-box-volume', '1');
      }
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

          <div className="flex items-center gap-2">
            <AuthPanel />
            <button
              type="button"
              onClick={toggleSound}
              aria-label={silent ? '打开音效' : '关闭音效'}
              aria-pressed={silent}
              className="grid size-11 place-items-center rounded-full border border-white/90 bg-white/75 text-emerald-600 shadow-sm backdrop-blur transition active:scale-95"
            >
              {silent ? <VolumeX size={22} /> : <Volume2 size={22} />}
            </button>
          </div>
        </header>

        <section className="px-5 pb-5 pt-1">
          <p className="text-[1.75rem] font-black tracking-[-0.04em] text-[#173366]">
            今晚玩点什么？
          </p>
          <p className="mt-1 text-sm font-semibold text-emerald-600">
            {user ? '即开即玩 · 无需下载' : '登录后即玩 · 无需下载 · 一键开号'}
          </p>
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

              <GameLink
                href="/star-runner"
                className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-[#43d875] to-[#2cbe60] px-5 text-lg font-black text-white shadow-[0_8px_0_#22994b,0_12px_24px_rgba(50,201,107,0.28)] transition active:translate-y-1 active:shadow-[0_4px_0_#22994b]"
              >
                <Play size={22} className="fill-current" />
                立即开始
              </GameLink>
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
            <GameLink
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
            </GameLink>
            <GameLink
              href="/neon-strike-2d"
              className="flex items-center gap-4 rounded-3xl border border-white bg-[#140a2e] p-2.5 shadow-[0_8px_24px_rgba(133,66,190,0.24)] transition active:scale-[0.99]"
            >
              <div className="relative size-24 shrink-0 overflow-hidden rounded-2xl bg-[#090820]">
                <Image
                  src="/neon-strike-2d/assets/space-corridor-v2.png"
                  alt="霓虹光廊里的竖屏弹幕战场"
                  fill
                  sizes="96px"
                  className="object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-black text-fuchsia-300">霓虹突击 2D</p>
                <p className="mt-0.5 text-sm font-bold text-indigo-100">初代竖屏弹幕版</p>
                <p className="mt-2 text-xs font-bold text-pink-400">最高分 {neon2dBestScore}</p>
              </div>
              <span className="grid size-11 place-items-center rounded-2xl bg-fuchsia-300/10 text-fuchsia-300"><Play size={21} className="fill-current" /></span>
            </GameLink>
            <GameLink
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
            </GameLink>
            <GameLink
              href="/eight-ball"
              className="flex items-center gap-4 rounded-3xl border border-white bg-[#123322] p-2.5 shadow-[0_8px_24px_rgba(31,122,82,0.24)] transition active:scale-[0.99]"
            >
              <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-2xl bg-[radial-gradient(circle_at_50%_35%,#2a9463,#0d1a14_72%)] text-5xl shadow-inner">🎱</div>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-black text-emerald-300">Eight Ball</p>
                <p className="mt-0.5 text-sm font-bold text-emerald-100/90">竖屏 8 球，跟 AI 对局</p>
                <p className="mt-2 text-xs font-bold text-amber-300">英文界面 · 三档对手</p>
              </div>
              <span className="grid size-11 place-items-center rounded-2xl bg-emerald-300/10 text-emerald-300"><Play size={21} className="fill-current" /></span>
            </GameLink>
            <GameLink
              href="/triple-pile"
              className="flex items-center gap-4 rounded-3xl border border-white bg-[#2b1a10] p-2.5 shadow-[0_8px_24px_rgba(190,120,46,0.24)] transition active:scale-[0.99]"
            >
              <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-2xl bg-[radial-gradient(circle_at_50%_35%,#c98a45,#1a120c_72%)] text-5xl shadow-inner">🍲</div>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-black text-amber-300">叠叠消</p>
                <p className="mt-0.5 text-sm font-bold text-amber-100/90">俯视捞菜，三个一组消除</p>
                <p className="mt-2 text-xs font-bold text-orange-300">已解锁第 {pileLevel} 关 · 共 12 关</p>
              </div>
              <span className="grid size-11 place-items-center rounded-2xl bg-amber-300/10 text-amber-300"><Play size={21} className="fill-current" /></span>
            </GameLink>
            <GameLink
              href="/fish-hunter"
              className="flex items-center gap-4 rounded-3xl border border-white bg-[#062435] p-2.5 shadow-[0_8px_24px_rgba(30,120,160,0.26)] transition active:scale-[0.99]"
            >
              <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-2xl bg-[radial-gradient(circle_at_50%_35%,#1a86a8,#04141f_72%)] text-5xl shadow-inner">🐟</div>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-black text-cyan-300">深海捕鱼</p>
                <p className="mt-0.5 text-sm font-bold text-cyan-100/90">横屏一池鱼，最多四人同打</p>
                <p className="mt-2 text-xs font-bold text-amber-300">金币 {fishCoins}</p>
              </div>
              <span className="grid size-11 place-items-center rounded-2xl bg-cyan-300/10 text-cyan-300"><Play size={21} className="fill-current" /></span>
            </GameLink>
            <GameLink
              href="/ludo"
              className="flex items-center gap-4 rounded-3xl border border-white bg-[#0d2a63] p-2.5 shadow-[0_8px_24px_rgba(30,80,180,0.28)] transition active:scale-[0.99]"
            >
              <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-2xl bg-[radial-gradient(circle_at_50%_35%,#4f8bff,#0b2154_72%)] text-5xl shadow-inner">✈️</div>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-black text-sky-300">Ludo</p>
                <p className="mt-0.5 text-sm font-bold text-sky-100/90">四人开房，掷二选一</p>
                <p className="mt-2 text-xs font-bold text-amber-300">建房邀请好友 · 人不够可加机器人</p>
              </div>
              <span className="grid size-11 place-items-center rounded-2xl bg-sky-300/10 text-sky-300"><Play size={21} className="fill-current" /></span>
            </GameLink>
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
          <button
            type="button"
            onClick={() => openPanel(user ? 'account' : 'register')}
            className="flex min-h-20 flex-1 flex-col items-center justify-center gap-1 font-bold text-slate-400 transition active:scale-95"
            aria-label={user ? '账号设置' : '登录'}
          >
            {user ? (
              <span className="text-2xl leading-none" aria-hidden="true">{user.avatar}</span>
            ) : (
              <UserRound size={24} />
            )}
            <span className="text-xs">我的</span>
          </button>
        </nav>
      </div>
    </main>
  );
}

/**
 * 游戏入口。
 *
 * 真正拦人的是 `src/middleware.ts`(直接敲 URL 也进不去);这里只是把体验补顺 ——
 * 未登录时点卡片就地弹登录面板,而不是先跳进游戏页再被 middleware 弹回首页。
 * /me 还没回来的那一小会儿按登录处理:middleware 在后面兜着,不会漏进去。
 */
function GameLink({ href, className, children }: { href: string; className: string; children: ReactNode }) {
  const { user, loading, openPanel } = useAuth();
  if (user) {
    return <Link href={href} className={className}>{children}</Link>;
  }
  return (
    <button
      type="button"
      disabled={loading}
      onClick={() => openPanel('register')}
      aria-label="需要先登录才能玩"
      className={`${className} w-full text-left`}
    >
      {children}
    </button>
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
