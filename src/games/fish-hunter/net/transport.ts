/**
 * 游戏层和"服务端"之间的唯一接口。DESIGN.md §3.6。
 *
 * 单机和联机的区别**只体现在这个接口的实现上**:
 *   GameScene ── Transport ──┬── WsTransport   → server/ws.mjs → FishRoom(Node)
 *                            └── LocalTransport → FishRoom(浏览器内)
 *
 * 场景代码不知道自己是单机还是联机,也不该知道 —— 一旦它开始分支,
 * 两种模式的玩法就会慢慢走偏,而这正是这套设计要避免的。
 */

import type { ClientMsg, ServerMsg } from '../sim/protocol';

export type Transport = {
  send(msg: ClientMsg): void;
  /** 挂收消息的回调。传 null 摘掉 */
  listen(handler: ((msg: ServerMsg) => void) | null): void;
  /**
   * 服务端时钟。单机就是本地时钟;联机是本地时钟 + 握手估出来的偏移。
   * **所有和鱼、炮弹有关的求值都必须用它**,不能用 Date.now()。
   */
  now(): number;
  close(): void;
};
