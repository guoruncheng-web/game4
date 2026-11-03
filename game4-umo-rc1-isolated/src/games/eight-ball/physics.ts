/**
 * 桌球物理内核。
 *
 * 这里是纯数学,不 import Phaser、不碰 DOM —— 因为它有两个调用方:
 * 1. 场景每帧推进一次,玩家看到球在滚;
 * 2. AI 无头跑完整杆去试算结果。
 * 两边必须跑出一模一样的结果,所以内部一律用固定步长 stepSeconds,
 * 绝不拿渲染帧的 delta 直接积分(掉帧就会改变落点,AI 算的和你看到的会对不上)。
 *
 * 为什么不用 Phaser 的 Arcade 物理:Arcade 没有连续碰撞(大力球一步跨过整个球)、
 * 没有对撞冲量(只有 bounce 反弹)、也没有"全体静止"这个概念 —— 桌球最吃的三件事它都不提供。
 */
import { BALL_R, PHYSICS, PLAY, POCKETS, POCKET_R } from './config';

export type Ball = {
  /** 0 = 母球,1~7 全色,8 黑球,9~15 花色 */
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  potted: boolean;
};

export type ShotEvent =
  | { type: 'cushion'; ball: number; speed: number; x: number; y: number }
  | { type: 'collide'; a: number; b: number; speed: number; x: number; y: number }
  | { type: 'pot'; ball: number; x: number; y: number };

/** 一杆打完的全部事实,规则判定只认这个结构 */
export type ShotOutcome = {
  /** 母球第一个碰到的球;null = 一颗都没碰到(空杆) */
  firstHit: number | null;
  /** 落袋的球,按先后顺序 */
  potted: number[];
  /** 母球接触目标球之后,是否有任意球碰到库边 */
  cushionAfterContact: boolean;
  /** 母球是否落袋 */
  cueScratched: boolean;
};

export function createBall(id: number, x: number, y: number): Ball {
  return { id, x, y, vx: 0, vy: 0, potted: false };
}

export function cloneBalls(balls: Ball[]): Ball[] {
  return balls.map((b) => ({ ...b }));
}

export function emptyOutcome(): ShotOutcome {
  return { firstHit: null, potted: [], cushionAfterContact: false, cueScratched: false };
}

export function allAtRest(balls: Ball[]): boolean {
  for (const ball of balls) {
    if (!ball.potted && (ball.vx !== 0 || ball.vy !== 0)) return false;
  }
  return true;
}

/** 给母球一个初速度。angle 是弧度,power 是 0~1 */
export function strike(cue: Ball, angle: number, power: number) {
  const clamped = Math.max(0, Math.min(1, power));
  const speed = PHYSICS.minShotSpeed + (PHYSICS.maxShotSpeed - PHYSICS.minShotSpeed) * clamped;
  cue.vx = Math.cos(angle) * speed;
  cue.vy = Math.sin(angle) * speed;
}

const LEFT = PLAY.left + BALL_R;
const RIGHT = PLAY.right - BALL_R;
const TOP = PLAY.top + BALL_R;
const BOTTOM = PLAY.bottom - BALL_R;
const DIAMETER = BALL_R * 2;
const DIAMETER_SQ = DIAMETER * DIAMETER;
const POCKET_R_SQ = POCKET_R * POCKET_R;

/**
 * 推进一个物理定步长。
 * 顺序刻意是:摩擦 → 位移 → 落袋 → 撞库 → 球球对撞。
 * 落袋必须排在撞库前面 —— 不然滚进袋口的球会先被库边弹回来,永远进不了袋。
 */
function stepOnce(balls: Ball[], dt: number, outcome: ShotOutcome, events: ShotEvent[] | null) {
  const decel = PHYSICS.friction * dt;

  for (const ball of balls) {
    if (ball.potted) continue;
    const speed = Math.hypot(ball.vx, ball.vy);
    if (speed === 0) continue;
    if (speed <= PHYSICS.stopSpeed) {
      // 低于阈值直接停死。留着的话球会以看不见的速度蠕动几十秒,回合迟迟不结束
      ball.vx = 0;
      ball.vy = 0;
      continue;
    }
    const next = Math.max(0, speed - decel);
    const scale = next / speed;
    ball.vx *= scale;
    ball.vy *= scale;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
  }

  for (const ball of balls) {
    if (ball.potted || (ball.vx === 0 && ball.vy === 0)) continue;
    for (const pocket of POCKETS) {
      const dx = ball.x - pocket.x;
      const dy = ball.y - pocket.y;
      if (dx * dx + dy * dy > POCKET_R_SQ) continue;
      ball.potted = true;
      ball.vx = 0;
      ball.vy = 0;
      outcome.potted.push(ball.id);
      if (ball.id === 0) outcome.cueScratched = true;
      events?.push({ type: 'pot', ball: ball.id, x: pocket.x, y: pocket.y });
      break;
    }
  }

  for (const ball of balls) {
    if (ball.potted) continue;
    // 法线方向按弹性系数反弹,切线方向只被库皮蹭掉一点点 —— 两个方向用同一个系数
    // 会让贴库球的行进速度也被当成撞击损耗,球一碰库就"粘"住,走位全错。
    const rest = PHYSICS.cushionRestitution;
    const fric = PHYSICS.cushionFriction;
    let hit = 0;
    if (ball.x < LEFT && ball.vx < 0) {
      ball.x = LEFT; ball.vx = -ball.vx * rest; ball.vy *= fric; hit = Math.abs(ball.vx);
    } else if (ball.x > RIGHT && ball.vx > 0) {
      ball.x = RIGHT; ball.vx = -ball.vx * rest; ball.vy *= fric; hit = Math.abs(ball.vx);
    }
    if (ball.y < TOP && ball.vy < 0) {
      ball.y = TOP; ball.vy = -ball.vy * rest; ball.vx *= fric; hit = Math.max(hit, Math.abs(ball.vy));
    } else if (ball.y > BOTTOM && ball.vy > 0) {
      ball.y = BOTTOM; ball.vy = -ball.vy * rest; ball.vx *= fric; hit = Math.max(hit, Math.abs(ball.vy));
    }
    if (hit === 0) continue;
    if (outcome.firstHit !== null) outcome.cushionAfterContact = true;
    events?.push({ type: 'cushion', ball: ball.id, speed: hit, x: ball.x, y: ball.y });
  }

  for (let i = 0; i < balls.length; i++) {
    const a = balls[i];
    if (a.potted) continue;
    for (let j = i + 1; j < balls.length; j++) {
      const b = balls[j];
      if (b.potted) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distSq = dx * dx + dy * dy;
      if (distSq >= DIAMETER_SQ || distSq === 0) continue;
      const dist = Math.sqrt(distSq);
      const nx = dx / dist;
      const ny = dy / dist;
      // 先分开,再谈碰撞:重叠状态下算冲量会把两球黏在一起反复触发
      const overlap = (DIAMETER - dist) / 2;
      a.x -= nx * overlap; a.y -= ny * overlap;
      b.x += nx * overlap; b.y += ny * overlap;

      const rvx = b.vx - a.vx;
      const rvy = b.vy - a.vy;
      const approach = rvx * nx + rvy * ny;
      if (approach >= 0) continue;
      // 等质量弹性碰撞:冲量沿法线均分给两球
      const impulse = -(1 + PHYSICS.ballRestitution) * approach / 2;
      a.vx -= impulse * nx; a.vy -= impulse * ny;
      b.vx += impulse * nx; b.vy += impulse * ny;

      if (outcome.firstHit === null && (a.id === 0 || b.id === 0)) {
        outcome.firstHit = a.id === 0 ? b.id : a.id;
      }
      events?.push({
        type: 'collide', a: a.id, b: b.id, speed: Math.abs(approach),
        x: a.x + nx * BALL_R, y: a.y + ny * BALL_R,
      });
    }
  }
}

/**
 * 按真实经过的时间推进,内部拆成若干个定步长。
 * 返回是否已经全部静止。deltaSeconds 会被夹住 —— 切后台再回来时 delta 可能是几秒,
 * 一口气补完等于让球瞬移过整张台。
 */
export function advance(
  balls: Ball[],
  deltaSeconds: number,
  outcome: ShotOutcome,
  events: ShotEvent[] | null = null,
): boolean {
  let remain = Math.min(deltaSeconds, 0.05);
  while (remain > 0) {
    const dt = Math.min(PHYSICS.stepSeconds, remain);
    stepOnce(balls, dt, outcome, events);
    remain -= dt;
  }
  return allAtRest(balls);
}

/** 无头跑完一整杆,直接得到静止后的球局与这一杆的事实。AI 用它试算 */
export function runShot(balls: Ball[], angle: number, power: number): ShotOutcome {
  const cue = balls.find((b) => b.id === 0);
  const outcome = emptyOutcome();
  if (!cue || cue.potted) return outcome;
  strike(cue, angle, power);
  let elapsed = 0;
  while (elapsed < PHYSICS.maxShotSeconds) {
    stepOnce(balls, PHYSICS.stepSeconds, outcome, null);
    elapsed += PHYSICS.stepSeconds;
    if (allAtRest(balls)) break;
  }
  return outcome;
}

/** 某个点能不能放下一颗球(在台面内且不压着别的球) */
export function isFreeSpot(balls: Ball[], x: number, y: number, ignoreId = -1): boolean {
  if (x < LEFT || x > RIGHT || y < TOP || y > BOTTOM) return false;
  for (const pocket of POCKETS) {
    if (Math.hypot(x - pocket.x, y - pocket.y) < POCKET_R + BALL_R) return false;
  }
  for (const ball of balls) {
    if (ball.potted || ball.id === ignoreId) continue;
    if (Math.hypot(x - ball.x, y - ball.y) < DIAMETER + 0.5) return false;
  }
  return true;
}

/** 自由球:从想放的位置往外螺旋找一个放得下的点,保证一定能落下去 */
export function nearestFreeSpot(balls: Ball[], x: number, y: number, ignoreId = 0) {
  if (isFreeSpot(balls, x, y, ignoreId)) return { x, y };
  for (let radius = DIAMETER; radius < 260; radius += BALL_R) {
    for (let i = 0; i < 24; i++) {
      const angle = (Math.PI * 2 * i) / 24;
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;
      if (isFreeSpot(balls, px, py, ignoreId)) return { x: px, y: py };
    }
  }
  return { x, y };
}

/** 从 from 到 to 这条线上,有没有别的球挡路(用于 AI 判断线路是否干净) */
export function pathBlocked(balls: Ball[], fromX: number, fromY: number, toX: number, toY: number, ignore: number[]): boolean {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return false;
  for (const ball of balls) {
    if (ball.potted || ignore.includes(ball.id)) continue;
    const t = ((ball.x - fromX) * dx + (ball.y - fromY) * dy) / lengthSq;
    if (t <= 0 || t >= 1) continue;
    const px = fromX + dx * t;
    const py = fromY + dy * t;
    if (Math.hypot(ball.x - px, ball.y - py) < DIAMETER) return true;
  }
  return false;
}

export const TABLE_BOUNDS = { left: LEFT, right: RIGHT, top: TOP, bottom: BOTTOM };
