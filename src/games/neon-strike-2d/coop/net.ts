/**
 * WebRTC DataChannel 封装。对外只暴露 send / onMessage / close。
 *
 * 为什么是 P2P 而不是走服务器中转:局内每秒十几条消息,`@neondatabase/serverless`
 * 是 HTTP 驱动、一次查询一个往返 —— 中转等于每秒十几次 HTTP + 数据库写。
 * 直连之后这些数据一个字节都不经过服务器,延迟最低、流量成本为零。
 *
 * 代价是 NAT 穿透:只配公共 STUN 时,约 10–20% 的网络组合连不上。
 * **本作不做 TURN 中转**,连不上就明确报错,不静默降级(COOP.md §1)。
 */

import type { NetMessage, Role } from './protocol';

/** 信令通道。实现在 lobby.ts,走 HTTP 轮询 */
export type SignalTransport = {
  send(kind: 'offer' | 'answer' | 'ice', payload: unknown): Promise<void>;
  poll(): Promise<Array<{ kind: string; payload: unknown }>>;
};

const ICE_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
];

/** 握手期间的信令轮询间隔 */
const POLL_INTERVAL_MS = 1000;
/** 从开始握手算起的总超时。连不上时用户唯一的诉求是尽快知道连不上 */
const HANDSHAKE_TIMEOUT_MS = 25_000;

export type NetEvents = {
  onMessage: (msg: NetMessage) => void;
  /** 连接断了。原因用于结算页的文案 */
  onClose: (reason: 'peer-left' | 'error') => void;
};

export class CoopNet {
  private pc: RTCPeerConnection;
  private channel: RTCDataChannel | null = null;
  private pollTimer = 0;
  private closed = false;
  private events: NetEvents | null = null;
  /** 已经处理过的远端描述,防止重复 setRemoteDescription 抛错 */
  private remoteSet = false;

  private constructor(private readonly signal: SignalTransport) {
    this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.pc.onicecandidate = (e) => {
      // candidate 为 null 表示收集结束,没必要发出去
      if (e.candidate) void this.signal.send('ice', e.candidate.toJSON());
    };
    this.pc.onconnectionstatechange = () => {
      const state = this.pc.connectionState;
      if (state === 'failed' || state === 'closed') this.fail('error');
      else if (state === 'disconnected') this.fail('peer-left');
    };
  }

  /**
   * 建立连接。resolve 时 DataChannel 已经 open,可以直接发消息。
   *
   * host 主动建 channel 并发 offer;guest 等 offer 再回 answer ——
   * 两边都发 offer 会撞车(glare),而本作是一次性握手,不需要 perfect negotiation 那套。
   */
  static async connect(role: Role, signal: SignalTransport): Promise<CoopNet> {
    const net = new CoopNet(signal);
    const opened = new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(
        () => reject(new Error('连接超时:可能是网络限制,换个网络再试')),
        HANDSHAKE_TIMEOUT_MS,
      );
      net.onOpen = () => { window.clearTimeout(timer); resolve(); };
      net.onFail = (err) => { window.clearTimeout(timer); reject(err); };
    });

    if (role === 'host') {
      const channel = net.pc.createDataChannel('game', {
        // 位置同步是每 50ms 一条的连续流,丢一条不如晚一条 —— 关掉重传和顺序保证
        ordered: false,
        maxRetransmits: 0,
      });
      net.bindChannel(channel);
      const offer = await net.pc.createOffer();
      await net.pc.setLocalDescription(offer);
      await signal.send('offer', offer);
    } else {
      net.pc.ondatachannel = (e) => net.bindChannel(e.channel);
    }

    net.startPolling(role);
    await opened;
    return net;
  }

  private onOpen: (() => void) | null = null;
  private onFail: ((err: Error) => void) | null = null;

  private bindChannel(channel: RTCDataChannel) {
    this.channel = channel;
    channel.onopen = () => {
      this.stopPolling();
      this.onOpen?.();
    };
    channel.onclose = () => this.fail('peer-left');
    channel.onerror = () => this.fail('error');
    channel.onmessage = (e) => {
      if (this.closed) return;
      try {
        this.events?.onMessage(JSON.parse(e.data as string) as NetMessage);
      } catch {
        // 单条消息解析失败不该炸掉整局,丢掉继续
      }
    };
  }

  /** 轮询信令。**连上就停** —— 之后所有数据都走 DataChannel,不再有任何 HTTP */
  private startPolling(role: Role) {
    const tick = async () => {
      if (this.closed || this.isOpen) return;
      try {
        for (const item of await this.signal.poll()) {
          if (this.closed) return;
          await this.handleSignal(role, item.kind, item.payload);
        }
      } catch {
        // 单次轮询失败(网络抖动)不该中断握手,下一轮继续;真连不上有总超时兜底
      }
      if (!this.closed && !this.isOpen) {
        this.pollTimer = window.setTimeout(tick, POLL_INTERVAL_MS);
      }
    };
    this.pollTimer = window.setTimeout(tick, 0);
  }

  /**
   * 用 getter 而不是直接读 this.channel?.readyState:
   * 直接读的话 TS 会在第一次判断之后把类型窄化掉 'open',
   * 而 await 之后状态其实已经变了 —— 后面的判断会被当成永假。
   */
  private get isOpen() {
    return this.channel?.readyState === 'open';
  }

  private stopPolling() {
    window.clearTimeout(this.pollTimer);
    this.pollTimer = 0;
  }

  private async handleSignal(role: Role, kind: string, payload: unknown) {
    if (kind === 'offer' && role === 'guest' && !this.remoteSet) {
      this.remoteSet = true;
      await this.pc.setRemoteDescription(payload as RTCSessionDescriptionInit);
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      await this.signal.send('answer', answer);
    } else if (kind === 'answer' && role === 'host' && !this.remoteSet) {
      this.remoteSet = true;
      await this.pc.setRemoteDescription(payload as RTCSessionDescriptionInit);
    } else if (kind === 'ice') {
      // 远端描述还没设好时来的 candidate 直接加会抛错,吞掉即可:
      // ICE 本来就允许丢,后续 candidate 足够建连
      try {
        await this.pc.addIceCandidate(payload as RTCIceCandidateInit);
      } catch {
        /* 忽略 */
      }
    }
  }

  private fail(reason: 'peer-left' | 'error') {
    if (this.closed) return;
    // 还没连上就失败 → 走 connect 的 reject;已经连上 → 走 onClose
    if (!this.isOpen && this.onFail) {
      this.closed = true;
      this.stopPolling();
      this.onFail(new Error('连接失败:对方网络可能不支持直连'));
      return;
    }
    this.close(reason);
  }

  // ---------------------------------------------------------------- 对外

  listen(events: NetEvents) {
    this.events = events;
  }

  send(msg: NetMessage) {
    // 这里不能用 isOpen:getter 挡住了 TS 的类型收窄,它不知道 channel 非空
    if (this.channel?.readyState !== 'open') return;
    try {
      this.channel.send(JSON.stringify(msg));
    } catch {
      // 发送缓冲满时会抛。位置同步这种高频消息丢一条无所谓,下一帧就补上了
    }
  }

  get connected() {
    return !this.closed && this.isOpen;
  }

  close(reason: 'peer-left' | 'error' | 'quit' = 'quit') {
    if (this.closed) return;
    this.closed = true;
    this.stopPolling();
    try { this.channel?.close(); } catch { /* 已经关了 */ }
    try { this.pc.close(); } catch { /* 已经关了 */ }
    if (reason !== 'quit') this.events?.onClose(reason);
    this.events = null;
  }
}
