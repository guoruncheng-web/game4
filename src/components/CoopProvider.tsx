'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './AuthProvider';

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

export type CoopUser = { id: number; username: string };
export type CoopRoom = {
  id: number;
  game: string;
  hostId: number;
  started: boolean;
  players: Array<{ id: number; username: string; host: boolean }>;
};
export type CoopInvite = { roomId: number; game: string; from: string };

type CoopValue = {
  /** 连上了没。断线时 UI 该显示「连接中」而不是「没人在线」 */
  connected: boolean;
  me: CoopUser | null;
  online: CoopUser[];
  room: CoopRoom | null;
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

export default function CoopProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(RECONNECT_MIN);
  const timerRef = useRef<number>(0);
  /** 局内消息的处理函数。游戏场景挂上,离开时摘掉 */
  const gameHandler = useRef<((data: unknown) => void) | null>(null);

  const [connected, setConnected] = useState(false);
  const [me, setMe] = useState<CoopUser | null>(null);
  const [online, setOnline] = useState<CoopUser[]>([]);
  const [room, setRoom] = useState<CoopRoom | null>(null);
  const [invite, setInvite] = useState<CoopInvite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [start, setStart] = useState<CoopValue['start']>(null);

  const send = useCallback((msg: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
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
      const ws = new WebSocket(`${proto}://${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        retryRef.current = RECONNECT_MIN;
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
          case 'invited': setInvite({ roomId: msg.roomId as number, game: msg.game as string, from: msg.from as string }); break;
          case 'roomClosed':
            setRoom(null);
            setInvite(null);
            setStart(null);
            if (msg.reason === 'peer-left') setError('队友离开了');
            break;
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
          return;
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
  }, [user]);

  // 收到开局信号就把两个人一起送进游戏。房主点了「开始」之后,
  // 客人那边不需要任何操作 —— 这是「由邀请方开始游戏」的落地方式
  useEffect(() => {
    if (start && !window.location.pathname.startsWith(`/${start.game}`)) {
      router.push(`/${start.game}?coop=${start.roomId}&role=${start.role}`);
    }
  }, [start, router]);

  const value = useMemo<CoopValue>(() => ({
    connected, me, online, room, invite, error, start, send,
    doInvite: (userId, game) => { setError(null); send({ t: 'invite', userId, game }); },
    accept: (roomId) => { setInvite(null); send({ t: 'accept', roomId }); router.push('/neon-strike-2d/lobby'); },
    decline: (roomId) => { setInvite(null); send({ t: 'decline', roomId }); },
    leave: () => { send({ t: 'leave' }); setRoom(null); setStart(null); },
    startGame: () => send({ t: 'start' }),
    sendGame: (data) => send({ t: 'game', data }),
    onGame: (handler) => { gameHandler.current = handler; },
    clearStart: () => setStart(null),
  }), [connected, me, online, room, invite, error, start, send, router]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <InviteToast />
    </Ctx.Provider>
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
        <p className="mt-1 text-sm font-bold text-slate-500">霓虹突击 2D · 双人协作</p>
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
