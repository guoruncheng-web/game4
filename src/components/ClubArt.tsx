import type { CSSProperties } from 'react';

const icons = ['home', 'voice', 'messages', 'profile', 'games', 'security', 'diamond', 'password', 'robot', 'fruit', 'pool', 'puzzle', 'fish', 'cards', 'rocket', 'ludo'] as const;
export type ClubIconName = typeof icons[number];

/** 图集只承载装饰，按钮的名称与状态由真实 DOM 提供。 */
export function ClubIcon({ name, className = '' }: { name: ClubIconName; className?: string }) {
  const index = icons.indexOf(name);
  return <span aria-hidden="true" className={`gb-icon ${className}`} style={{ maskPosition: `${(index % 4) * 100 / 3}% ${Math.floor(index / 4) * 100 / 3}%` }} />;
}

/** 原创立体插画：透明素材与真实 DOM 文案分别渲染。 */
const covers: Record<string, string> = {
  'thirteen': '/assets/social/thirteen-v1.webp',
  'umo': '/assets/social/umo-v1.webp',
  'ludo': '/assets/social/ludo-v1.webp',
  'eight-ball': '/assets/social/eight-ball-v1.webp',
  'fruit-slasher': '/assets/social/fruit-slasher-v1.webp',
  'triple-pile': '/assets/social/triple-pile-v1.webp',
  'star-runner': '/assets/social/star-runner-v1.webp',
  'neon-strike-2d': '/assets/social/neon-strike-2d-v1.webp',
  'neon-strike': '/assets/social/neon-strike-v1.webp',
  'fish-hunter': '/assets/social/fish-hunter-v1.webp',
  'thirteen-social': '/assets/social/thirteen-social-v1.webp',
};
export function cardStyle(slug: string): CSSProperties {
  return { backgroundImage: `url('${covers[slug] ?? covers.thirteen}')`, backgroundSize: 'contain', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' };
}

/** 导航使用逐项状态图；标题、角标与点击目标由 DOM 提供。 */
const navArt: Partial<Record<ClubIconName, [string, string]>> = {
  home: ['/assets/social/nav-home-v2.webp', '/assets/social/nav-home-selected-v2.webp'],
  voice: ['/assets/social/nav-party-v2.webp', '/assets/social/nav-party-selected-v2.webp'],
  messages: ['/assets/social/nav-message-v2.webp', '/assets/social/nav-message-selected-v2.webp'],
  games: ['/assets/social/nav-discover-v2.webp', '/assets/social/nav-discover-selected-v2.webp'],
  profile: ['/assets/social/nav-profile-v2.webp', '/assets/social/nav-profile-selected-v2.webp'],
};
export function ClubNavIcon({ name, selected }: { name: ClubIconName; selected: boolean }) {
  const art = navArt[name] ?? navArt.home!;
  return <span aria-hidden="true" className="gb-nav-icon" style={{ backgroundImage: `url('${art[selected ? 1 : 0]}')` }} />;
}

export function ClubBrand() {
  return <div className="gb-brand" aria-label="趣宝玩"><span className="gb-brand-symbol"><ClubIcon name="games" /></span><span><b>趣宝玩</b><small>一起玩，更开心</small></span></div>;
}
