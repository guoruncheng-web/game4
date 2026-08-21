'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { getGame } from '@/games/registry';
import { LUDO_BLOBS, LUDO_IMAGES } from '@/games/ludo/assets';
import { DEFAULT_DURATION, DURATIONS, SEATS } from '@/games/ludo/config';
import { DICE_DROP_DELAY_MS } from '@/games/ludo/ui/introTiming';
import { playIntroAudio, preloadIntroAudio, unlockIntroAudio } from '@/games/ludo/ui/introAudio';

const meta = getGame('ludo')!;

// 棋盘只在开局后才挂载(DESIGN §2 的第 ⑤ 步)。
// dynamic + ssr:false 是硬性的 —— Three 在模块顶层就会碰 window
const ThreeCanvas = dynamic(() => import('@/components/ThreeCanvas'), {
  ssr: false,
  loading: () => <div className="grid h-dvh place-items-center bg-[#0a1f5c] text-sky-200">棋盘加载中…</div>,
});

const EffekseerVs = dynamic(() => import('@/games/ludo/ui/EffekseerVs'), { ssr: false });
const IntroDice = dynamic(() => import('@/games/ludo/ui/IntroDice'), { ssr: false });

/**
 * Ludo 的房间页。**这是这款游戏的入口** —— 点首页卡片进的是这里,不是棋盘;
 * 棋盘只在房主点「开始」之后才挂载(见 DESIGN.md §A)。
 *
 * **当前是离线壳(DESIGN §14 第 2 步):所有状态都在本地,不连服务端。**
 * 这么做是刻意的 —— 这一页的交互细节最多(创建/加入/准备/踢人/机器人/聊天),
 * 先把它们在本地调对,接了网络之后出问题才分得清是"UI 不对"还是"消息不对"。
 * 接服务端时要替换的只有下面这些 action 的实现,JSX 一行不用动。
 */

type Member = {
  key: string;
  name: string;
  avatar: string;
  host: boolean;
  ready: boolean;
  bot: boolean;
};

type Chat = {
  key: number;
  kind: 'system' | 'player' | 'invite';
  from?: string;
  avatar?: string;
  text: string;
  time: string;
};

const AVATARS = Array.from({ length: 6 }, (_, i) => `/ludo/avatars/player-${String(i + 1).padStart(2, '0')}-square-v2.png`);
const BOT_NAMES = ['小飞', '阿星', '铁蛋'];

const UI = {
  logo: '/ludo/ui/lobby-logo.png',
  gameStart: '/ludo/ui/game-start-table-dynamic-v1.png',
  button: {
    purple: '/ludo/ui/button-purple.png',
    cyan: '/ludo/ui/button-cyan.png',
    yellow: '/ludo/ui/button-yellow.png',
    green: '/ludo/ui/button-green.png',
    disabled: '/ludo/ui/button-disabled.png',
  },
  icon: (name: string) => `/ludo/ui/icons/${name}.png`,
} as const;

const INTRO_AVATAR_SLOTS = [
  { left: '8.5%', top: '9.1%' },
  { left: '77.9%', top: '9.1%' },
  { left: '8.5%', top: '69.3%' },
  { left: '77.9%', top: '69.3%' },
] as const;

// 六点确认音在 4580ms 启动、持续约 600ms；播完再进入棋盘，避免切掉演出的最后声音。
const INTRO_COMPLETE_DELAY_MS = 5250;

/** 将带真实头像的完整开局图切成四块,分别从四周飞入后拼合。 */
function StartIntro({ seats, onComplete }: { seats: (Member | null)[]; onComplete: () => void }) {
  // 与 CSS 动画共用本次挂载作为零点，避免“点击时声音已计时、画面还没提交”的漂移。
  useLayoutEffect(() => playIntroAudio(), []);
  useEffect(() => {
    const timer = window.setTimeout(onComplete, INTRO_COMPLETE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [onComplete]);

  const renderPicture = () => (
    <div className="absolute inset-0">
      {INTRO_AVATAR_SLOTS.map((position, index) => {
        const member = seats[index];
        return (
          <div
            key={index}
            className="absolute overflow-hidden bg-[#071b55]"
            style={{ ...position, width: '13.6%', aspectRatio: '1' }}
          >
            <Image
              src={member?.avatar ?? UI.icon('add-seat')}
              alt=""
              fill
              sizes="66px"
              className={member ? 'object-cover' : 'scale-50 object-contain opacity-55'}
            />
          </div>
        );
      })}
      <Image
        src={UI.gameStart}
        alt=""
        fill
        priority
        sizes="(max-width: 480px) 100vw, 480px"
        className="pointer-events-none object-contain"
      />
    </div>
  );

  return (
    <main className="ludo-intro relative mx-auto flex min-h-dvh w-full max-w-[480px] items-center justify-center overflow-hidden bg-[#020b29] text-white">
      <p className="sr-only">
        游戏开始：{seats.map((member) => member?.name ?? '空座位').join('、')}
      </p>
      <div className="ludo-intro-picture relative w-full" style={{ aspectRatio: '941 / 1672' }} aria-hidden="true">
        {['top', 'right', 'bottom', 'left'].map((direction) => (
          <div key={direction} className={`ludo-intro-piece ludo-intro-piece-${direction} absolute inset-0`}>
            {renderPicture()}
          </div>
        ))}
        <div className="ludo-effekseer-vs pointer-events-none absolute z-10" aria-hidden="true">
          <EffekseerVs />
        </div>
        <div className="ludo-intro-dice pointer-events-none absolute z-20" aria-hidden="true">
          <IntroDice />
        </div>
      </div>
      <style>{`
        .ludo-intro-piece{will-change:transform;animation-duration:.58s;animation-timing-function:cubic-bezier(.42,0,.82,.28);animation-fill-mode:both}
        .ludo-intro-piece-top{clip-path:polygon(0 0,100% 0,100% 22%,54% 50%,0 38%);animation-name:ludo-piece-top}
        .ludo-intro-piece-right{clip-path:polygon(100% 22%,100% 67%,54% 50%);animation-name:ludo-piece-right}
        .ludo-intro-piece-bottom{clip-path:polygon(0 81%,54% 50%,100% 67%,100% 100%,0 100%);animation-name:ludo-piece-bottom}
        .ludo-intro-piece-left{clip-path:polygon(0 38%,54% 50%,0 81%);animation-name:ludo-piece-left}
        .ludo-effekseer-vs{left:calc(50% + 10px);top:44%;width:min(58vw,258px);aspect-ratio:1;opacity:0;transform:translate(-50%,-50%);animation:ludo-vs-in .1s .06s ease-out forwards,ludo-vs-out .3s 1.8s ease-in forwards}
        .ludo-intro-dice{left:calc(50% + 10px);top:41.5%;width:min(30vw,132px);aspect-ratio:1;transform:translate(-50%,-50%);animation:ludo-dice-drop .72s ${DICE_DROP_DELAY_MS}ms cubic-bezier(.28,.72,.38,1.18) both}
        @keyframes ludo-piece-top{from{transform:translateY(-103%)}to{transform:translate(0,0)}}
        @keyframes ludo-piece-right{from{transform:translateX(103%)}to{transform:translate(0,0)}}
        @keyframes ludo-piece-bottom{from{transform:translateY(103%)}to{transform:translate(0,0)}}
        @keyframes ludo-piece-left{from{transform:translateX(-103%)}to{transform:translate(0,0)}}
        @keyframes ludo-vs-in{from{opacity:0}to{opacity:1}}
        @keyframes ludo-vs-out{from{opacity:1}to{opacity:0}}
        @keyframes ludo-dice-drop{0%{opacity:0;transform:translate(-50%,-115vh) scale(.82)}12%{opacity:1}72%{transform:translate(-50%,7%) scale(1.04)}86%{transform:translate(-50%,-58%) scale(.97)}100%{opacity:1;transform:translate(-50%,-50%) scale(1)}}
        @media (prefers-reduced-motion:reduce){.ludo-intro-piece{animation:none!important;opacity:1!important;transform:none!important}.ludo-intro-dice{animation:none!important;opacity:1!important;transform:translate(-50%,-50%)!important}}
      `}</style>
    </main>
  );
}

/**
 * 按钮皮肤:**九宫格拉伸,不是整图拉伸。**
 *
 * 按钮图是一颗带金边的胶囊(约 492×155)。早先用 `background-size:100% 100%`
 * 把整张图硬拉到元素尺寸,结果圆角被压扁、金边粗细随宽度变化 —— 也就是"按钮显示有问题"。
 * `border-image` 把图切成九块:四角原样不拉伸,四边只沿一个方向拉,中间填充。
 * 这样同一张图用在窄按钮和通栏按钮上都不变形,**不需要为每个尺寸单独切图**。
 *
 * slice 的取值跟着图的实际结构走:左右各 90px 是胶囊的圆头,上下各 70px 是金边 + 高光。
 */
/**
 * 弹窗面板皮肤。和按钮同理走九宫格 ——
 * 这张图四角有铆钉,整图拉伸会把铆钉拉成椭圆,而且面板越高铆钉越扁。
 */
function panel(url: string): React.CSSProperties {
  return {
    borderStyle: 'solid',
    borderWidth: '30px',
    borderImageSource: `url(${url})`,
    borderImageSlice: '150 fill',
    borderImageWidth: '30px',
    borderImageRepeat: 'stretch',
    background: 'none',
  };
}

function skin(url: string): React.CSSProperties {
  return {
    borderStyle: 'solid',
    borderWidth: '22px 28px',
    borderImageSource: `url(${url})`,
    borderImageSlice: '70 90 fill',
    borderImageWidth: '22px 28px',
    borderImageRepeat: 'stretch',
    background: 'none',
  };
}

const now = () => new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
const roomId = () => String(Math.floor(100000 + Math.random() * 900000));

export default function LudoRoomPage() {
  const [room, setRoom] = useState<{ id: string; name: string } | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [chat, setChat] = useState<Chat[]>([]);
  const [duration, setDuration] = useState(DEFAULT_DURATION);
  const [dialog, setDialog] = useState<'created' | 'join' | null>(null);
  const [joinInput, setJoinInput] = useState('');
  const [draft, setDraft] = useState('');
  const [toast, setToast] = useState('');
  /** 开局之后整页换成棋盘 */
  const [playing, setPlaying] = useState(false);
  /**
   * 页面阶段(DESIGN §2 的五步)。
   * 'loading' 加载页 → 'ready' 大厅/房间 → 'intro' 开局动画 → playing 棋盘
   */
  const [phase, setPhase] = useState<'loading' | 'ready' | 'intro'>('loading');
  const [progress, setProgress] = useState(0);
  const chatKey = useRef(0);
  const chatBox = useRef<HTMLDivElement>(null);

  const me = members.find((m) => m.key === 'me');
  const iAmHost = me?.host ?? false;
  const humans = members.filter((m) => !m.bot);
  const allReady = humans.length > 0 && humans.every((m) => m.ready);
  const canStart = iAmHost && allReady && members.length >= 2;

  const say = useCallback((msg: Omit<Chat, 'key' | 'time'>) => {
    chatKey.current += 1;
    setChat((prev) => [...prev, { ...msg, key: chatKey.current, time: now() }].slice(-40));
  }, []);

  const flash = useCallback((text: string) => {
    setToast(text);
    window.setTimeout(() => setToast(''), 1800);
  }, []);

  /**
   * ① 加载页:把素材下载摊在这里。
   *
   * **`public/ludo/` 下的东西全部在这里下完**(清单由 tools/art/ludo/gen_manifest.mjs 生成),
   * 包括棋盘、按钮、头像、图标、3D 模型和音效。玩家在这一页等一次,
   * 后面创建房间、进棋盘、掷骰子就都不用再等 —— 否则等待会散落在每一次交互里,
   * 而"点了创建房间才开始等图"是最难受的一种:那时候他已经在等人了。
   */
  useEffect(() => {
    let cancelled = false;
    const images = LUDO_IMAGES;
    const blobs = LUDO_BLOBS;
    const total = images.length + blobs.length;
    let done = 0;
    const tick = () => {
      done += 1;
      if (!cancelled) setProgress(Math.round((done / total) * 100));
    };

    const jobs = [
      ...images.map((src) => new Promise<void>((resolve) => {
        const img = new window.Image();
        // 失败也要走下去 —— 少一张图不该把人卡在加载页上
        img.onload = img.onerror = () => { tick(); resolve(); };
        img.src = src;
      })),
      // 模型与通用音频先进入 HTTP 缓存；开局音效还会在下方额外解码为 AudioBuffer。
      ...blobs.map((src) => fetch(src).then((r) => r.blob()).catch(() => null).then(() => { tick(); })),
      preloadIntroAudio(),
    ];

    void Promise.all(jobs).then(() => {
      if (cancelled) return;
      // 太快闪过去反而像卡了一下,给个下限
      window.setTimeout(() => !cancelled && setPhase('ready'), 350);
    });
    return () => { cancelled = true; };
  }, []);

  // 聊天流自动滚到底。新消息看不见等于没发
  useEffect(() => {
    const box = chatBox.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [chat]);

  // ------------------------------------------------------------ 动作

  const createRoom = () => {
    const id = roomId();
    setRoom({ id, name: '欢乐 Ludo 房' });
    setMembers([{ key: 'me', name: '我', avatar: AVATARS[0], host: true, ready: false, bot: false }]);
    setChat([]);
    chatKey.current = 0;
    setDialog('created');
    say({ kind: 'system', text: '房间已创建，你是房主' });
    // 弹窗关掉之后 ID 就找不回来是最容易发生的挫败,所以往聊天流里也留一条(DESIGN §4)
    say({ kind: 'invite', text: id });
  };

  const joinRoom = (id: string) => {
    if (!/^\d{6}$/.test(id)) return flash('游戏 ID 是 6 位数字');
    setRoom({ id, name: '欢乐 Ludo 房' });
    // 离线壳:假装房里已经有个房主。接服务端后这份名单由 room 消息下发
    setMembers([
      { key: 'host', name: '小明', avatar: AVATARS[1], host: true, ready: true, bot: false },
      { key: 'me', name: '我', avatar: AVATARS[0], host: false, ready: false, bot: false },
    ]);
    setChat([]);
    chatKey.current = 0;
    setDialog(null);
    setJoinInput('');
    say({ kind: 'system', text: '你进入了房间' });
  };

  const leave = () => {
    setRoom(null);
    setMembers([]);
    setChat([]);
    setDialog(null);
  };

  const toggleReady = () => {
    setMembers((prev) => prev.map((m) => (m.key === 'me' ? { ...m, ready: !m.ready } : m)));
    say({ kind: 'system', text: me?.ready ? '你取消了准备' : '你已准备' });
  };

  const addBot = () => {
    if (members.length >= SEATS) return flash('房间满了');
    const taken = members.length;
    setMembers((prev) => [...prev, {
      key: `bot-${Date.now()}`,
      name: BOT_NAMES[(taken - 1) % BOT_NAMES.length],
      avatar: '/ludo/avatars/bot-square-v2.png',
      host: false,
      // 机器人恒为已准备 —— 否则房主要等一个永远不会点准备的东西
      ready: true,
      bot: true,
    }]);
    say({ kind: 'system', text: `房主添加了机器人` });
  };

  const kick = (key: string) => {
    const target = members.find((m) => m.key === key);
    if (!target) return;
    setMembers((prev) => prev.filter((m) => m.key !== key));
    say({ kind: 'system', text: `${target.name} 被移出了房间` });
  };

  const send = () => {
    const text = draft.trim().slice(0, 200);
    if (!text) return;
    say({ kind: 'player', from: me?.name ?? '我', avatar: me?.avatar, text });
    setDraft('');
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      flash('已复制');
    } catch {
      // http 或旧浏览器下 clipboard 不可用。**不能静默失败** —— 用户会以为复制成功了
      flash('复制失败,请长按选中');
    }
  };

  const start = () => {
    if (!canStart) return;
    say({ kind: 'system', text: '游戏开始' });
    // 两人即可开局；缺少的座位在开局瞬间补机器人，保证棋盘始终是完整四家。
    setMembers((current) => {
      const next = [...current];
      while (next.length < SEATS) {
        const index = next.length;
        next.push({
          key: `intro-bot-${index}-${Date.now()}`,
          name: BOT_NAMES[(index - 1) % BOT_NAMES.length],
          avatar: '/ludo/avatars/bot-square-v2.png',
          host: false,
          ready: true,
          bot: true,
        });
      }
      return next;
    });
    // 点击事件只解锁 AudioContext；真正的时间轴由开局画面挂载瞬间启动。
    unlockIntroAudio();
    // ④ 开局动画:带真实头像的四块画面从四周飞入拼合 → 进棋盘
    setPhase('intro');
    // 开局动画调试期:拼合后停留在完整画面,暂不进入棋盘。
  };

  // ------------------------------------------------------------ 渲染

  const seats: (Member | null)[] = Array.from({ length: SEATS }, (_, i) => members[i] ?? null);
  const mm = String(Math.floor(duration / 60)).padStart(2, '0');
  const ss = String(duration % 60).padStart(2, '0');

  /** 五个阶段共用同一层背景,切换时不会闪 */
  const backdrop = (
    <>
      <div
        className="pointer-events-none fixed inset-0 -z-10 bg-[#06184c] bg-[url('/ludo/backgrounds/lobby-sky.png')] bg-cover bg-center"
        aria-hidden="true"
      />
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[#03133a]/20" aria-hidden="true" />
    </>
  );

  // ① 加载页:logo + 进度条。**素材在这里全部下完**,后面各页不再等
  if (phase === 'loading') {
    return (
      <main className="relative mx-auto flex min-h-dvh w-full max-w-[480px] flex-col items-center justify-center gap-6 p-8 text-white">
        {backdrop}
        <Image
          src={UI.logo}
          alt="Ludo"
          width={280}
          height={152}
          priority
          className="w-64 drop-shadow-[0_8px_24px_rgba(0,140,255,.5)]"
        />
        <div className="h-3 w-full max-w-xs overflow-hidden rounded-full border border-sky-300/40 bg-[#061b55]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#5eead4] to-[#38bdf8] transition-[width] duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-sm font-bold text-sky-200/85 tabular-nums">加载中 {progress}%</p>
      </main>
    );
  }

  if (phase === 'intro') {
    return (
      <StartIntro
        seats={seats}
        onComplete={() => {
          setPhase('ready');
          setPlaying(true);
        }}
      />
    );
  }

  // 开局之后整页换成棋盘。房间页的状态原样留着,退出棋盘就回到房间(DESIGN §2 第 ⑤ 步)
  if (playing) {
    return (
      <main className="relative mx-auto h-dvh w-full max-w-[480px] overflow-hidden bg-[#102b59] before:absolute before:inset-0 before:bg-[linear-gradient(135deg,rgba(255,255,255,.025)_25%,transparent_25%,transparent_75%,rgba(255,255,255,.025)_75%)] before:bg-[length:160px_160px] before:content-['']">
        <ThreeCanvas load={() => import('@/games/ludo')} />
        <button
          type="button"
          onClick={() => setPlaying(false)}
          aria-label="返回房间"
          className="absolute right-[14px] top-[128px] z-20 grid size-[48px] place-items-center rounded-full border-2 border-[#28bfff] bg-gradient-to-br from-[#258ee9] to-[#12396f] shadow-[0_0_0_2px_#0a244c,0_4px_8px_#020b20]"
        >
          <Image src="/ludo/ui/icons/settings.png" alt="" width={32} height={32} className="size-8 object-contain" />
        </button>
      </main>
    );
  }

  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-[480px] flex-col gap-3 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-white">
      {/*
        背景铺满**整个视口**(fixed inset-0)而不是只铺 main。
        装到桌面后状态栏是透明的,那块区域露出来的是文档背景 ——
        只给 main 上背景的话,顶上会留一条白边(用户报的那个问题)。
      */}
      <div
        className="pointer-events-none fixed inset-0 -z-10 bg-[#06184c] bg-[url('/ludo/backgrounds/lobby-sky.png')] bg-cover bg-center"
        aria-hidden="true"
      />
      <div className="pointer-events-none fixed inset-0 -z-10 bg-[#03133a]/20" aria-hidden="true" />
      {/* 顶部:房间名 + 房间号 + 人数 */}
      <header className="relative z-10 mt-[env(safe-area-inset-top)] rounded-3xl border border-sky-300/50 bg-[#061b55]/85 p-4 shadow-[inset_0_0_18px_rgba(66,186,255,.35),0_0_18px_rgba(20,125,255,.3)] backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-black tracking-tight">{room ? room.name : meta.title}</h1>
            <p className="mt-1 flex items-center gap-2 text-sm text-white/70">
              {room ? (
                <>
                  房间号 {room.id}
                  <button
                    type="button"
                    onClick={() => copy(room.id)}
                    aria-label="复制房间号"
                    className="grid size-6 place-items-center rounded-lg bg-sky-400/30 text-xs transition active:scale-90"
                  >
                    <Image src={UI.icon('copy')} alt="" width={18} height={18} />
                  </button>
                </>
              ) : (
                '创建一间房，或用游戏 ID 加入好友的房间'
              )}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="flex items-center gap-1 text-sm font-bold text-white/80">
              {members.length}/{SEATS}
              <Image src={UI.icon('players')} alt="玩家" width={22} height={22} />
            </span>
            <Link href="/" className="rounded-full border border-white/20 px-3 py-1 text-sm text-white/80">
              返回
            </Link>
          </div>
        </div>
      </header>

      {/* 成员位 */}
      <div className="relative z-10 grid grid-cols-4 gap-2">
        {seats.map((m, i) => (
          <div
            key={m?.key ?? `empty-${i}`}
            className="relative flex flex-col items-center gap-1 rounded-2xl border border-white/15 bg-white/10 p-2"
          >
            {m ? (
              <>
                <div className="relative">
                  <div className="relative size-14 overflow-hidden rounded-xl border-2 border-sky-300/70 bg-[#123a86]">
                    <Image src={m.avatar} alt={`${m.name}的头像`} fill sizes="56px" className="object-cover" />
                  </div>
                  {m.host && (
                    <span className="absolute -left-1 -top-1 rounded-md bg-amber-400 px-1 text-[10px] font-black text-amber-950">
                      房主
                    </span>
                  )}
                  {iAmHost && !m.host && (
                    <button
                      type="button"
                      onClick={() => kick(m.key)}
                      aria-label={`移出 ${m.name}`}
                      className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-rose-500 text-xs font-black transition active:scale-90"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <span className={`text-xs font-bold ${m.ready ? 'text-emerald-300' : 'text-amber-300'}`}>
                  {m.ready ? '✓ 已准备' : '● 未准备'}
                </span>
                <span className="max-w-full truncate text-xs text-white/80">{m.bot ? `${m.name}(机器人)` : m.name}</span>
              </>
            ) : (
              <button
                type="button"
                onClick={iAmHost ? addBot : undefined}
                disabled={!iAmHost}
                className="flex h-[86px] w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-white/25 text-white/40 disabled:opacity-50"
              >
                <Image src={UI.icon(iAmHost ? 'robot' : 'add-seat')} alt="" width={34} height={34} />
                <span className="text-[11px]">{iAmHost ? '加机器人' : '空位'}</span>
              </button>
            )}
          </div>
        ))}
      </div>

      {/* 中间:标识 + 局时长 / 或 创建与加入 */}
      <section className="relative z-10 flex flex-1 flex-col items-center justify-center gap-4 py-2">
        <div className="relative h-36 w-52 drop-shadow-[0_10px_24px_rgba(22,108,255,.5)]">
          <Image src={UI.logo} alt="LUDO 游戏大厅" fill priority sizes="208px" className="object-contain" />
        </div>

        {room ? (
          <>
            {/* 局时长:仅房主可调 */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label="减少时长"
                onClick={() => {
                  if (!iAmHost) return flash('只有房主能改时长');
                  const i = DURATIONS.indexOf(duration);
                  setDuration(DURATIONS[Math.max(0, i - 1)]);
                }}
                className="grid size-9 place-items-center rounded-xl bg-white/15 text-lg active:scale-90"
              >
                ◀
              </button>
              <div className="flex items-center gap-2 rounded-2xl border border-sky-300/40 bg-[#0b2a6b] px-6 py-2 text-2xl font-black tabular-nums">
                <Image src={UI.icon('clock')} alt="" width={30} height={30} /> {mm}:{ss}
              </div>
              <button
                type="button"
                aria-label="增加时长"
                onClick={() => {
                  if (!iAmHost) return flash('只有房主能改时长');
                  const i = DURATIONS.indexOf(duration);
                  setDuration(DURATIONS[Math.min(DURATIONS.length - 1, i + 1)]);
                }}
                className="grid size-9 place-items-center rounded-xl bg-white/15 text-lg active:scale-90"
              >
                ▶
              </button>
            </div>

            <div className="flex w-full gap-3 px-2">
              <button
                type="button"
                onClick={leave}
                style={skin(UI.button.yellow)}
                className="min-h-14 flex-1 text-xl font-black text-amber-950 drop-shadow-lg active:translate-y-0.5"
              >
                离开
              </button>
              {/*
                房主也要先点「准备」,准备好之后按钮才变成「开始」——
                参考图 122646(房主没勾,按钮是"准备")和 122634(全员打勾,按钮变绿"开始")正是这两态。
                **不能只给房主一个「开始」**:开始的条件是"所有真人都已准备",
                房主自己没有准备入口的话这个条件永远满足不了,按钮会一直是灰的。
              */}
              {iAmHost && !me?.ready ? (
                <button
                  type="button"
                  onClick={toggleReady}
                  style={skin(UI.button.purple)}
                  className="min-h-14 flex-1 text-xl font-black text-white drop-shadow-lg active:translate-y-0.5"
                >
                  准备
                </button>
              ) : iAmHost ? (
                <button
                  type="button"
                  onClick={canStart ? start : undefined}
                  disabled={!canStart}
                  style={skin(canStart ? UI.button.green : UI.button.disabled)}
                  className="min-h-14 flex-1 text-xl font-black text-white drop-shadow-lg transition active:translate-y-0.5 disabled:text-white/60"
                >
                  开始
                </button>
              ) : (
                <button
                  type="button"
                  onClick={toggleReady}
                  style={skin(me?.ready ? UI.button.disabled : UI.button.purple)}
                  className="min-h-14 flex-1 text-xl font-black text-white drop-shadow-lg active:translate-y-0.5"
                >
                  {me?.ready ? '取消准备' : '准备'}
                </button>
              )}
            </div>
            {iAmHost && !canStart && (
              <p className="text-xs text-white/50">
                {members.length < 2
                  ? '至少要 2 个人(可以加机器人)'
                  : !me?.ready
                    ? '你也要点一下准备'
                    : '等其他人准备好'}
              </p>
            )}
          </>
        ) : (
          <div className="flex w-full flex-col gap-3 px-2">
            <button
              type="button"
              onClick={createRoom}
              style={skin(UI.button.purple)}
              className="flex min-h-14 items-center justify-center gap-2 text-xl font-black drop-shadow-lg active:translate-y-0.5"
            >
              <Image src={UI.icon('create')} alt="" width={34} height={34} /> 创建新游戏房间
            </button>
            <button
              type="button"
              onClick={() => setDialog('join')}
              style={skin(UI.button.cyan)}
              className="flex min-h-14 items-center justify-center gap-2 text-xl font-black text-white drop-shadow-lg active:translate-y-0.5"
            >
              <Image src={UI.icon('join')} alt="" width={34} height={34} /> 加入已有游戏房间
            </button>
          </div>
        )}
      </section>

      {/* 聊天流 */}
      <div
        ref={chatBox}
        className="relative z-10 h-32 shrink-0 overflow-y-auto rounded-2xl border border-sky-300/30 bg-[#061b55]/80 p-2 text-sm backdrop-blur"
      >
        {chat.length === 0 && <p className="px-1 py-6 text-center text-white/35">还没有人说话</p>}
        {chat.map((c) => (
          <div key={c.key} className="flex items-center gap-2 border-b border-white/5 px-1 py-1.5 last:border-0">
            {c.kind === 'player' ? (
              <>
                <span className="relative size-6 shrink-0 overflow-hidden rounded-md bg-white/15">
                  {c.avatar && <Image src={c.avatar} alt="" fill sizes="24px" className="object-cover" />}
                </span>
                <span className="shrink-0 text-white/60">{c.from}</span>
                <span className="min-w-0 flex-1 truncate">{c.text}</span>
              </>
            ) : c.kind === 'invite' ? (
              <button
                type="button"
                onClick={() => copy(c.text)}
                className="flex-1 text-left text-sky-300 underline decoration-dotted"
              >
                游戏 ID {c.text}，点此复制
              </button>
            ) : (
              <span className="flex-1 text-amber-200/80">{c.text}</span>
            )}
            <span className="shrink-0 text-xs text-white/35">{c.time}</span>
          </div>
        ))}
      </div>

      {/* 输入条 */}
      <div className="relative z-10 flex shrink-0 items-center gap-2 pb-[env(safe-area-inset-bottom)]">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
          maxLength={200}
          placeholder="聊一聊…"
          className="min-h-12 flex-1 rounded-2xl border border-white/15 bg-white/10 px-4 text-base outline-none placeholder:text-white/40 focus:border-sky-300/60"
        />
        <button
          type="button"
          onClick={send}
          style={skin(UI.button.cyan)}
          className="flex min-h-12 items-center gap-1 px-5 font-black text-white active:translate-y-0.5"
        >
          <Image src={UI.icon('send')} alt="" width={24} height={24} /> 发送
        </button>
      </div>

      {/* 创建成功弹窗 */}
      {dialog === 'created' && room && (
        <Dialog onClose={() => setDialog(null)}>
          <div className="relative mx-auto -mt-12 size-20">
            <Image src={UI.icon('crown')} alt="" fill sizes="80px" className="object-contain" />
          </div>
          <h2 className="mt-2 text-center text-2xl font-black">房间创建成功</h2>
          <div className="mt-4 rounded-2xl border border-white/15 bg-black/25 py-4 text-center">
            <p className="text-sm text-white/60">房间号</p>
            <p className="text-4xl font-black tracking-[0.2em] tabular-nums">{room.id}</p>
          </div>
          <button
            type="button"
            onClick={() => copy(room.id)}
            style={skin(UI.button.cyan)}
            className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 text-lg font-black active:translate-y-0.5"
          >
            <Image src={UI.icon('copy')} alt="" width={28} height={28} /> 复制房间号
          </button>
        </Dialog>
      )}

      {/* 加入弹窗 */}
      {dialog === 'join' && (
        <Dialog onClose={() => setDialog(null)}>
          <h2 className="text-center text-2xl font-black">加入已有游戏房间</h2>
          <p className="mt-1 text-center text-sm text-white/70">输入好友给你的 6 位房间号</p>
          <input
            value={joinInput}
            onChange={(e) => setJoinInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            placeholder="000000"
            autoFocus
            className="mt-4 w-full rounded-2xl border border-white/15 bg-black/25 py-4 text-center text-4xl font-black tracking-[0.2em] tabular-nums outline-none placeholder:text-white/25 focus:border-sky-300/60"
          />
          <button
            type="button"
            onClick={() => joinRoom(joinInput)}
            style={skin(UI.button.cyan)}
            className="mt-4 min-h-12 w-full text-lg font-black text-white active:translate-y-0.5"
          >
            确认加入
          </button>
        </Dialog>
      )}

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-28 z-50 flex justify-center">
          <span className="rounded-full bg-black/80 px-4 py-2 text-sm">{toast}</span>
        </div>
      )}
    </main>
  );
}

function Dialog({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/60 p-6 backdrop-blur-sm">
      <div className="relative w-full max-w-sm p-2" style={panel('/ludo/ui/dialog-panel.png')}>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭"
          className="absolute -right-2 -top-2 grid size-11 place-items-center rounded-full active:scale-90"
        >
          <Image src={UI.icon('close')} alt="" width={44} height={44} />
        </button>
        {children}
      </div>
    </div>
  );
}
