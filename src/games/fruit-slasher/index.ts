import * as Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, GRAVITY } from './config';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';
import { GameOverScene } from './scenes/GameOverScene';
import { PauseScene } from './scenes/PauseScene';

export function startGame(parent: HTMLElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: '#071326',
    transparent: false,
    // 必须用 FIT,不能用 ENVELOP。
    // ENVELOP 是 cover:视口比 9:16 宽就把上下裁掉,1440×900 的笔记本上只剩逻辑 y 311~649,
    // 菜单的开始按钮、局内的分数/倒计时/命数全在画布外,玩家只能靠键盘开局。
    // FIT 会留边,但页面本身铺了道场背景图,留出来的部分正好露出背景,不会是黑边。
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    physics: { default: 'arcade', arcade: { gravity: { x: 0, y: GRAVITY }, debug: false } },
    input: { activePointers: 2 },
    scene: [BootScene, MenuScene, GameScene, PauseScene, GameOverScene],
  });
}
