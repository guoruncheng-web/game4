export const SUITS = ['spade', 'club', 'diamond', 'heart'] as const;
export type Suit = (typeof SUITS)[number];

export const RANKS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] as const;
export type Rank = (typeof RANKS)[number];

export interface Card {
  readonly id: string;
  readonly rank: Rank;
  readonly suit: Suit;
}

export const THREE_OF_SPADES_ID = '3-spade';

export function createDeck(): Card[] {
  return RANKS.flatMap((rank) => SUITS.map((suit) => ({
    id: `${rank}-${suit}`,
    rank,
    suit,
  })));
}

export function card(rank: Rank, suit: Suit = 'spade'): Card {
  return { id: `${rank}-${suit}`, rank, suit };
}

export function compareCardsByRank(left: Card, right: Card): number {
  return left.rank - right.rank;
}

/** Small deterministic PRNG for local matches and reproducible failing tests. */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

export function shuffleDeck(seed: number): Card[] {
  const deck = createDeck();
  const random = createRandom(seed);
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
  }
  return deck;
}

export function dealFourHands(seed: number): readonly Card[][] {
  const deck = shuffleDeck(seed);
  return [0, 1, 2, 3].map((seat) => deck.filter((_, index) => index % 4 === seat));
}
