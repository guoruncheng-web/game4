'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import ChatPanel from '@/components/ChatPanel';
import ProfilePanel from '@/components/ProfilePanel';
import type { ReactNode } from 'react';
import { apiFetch, withGameCredentials } from '@/lib/api-client';
import Avatar from '@/components/Avatar';

export default function Home() {
  const { user, wallet, loading: authLoading } = useAuth();
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
  const [conversationOpen, setConversationOpen] = useState(false);
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
    const requestedTab = new URLSearchParams(window.location.search).get('tab');
    if (requestedTab === 'messages' || requestedTab === 'profile') {
      const timer = window.setTimeout(() => setActiveTab(requestedTab), 0);
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

  const worlds = [
    {
      slug: 'neon-strike',
      href: '/neon-strike',
      title: '霓虹突击',
      subtitle: '星际飞行',
      stat: `最高分 ${neonBestScore}`,
      image: '/neon-strike/concepts/neon-strike-gameplay-ui-concept-v1.png',
      alt: '霓虹太空战场',
      tone: 'blue',
    },
    {
      slug: 'fruit-slasher',
      href: '/fruit-slasher',
      title: '水果道场',
      subtitle: '挥刀挑战',
      stat: `最高分 ${fruitBestScore}`,
      image: '/fruit-slasher/concepts/gameplay-concept-portrait-v2.png',
      alt: '月夜水果道场',
      tone: 'coral',
    },
    {
      slug: 'eight-ball',
      href: '/eight-ball',
      title: '台球俱乐部',
      subtitle: '挑战 AI',
      stat: '三档对手',
      image: '/eight-ball/concepts/3d-gameplay-concept-v1.png',
      alt: '绿色台球俱乐部',
      tone: 'green',
    },
    {
      slug: 'triple-pile',
      href: '/triple-pile',
      title: '火锅派对',
      subtitle: '三个一组',
      stat: `第 ${pileLevel} / 12 关`,
      image: '/triple-pile/scene/tabletop.jpg',
      alt: '热闹的火锅餐桌',
      tone: 'orange',
    },
    {
      slug: 'fish-hunter',
      href: '/fish-hunter',
      title: '欢乐钓鱼',
      subtitle: '深海寻宝',
      stat: `金币 ${fishCoins}`,
      image: '/fish-hunter/concept.png',
      alt: '卡通深海捕鱼场',
      tone: 'cyan',
    },
    {
      slug: 'thirteen',
      href: '/thirteen',
      title: '卡牌酒馆',
      subtitle: '南方十三张',
      stat: '单机 / 四人联机',
      image: '/thirteen/cover.png',
      alt: '西贡夜市卡牌酒馆',
      tone: 'purple',
      requiresAuth: false,
    },
    {
      slug: 'ludo',
      href: '/ludo',
      title: '飞行棋堡',
      subtitle: '好友开房',
      stat: '真人 / 机器人',
      image: '/ludo/ui/game-start.jpg',
      alt: '天空飞行棋城堡',
      tone: 'yellow',
    },
    {
      slug: 'umo',
      href: '/umo',
      title: 'UMO 竞技场',
      subtitle: '脉冲卡牌',
      stat: '经典 / 2v2',
      image: '/umo/cover.png',
      alt: 'UMO 卡牌竞技场',
      tone: 'teal',
      requiresAuth: false,
    },
    {
      slug: 'neon-strike-2d',
      href: '/neon-strike-2d',
      title: '光廊远征',
      subtitle: '竖屏弹幕',
      stat: `最高分 ${neon2dBestScore}`,
      image: '/neon-strike-2d/assets/space-corridor-v2.png',
      alt: '霓虹光廊远征入口',
      tone: 'violet',
    },
  ] as const;

  return (
    <main className="game-world min-h-dvh text-[#173366]">
      <div className="game-world-shell mx-auto min-h-dvh w-full max-w-[480px]">
        <div className="live-hud-layer">
          <button type="button" className="map-player" onClick={() => setActiveTab('profile')} aria-label="打开我的资料">
            <Image src="/assets/game-box/v3/runtime/player-hud-empty.png" alt="" fill sizes="110px" priority />
            <span className="map-player-avatar">
              {user ? <Avatar emoji={user.avatar} url={user.avatarUrl} /> : <Image src="/assets/game-box/v3/runtime/cube-mascot.png" alt="游客" fill sizes="42px" />}
            </span>
            <b>{user ? '玩家' : '游客'}</b>
          </button>
          <div className="map-currency" aria-label={`${wallet?.diamonds ?? 0} 钻石`}>
            <Image src="/assets/game-box/v3/runtime/currency-hud-empty.png" alt="" fill sizes="120px" priority />
            <b>{(wallet?.diamonds ?? 0).toLocaleString('zh-CN')}</b>
          </div>
          <button type="button" className="map-sound" onClick={toggleSound} aria-label={silent ? '打开音效' : '关闭音效'} aria-pressed={silent}>
            <Image src="/assets/game-box/v3/runtime/sound-button.png" alt="" fill sizes="48px" priority />
          </button>
        </div>
        {activeTab === 'games' && (
          <section className="sky-map" aria-label="天空街机世界地图">
            <Image className="map-brand" src="/assets/game-box/v3/runtime/brand-logo.png" alt="GAME BOX" width={426} height={277} priority />
            <Image className="map-coming" src="/assets/game-box/v3/runtime/coming-soon-sign.png" alt="更多世界 敬请期待" width={260} height={228} />

            <GameLink href="/star-runner" enabled={gameAvailability['star-runner'] !== false} className="map-portal">
              <Image src="/assets/game-box/v3/runtime/adventure-portal.png" alt="继续冒险：星际跑酷" fill sizes="270px" priority />
              <Image className="map-mascot" src="/assets/game-box/v3/runtime/cube-mascot.png" alt="" width={248} height={276} />
              <Image className="map-portal-plaque" src="/assets/game-box/v3/runtime/wood-plaque.png" alt="" width={362} height={209} />
              <span className="map-portal-title">继续冒险<small>最高分 {bestScore.toLocaleString('zh-CN')}</small></span>
            </GameLink>

            <Image className="map-star-road" src="/assets/game-box/v3/runtime/star-road.png" alt="" width={558} height={1442} />
            <div className="map-worlds" role="list">
              {worlds.slice(0, 6).map((world, index) => (
                <GameLink
                  key={world.slug}
                  href={world.href}
                  enabled={gameAvailability[world.slug] !== false}
                  requiresAuth={'requiresAuth' in world ? world.requiresAuth : true}
                  className={`map-world map-world--${world.slug}`}
                >
                  <Image
                    src={`/assets/game-box/v3/runtime/${['world-star-runner', 'world-fruit-slasher', 'world-eight-ball', 'world-triple-pile', 'world-fish-hunter', 'world-thirteen'][index]}.png`}
                    alt={`${world.title}：${world.subtitle}，${world.stat}`}
                    fill
                    sizes="190px"
                  />
                </GameLink>
              ))}
            </div>
          </section>
        )}

        {activeTab === 'messages' && (
          <div className={`concept-tab ${conversationOpen ? 'concept-tab--chat' : 'concept-tab--messages'}`}>
            <Image
              src={conversationOpen
                ? '/assets/game-box/v3/game-box-chat-background-clean-v3.png'
                : '/assets/game-box/v3/game-box-messages-background-clean-v4.png'}
              alt={conversationOpen ? '冒险者通讯台' : '冒险者邮局'}
              fill
              priority
              unoptimized
              sizes="480px"
            />
            <div className="concept-tab-content"><ChatPanel onConversationChange={setConversationOpen} /></div>
          </div>
        )}
        {activeTab === 'profile' && (
          <div className="concept-tab concept-tab--profile">
            <Image src="/assets/game-box/v3/game-box-profile-background-clean-v3.png" alt="玩家小屋" fill priority unoptimized sizes="480px" />
            <div className="concept-tab-content"><ProfilePanel /></div>
          </div>
        )}

        <nav className="game-controller-dock" aria-label="主导航">
          <button
            type="button"
            onClick={() => setActiveTab('games')}
            aria-current={activeTab === 'games' ? 'page' : undefined}
            className={`controller-button ${activeTab === 'games' ? 'is-active' : ''}`}
          >
            <Image src="/assets/game-box/v3/runtime/nav-games-active.png" alt="游戏" fill sizes="145px" />
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('messages')}
            aria-current={activeTab === 'messages' ? 'page' : undefined}
            className={`controller-button ${activeTab === 'messages' ? 'is-active' : ''}`}
          >
            <Image src="/assets/game-box/v3/runtime/nav-messages.png" alt="消息" fill sizes="145px" />
            {unreadMessages > 0 && <span className="controller-unread" aria-label={`${unreadMessages} 条未读消息`} />}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            aria-current={activeTab === 'profile' ? 'page' : undefined}
            className={`controller-button ${activeTab === 'profile' ? 'is-active' : ''}`}
            aria-label="我的个人资料"
          >
            <Image src="/assets/game-box/v3/runtime/nav-profile.png" alt="我的" fill sizes="145px" />
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
