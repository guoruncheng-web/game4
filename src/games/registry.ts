/**
 * 游戏清单。首页(游戏盒子)读取这里渲染入口卡片。
 * 新增一个游戏 = 在 src/games/<slug>/ 写实现 + 在这里补一条 + 建 src/app/<slug>/page.tsx。
 *
 * 重要:这个文件只放纯元数据,不要 import 任何游戏代码。
 * 首页是服务端组件,一旦这里引用到游戏模块,Phaser 就会被拖进 RSC 依赖图并导致构建失败
 * (phaser 的 ESM 产物没有 default export)。加载游戏由各游戏页自己的动态 import 负责。
 */
export type GameMeta = {
  /** 必须同时等于目录名 src/games/<slug> 和路由 /app/<slug> */
  slug: string;
  title: string;
  /** 一句话介绍,显示在卡片上 */
  tagline: string;
  /** 操作说明 */
  controls: string;
  /** 卡片强调色(Tailwind 类名) */
  accent: string;
};

export const GAMES: GameMeta[] = [
  {
    slug: 'star-runner',
    title: 'Star Runner',
    tagline: '收集全部星星,躲开炸弹的横版跳跃',
    controls: '← → / A D 移动 · 空格跳跃(可二段跳)',
    accent: 'text-emerald-400',
  },
  {
    slug: 'fruit-slasher',
    title: '水果切切乐',
    tagline: '经典 / 限时 / 禅意三种模式 · 三档难度',
    controls: '按住鼠标或单指滑动切水果 · 避开炸弹 · P / ESC 暂停',
    accent: 'text-orange-400',
  },
  {
    slug: 'neon-strike',
    title: '霓虹突击',
    tagline: '3D 纵深追尾射击 · 12 波战役 · 3 场 Boss',
    controls: '拖动画面或方向键走位 · 自动射击 · P / ESC 暂停',
    accent: 'text-cyan-400',
  },
  {
    slug: 'neon-strike-2d',
    title: '霓虹突击 2D',
    tagline: '初代 Phaser 竖屏弹幕版 · 手绘贴图 · 独立存档',
    controls: '拖动或方向键走位 · 自动射击 · P / ESC 暂停',
    accent: 'text-fuchsia-400',
  },
];

export function getGame(slug: string): GameMeta | undefined {
  return GAMES.find((g) => g.slug === slug);
}
