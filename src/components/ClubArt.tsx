import type { CSSProperties } from 'react';

const icons = ['home', 'voice', 'messages', 'profile', 'games', 'security', 'diamond', 'password', 'robot', 'fruit', 'pool', 'puzzle', 'fish', 'cards', 'rocket', 'ludo'] as const;
export type ClubIconName = typeof icons[number];

/** 图集只承载装饰，按钮的名称与状态由真实 DOM 提供。 */
export function ClubIcon({ name, className = '' }: { name: ClubIconName; className?: string }) {
  const index = icons.indexOf(name);
  return <span aria-hidden="true" className={`gb-icon ${className}`} style={{ maskPosition: `${(index % 4) * 100 / 3}% ${Math.floor(index / 4) * 100 / 3}%` }} />;
}

/** 统一封面图集：与夜游俱乐部设计稿一致，不把文字烘焙进图片。 */
const covers: Record<string, number> = { thirteen: 0, umo: 1, ludo: 2, 'eight-ball': 3, 'fruit-slasher': 4, 'triple-pile': 5, 'star-runner': 6, 'neon-strike-2d': 7, 'neon-strike': 8, 'fish-hunter': 9, 'thirteen-social': 11 };
export function cardStyle(slug: string): CSSProperties {
  const index = covers[slug] ?? 0;
  return { backgroundImage: "url('/assets/nightclub/game-covers-v1.webp')", backgroundSize: '300% 400%', backgroundPosition: `${index % 3 * 50}% ${Math.floor(index / 3) * 100 / 3}%` };
}

export function ClubBrand() {
  return <div className="gb-brand" aria-label="趣宝玩"><span className="gb-brand-symbol"><ClubIcon name="games" /></span><span><b>趣宝玩</b><small>夜游俱乐部</small></span></div>;
}
