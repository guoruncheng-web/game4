import * as Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './config';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';
import { GameOverScene } from './scenes/GameOverScene';
import { PauseScene } from './scenes/PauseScene';
import { takeCoopBridge } from './coop/bridge';

export function startGame(parent: HTMLElement): Phaser.Game {
  // 带着桥进来说明是从匹配页开局的,直接进战斗,不再走菜单 ——
  // 两个人已经在匹配页确认过了,再让他们各自点一次「开始战役」只会错开
  const bridge = takeCoopBridge();

  const game = new Phaser.Game({
    type: Phaser.AUTO, parent, width: GAME_WIDTH, height: GAME_HEIGHT, backgroundColor: '#06051b',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 }, debug: false } },
    scene: [BootScene, MenuScene, GameScene, PauseScene, GameOverScene],
  });

  if (bridge) {
    // 放进 registry:Boot 也要用它互报加载进度,而 registry 是跨场景共享的
    game.registry.set('coopBridge', bridge);
    // Boot 装完资源才会有贴图,所以要等它跑完再切场景
    game.events.once('ready', () => {
      game.scene.getScene('NeonBoot')?.events.once('shutdown', () => {
        game.scene.start('NeonGame', { mode: 'campaign', difficulty: 'normal', coop: bridge });
      });
    });
  }
  return game;
}

