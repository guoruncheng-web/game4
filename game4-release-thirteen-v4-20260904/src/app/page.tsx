'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  Gamepad2,
  Hourglass,
  MessageCircle,
  Play,
  Puzzle,
  RadioTower,
  UserRound,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import ChatPanel from '@/components/ChatPanel';
import ProfilePanel from '@/components/ProfilePanel';
import type { ReactNode } from 'react';
import { apiFetch, withGameCredentials } from '@/lib/api-client';
import Avatar from '@/components/Avatar';

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
  const { user, loading: authLoading } = useAuth();
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
  const [activeTab, setActiveTab] = useState<'games' | 'messages' | 'profile'>('games');
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [gameAvailability, setGameAvailability] = useState<Record<string, boolean>>({});

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

  useEffect(() => {
    let cancelled = false;
    async function loadUnread() {
      if (!user) {
        if (!cancelled) setUnreadMessages(0);
        return;
      }
      try {
        const response = await apiFetch('/api/friends');
        const data = await response.json();
        if (!cancelled && response.ok) {
          const total = (data.friends as Array<{ unreadCount?: number }>).reduce(
            (sum, friend) => sum + (friend.unreadCount ?? 0), 0,
          );
          setUnreadMessages(total);
        }
      } catch {
        // 未读红点是增强信息，断网时保留上一次状态。
      }
    }
    const initial = window.setTimeout(() => { void loadUnread(); }, 0);
    const polling = window.setInterval(() => { void loadUnread(); }, 5000);
    return () => {
      cancelled = true;
      window.clearTimeout(initial);
      window.clearInterval(polling);
    };
  }, [user]);

  useEffect(() => {
    if (authLoading || !user) return undefined;
    let cancelled = false;
    apiFetch('/api/games')
      .then((response) => response.json())
      .then((data: { games?: Array<{ slug: string; enabled: boolean }> }) => {
        if (!cancelled) {
          setGameAvailability(Object.fromEntries((data.games ?? []).map((game) => [game.slug, game.enabled])));
        }
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [authLoading, user]);

  useEffect(() => {
    function openMessages() { setActiveTab('messages'); }
    if (new URLSearchParams(window.location.search).get('tab') === 'messages') {
      const timer = window.setTimeout(openMessages, 0);
      window.addEventListener('game-box-open-messages', openMessages);
      return () => {
        window.clearTimeout(timer);
        window.removeEventListener('game-box-open-messages', openMessages);
      };
    }
    window.addEventListener('game-box-open-messages', openMessages);
    return () => window.removeEventListener('game-box-open-messages', openMessages);
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
      <div className="game-box-shell mx-auto min-h-dvh w-full max-w-[480px] pb-[calc(7.25rem+env(safe-area-inset-bottom))]">
        <header className="game-box-header relative z-10 flex items-center justify-between px-5 pb-5 pt-[calc(1rem+env(safe-area-inset-top))]">
          <Link href="/" className="flex items-center gap-2.5" aria-label="游戏盒子首页">
            <span className="grid size-11 place-items-center rounded-2xl border border-emerald-200/30 bg-gradient-to-br from-[#5ff0a6] to-[#20b96e] text-[#08271a] shadow-[0_0_24px_rgba(67,216,117,0.35)]">
              <Gamepad2 size={25} strokeWidth={2.7} aria-hidden="true" />
            </span>
            <span>
              <span className="block text-[10px] font-black tracking-[0.24em] text-emerald-300/70">PLAY ANYWHERE</span>
              <span className="block text-xl font-black tracking-[-0.04em] text-white">GAME <span className="text-[#5ff0a6]">BOX</span></span>
            </span>
          </Link>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleSound}
              aria-label={silent ? '打开音效' : '关闭音效'}
              aria-pressed={silent}
              className="grid size-11 place-items-center rounded-2xl border border-white/15 bg-white/10 text-emerald-300 shadow-sm backdrop-blur transition active:scale-95"
            >
              {silent ? <VolumeX size={22} /> : <Volume2 size={22} />}
            </button>
          </div>
        </header>

        <div className={activeTab === 'games' ? '' : 'hidden'}>
        <section className="px-5 pb-6 pt-2 text-white">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1.5 text-[11px] font-black tracking-[0.12em] text-emerald-200">
            <span className="size-1.5 rounded-full bg-emerald-300 shadow-[0_0_8px_#5ff0a6]" /> 随时开局
          </div>
          <p className="text-[2rem] font-black leading-[1.08] tracking-[-0.055em]">
            你的掌上游戏厅
          </p>
          <p className="mt-2 text-sm font-semibold text-slate-300">
            {user ? '继续挑战记录，或者叫上好友来一局' : '一次登录，收藏你的成绩与好友'}
          </p>
        </section>

        <section className="px-4 pb-5 pt-2" aria-labelledby="more-games">
          <div className="mb-3 flex items-center gap-2 px-1">
            <Gamepad2 className="text-emerald-600" size={22} />
            <h2 id="more-games" className="text-xl font-black text-[#173366]">动作街机</h2>
            <span className="h-px flex-1 bg-gradient-to-r from-sky-200 to-transparent" />
          </div>

          <div className="space-y-3">
            <GameLink
              href="/star-runner"
              enabled={gameAvailability['star-runner'] !== false}
              className="flex items-center gap-4 rounded-3xl border border-white bg-white/90 p-2.5 shadow-[0_10px_28px_rgba(23,88,82,0.14)] backdrop-blur transition active:scale-[0.99]"
            >
              <div className="relative size-24 shrink-0 overflow-hidden rounded-2xl bg-sky-300">
                <Image src="/assets/game-box/star-runner-cover.png" alt="绿色小方块跳过草地平台收集星星" fill priority sizes="96px" className="object-cover" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-black text-[#173366]">STAR RUNNER</p>
                <p className="mt-0.5 text-sm font-bold text-slate-600">收集星星，躲开炸弹</p>
                <p className="mt-2 text-xs font-black text-emerald-600">最高分 {bestScore.toLocaleString('zh-CN')}</p>
              </div>
              <span className="grid size-11 place-items-center rounded-2xl bg-emerald-50 text-emerald-500"><Play size={21} className="fill-current" /></span>
            </GameLink>
            <GameLink
              href="/neon-strike"
              enabled={gameAvailability['neon-strike'] !== false}
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
              enabled={gameAvailability['neon-strike-2d'] !== false}
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
              enabled={gameAvailability['fruit-slasher'] !== false}
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

            <div className="flex items-center gap-2 px-1 pb-0 pt-5">
              <span className="grid size-8 place-items-center rounded-xl bg-violet-100 text-violet-600" aria-hidden="true"><Puzzle size={17} /></span>
              <h2 className="text-xl font-black text-[#173366]">桌游益智</h2>
              <span className="h-px flex-1 bg-gradient-to-r from-violet-200 to-transparent" />
            </div>
            <GameLink
              href="/eight-ball"
              enabled={gameAvailability['eight-ball'] !== false}
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
              enabled={gameAvailability['triple-pile'] !== false}
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

            <div className="flex items-center gap-2 px-1 pb-0 pt-5">
              <span className="grid size-8 place-items-center rounded-xl bg-cyan-100 text-cyan-600" aria-hidden="true"><RadioTower size={17} /></span>
              <h2 className="text-xl font-black text-[#173366]">多人联机</h2>
              <span className="h-px flex-1 bg-gradient-to-r from-cyan-200 to-transparent" />
            </div>
            <GameLink
              href="/fish-hunter"
              enabled={gameAvailability['fish-hunter'] !== false}
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
              enabled={gameAvailability.ludo !== false}
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
            <GameLink
              href="/umo"
              enabled={gameAvailability.umo !== false}
              requiresAuth={false}
              className="flex items-center gap-4 rounded-3xl border border-white bg-[#050b1d] p-2.5 shadow-[0_8px_24px_rgba(38,204,183,0.26)] transition active:scale-[0.99]"
            >
              <div className="relative size-24 shrink-0 overflow-hidden rounded-2xl bg-[#071022]">
                <Image src="/umo/cover.png" alt="霓虹竞技台上的 UMO 卡牌模式入口" fill sizes="96px" className="object-cover object-top" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-black text-teal-300">UMO</p>
                <p className="mt-0.5 text-sm font-bold text-cyan-100/90">四人脉冲卡牌竞技</p>
                <p className="mt-2 text-xs font-bold text-amber-300">游客可玩 · 经典 / 2v2 联机</p>
              </div>
              <span className="grid size-11 place-items-center rounded-2xl bg-teal-300/10 text-teal-300"><Play size={21} className="fill-current" /></span>
            </GameLink>
            <GameLink
              href="/thirteen"
              enabled={gameAvailability.thirteen !== false}
              requiresAuth={false}
              className="flex items-center gap-4 rounded-3xl border border-white bg-[#082f31] p-2.5 shadow-[0_8px_24px_rgba(12,92,82,0.3)] transition active:scale-[0.99]"
            >
              <div className="relative size-24 shrink-0 overflow-hidden rounded-2xl bg-[#061f25]">
                <Image src="/thirteen/cover.png" alt="西贡夜市中的十三张牌桌入口" fill sizes="96px" className="object-cover" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-black text-amber-300">Chặt Heo!</p>
                <p className="mt-0.5 text-sm font-bold text-emerald-100/90">西贡夜市 · 南方十三张</p>
                <p className="mt-2 text-xs font-bold text-teal-300">游客可单机 · 登录后四人联机</p>
              </div>
              <span className="grid size-11 place-items-center rounded-2xl bg-amber-300/10 text-amber-300"><Play size={21} className="fill-current" /></span>
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
        </div>

        {activeTab === 'messages' && <ChatPanel />}
        {activeTab === 'profile' && <ProfilePanel />}

        <nav
          className="game-box-dock fixed bottom-[calc(0.65rem+env(safe-area-inset-bottom))] left-1/2 z-20 flex max-w-[456px] -translate-x-1/2 rounded-[1.7rem] border border-white/10 bg-[#0b2032]/95 px-1.5 py-1.5 backdrop-blur-xl"
          style={{ width: 'calc(100% - 1.5rem)' }}
          aria-label="主导航"
        >
          <button
            type="button"
            onClick={() => setActiveTab('games')}
            aria-current={activeTab === 'games' ? 'page' : undefined}
            className={`flex min-h-16 flex-1 flex-col items-center justify-center gap-1 rounded-[1.25rem] font-bold transition active:scale-95 ${activeTab === 'games' ? 'bg-emerald-400/15 text-emerald-300' : 'text-slate-400'}`}
          >
            <Gamepad2 size={24} strokeWidth={2.5} />
            <span className="text-xs">游戏</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('messages')}
            aria-current={activeTab === 'messages' ? 'page' : undefined}
            className={`flex min-h-16 flex-1 flex-col items-center justify-center gap-1 rounded-[1.25rem] font-bold transition active:scale-95 ${activeTab === 'messages' ? 'bg-emerald-400/15 text-emerald-300' : 'text-slate-400'}`}
          >
            <span className="relative">
              <MessageCircle size={24} />
              {unreadMessages > 0 && (
                <span className="absolute -right-1.5 -top-1.5 size-2.5 rounded-full border-2 border-[#0b2032] bg-rose-500" aria-label={`${unreadMessages} 条未读消息`} />
              )}
            </span>
            <span className="text-xs">消息</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            aria-current={activeTab === 'profile' ? 'page' : undefined}
            className={`flex min-h-16 flex-1 flex-col items-center justify-center gap-1 rounded-[1.25rem] font-bold transition active:scale-95 ${activeTab === 'profile' ? 'bg-emerald-400/15 text-emerald-300' : 'text-slate-400'}`}
            aria-label="我的个人资料"
          >
            {user ? (
              <Avatar emoji={user.avatar} url={user.avatarUrl} className="size-7 rounded-lg text-2xl leading-none" />
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
function GameLink({ href, className, children, enabled = true, requiresAuth = true }: {
  href: string; className: string; children: ReactNode; enabled?: boolean; requiresAuth?: boolean;
}) {
  const { user, credentials, loading, openPanel } = useAuth();
  if (!enabled) {
    return (
      <div aria-disabled="true" className={`${className} relative overflow-hidden opacity-60`}>
        {children}
        <span className="absolute right-3 top-3 rounded-full bg-slate-900/80 px-2.5 py-1 text-[10px] font-black text-white">维护中</span>
      </div>
    );
  }
  if (user || !requiresAuth) {
    return <Link href={withGameCredentials(href, credentials)} className={className}>{children}</Link>;
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
