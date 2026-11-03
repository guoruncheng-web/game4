/**
 * 鱼的运动。**这是整套设计的地基**(DESIGN.md §3.2)。
 *
 * 每条鱼的位置是时间的纯函数:`fishPos(spawn, t)`。
 * 服务端和客户端跑的是这一个函数,所以只要 spawn 消息里的参数一致,
 * 两端算出来的位置就永远一致 —— 不需要任何位置同步,也不需要漂移校正。
 *
 * 加新路径时守住这条:**只许读 spawn 里的参数和 t,不许有任何内部状态。**
 * 一旦某条路径依赖了「上一帧的位置」,两端就会分叉,而且是慢慢分叉、
 * 很难在测试里被发现的那种。
 */

import { FISH_KINDS, GAME_WIDTH, POOL_BOTTOM, POOL_TOP } from '../config';
import type { FishSpawn, PathId } from './protocol';
import type { Rng } from './rng';
import { range } from './rng';

/** 进出场留白。鱼在画面外生成,游进来才被看到 */
const MARGIN = 120;

export type FishPose = { x: number; y: number; angle: number };

/** 求位置。t 是服务端时钟(毫秒) */
export function fishPos(f: FishSpawn, t: number): FishPose {
  const p = rawPos(f, t);
  // 朝向用前后各采一次的差分算,省得每条路径都自己推导切线
  const q = rawPos(f, t + 24);
  return { x: p.x, y: p.y, angle: Math.atan2(q.y - p.y, q.x - p.x) };
}

function rawPos(f: FishSpawn, t: number): { x: number; y: number } {
  const dt = Math.max(0, t - f.t0) / 1000;
  const dir = f.flip ? -1 : 1;
  const startX = f.flip ? GAME_WIDTH + MARGIN : -MARGIN;

  switch (f.path) {
    case 'wave':
      return {
        x: startX + dir * f.speed * dt,
        y: f.y0 + Math.sin(dt * 1.5 + f.seed) * 130,
      };

    case 'arc': {
      // 从一侧游到另一侧,中途拱起一道弧。progress 用 life 归一,两端一致
      const k = Math.min(1, (t - f.t0) / f.life);
      const bulge = f.seed % 2 < 1 ? 1 : -1;
      return {
        x: startX + dir * f.speed * dt,
        y: f.y0 + bulge * 210 * Math.sin(Math.PI * k),
      };
    }

    case 'loiter': {
      // 在一处绕圈徘徊。y0 这里当圆心高度,seed 当起始相位
      const w = f.speed / 220;
      const cx = f.flip ? GAME_WIDTH * 0.68 : GAME_WIDTH * 0.32;
      return {
        x: cx + Math.cos(w * dt + f.seed) * 240 * dir,
        y: f.y0 + Math.sin(w * dt + f.seed) * 120,
      };
    }

    case 'cross':
    default:
      return {
        x: startX + dir * f.speed * dt,
        y: f.y0 + Math.sin(dt * 2 + f.seed) * 14,
      };
  }
}

/** 造一条鱼。**只在服务端调**,客户端拿到的是造好的结果 */
export function makeFish(
  rng: Rng,
  id: number,
  kind: FishSpawn['kind'],
  now: number,
  opts?: { path?: PathId; flip?: boolean; life?: number },
): FishSpawn {
  const spec = FISH_KINDS[kind];
  const flip = opts?.flip ?? rng() < 0.5;
  const path: PathId = opts?.path ?? pickPath(rng, kind);
  const speed = spec.speed * range(rng, 0.85, 1.15);

  // 徘徊型不横穿,给固定时长;横穿型按走完全程算,到点自然消失(不发 despawn)
  const life =
    opts?.life ??
    (path === 'loiter'
      ? 22_000
      : ((GAME_WIDTH + MARGIN * 2) / speed) * 1000);

  // 保证摆动之后仍在池子里:按各路径的振幅内缩上下界
  const swing = path === 'wave' ? 140 : path === 'arc' ? 220 : path === 'loiter' ? 130 : 24;
  const lo = POOL_TOP + spec.radius + (path === 'arc' ? 0 : swing);
  const hi = POOL_BOTTOM - spec.radius - (path === 'arc' ? 0 : swing);
  const y0 = range(rng, Math.min(lo, hi), Math.max(lo, hi));

  return { id, kind, path, seed: range(rng, 0, Math.PI * 2), t0: now, life, speed, flip, y0 };
}

function pickPath(rng: Rng, kind: FishSpawn['kind']): PathId {
  if (kind === 'boss') return 'loiter';
  const roll = rng();
  // 小鱼以横穿为主(成群时看着才像鱼群),大鱼多走曲线,难瞄一点
  const big = FISH_KINDS[kind].value >= 40;
  if (big) return roll < 0.45 ? 'wave' : roll < 0.8 ? 'arc' : 'loiter';
  return roll < 0.62 ? 'cross' : roll < 0.9 ? 'wave' : 'arc';
}

/** 鱼是不是已经该消失了 */
export function isGone(f: FishSpawn, t: number): boolean {
  return t - f.t0 >= f.life;
}
