import { randomUUID } from 'node:crypto';
import type { RawData, WebSocket } from 'ws';
import { AuthoritativeGateway, type GatewayResponse } from './gateway';

interface UmoWsAdapterOptions {
  readonly automationTickMs?: number;
  readonly onGatewayChanged?: (snapshotJson: string) => void;
}

/**
 * UMO 使用自己的匿名四人权威协议，不进入游戏盒子的双人房间和账号在线表。
 * 连接仍复用同一个 /ws 进程与反向代理，只通过 `?game=umo` 分流。
 */
export class UmoWsAdapter {
  private readonly gateway: AuthoritativeGateway;
  private readonly sockets = new Map<string, WebSocket>();
  private readonly automationTimer: ReturnType<typeof setInterval>;
  private readonly onGatewayChanged: ((snapshotJson: string) => void) | undefined;

  constructor(gateway = new AuthoritativeGateway(), options: UmoWsAdapterOptions = {}) {
    this.gateway = gateway;
    this.onGatewayChanged = options.onGatewayChanged;
    const automationTickMs = options.automationTickMs ?? 250;
    if (!Number.isFinite(automationTickMs) || automationTickMs < 10) {
      throw new Error('INVALID_AUTOMATION_TICK');
    }
    this.automationTimer = setInterval((): void => {
      const tick = this.gateway.tick();
      if (tick.responses.length > 0) this.deliver(tick.responses);
      if (tick.changed) this.notifyGatewayChanged();
    }, automationTickMs);
    this.automationTimer.unref?.();
  }

  get connectionCount(): number {
    return this.sockets.size;
  }

  get roomCount(): number {
    const snapshot = JSON.parse(this.gateway.snapshotJson()) as { rooms?: unknown[] };
    return snapshot.rooms?.length ?? 0;
  }

  destroy(): void {
    clearInterval(this.automationTimer);
  }

  attach(socket: WebSocket): void {
    const connectionId = randomUUID();
    this.sockets.set(connectionId, socket);
    socket.on('message', (raw): void => this.receive(connectionId, raw));
    socket.on('close', (): void => {
      if (this.sockets.get(connectionId) !== socket) return;
      this.sockets.delete(connectionId);
      this.deliver(this.gateway.disconnect(connectionId));
      this.notifyGatewayChanged();
    });
  }

  private receive(connectionId: string, raw: RawData): void {
    let message: unknown = null;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      // Gateway 会把 null 统一转换为 ENVELOPE_INVALID。
    }
    this.deliver(this.gateway.handle(connectionId, message));
    if ((message as { type?: unknown } | null)?.type !== 'PING') this.notifyGatewayChanged();
  }

  private notifyGatewayChanged(): void {
    this.onGatewayChanged?.(this.gateway.snapshotJson());
  }

  private deliver(responses: readonly GatewayResponse[]): void {
    for (const response of responses) {
      const socket = this.sockets.get(response.connectionId);
      if (socket?.readyState !== 1) continue;
      try {
        socket.send(JSON.stringify(response.envelope));
      } catch {
        // 单个慢连接不能阻断其他座位广播。
      }
    }
  }
}
