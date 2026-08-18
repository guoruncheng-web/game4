import * as Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './config';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';
import { GameOverScene } from './scenes/GameOverScene';

export function startGame(parent: HTMLElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: '#0d1a14',
    // 必须 FIT:ENVELOP 会把上下裁掉,底部那条力度条一旦出画就没法出杆了
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    // 刻意不开 Phaser 的物理系统:桌球用的是 physics.ts 那套自研内核,
    // Arcade 既没有连续碰撞也没有静止判定,开着只是白占一份 update 开销。
    render: { powerPreference: 'high-performance', antialias: true },
    input: { activePointers: 2 },
    scene: [BootScene, MenuScene, GameScene, GameOverScene],
  });
}
