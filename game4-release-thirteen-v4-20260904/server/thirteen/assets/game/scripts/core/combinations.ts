import type { Card, Rank } from './cards';

export type CombinationType =
  | 'single'
  | 'pair'
  | 'triple'
  | 'straight'
  | 'consecutivePairs'
  | 'fourOfKind';

export interface Combination {
  readonly type: CombinationType;
  readonly cards: readonly Card[];
  readonly highRank: Rank;
  readonly length: number;
  readonly pairCount?: number;
}

export type Classification =
  | { readonly ok: true; readonly combination: Combination }
  | { readonly ok: false; readonly reason: string };

function rankCounts(cards: readonly Card[]): Map<Rank, number> {
  const counts = new Map<Rank, number>();
  for (const item of cards) counts.set(item.rank, (counts.get(item.rank) ?? 0) + 1);
  return counts;
}

function sortedRanks(cards: readonly Card[]): Rank[] {
  // Creator's web Babel target does not lower generic iterable spread correctly.
  return Array.from(new Set(cards.map((item) => item.rank))).sort((a, b) => a - b);
}

function isConsecutive(ranks: readonly Rank[]): boolean {
  return ranks.every((rank, index) => index === 0 || rank === ranks[index - 1] + 1);
}

export function classifyCombination(cards: readonly Card[]): Classification {
  if (cards.length === 0) return { ok: false, reason: 'empty_selection' };
  const ids = new Set(cards.map((item) => item.id));
  if (ids.size !== cards.length) return { ok: false, reason: 'duplicate_card' };

  const counts = rankCounts(cards);
  const ranks = sortedRanks(cards);
  const highRank = ranks[ranks.length - 1];
  const build = (type: CombinationType, pairCount?: number): Classification => ({
    ok: true,
    combination: { type, cards: [...cards], highRank, length: cards.length, pairCount },
  });

  if (cards.length === 1) return build('single');
  if (ranks.length === 1 && cards.length === 2) return build('pair');
  if (ranks.length === 1 && cards.length === 3) return build('triple');
  if (ranks.length === 1 && cards.length === 4) return build('fourOfKind');

  if (cards.length >= 3 && ranks.length === cards.length) {
    if (highRank === 15) return { ok: false, reason: 'straight_cannot_include_two' };
    if (isConsecutive(ranks)) return build('straight');
  }

  if (cards.length >= 6 && cards.length % 2 === 0 && ranks.length === cards.length / 2) {
    if (highRank === 15) return { ok: false, reason: 'consecutive_pairs_cannot_include_two' };
    if (Array.from(counts.values()).every((count) => count === 2) && isConsecutive(ranks)) {
      return build('consecutivePairs', ranks.length);
    }
  }

  return { ok: false, reason: 'unrecognized_combination' };
}

export function isBomb(combination: Combination): boolean {
  return combination.type === 'fourOfKind'
    || (combination.type === 'consecutivePairs' && (combination.pairCount ?? 0) >= 3);
}

function isSingleTwo(combination: Combination): boolean {
  return combination.type === 'single' && combination.highRank === 15;
}

function isPairOfTwos(combination: Combination): boolean {
  return combination.type === 'pair' && combination.highRank === 15;
}

export function canBeat(challenger: Combination, incumbent: Combination): boolean {
  if (isSingleTwo(incumbent)) {
    return (challenger.type === 'fourOfKind' && challenger.highRank !== 15)
      || (challenger.type === 'consecutivePairs' && (challenger.pairCount ?? 0) >= 3);
  }

  if (isPairOfTwos(incumbent)) {
    return challenger.type === 'consecutivePairs' && (challenger.pairCount ?? 0) >= 4;
  }

  // source-locked-v1: bombs never beat ordinary combinations or other bombs.
  if (isBomb(challenger) || isBomb(incumbent)) return false;
  if (challenger.type !== incumbent.type || challenger.length !== incumbent.length) return false;
  return challenger.highRank > incumbent.highRank;
}

export function canLead(combination: Combination): boolean {
  // Four twos may be led as the explicitly approved R16 special combination.
  return combination.cards.length > 0;
}

export function includesThreeOfSpades(combination: Combination): boolean {
  return combination.cards.some((item) => item.rank === 3 && item.suit === 'spade');
}
