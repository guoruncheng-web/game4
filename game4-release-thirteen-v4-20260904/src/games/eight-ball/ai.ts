/**
 * AI 出杆。
 *
 * 思路是"先几何粗筛,再物理精算":
 * 1. 枚举 (自己那组的每颗球 × 六个袋),用假想球算出瞄准点,把角度太刁、线路被挡的直接扔掉;
 * 2. 剩下的按几何难度排序,取前 N 条真的用物理内核无头打一遍,看落袋、犯规、走位;
 * 3. 挑分最高的那条,再按难度加上瞄准/力度误差 —— 误差是加在最后的,
 *    所以低难度 AI 是"选对了球打偏了",而不是"傻到选错球",这样输给它才不别扭。
 *
 * 因为用的是同一套物理内核,AI 试算出来的结果和玩家看到的完全一致。
 */
import { BALL_R, BREAK_SPOT, DIFFICULTIES, POCKETS, type DifficultySpec } from './config';
import {
  cloneBalls, nearestFreeSpot, pathBlocked, runShot, TABLE_BOUNDS,
  type Ball,
} from './physics';
import { ballGroup, isOnEight, type MatchState } from './rules';

export type AiPlan = {
  angle: number;
  power: number;
  /** 有自由球时,AI 想把母球摆在哪 */
  placeCue: { x: number; y: number } | null;
};

type Candidate = {
  targetId: number;
  angle: number;
  power: number;
  /** 几何粗筛分,只用来决定谁进入精算 */
  rough: number;
};

/** 该打哪些球:开台打除黑八外全部,定组后打自己那组,清完打黑八 */
function legalTargets(balls: Ball[], state: MatchState, player: 'you' | 'cpu'): Ball[] {
  const group = state.groups[player];
  const live = balls.filter((b) => !b.potted && b.id !== 0);
  if (state.open || group === null) return live.filter((b) => b.id !== 8);
  if (isOnEight(balls, group)) return live.filter((b) => b.id === 8);
  return live.filter((b) => ballGroup(b.id) === group);
}

function buildCandidates(balls: Ball[], cue: Ball, targets: Ball[]): Candidate[] {
  const out: Candidate[] = [];
  for (const target of targets) {
    for (const pocket of POCKETS) {
      const toPocketX = pocket.x - target.x;
      const toPocketY = pocket.y - target.y;
      const pocketDist = Math.hypot(toPocketX, toPocketY);
      if (pocketDist < 1) continue;
      const px = toPocketX / pocketDist;
      const py = toPocketY / pocketDist;
      // 假想球:母球要撞到目标球的"背面"这个点上,目标球才会朝着袋口走
      const ghostX = target.x - px * BALL_R * 2;
      const ghostY = target.y - py * BALL_R * 2;
      if (ghostX < TABLE_BOUNDS.left || ghostX > TABLE_BOUNDS.right) continue;
      if (ghostY < TABLE_BOUNDS.top || ghostY > TABLE_BOUNDS.bottom) continue;

      const toGhostX = ghostX - cue.x;
      const toGhostY = ghostY - cue.y;
      const cueDist = Math.hypot(toGhostX, toGhostY);
      if (cueDist < 1) continue;
      const gx = toGhostX / cueDist;
      const gy = toGhostY / cueDist;
      // 切角:母球来向与目标球去向的夹角。超过 ~78° 的薄球基本打不进,直接不考虑
      const cut = gx * px + gy * py;
      if (cut < 0.2) continue;
      if (pathBlocked(balls, cue.x, cue.y, ghostX, ghostY, [0, target.id])) continue;
      if (pathBlocked(balls, target.x, target.y, pocket.x, pocket.y, [target.id])) continue;

      const angle = Math.atan2(toGhostY, toGhostX);
      // 距离越远、切角越薄,越要多给点力;短台轻推容易停在袋口
      const power = Math.max(0.3, Math.min(0.95, 0.3 + (cueDist + pocketDist) / 1700 + (1 - cut) * 0.25));
      const rough = cut * 2 - (cueDist + pocketDist) / 900;
      out.push({ targetId: target.id, angle, power, rough });
    }
  }
  return out.sort((a, b) => b.rough - a.rough);
}

/** 打完之后局面好不好:母球别贴库、离下一颗自己的球别太远也别贴太近 */
function positionScore(after: Ball[], state: MatchState, player: 'you' | 'cpu'): number {
  const cue = after.find((b) => b.id === 0);
  if (!cue || cue.potted) return -50;
  const next = legalTargets(after, state, player);
  if (next.length === 0) return 0;
  let best = Infinity;
  for (const ball of next) best = Math.min(best, Math.hypot(ball.x - cue.x, ball.y - cue.y));
  // 60~320 之间是舒服的距离
  const comfort = best < 60 ? -12 : best > 320 ? -10 : 8;
  const railPenalty = Math.min(
    cue.x - TABLE_BOUNDS.left, TABLE_BOUNDS.right - cue.x,
    cue.y - TABLE_BOUNDS.top, TABLE_BOUNDS.bottom - cue.y,
  ) < BALL_R * 2 ? -14 : 0;
  return comfort + railPenalty;
}

function scoreShot(balls: Ball[], state: MatchState, player: 'you' | 'cpu', candidate: Candidate): number {
  const sim = cloneBalls(balls);
  const outcome = runShot(sim, candidate.angle, candidate.power);
  const group = state.groups[player];
  const onEight = !state.open && isOnEight(balls, group);

  let score = 0;
  if (outcome.cueScratched) score -= 900;
  if (outcome.firstHit === null) score -= 800;
  else if (!state.open && group && !onEight && ballGroup(outcome.firstHit) !== group) score -= 700;
  else if (onEight && outcome.firstHit !== 8) score -= 700;
  else if (state.open && outcome.firstHit === 8) score -= 700;

  for (const id of outcome.potted) {
    if (id === 0) continue;
    if (id === 8) {
      // 该打黑八时进袋直接赢,不该打时进袋直接输 —— 分差必须拉满
      score += onEight && !outcome.cueScratched ? 2000 : -2000;
      continue;
    }
    const g = ballGroup(id);
    if (state.open || group === null) score += 260;
    else score += g === group ? 300 : -140;
  }
  if (outcome.potted.length === 0 && !outcome.cushionAfterContact && outcome.firstHit !== null) {
    score -= 500;
  }
  return score + positionScore(sim, state, player);
}

/** 一杆都没有把握时的防守:轻碰自己一颗球,把犯规风险降到最低 */
function safetyPlan(balls: Ball[], cue: Ball, targets: Ball[]): AiPlan {
  let best: AiPlan = { angle: 0, power: 0.4, placeCue: null };
  let bestDist = Infinity;
  for (const target of targets) {
    const dist = Math.hypot(target.x - cue.x, target.y - cue.y);
    if (pathBlocked(balls, cue.x, cue.y, target.x, target.y, [0, target.id])) continue;
    if (dist < bestDist) {
      bestDist = dist;
      best = {
        angle: Math.atan2(target.y - cue.y, target.x - cue.x),
        power: Math.max(0.32, Math.min(0.6, dist / 900 + 0.3)),
        placeCue: null,
      };
    }
  }
  if (bestDist === Infinity && targets.length > 0) {
    // 全被挡住了,硬顶最近那颗,至少不是空杆
    const target = targets[0];
    best = {
      angle: Math.atan2(target.y - cue.y, target.x - cue.x),
      power: 0.55,
      placeCue: null,
    };
  }
  return best;
}

/**
 * 有自由球时先决定母球摆哪:挑几何上最好打的一条线,
 * 把母球放到"目标球背后、正对袋口"的位置上,留一个正面直球。
 */
function planPlacement(balls: Ball[], state: MatchState, player: 'you' | 'cpu') {
  const targets = legalTargets(balls, state, player);
  let best: { x: number; y: number } | null = null;
  let bestScore = -Infinity;
  for (const target of targets) {
    for (const pocket of POCKETS) {
      const dx = target.x - pocket.x;
      const dy = target.y - pocket.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 1) continue;
      for (const back of [120, 200, 280]) {
        const x = target.x + (dx / dist) * back;
        const y = target.y + (dy / dist) * back;
        const spot = nearestFreeSpot(balls, x, y, 0);
        if (pathBlocked(balls, spot.x, spot.y, target.x, target.y, [0, target.id])) continue;
        if (pathBlocked(balls, target.x, target.y, pocket.x, pocket.y, [target.id])) continue;
        const score = -dist - back * 0.2;
        if (score > bestScore) { bestScore = score; best = spot; }
      }
    }
  }
  return best;
}

export function planShot(balls: Ball[], state: MatchState, spec: DifficultySpec = DIFFICULTIES.pro): AiPlan {
  const player = state.turn === 'cpu' ? 'cpu' : 'you';
  const working = cloneBalls(balls);
  let placeCue: { x: number; y: number } | null = null;
  if (state.ballInHand) {
    placeCue = planPlacement(working, state, player);
    const cue = working.find((b) => b.id === 0);
    if (cue) {
      // 挑不出理想摆位也要有个位置 —— 后面所有试算都建立在"母球在台上"这个前提上
      const spot = placeCue ?? nearestFreeSpot(working, BREAK_SPOT.x, BREAK_SPOT.y, 0);
      placeCue = spot;
      cue.x = spot.x; cue.y = spot.y; cue.potted = false; cue.vx = 0; cue.vy = 0;
    }
  }

  const cue = working.find((b) => b.id === 0);
  const targets = legalTargets(working, state, player);
  if (!cue || targets.length === 0) return { angle: 0, power: 0.5, placeCue };

  const candidates = buildCandidates(working, cue, targets).slice(0, spec.candidates);
  let best: AiPlan | null = null;
  let bestScore = -Infinity;
  for (const candidate of candidates) {
    const score = scoreShot(working, state, player, candidate);
    if (score > bestScore) {
      bestScore = score;
      best = { angle: candidate.angle, power: candidate.power, placeCue };
    }
  }

  // 所有候选都算下来还是亏的(比如只剩薄到不行的球),就退回防守
  if (!best || bestScore < 0) {
    const safety = safetyPlan(working, cue, targets);
    best = { ...safety, placeCue };
  }

  // 误差加在最后:AI 依然"选对了球",只是手不稳
  const jitter = (Math.random() * 2 - 1) * spec.aimError;
  const powerJitter = 1 + (Math.random() * 2 - 1) * spec.powerError;
  return {
    angle: best.angle + jitter,
    power: Math.max(0.22, Math.min(1, best.power * powerJitter)),
    placeCue,
  };
}
