import {
  THREE_OF_SPADES_ID,
  dealFourHands,
  type Card,
} from './cards';
import {
  canBeat,
  canLead,
  classifyCombination,
  includesThreeOfSpades,
  isBomb,
  type Combination,
} from './combinations';

export const RULES_VERSION = 'source-locked-v1';
export const SEAT_COUNT = 4;

export interface PlayedTrick {
  readonly seat: number;
  readonly combination: Combination;
}

export interface MatchState {
  readonly rulesVersion: typeof RULES_VERSION;
  readonly hands: readonly (readonly Card[])[];
  readonly currentSeat: number;
  readonly firstPlayPending: boolean;
  readonly lastPlay: PlayedTrick | null;
  readonly passed: readonly boolean[];
  readonly hasPlayed: readonly boolean[];
  readonly winner: number | null;
  readonly turn: number;
}

export type MatchAction =
  | { readonly type: 'play'; readonly seat: number; readonly cardIds: readonly string[] }
  | { readonly type: 'pass'; readonly seat: number };

export type ActionResult =
  | { readonly ok: true; readonly state: MatchState }
  | { readonly ok: false; readonly reason: string; readonly state: MatchState };

export interface ScoreResult {
  readonly winner: number;
  readonly penalties: readonly number[];
  readonly cong: readonly boolean[];
}

function assertHands(hands: readonly (readonly Card[])[]): void {
  if (hands.length !== SEAT_COUNT) throw new Error('match_requires_four_hands');
  const allCards = hands.flat();
  if (new Set(allCards.map((item) => item.id)).size !== allCards.length) {
    throw new Error('match_hands_contain_duplicate_cards');
  }
}

export function createMatchFromHands(
  hands: readonly (readonly Card[])[],
  previousWinner: number | null = null,
): MatchState {
  assertHands(hands);
  const openingSeat = previousWinner ?? hands.findIndex((hand) => (
    hand.some((item) => item.id === THREE_OF_SPADES_ID)
  ));
  if (openingSeat < 0 || openingSeat >= SEAT_COUNT) throw new Error('opening_seat_not_found');

  return {
    rulesVersion: RULES_VERSION,
    hands: hands.map((hand) => [...hand]),
    currentSeat: openingSeat,
    firstPlayPending: previousWinner === null,
    lastPlay: null,
    passed: Array.from({ length: SEAT_COUNT }, () => false),
    hasPlayed: Array.from({ length: SEAT_COUNT }, () => false),
    winner: null,
    turn: 0,
  };
}

export function createMatch(seed: number, previousWinner: number | null = null): MatchState {
  return createMatchFromHands(dealFourHands(seed), previousWinner);
}

function fail(state: MatchState, reason: string): ActionResult {
  return { ok: false, reason, state };
}

function nextEligibleSeat(state: MatchState, fromSeat: number, passed: readonly boolean[]): number {
  for (let offset = 1; offset <= SEAT_COUNT; offset += 1) {
    const seat = (fromSeat + offset) % SEAT_COUNT;
    if (state.hands[seat].length > 0 && !passed[seat]) return seat;
  }
  return fromSeat;
}

function allRespondersPassed(state: MatchState, passed: readonly boolean[]): boolean {
  if (!state.lastPlay) return false;
  return state.hands.every((hand, seat) => (
    seat === state.lastPlay?.seat || hand.length === 0 || passed[seat]
  ));
}

function selectedCards(state: MatchState, seat: number, cardIds: readonly string[]): readonly Card[] | null {
  if (cardIds.length === 0 || new Set(cardIds).size !== cardIds.length) return null;
  const byId = new Map(state.hands[seat].map((item) => [item.id, item]));
  const selected = cardIds.map((id) => byId.get(id));
  return selected.every((item): item is Card => item !== undefined) ? selected : null;
}

export function validatePlay(
  state: MatchState,
  seat: number,
  cardIds: readonly string[],
): { readonly ok: true; readonly combination: Combination } | { readonly ok: false; readonly reason: string } {
  if (state.winner !== null) return { ok: false, reason: 'match_finished' };
  if (seat !== state.currentSeat) return { ok: false, reason: 'not_current_seat' };
  const selected = selectedCards(state, seat, cardIds);
  if (!selected) return { ok: false, reason: 'cards_not_owned_or_duplicated' };
  const classified = classifyCombination(selected);
  if (!classified.ok) return classified;
  if (state.firstPlayPending && !includesThreeOfSpades(classified.combination)) {
    return { ok: false, reason: 'first_play_requires_three_of_spades' };
  }
  if (!state.lastPlay && !canLead(classified.combination)) {
    return { ok: false, reason: 'combination_cannot_lead' };
  }
  if (state.lastPlay && !canBeat(classified.combination, state.lastPlay.combination)) {
    return { ok: false, reason: 'combination_cannot_beat_table' };
  }
  return { ok: true, combination: classified.combination };
}

function play(state: MatchState, action: Extract<MatchAction, { type: 'play' }>): ActionResult {
  const validation = validatePlay(state, action.seat, action.cardIds);
  if (!validation.ok) return fail(state, validation.reason);

  const playedIds = new Set(action.cardIds);
  const hands = state.hands.map((hand, seat) => (
    seat === action.seat ? hand.filter((item) => !playedIds.has(item.id)) : [...hand]
  ));
  const hasPlayed = state.hasPlayed.map((value, seat) => value || seat === action.seat);
  const winner = hands[action.seat].length === 0 ? action.seat : null;
  const passed = state.passed.map((value, seat) => (seat === action.seat ? false : value));
  const intermediate: MatchState = {
    ...state,
    hands,
    firstPlayPending: false,
    lastPlay: { seat: action.seat, combination: validation.combination },
    passed,
    hasPlayed,
    winner,
    turn: state.turn + 1,
  };

  return {
    ok: true,
    state: {
      ...intermediate,
      currentSeat: winner === null
        ? nextEligibleSeat(intermediate, action.seat, passed)
        : action.seat,
    },
  };
}

function pass(state: MatchState, action: Extract<MatchAction, { type: 'pass' }>): ActionResult {
  if (state.winner !== null) return fail(state, 'match_finished');
  if (action.seat !== state.currentSeat) return fail(state, 'not_current_seat');
  if (!state.lastPlay) return fail(state, 'cannot_pass_on_free_lead');

  const passed = state.passed.map((value, seat) => value || seat === action.seat);
  if (allRespondersPassed(state, passed)) {
    return {
      ok: true,
      state: {
        ...state,
        currentSeat: state.lastPlay.seat,
        lastPlay: null,
        passed: Array.from({ length: SEAT_COUNT }, () => false),
        turn: state.turn + 1,
      },
    };
  }

  return {
    ok: true,
    state: {
      ...state,
      currentSeat: nextEligibleSeat(state, action.seat, passed),
      passed,
      turn: state.turn + 1,
    },
  };
}

export function applyAction(state: MatchState, action: MatchAction): ActionResult {
  if (!Number.isInteger(action.seat) || action.seat < 0 || action.seat >= SEAT_COUNT) {
    return fail(state, 'invalid_seat');
  }
  return action.type === 'play' ? play(state, action) : pass(state, action);
}

function choose(cards: readonly Card[], count: number): readonly Card[][] {
  const output: Card[][] = [];
  const visit = (start: number, selected: Card[]): void => {
    if (selected.length === count) {
      output.push(selected);
      return;
    }
    for (let index = start; index <= cards.length - (count - selected.length); index += 1) {
      visit(index + 1, [...selected, cards[index]]);
    }
  };
  visit(0, []);
  return output;
}

function product(groups: readonly (readonly Card[][])[]): readonly Card[][] {
  let output: Card[][] = [[]];
  for (const options of groups) {
    output = output.flatMap((prefix) => options.map((option) => [...prefix, ...option]));
  }
  return output;
}

function candidateSelections(hand: readonly Card[]): readonly Card[][] {
  const byRank = new Map<number, Card[]>();
  for (const item of hand) byRank.set(item.rank, [...(byRank.get(item.rank) ?? []), item]);
  const candidates = new Map<string, Card[]>();
  const add = (selected: readonly Card[]): void => {
    const key = selected.map((item) => item.id).sort().join(',');
    candidates.set(key, Array.from(selected));
  };

  for (const item of hand) add([item]);
  for (const cards of byRank.values()) {
    for (const count of [2, 3, 4]) {
      if (cards.length >= count) for (const selected of choose(cards, count)) add(selected);
    }
  }

  const straightRanks = Array.from(byRank.keys()).filter((rank) => rank < 15).sort((a, b) => a - b);
  for (let start = 0; start < straightRanks.length; start += 1) {
    for (let end = start + 2; end < straightRanks.length; end += 1) {
      if (straightRanks[end] !== straightRanks[start] + (end - start)) break;
      const options = straightRanks.slice(start, end + 1).map((rank) => (
        byRank.get(rank)!.map((item) => [item])
      ));
      for (const selected of product(options)) add(selected);
    }
  }

  const pairedRanks = straightRanks.filter((rank) => byRank.get(rank)!.length >= 2);
  for (let start = 0; start < pairedRanks.length; start += 1) {
    for (let end = start + 2; end < pairedRanks.length; end += 1) {
      if (pairedRanks[end] !== pairedRanks[start] + (end - start)) break;
      const options = pairedRanks.slice(start, end + 1).map((rank) => (
        choose(byRank.get(rank)!, 2)
      ));
      for (const selected of product(options)) add(selected);
    }
  }
  return Array.from(candidates.values());
}

export function legalPlays(state: MatchState, seat: number = state.currentSeat): readonly Combination[] {
  if (seat !== state.currentSeat || state.winner !== null) return [];
  const legal: Combination[] = [];
  for (const selected of candidateSelections(state.hands[seat])) {
    const validation = validatePlay(state, seat, selected.map((item) => item.id));
    if (validation.ok) legal.push(validation.combination);
  }
  return legal.sort((left, right) => (
    Number(isBomb(left)) - Number(isBomb(right))
    || left.highRank - right.highRank
    || left.length - right.length
    || left.cards.map((item) => item.id).sort().join(',').localeCompare(
      right.cards.map((item) => item.id).sort().join(','),
    )
  ));
}

export function timeoutAction(state: MatchState): MatchAction {
  const candidate = legalPlays(state)[0];
  return candidate
    ? { type: 'play', seat: state.currentSeat, cardIds: candidate.cards.map((item) => item.id) }
    : { type: 'pass', seat: state.currentSeat };
}

export function scoreMatch(state: MatchState): ScoreResult | null {
  if (state.winner === null) return null;
  const cong = state.hasPlayed.map((played, seat) => seat !== state.winner && !played);
  const penalties = state.hands.map((hand, seat) => (
    seat === state.winner ? 0 : hand.length * (cong[seat] ? 2 : 1)
  ));
  return { winner: state.winner, penalties, cong };
}
