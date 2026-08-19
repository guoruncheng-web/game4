/**
 * 单机 Transport:把服务端塞进浏览器。
 *
 * FishRoom 在这里由一个 setInterval 驱动,消息不过网络、直接同步递给场景。
 * 因此单机的玩法、数值、判定和联机**逐字一致** —— 它不是"简化版",
 * 是同一份权威模拟跑在了本地(DESIGN.md §3.6)。
 *
 * 余额存 localStorage,且**不与账号余额互通**。这一点必须在 UI 上讲清楚,
 * 别让人打了半天发现登录后钱没了。
 */

import { STORAGE_LEVEL, STORAGE_WALLET, START_BALANCE, TICK_MS } from '../config';
import { FishRoom } from '../sim/room';
import type { ClientMsg, ServerMsg } from '../sim/protocol';
import type { Transport } from './transport';

const SEAT = 0;

export function createLocalTransport(): Transport {
  let handler: ((msg: ServerMsg) => void) | null = null;
  /** 场景还没挂上回调之前产生的消息(hello、开局那批鱼)要先存着,不能丢 */
  const backlog: ServerMsg[] = [];

  const room = new FishRoom({
    seed: (Math.random() * 0xffffffff) >>> 0,
    emit: (seat, msg) => {
      if (seat !== null && seat !== SEAT) return;
      if (handler) handler(msg);
      else backlog.push(msg);
    },
    onWallet: (_seat, balance) => saveNumber(STORAGE_WALLET, balance),
  });

  room.join(SEAT, '你', Date.now(), loadNumber(STORAGE_WALLET, START_BALANCE), loadNumber(STORAGE_LEVEL, 1));

  let last = Date.now();
  const timer = window.setInterval(() => {
    const now = Date.now();
    // 切后台回来时 dt 会是几十秒,直接喂进去会让炮弹瞬移穿过整个池子。
    // 夹住即可 —— 单机没人会介意后台那几秒没模拟
    const dt = Math.min(200, now - last);
    last = now;
    room.tick(now, dt);
  }, TICK_MS);

  return {
    kind: 'local',
    send(msg: ClientMsg) {
      if (msg.t === 'level') {
        room.input(SEAT, msg, Date.now());
        saveNumber(STORAGE_LEVEL, room.levelOf(SEAT));
        return;
      }
      room.input(SEAT, msg, Date.now());
    },
    listen(next) {
      handler = next;
      if (!next) return;
      while (backlog.length) next(backlog.shift()!);
    },
    now: () => Date.now(),
    close() {
      window.clearInterval(timer);
      handler = null;
      room.leave(SEAT);
    },
  };
}

function loadNumber(key: string, fallback: number): number {
  try {
    const raw = window.localStorage.getItem(key);
    const value = raw === null ? NaN : Number(raw);
    return Number.isFinite(value) ? value : fallback;
  } catch {
    // 隐私模式下 localStorage 会抛。存不了就用默认值,不能让游戏开不了局
    return fallback;
  }
}

function saveNumber(key: string, value: number): void {
  try {
    window.localStorage.setItem(key, String(Math.round(value)));
  } catch {
    /* 同上,存不了就算了 */
  }
}
