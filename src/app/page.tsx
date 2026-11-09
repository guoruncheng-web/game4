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
import { ClubBrand, ClubIcon, ClubNavIcon, cardStyle } from '@/components/ClubArt';

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
  const [category, setCategory] = useState('全部');
  const [activeTab, setActiveTab] = useState<'games' | 'voice' | 'messages' | 'discover' | 'profile'>('games');
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
    if (requestedTab === 'voice' || requestedTab === 'messages' || requestedTab === 'discover' || requestedTab === 'profile') {
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

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('game-box-tab-change', { detail: activeTab }));
  }, [activeTab]);

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
    { slug: 'thirteen', title: '南方十三张', subtitle: '好友开房 · 四人联机', category: '多人同玩', stat: '单机 / 四人联机' },
    { slug: 'umo', title: 'UMO', subtitle: '脉冲卡牌 · 经典 / 2v2', category: '多人同玩', stat: '经典 / 2v2' },
    { slug: 'ludo', title: '飞行棋', subtitle: '棋盘竞速 · 好友同玩', category: '多人同玩', stat: '真人 / 机器人' },
    { slug: 'eight-ball', title: '3D 台球', subtitle: '瞄准下一杆', category: '休闲解压', stat: '三档 AI 对手' },
    { slug: 'fruit-slasher', title: '水果乱斗', subtitle: '指尖切水果', category: '休闲解压', stat: `最高分 ${fruitBestScore}` },
    { slug: 'triple-pile', title: '叠叠消', subtitle: '火锅消除', category: '休闲解压', stat: `第 ${pileLevel} / 12 关` },
    { slug: 'fish-hunter', title: '捕鱼达人', subtitle: '深海探索 · 好友同玩', category: '多人同玩', stat: `金币 ${fishCoins}` },
    { slug: 'star-runner', title: '星际跑酷', subtitle: '向下一颗星出发', category: '街机挑战', stat: `最高分 ${bestScore}` },
    { slug: 'neon-strike-2d', title: '霓虹突击 2D', subtitle: '竖屏弹幕', category: '街机挑战', stat: `最高分 ${neon2dBestScore}` },
    { slug: 'neon-strike', title: '霓虹突击', subtitle: '星际飞行', category: '街机挑战', stat: `最高分 ${neonBestScore}` },
  ];
  const visibleWorlds = category === '全部' ? worlds : worlds.filter(world => world.category === category);
  const featuredWorld = worlds[0];
  const tabs = [
    { id: 'games', icon: 'home', label: '首页' },
    { id: 'voice', icon: 'voice', label: '派对' },
    { id: 'messages', icon: 'messages', label: '消息' },
    { id: 'discover', icon: 'games', label: '发现' },
    { id: 'profile', icon: 'profile', label: '我的' },
  ] as const;

  function discoverGames(nextCategory = '全部') {
    setCategory(nextCategory);
    setActiveTab('discover');
  }

  return (
    <main className={`gb-app gb-tab-${activeTab} ${conversationOpen ? 'gb-conversation-open' : ''}`}>
      <div className="gb-shell">
        {activeTab === 'games' && <header className="gb-hero gb-home-header">
          <div className="gb-account">
            <button type="button" className="gb-avatar-button" onClick={() => setActiveTab('profile')} aria-label="打开我的资料">
              {user ? <Avatar emoji={user.avatar} url={user.avatarUrl} /> : <ClubIcon name="profile" />}
            </button>
            <div className="gb-account-copy"><b className="gb-home-player-name">{user?.username ?? '欢迎来玩'}</b><span className="gb-wallet" aria-label={wallet ? `钻石 ${wallet.diamonds}` : '钻石余额暂不可用'}><ClubIcon name="diamond" /><b>{wallet ? wallet.diamonds.toLocaleString('zh-CN') : '—'}</b></span></div>
          </div>
          <div className="gb-header-actions">
            <ClubBrand />
            <button type="button" className="gb-sound" onClick={toggleSound} aria-label={silent ? '打开音效' : '关闭音效'} aria-pressed={silent}>{silent ? <VolumeX /> : <Volume2 />}</button>
          </div>
        </header>}
        <section className="gb-surface">
          {activeTab === 'games' && <div className="gb-home">
            <nav className="gb-quick-entries" aria-label="快捷入口">
              <button type="button" className="gb-quick-entry" data-tone="orange" onClick={() => discoverGames()}><span className="gb-quick-icon"><ClubIcon name="games" /></span><span>全部游戏</span></button>
              <button type="button" className="gb-quick-entry" data-tone="purple" onClick={() => setActiveTab('voice')}><span className="gb-quick-icon"><ClubIcon name="voice" /></span><span>语音派对</span></button>
              <button type="button" className="gb-quick-entry" data-tone="mint" onClick={() => setActiveTab('messages')}><span className="gb-quick-icon"><ClubIcon name="messages" /></span><span>好友消息</span>{unreadMessages > 0 && <i className="gb-quick-dot" aria-label="有未读消息" />}</button>
              <button type="button" className="gb-quick-entry" data-tone="pink" onClick={() => discoverGames('休闲解压')}><span className="gb-quick-icon"><ClubIcon name="puzzle" /></span><span>休闲解压</span></button>
              <button type="button" className="gb-quick-entry" data-tone="yellow" onClick={() => setActiveTab('profile')}><span className="gb-quick-icon"><ClubIcon name="profile" /></span><span>个人资料</span></button>
            </nav>
            <div className="gb-section-heading"><h1>一起玩</h1><button type="button" className="gb-section-link" onClick={() => setActiveTab('voice')}><ClubIcon name="voice" /><span>语音房间</span></button></div>
            <GameLink href={`/${featuredWorld.slug}`} label={`${featuredWorld.title} · ${featuredWorld.subtitle} · ${featuredWorld.stat}`} enabled={gameAvailability[featuredWorld.slug] !== false} className="gb-game-card gb-feature-card">
              <span className="gb-feature-copy"><small>好友开房 · 四人联机</small><b>{featuredWorld.title}</b><span>约上朋友，摆一手好牌</span><em>一起玩 <span aria-hidden="true">›</span></em></span>
              <span className="gb-game-cover" style={cardStyle(featuredWorld.slug)} aria-hidden="true" />
            </GameLink>
            <div id="gb-games" className="gb-game-grid gb-play-grid">
              {worlds.slice(1).map((world) => <GameLink key={world.slug} href={`/${world.slug}`} label={`${world.title} · ${world.subtitle} · ${world.stat}`} enabled={gameAvailability[world.slug] !== false} className={`gb-game-card gb-play-card gb-game-${world.slug}`}>
                <span className="gb-card-copy"><b>{world.title}</b><small>{world.subtitle}</small><em>{world.stat}</em></span>
                <span className="gb-game-cover" style={cardStyle(world.slug)} aria-hidden="true" />
              </GameLink>)}
            </div>
            <button type="button" className="gb-library-more" onClick={() => discoverGames()}>发现更多玩法 <span aria-hidden="true">›</span></button>
          </div>}
          {activeTab === 'discover' && <div className="gb-discover">
            <div className="gb-discover-intro"><h1>发现好游戏</h1><p>{worlds.length} 款游戏，找到你喜欢的玩法</p></div>
            <div className="gb-game-categories" aria-label="游戏分类">
              {['全部', '多人同玩', '休闲解压', '街机挑战'].map(item => <button type="button" key={item} aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}
            </div>
            <div className="gb-game-grid gb-discover-grid">
              {visibleWorlds.map((world) => <GameLink key={world.slug} href={`/${world.slug}`} label={`${world.title} · ${world.subtitle} · ${world.stat}`} enabled={gameAvailability[world.slug] !== false} className={`gb-game-card gb-discover-card gb-game-${world.slug}`}>
                <span className="gb-game-cover" style={cardStyle(world.slug)} aria-hidden="true" />
                <span className="gb-card-copy"><b>{world.title}</b><small>{world.subtitle}</small><em>{world.stat}</em></span>
              </GameLink>)}
            </div>
            <p className="gb-library-footer">喜欢的游戏，随时再来一局</p>
          </div>}
          {activeTab === 'voice' && <VoiceLobby />}
          {activeTab === 'messages' && <ChatPanel onConversationChange={setConversationOpen} />}
          {activeTab === 'profile' && <ProfilePanel />}
        </section>
        <nav className="gb-bottom-nav" aria-label="主导航">
          {tabs.map((tab) => <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} aria-current={activeTab === tab.id ? 'page' : undefined}>
            <ClubNavIcon name={tab.icon} selected={activeTab === tab.id} /><span>{tab.label}</span>
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
      onClick={() => openPanel('login')}
      aria-label={`${label} · 需要先登录才能玩`}
      className={`${className} w-full text-left`}
      style={style}
    >
      {children}
    </button>
  );
}
