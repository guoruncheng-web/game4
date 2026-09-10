import type { CSSProperties } from 'react';

const icons = ['home', 'voice', 'messages', 'profile', 'games', 'security', 'diamond', 'password', 'robot', 'fruit', 'pool', 'puzzle', 'fish', 'cards', 'rocket', 'ludo'] as const;
export type ClubIconName = typeof icons[number];

/** 图集只承载装饰，按钮的名称与状态由真实 DOM 提供。 */
export function ClubIcon({ name, className = '' }: { name: ClubIconName; className?: string }) {
  const index = icons.indexOf(name);
  return <span aria-hidden="true" className={`gb-icon ${className}`} style={{ backgroundPosition: `${(index % 4) * 100 / 3}% ${Math.floor(index / 4) * 100 / 3}%` }} />;
}

const cards: Record<string, number> = { 'star-runner': 0, 'fruit-slasher': 1, 'eight-ball': 2, 'triple-pile': 3, 'fish-hunter': 4, umo: 5, 'neon-strike-2d': 6, ludo: 7, thirteen: 8, 'neon-strike': 9 };
export function cardStyle(slug: string): CSSProperties {
  const index = cards[slug] ?? 0;
  return { backgroundPosition: `${index % 2 * 100}% ${Math.floor(index / 2) * 25}%` };
}

/** 首页静态卡面取自批准稿；房间和消息中的动态卡面仍使用无字图集。 */
export function homeCardStyle(slug: string): CSSProperties {
  const rects: Record<string, [number, number, number, number]> = {
    thirteen: [90, 242, 393, 86],
    'star-runner': [90, 337, 193, 57],
    'fruit-slasher': [293, 337, 191, 57],
    'eight-ball': [90, 399, 193, 56],
    'triple-pile': [293, 399, 191, 56],
    'fish-hunter': [90, 462, 193, 55],
    umo: [293, 462, 191, 55],
  };
  const rect = rects[slug];
  if (!rect) return cardStyle(slug);
  const [x, y, width, height] = rect;
  return {
    backgroundImage: "url('/assets/game-box/v5/pwa-main-reference-atlas.png')",
    backgroundSize: `${1470 / width * 100}% ${1070 / height * 100}%`,
    backgroundPosition: `${x / (1470 - width) * 100}% ${y / (1070 - height) * 100}%`,
    '--gb-card-copy-display': 'none',
  } as CSSProperties;
}

export function ClubBrand() {
  return <div className="gb-brand" aria-label="GAME BOX"><b>GAME</b><b>BOX</b><small>一起玩，更好玩</small></div>;
}
