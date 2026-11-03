/**
 * React 侧和游戏侧之间的联机桥。和霓虹突击那份(coop/bridge.ts)是同一个套路:
 * 连接活在全站的 CoopProvider 里,而游戏入口是一个纯 TS 的 startGame(parent),
 * 拿不到 React 的 context,所以由页面在挂载画布**之前**把桥放进来。
 *
 * **这个文件不能 import Phaser** —— 页面会 import 它,而 Phaser 在模块顶层就碰 window。
 */

export type FishBridge = {
  /** 发一条局内消息(服务端会把它交给 FishRoom) */
  send(data: unknown): void;
  /** 收局内消息。传 null 摘掉 */
  listen(handler: ((data: unknown) => void) | null): void;
  /** 房间没了 / 断线 */
  onClose(handler: () => void): void;
  close(): void;
};

let pending: FishBridge | null = null;

export function setFishBridge(bridge: FishBridge | null): void {
  pending = bridge;
}

/**
 * 游戏取走桥。**取完即清** —— 不清的话退出重进会拿到一个已经关掉的旧桥,
 * 表现是「第二局怎么打都没反应」。
 */
export function takeFishBridge(): FishBridge | null {
  const bridge = pending;
  pending = null;
  return bridge;
}
