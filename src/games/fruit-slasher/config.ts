export const GAME_WIDTH = 540;
export const GAME_HEIGHT = 960;
export const GRAVITY = 900;

export const STORAGE_KEY = 'fruit-slasher-best';

export const GAMEPLAY = {
  lives: 3,
  spawnY: 1010,
  missY: 1015,
  minSlashDistance: 6,
  slashPointLifeMs: 130,
  firstBombAtMs: 10_000,
  maxTargets: 9,
};

export type FruitKind = 'watermelon' | 'orange' | 'apple' | 'kiwi' | 'strawberry';

export const FRUIT_KINDS: FruitKind[] = [
  'watermelon',
  'orange',
  'apple',
  'kiwi',
  'strawberry',
];

export const FRUIT_COLORS: Record<FruitKind, number> = {
  watermelon: 0xf04455,
  orange: 0xffa21a,
  apple: 0xd9363e,
  kiwi: 0x7fbe38,
  strawberry: 0xe83d4f,
};

export const FRUIT_RADII: Record<FruitKind, number> = {
  watermelon: 38,
  orange: 32,
  apple: 33,
  kiwi: 30,
  strawberry: 30,
};

export function difficultyAt(elapsedMs: number) {
  const seconds = elapsedMs / 1000;
  if (seconds < 8) return { minFruit: 1, maxFruit: 2, minDelay: 1350, maxDelay: 1600, bombChance: 0 };
  if (seconds < 25) return { minFruit: 1, maxFruit: 3, minDelay: 1050, maxDelay: 1350, bombChance: 0.15 };
  if (seconds < 50) return { minFruit: 2, maxFruit: 4, minDelay: 820, maxDelay: 1100, bombChance: 0.25 };
  if (seconds < 80) return { minFruit: 3, maxFruit: 5, minDelay: 650, maxDelay: 900, bombChance: 0.35 };
  return { minFruit: 3, maxFruit: 6, minDelay: 550, maxDelay: 780, bombChance: 0.4 };
}
