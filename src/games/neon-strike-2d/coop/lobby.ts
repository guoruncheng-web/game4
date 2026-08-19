/**
 * 大厅:在线列表、邀请、握手的状态机。
 *
 * 只在**菜单页**活着。握手一完成就停掉所有轮询 —— 之后局内数据全走 DataChannel,
 * 不再有任何 HTTP 请求(COOP.md §7 第 10 条,可以用 Network 面板确认)。
 */

import { CoopNet, type SignalTransport } from './net';
import type { Role } from './protocol';

const HEARTBEAT_MS = 3000;

export type LobbyUser = { id: number; username: string };

export type LobbyRoom = {
  id: number;
  state: 'pending' | 'accepted' | 'connected' | 'declined' | 'ended';
  role: Role;
  peer: string;
};

export type LobbyView = {
  /** 没登录时联机整个不可用 —— 邀请需要知道你是谁 */
  loggedIn: boolean;
  me: LobbyUser | null;
  online: LobbyUser[];
  room: LobbyRoom | null;
  /** 正在建连 */
  connecting: boolean;
  error: string | null;
};

async function post<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || '请求失败');
  return data;
}

export class Lobby {
  private timer = 0;
  private stopped = false;
  private connecting = false;
  private view: LobbyView = {
    loggedIn: true, me: null, online: [], room: null, connecting: false, error: null,
  };

  /** 握手成功后把连接交出去,由调用方带进 GameScene */
  constructor(
    private readonly onView: (view: LobbyView) => void,
    private readonly onReady: (net: CoopNet, room: LobbyRoom) => void,
  ) {}

  start() {
    this.stopped = false;
    void this.beat();
  }

  stop() {
    this.stopped = true;
    window.clearTimeout(this.timer);
  }

  /**
   * 广播视图变化。
   *
   * **stop() 之后一律不再回调。** stop() 只能清掉待发的定时器,
   * 清不掉**已经在飞的那次 beat()** —— 它 await 完 fetch 回来时场景可能已经销毁,
   * 回调过去就是往一个死掉的 Scene 上写东西。
   */
  private emit(patch: Partial<LobbyView>) {
    this.view = { ...this.view, ...patch };
    if (this.stopped) return;
    this.onView(this.view);
  }

  /**
   * 心跳。一个请求同时做三件事:上报在线、拉在线列表、查房间状态。
   * 拆成三个轮询的话,每个在大厅的人每 3 秒就是三次数据库往返。
   */
  private async beat() {
    if (this.stopped) return;
    try {
      const data = await post<{ me: LobbyUser; room: LobbyRoom | null; online: LobbyUser[] }>(
        '/api/coop/heartbeat',
      );
      if (this.stopped) return;
      this.emit({ loggedIn: true, me: data.me, online: data.online, room: data.room, error: null });
      // 对方接受了 → 开始建连。connecting 兜住重入,否则每次心跳都会新建一个 PeerConnection
      if (data.room?.state === 'accepted' && !this.connecting) void this.handshake(data.room);
    } catch (error) {
      const message = error instanceof Error ? error.message : '连接失败';
      if (message.includes('未登录')) this.emit({ loggedIn: false, online: [], room: null });
      else this.emit({ error: message });
    }
    if (!this.stopped) this.timer = window.setTimeout(() => void this.beat(), HEARTBEAT_MS);
  }

  // ---------------------------------------------------------------- 动作

  async invite(userId: number) {
    try {
      const data = await post<{ room: LobbyRoom }>('/api/coop/invite', { userId });
      this.emit({ room: data.room, error: null });
    } catch (error) {
      this.emit({ error: error instanceof Error ? error.message : '邀请失败' });
    }
  }

  async respond(roomId: number, accept: boolean) {
    try {
      const data = await post<{ room: LobbyRoom }>('/api/coop/respond', { roomId, accept });
      this.emit({ room: accept ? data.room : null, error: null });
      if (accept) void this.handshake(data.room);
    } catch (error) {
      this.emit({ error: error instanceof Error ? error.message : '操作失败', room: null });
    }
  }

  /** 退出房间。局末、拒绝、关页面都要调 —— 漏了双方会一直卡在 busy */
  async leave() {
    this.connecting = false;
    this.emit({ room: null, connecting: false });
    try { await post('/api/coop/leave'); } catch { /* 退出失败不该挡住用户 */ }
  }

  // ---------------------------------------------------------------- 握手

  private signalTransport(roomId: number): SignalTransport {
    return {
      send: async (kind, payload) => { await post('/api/coop/signal', { roomId, kind, payload }); },
      poll: async () => {
        const res = await fetch(`/api/coop/signal?roomId=${roomId}`);
        if (!res.ok) throw new Error('信令拉取失败');
        const data = (await res.json()) as { signals: Array<{ kind: string; payload: unknown }> };
        return data.signals;
      },
    };
  }

  private async handshake(room: LobbyRoom) {
    if (this.connecting) return;
    this.connecting = true;
    this.emit({ connecting: true, error: null });
    try {
      const net = await CoopNet.connect(room.role, this.signalTransport(room.id));
      // 通知服务端房间进入 connected,同时把残留的信令清干净
      void fetch(`/api/coop/signal?roomId=${room.id}&connected=1`).catch(() => {});
      this.stop();
      this.emit({ connecting: false });
      this.onReady(net, room);
    } catch (error) {
      this.connecting = false;
      this.emit({
        connecting: false,
        error: error instanceof Error ? error.message : '连接失败',
        room: null,
      });
      await this.leave();
    }
  }
}
