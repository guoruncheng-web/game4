import type Phaser from 'phaser';

/**
 * 每个游戏目录的 index.ts 都必须导出 startGame。
 * 约定:startGame 负责创建并返回 Phaser.Game,销毁由外层容器负责。
 */
export type GameModule = {
  startGame: (parent: HTMLElement) => Phaser.Game;
};
