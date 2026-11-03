import type Phaser from 'phaser';

/**
 * 每个游戏目录的 index.ts 都必须导出 startGame。
 * 约定:startGame 负责创建并返回 Phaser.Game,销毁由外层容器负责。
 */
export type GameModule = {
  startGame: (parent: HTMLElement) => Phaser.Game;
};

/**
 * Three.js 游戏走另一套契约:没有 Phaser.Game,只要求返回一个能销毁自己的句柄。
 * 由 ThreeCanvas 负责在卸载时调用 destroy()。
 */
export type ThreeGameModule = {
  startGame: (parent: HTMLElement) => { destroy(): void };
};
