'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './AuthProvider';
import { withGameCredentials } from '@/lib/api-client';

/**
 * 全站的联机连接。
 *
 * **挂在 layout 里而不是某个游戏页**,因为邀请必须在任何页面都能收到 ——
 * A 在首页闲着,B 在游戏里邀请他,A 得当场看见弹窗。这也是这套要用长连接
 * 而不是轮询的根本原因:轮询要么慢(3 秒一次),要么费(每人每秒一个请求)。
 *
 * 连接只在**登录之后**建立。没登录的人既不能邀请别人也不能被邀请,
 * 连上去只是白占一个连接。
 */

export type CoopUser = { id: number; uid: number; username: string };
export type CoopRoom = {
  id: number;
  game: string;
  hostId: number;
  started: boolean;
  players: Array<{ id: number; username: string; host: boolean }>;
};
export type CoopInvite = { roomId: number; game: string; from: string };
/** 大厅里的一间捕鱼房。捕鱼走开放房列表而不是定向邀请(见它的 DESIGN.md §4.2) */
export type FishRoomListing = { id: number; count: number; max: number; names: string[] };

type CoopValue = {
  /** 连上了没。断线时 UI 该显示「连接中」而不是「没人在线」 */
  connected: boolean;
  me: CoopUser | null;
  online: CoopUser[];
  room: CoopRoom | null;
  /** 可加入的捕鱼房 */
  fishRooms: FishRoomListing[];
  invite: CoopInvite | null;
  error: string | null;
  /** 开局信号。游戏页拿它决定自己是 host 还是 guest */
  start: { roomId: number; game: string; role: 'host' | 'guest' } | null;
  send(msg: Record<string, unknown>): void;
  doInvite(userId: number, game: string): void;
  accept(roomId: number): void;
  decline(roomId: number): void;
  leave(): void;
  startGame(): void;
  /** 建一间捕鱼房并直接坐下(捕鱼没有"开局"这一刻) */
  createFishRoom(): void;
  joinFishRoom(roomId: number): void;
  refreshFishRooms(): void;
  /** 局内消息:发给房间里的另一个人,服务端只转发不解析 */
  sendGame(data: unknown): void;
  onGame(handler: ((data: unknown) => void) | null): void;
  clearStart(): void;
};

const Ctx = createContext<CoopValue | null>(null);

export function useCoop() {
  const value = useContext(Ctx);
  if (!value) throw new Error('useCoop 必须放在 CoopProvider 里面');
  return value;
}

/** 断线重连的退避:1s 起,翻倍,封顶 15s */
const RECONNECT_MIN = 1000;
const RECONNECT_MAX = 15000;
/**
 * 连续失败多少次就认定「服务不可用」并明确报错。
 *
 * 不设这个的话,本地开发忘了起 WS 进程时页面会**永远显示「正在连接」**——
 * 那是最误导人的状态:看起来像在努力,其实永远不会好。
 */
const FAIL_THRESHOLD = 3;

export default function CoopProvider({ children }: { children: React.ReactNode }) {
  const { user, credentials } = useAuth();
  const router = useRouter();
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(RECONNECT_MIN);
  const timerRef = useRef<number>(0);
  const failRef = useRef(0);
  /** 局内消息的处理函数。游戏场景挂上,离开时摘掉 */
  const gameHandler = useRef<((data: unknown) => void) | null>(null);

  const [connected, setConnected] = useState(false);
  const [me, setMe] = useState<CoopUser | null>(null);
  const [online, setOnline] = useState<CoopUser[]>([]);
  const [room, setRoom] = useState<CoopRoom | null>(null);
  const [fishRooms, setFishRooms] = useState<FishRoomListing[]>([]);
  const [invite, setInvite] = useState<CoopInvite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [start, setStart] = useState<CoopValue['start']>(null);
  /** 顶部横幅:队友离开之类的一次性通知。几秒后自动消失 */
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<number>(0);

  const send = useCallback((msg: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  // 游戏页把它放进 effect 依赖；身份必须稳定，否则房间人数一变化就会触发 cleanup，
  // 把仍在运行的捕鱼消息处理器摘掉，之后整局看似在线却再也收不到 spawn/pop。
  const onGame = useCallback((handler: ((data: unknown) => void) | null) => {
    gameHandler.current = handler;
  }, []);

  useEffect(() => {
    // 没登录就不连:既不能邀请也不能被邀请,连上去只是白占一个连接。
    // 这里**不清状态** —— 上一轮 effect 的 cleanup 已经把连接关了,
    // 清理统一在 onclose 里做。在 effect 体里同步 setState 会触发
    // react-hooks/set-state-in-effect,而且多一条改状态的路径就多一处要对齐的地方
    if (!user) return;

    let disposed = false;

    const connect = () => {
      if (disposed) return;
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(withGameCredentials(`${proto}://${window.location.host}/ws`, credentials));
      wsRef.current = ws;

      ws.onopen = () => {
        retryRef.current = RECONNECT_MIN;
        failRef.current = 0;
        setConnected(true);
        setError(null);
        ws.send(JSON.stringify({ t: 'hello' }));
      };

      ws.onmessage = (event) => {
        let msg: { t: string; [k: string]: unknown };
        try { msg = JSON.parse(event.data as string); } catch { return; }
        switch (msg.t) {
          case 'ready': setMe(msg.me as CoopUser); break;
          case 'online': setOnline(msg.users as CoopUser[]); break;
          case 'room': setRoom(msg.room as CoopRoom); break;
          case 'rooms': setFishRooms(msg.rooms as FishRoomListing[]); break;
          case 'invited': setInvite({ roomId: msg.roomId as number, game: msg.game as string, from: msg.from as string }); break;
          case 'roomClosed': {
            setRoom(null);
            setInvite(null);
            setStart(null);
            // by 为空说明是自己走的,不用给自己弹提示
            const who = msg.by as string | null;
            if (who) {
              setNotice(`${who} 离开了游戏`);
              window.clearTimeout(noticeTimer.current);
              noticeTimer.current = window.setTimeout(() => setNotice(null), 5000);
            }
            break;
          }
          case 'start':
            setStart({ roomId: msg.roomId as number, game: msg.game as string, role: msg.role as 'host' | 'guest' });
            break;
          case 'game':
            gameHandler.current?.(msg.data);
            break;
          case 'error': setError(String(msg.message)); break;
          // 同一账号在别处连上了,这条连接被顶掉。不要重连,否则两个标签页会互相踢
          case 'replaced': disposed = true; setError('这个账号在别处打开了'); break;
          default: break;
        }
      };

      ws.onclose = () => {
        setConnected(false);
        if (disposed) {
          // 是主动断开(登出 / 切换账号 / 卸载),把状态一并清干净
          setOnline([]);
          setRoom(null);
          setMe(null);
          setStart(null);
          setFishRooms([]);
          return;
        }
        failRef.current += 1;
        if (failRef.current >= FAIL_THRESHOLD) {
          setError(
            process.env.NODE_ENV === 'development'
              ? '连不上联机服务。本地要另开一个终端跑 pnpm ws'
              : '连不上联机服务,请稍后再试',
          );
        }
        // 退避重连:服务重启或网络抖动时不至于把服务器打爆
        timerRef.current = window.setTimeout(connect, retryRef.current);
        retryRef.current = Math.min(retryRef.current * 2, RECONNECT_MAX);
      };
      ws.onerror = () => { /* onclose 会跟着触发,统一在那里处理 */ };
    };

    connect();
    return () => {
      disposed = true;
      window.clearTimeout(timerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [credentials, user]);

  // 收到开局信号就把两个人一起送进游戏。房主点了「开始」之后,
  // 客人那边不需要任何操作 —— 这是「由邀请方开始游戏」的落地方式
  useEffect(() => {
    if (!start) return;
    // **必须精确比对路径,不能用 startsWith。**
    // 点「开始」时两个人都在 /neon-strike-2d/lobby,而它正好以 /neon-strike-2d 开头 ——
    // 用前缀判断会认为「已经在游戏里了」而跳过跳转,表现就是点了没反应。
    if (window.location.pathname === `/${start.game}`) return;
    router.push(withGameCredentials(`/${start.game}?coop=${start.roomId}&role=${start.role}`, credentials));
  }, [credentials, start, router]);

  /**
   * 捕鱼房**没有开局信号**:占到座位就该在池边了(DESIGN §4.2)。
   * 所以这里盯的是 room 而不是 start —— 建房和加入房走的是同一条路。
   */
  useEffect(() => {
    if (room?.game !== 'fish-hunter') return;
    if (window.location.pathname === '/fish-hunter') return;
    router.push(withGameCredentials('/fish-hunter', credentials));
  }, [credentials, room, router]);

  const value = useMemo<CoopValue>(() => ({
    connected, me, online, room, fishRooms, invite, error, start, send,
    doInvite: (userId, game) => { setError(null); send({ t: 'invite', userId, game }); },
    accept: (roomId) => {
      setInvite(null);
      // 捕鱼是直接坐下,没有匹配页;霓虹突击要先去匹配页等房主点开始
      const game = invite?.game;
      if (game === 'fish-hunter') send({ t: 'join', roomId });
      else { send({ t: 'accept', roomId }); router.push(withGameCredentials('/neon-strike-2d/lobby', credentials)); }
    },
    decline: (roomId) => { setInvite(null); send({ t: 'decline', roomId }); },
    leave: () => { send({ t: 'leave' }); setRoom(null); setStart(null); },
    startGame: () => send({ t: 'start' }),
    createFishRoom: () => { setError(null); send({ t: 'create', game: 'fish-hunter' }); },
    joinFishRoom: (roomId) => { setError(null); send({ t: 'join', roomId }); },
    refreshFishRooms: () => send({ t: 'rooms', game: 'fish-hunter' }),
    sendGame: (data) => send({ t: 'game', data }),
    onGame,
    clearStart: () => setStart(null),
  }), [connected, credentials, me, online, room, fishRooms, invite, error, start, send, onGame, router]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <LeaveBanner text={notice} />
      <InviteToast />
    </Ctx.Provider>
  );
}

/**
 * 队友离开的横幅。挂在顶部导航栏下方,**全站可见** ——
 * 人可能是在游戏里、匹配页或首页被通知的,做成局内的飘字就只有一处能看见。
 */
function LeaveBanner({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-[100] flex justify-center px-4">
      <div className="animate-[tp-drop_0.25s_ease-out] rounded-2xl border border-white/20 bg-slate-900/90 px-4 py-2.5 text-sm font-bold text-amber-200 shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur">
        {text}
      </div>
    </div>
  );
}

/** 邀请弹窗。全站可见 —— 这是这套设计的核心体验 */
function InviteToast() {
  const { invite, accept, decline } = useCoop();
  if (!invite) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-[100] flex justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="w-full max-w-sm rounded-3xl border border-white bg-white/95 p-4 shadow-[0_12px_40px_rgba(23,51,102,0.25)] backdrop-blur">
        <p className="text-base font-black text-[#173366]">
          {invite.from} 邀请你一起玩
        </p>
        <p className="mt-1 text-sm font-bold text-slate-500">
          {invite.game === 'fish-hunter' ? '深海捕鱼 · 一池鱼最多四个人' : '霓虹突击 2D · 双人协作'}
        </p>
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => accept(invite.roomId)}
            className="min-h-11 flex-1 rounded-2xl bg-gradient-to-b from-[#43d875] to-[#2cbe60] text-base font-black text-white shadow-[0_4px_0_#22994b] active:translate-y-0.5"
          >
            接受
          </button>
          <button
            onClick={() => decline(invite.roomId)}
            className="min-h-11 flex-1 rounded-2xl border border-slate-200 text-base font-bold text-slate-500"
          >
            拒绝
          </button>
        </div>
      </div>
    </div>
  );
}
