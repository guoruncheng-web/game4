/**
 * React 侧和 Phaser 侧之间的联机桥。
 *
 * 游戏是 `startGame(parent)` 这样一个纯 TS 入口,拿不到 React 的 context;
 * 而连接活在全站的 CoopProvider 里。所以由页面在挂载游戏**之前**把桥放进来,
 * 游戏在 startGame 里取走。
 *
 * **这个文件不能 import Phaser** —— 页面会 import 它,而 Phaser 在模块顶层就会碰 window,
 * 拖进页面会让构建直接失败。
 */

import type { Role } from './protocol';

export type CoopBridge = {
  role: Role;
  /** 对方的用户名,给 HUD 显示 */
  peer: string;
  /** 发一条局内消息。服务端只转发不解析 */
  send(data: unknown): void;
  /** 挂上收消息的回调。传 null 摘掉 */
  listen(handler: ((data: unknown) => void) | null): void;
  /** 对方掉线 / 房间解散 */
  onClose(handler: () => void): void;
  close(): void;
};

let pending: CoopBridge | null = null;

/** 页面在渲染 PhaserCanvas 之前调 */
export function setCoopBridge(bridge: CoopBridge | null) {
  pending = bridge;
}

/**
 * 游戏取走桥。**取完即清** —— 否则退出重进会拿到一个已经关掉的旧桥,
 * 表现是「第二局怎么点都没有联机」。
 */
export function takeCoopBridge(): CoopBridge | null {
  const bridge = pending;
  pending = null;
  return bridge;
}
