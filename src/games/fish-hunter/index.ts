import * as Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './config';
import { createLocalTransport } from './net/local';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';

/**
 * 深海捕鱼。横屏 1280×800。
 *
 * 现在只有单机(DESIGN.md §8 第 1 步):Transport 走 LocalTransport,
 * FishRoom 跑在本 tab 里。接联机时**只换 Transport 的实现**,场景一行不用改 ——
 * 这正是那个接口存在的理由。
 *
 * 没有 arcade 物理:鱼的位置是纯函数求值、炮弹碰撞在 FishRoom 里算,
 * 引擎的物理世界在这里没有任何用处,开着只是白跑一遍。
 */
export function startGame(parent: HTMLElement): Phaser.Game {
  const transport = createLocalTransport();

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: '#021320',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [BootScene, GameScene],
  });

  // 场景是 Boot 起的,拿不到这里的 transport,用注册表转交
  game.registry.set('transport', transport);
  game.events.once('destroy', () => transport.close());

  return game;
}
