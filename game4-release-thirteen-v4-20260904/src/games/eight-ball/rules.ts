/**
 * 8 球规则判定。纯函数,不碰渲染。
 *
 * 采用的是海外酒吧最通行的那套(bar rules / APA 简化版),因为面向的是休闲玩家:
 * - 开球后台面保持"未定组",第一杆合法进球才定全色/花色;
 * - 犯规一律给对手自由球(可放全台),不搞"击球线后"这种上手门槛高的限制;
 * - 母球落袋、空杆、先碰错球、碰球后无球进袋也无球碰库,都是犯规;
 * - 自己那组清完才能打黑八;提前进黑八、连同犯规进黑八,都是直接输。
 */
import type { Ball, ShotOutcome } from './physics';

export type Group = 'solids' | 'stripes';
export type Player = 'you' | 'cpu';

export type MatchState = {
  turn: Player;
  groups: Record<Player, Group | null>;
  /** 台面是否还没定组 */
  open: boolean;
  /** 当前出杆方是否拿着自由球 */
  ballInHand: boolean;
  /** 开球是否已经打过 */
  broken: boolean;
  winner: Player | null;
  /** 结束原因,英文,直接显示在结算页 */
  endReason: string;
};

export type Judgement = {
  foul: boolean;
  /** 英文提示,直接进 HUD */
  message: string;
  /** 是否继续由本方出杆 */
  continueTurn: boolean;
  /** 本杆定下来的球组 */
  assigned: Group | null;
  /** 黑八在开球时进袋 —— 重新摆回台面,不算犯规也不算输 */
  respotEight: boolean;
  winner: Player | null;
  endReason: string;
};

export function otherPlayer(player: Player): Player {
  return player === 'you' ? 'cpu' : 'you';
}

/** 0 号母球和 8 号黑球不属于任何一组 */
export function ballGroup(id: number): Group | null {
  if (id >= 1 && id <= 7) return 'solids';
  if (id >= 9 && id <= 15) return 'stripes';
  return null;
}

export function remainingOf(balls: Ball[], group: Group): number {
  return balls.filter((b) => !b.potted && ballGroup(b.id) === group).length;
}

/** 自己那组已经清完 = 该打黑八了 */
export function isOnEight(balls: Ball[], group: Group | null): boolean {
  return group !== null && remainingOf(balls, group) === 0;
}

export function createMatch(first: Player = 'you'): MatchState {
  return {
    turn: first,
    groups: { you: null, cpu: null },
    open: true,
    ballInHand: false,
    broken: false,
    winner: null,
    endReason: '',
  };
}

/**
 * 判定一杆。ballsBefore 是出杆前的球局(用来判断"这一杆之前我那组还剩几颗"),
 * outcome 是物理内核吐出来的事实。这里只做判断,不改状态。
 */
export function judgeShot(state: MatchState, ballsBefore: Ball[], outcome: ShotOutcome): Judgement {
  const shooter = state.turn;
  const opponent = otherPlayer(shooter);
  const myGroup = state.groups[shooter];
  const potted = outcome.potted.filter((id) => id !== 0);
  const pottedEight = potted.includes(8);
  const onEight = !state.open && isOnEight(ballsBefore, myGroup);

  let foul = false;
  let message = '';
  const flag = (text: string) => { if (!foul) { foul = true; message = text; } };

  if (outcome.cueScratched) flag('Scratch — cue ball potted');

  if (outcome.firstHit === null) {
    flag('Foul — no ball hit');
  } else if (state.open) {
    // 开台阶段黑八不能当第一颗目标球
    if (outcome.firstHit === 8) flag('Foul — hit the 8 first');
  } else if (onEight) {
    if (outcome.firstHit !== 8) flag('Foul — must hit the 8');
  } else if (outcome.firstHit === 8 || ballGroup(outcome.firstHit) !== myGroup) {
    flag(`Foul — must hit ${myGroup} first`);
  }

  // 碰到球之后必须有球进袋或者有球碰库,否则是"做球不到位"的消极犯规
  if (outcome.firstHit !== null && potted.length === 0 && !outcome.cushionAfterContact) {
    flag('Foul — no rail after contact');
  }

  // 开球有自己的一套:进球或有球碰库就算有效开球
  if (!state.broken && !outcome.cueScratched && outcome.firstHit !== null
      && potted.length === 0 && !outcome.cushionAfterContact) {
    foul = true;
    message = 'Foul — weak break';
  }

  if (pottedEight) {
    // 开球就把黑八打进:摆回去接着打,不奖不罚
    if (!state.broken && !foul) {
      return {
        foul: false, message: '8 on the break — respotted', continueTurn: true,
        assigned: null, respotEight: true, winner: null, endReason: '',
      };
    }
    const legal = !foul && onEight;
    const winner = legal ? shooter : opponent;
    const endReason = legal
      ? 'Black ball down — clean finish'
      : foul
      ? 'The 8 went down on a foul'
      : 'The 8 went down too early';
    return {
      foul: !legal, message: legal ? '8 ball — game over' : endReason,
      continueTurn: false, assigned: null, respotEight: false, winner, endReason,
    };
  }

  // 定组只发生在开球之后的第一次合法进球
  let assigned: Group | null = null;
  if (state.open && state.broken && !foul && potted.length > 0) {
    assigned = ballGroup(potted[0]);
  }

  const activeGroup = assigned ?? myGroup;
  const pottedOwn = activeGroup !== null && potted.some((id) => ballGroup(id) === activeGroup);
  // 开球那一杆还没定组,进了任何一颗(黑八除外)都算续杆
  const pottedAnyOnBreak = !state.broken && potted.length > 0;
  const continueTurn = !foul && (pottedOwn || pottedAnyOnBreak);

  if (!message) {
    if (assigned) message = `You're ${assigned}`;
    else if (potted.length > 0) message = potted.length > 1 ? `${potted.length} down` : 'Potted';
    else message = '';
  }

  return { foul, message, continueTurn, assigned, respotEight: false, winner: null, endReason: '' };
}

/** 把判定结果落到状态上 */
export function applyJudgement(state: MatchState, judgement: Judgement): MatchState {
  const shooter = state.turn;
  const opponent = otherPlayer(shooter);
  if (judgement.assigned) {
    state.groups[shooter] = judgement.assigned;
    state.groups[opponent] = judgement.assigned === 'solids' ? 'stripes' : 'solids';
    state.open = false;
  }
  state.broken = true;
  if (judgement.winner) {
    state.winner = judgement.winner;
    state.endReason = judgement.endReason;
    return state;
  }
  if (judgement.continueTurn) {
    state.ballInHand = false;
  } else {
    state.turn = opponent;
    state.ballInHand = judgement.foul;
  }
  return state;
}
