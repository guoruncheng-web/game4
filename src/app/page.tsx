'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import ChatPanel from '@/components/ChatPanel';
import ProfilePanel from '@/components/ProfilePanel';
import VoiceLobby from '@/components/VoiceLobby';
import type { ReactNode, CSSProperties } from 'react';
import { apiFetch, withGameCredentials } from '@/lib/api-client';
import Avatar from '@/components/Avatar';
import { Volume2, VolumeX } from 'lucide-react';
import { ClubIcon, homeCardStyle } from '@/components/ClubArt';

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
  const [activeTab, setActiveTab] = useState<'games' | 'voice' | 'messages' | 'profile'>('games');
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
    if (requestedTab === 'voice' || requestedTab === 'messages' || requestedTab === 'profile') {
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
    { slug: 'star-runner', title: '星际跑酷', subtitle: '收集星星', stat: `最高分 ${bestScore}` },
    { slug: 'fruit-slasher', title: '水果乱斗', subtitle: '指尖切水果', stat: `最高分 ${fruitBestScore}` },
    { slug: 'eight-ball', title: '3D 台球', subtitle: '挑战 AI', stat: '三档对手' },
    { slug: 'triple-pile', title: '叠叠消', subtitle: '火锅消除', stat: `第 ${pileLevel} / 12 关` },
    { slug: 'fish-hunter', title: '捕鱼达人', subtitle: '好友同玩', stat: `金币 ${fishCoins}` },
    { slug: 'umo', title: 'UMO', subtitle: '脉冲卡牌', stat: '经典 / 2v2' },
    { slug: 'neon-strike-2d', title: '霓虹突击 2D', subtitle: '竖屏弹幕', stat: `最高分 ${neon2dBestScore}` },
    { slug: 'ludo', title: '飞行棋', subtitle: '棋盘竞速', stat: '真人 / 机器人' },
    { slug: 'thirteen', title: '南方十三张', subtitle: '好友开房', stat: '单机 / 四人联机' },
    { slug: 'neon-strike', title: '霓虹突击', subtitle: '星际飞行', stat: `最高分 ${neonBestScore}` },
  ];
  const tabs = [
    { id: 'games', icon: 'home', label: '首页' },
    { id: 'voice', icon: 'voice', label: '语聊' },
    { id: 'messages', icon: 'messages', label: '消息' },
    { id: 'profile', icon: 'profile', label: '我的' },
  ] as const;

  return (
    <main className={`gb-app gb-tab-${activeTab} ${conversationOpen ? 'gb-conversation-open' : ''}`}>
      <div className="gb-shell">
        <header className="gb-hero">
          {activeTab === 'games' ? (
            <div className="gb-player-header">
              <button type="button" className="gb-avatar-button" onClick={() => setActiveTab('profile')} aria-label="打开我的资料">
                {user ? <Avatar emoji={user.avatar} url={user.avatarUrl} /> : <ClubIcon name="profile" />}
              </button>
              <div className="gb-player-details"><b>{user?.username ?? '加载中'}</b><small>UID {user?.uid ?? '—'}</small><span className="gb-wallet"><ClubIcon name="diamond" />{(wallet?.diamonds ?? 0).toLocaleString('zh-CN')}</span></div>
              <button type="button" className="gb-sound" onClick={toggleSound} aria-label={silent ? '打开音效' : '关闭音效'} aria-pressed={silent}>{silent ? <VolumeX /> : <Volume2 />}</button>
            </div>
          ) : <div className="gb-page-heading"><h1>{activeTab === 'voice' ? '语聊开黑' : activeTab === 'messages' ? '消息' : '我的'}</h1><p>{activeTab === 'voice' ? '找个房间，一起聊聊' : activeTab === 'messages' ? '和好友一起玩，更开心' : '记录每一次游戏时光'}</p></div>}
        </header>
        <section className="gb-surface">
          {activeTab === 'games' && <div className="gb-home">
            <div className="gb-shortcuts" aria-label="快捷入口">
              <button type="button" onClick={() => document.getElementById('gb-games')?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })}><ClubIcon name="games" /><span>全部游戏</span></button>
              <button type="button" onClick={() => setActiveTab('voice')}><ClubIcon name="voice" /><span>语聊开黑</span></button>
              <button type="button" onClick={() => setActiveTab('messages')}><ClubIcon name="messages" /><span>好友消息</span>{unreadMessages > 0 && <i className="gb-dot" />}</button>
              <button type="button" onClick={() => setActiveTab('profile')}><ClubIcon name="security" /><span>账号安全</span></button>
            </div>
            <div className="gb-section-heading"><h1>一起玩</h1><button type="button" onClick={() => document.getElementById('gb-games')?.scrollIntoView()}>全部游戏 ›</button></div>
            <GameLink href="/thirteen" label="南方十三张 · 好友开房 · 四人联机" enabled={gameAvailability.thirteen !== false} className="gb-game-card gb-featured" style={homeCardStyle('thirteen')}>
              <span className="gb-card-copy"><b>南方十三张</b><small>好友开房 · 四人联机</small><em>一起开局 ›</em></span>
            </GameLink>
            <div id="gb-games" className="gb-game-grid">
              {worlds.map((world) => <GameLink key={world.slug} href={`/${world.slug}`} label={`${world.title} · ${world.subtitle} · ${world.stat}`} enabled={gameAvailability[world.slug] !== false} className="gb-game-card" style={homeCardStyle(world.slug)}>
                <span className="gb-card-copy"><b>{world.title}</b><small>{world.subtitle}</small><em>{world.stat}</em></span>
              </GameLink>)}
            </div>
          </div>}
          {activeTab === 'voice' && <VoiceLobby />}
          {activeTab === 'messages' && <ChatPanel onConversationChange={setConversationOpen} />}
          {activeTab === 'profile' && <ProfilePanel />}
        </section>
        <nav className="gb-bottom-nav" aria-label="主导航">
          {tabs.map((tab) => <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} aria-current={activeTab === tab.id ? 'page' : undefined}>
            <ClubIcon name={tab.icon} /><span>{tab.label}</span>
            {tab.id === 'messages' && unreadMessages > 0 && <i className="gb-unread" aria-label={`${unreadMessages} 条未读消息`}>{unreadMessages > 99 ? '99+' : unreadMessages}</i>}
          </button>)}
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
function GameLink({ href, label, className, children, style, enabled = true, requiresAuth = true }: {
  href: string; label: string; className: string; children: ReactNode; style?: CSSProperties; enabled?: boolean; requiresAuth?: boolean;
}) {
  const { user, credentials, loading, openPanel } = useAuth();
  if (!enabled) {
    return (
      <div style={style} role="link" aria-label={`${label} · 维护中`} aria-disabled="true" className={`${className} relative overflow-hidden opacity-60`}>
        {children}
        <span className="absolute right-3 top-3 rounded-full bg-slate-900/80 px-2.5 py-1 text-[10px] font-black text-white">维护中</span>
      </div>
    );
  }
  if (user || !requiresAuth) {
    return <Link href={withGameCredentials(href, credentials)} aria-label={label} className={className} style={style}>{children}</Link>;
  }
  return (
    <button
      type="button"
      disabled={loading}
      onClick={() => openPanel('register')}
      aria-label={`${label} · 需要先登录才能玩`}
      className={`${className} w-full text-left`}
      style={style}
    >
      {children}
    </button>
  );
}
