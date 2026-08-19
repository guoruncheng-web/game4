/**
 * 联机 Transport。把桥(WebSocket)包成和单机一模一样的接口。
 *
 * 它比 LocalTransport 只多干一件事:**估服务端时钟偏移**。
 * 鱼的位置是 `fishPos(spawn, t)` 求出来的,两端的 t 必须是同一个时钟 ——
 * 差 200ms 就是差大半条鱼的身位,网会明显打偏(DESIGN.md §3.2)。
 */

import type { ClientMsg, ServerMsg } from '../sim/protocol';
import type { Transport } from './transport';
import type { FishBridge } from './bridge';

/** 时钟对齐的频率。开局密一点,之后每 10 秒一次防漂 */
const PING_INTERVAL_MS = 10_000;
const WARMUP_PINGS = 5;
const WARMUP_GAP_MS = 250;

type Pong = { t: 'pong'; id: number; now: number };

export function createWsTransport(bridge: FishBridge): Transport {
  let handler: ((msg: ServerMsg) => void) | null = null;
  const backlog: ServerMsg[] = [];

  /** 服务端时钟 - 本地时钟 */
  let offset = 0;
  /** 目前见过的最短往返。**只用最短的那次估偏移** —— 排队和重传只会让往返变长,
   *  最短的那次是最接近"纯路程"的一次,取平均反而会被长尾拖偏 */
  let bestRtt = Number.POSITIVE_INFINITY;
  const sentAt = new Map<number, number>();
  let pingId = 1;

  const ping = () => {
    const id = pingId++;
    sentAt.set(id, Date.now());
    bridge.send({ t: 'ping', id });
    // 老的记录清掉,免得丢包时这张表只增不减
    if (sentAt.size > 32) for (const k of [...sentAt.keys()].slice(0, 16)) sentAt.delete(k);
  };

  bridge.listen((raw) => {
    const msg = raw as ServerMsg | Pong;
    if (msg?.t === 'pong') {
      const sent = sentAt.get(msg.id);
      sentAt.delete(msg.id);
      if (sent === undefined) return;
      const rtt = Date.now() - sent;
      if (rtt < bestRtt) {
        bestRtt = rtt;
        // 回来的 now 是服务端在往返中点附近的时刻,所以补半个 RTT
        offset = msg.now + rtt / 2 - Date.now();
      }
      return;
    }
    if (handler) handler(msg as ServerMsg);
    else backlog.push(msg as ServerMsg);
  });

  // 开局先密集打几次,尽快把偏移收敛到位;之后转成低频防漂
  for (let i = 0; i < WARMUP_PINGS; i += 1) window.setTimeout(ping, i * WARMUP_GAP_MS);
  const timer = window.setInterval(ping, PING_INTERVAL_MS);

  return {
    kind: 'ws',
    send(msg: ClientMsg) {
      bridge.send(msg);
    },
    listen(next) {
      handler = next;
      if (!next) return;
      while (backlog.length) next(backlog.shift()!);
    },
    now: () => Date.now() + offset,
    close() {
      window.clearInterval(timer);
      handler = null;
      bridge.listen(null);
      bridge.close();
    },
  };
}
