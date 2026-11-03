import * as Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, GameScene } from './phaser/GameScene';

/**
 * Ludo 棋盘(Phaser 3)。**只在房主点「开始」并放完开局动画之后才挂载**(DESIGN §2 ⑤)。
 *
 * **从 Three.js 改造过来时,`sim/` 四个文件一行没动。**
 * 换掉的只有渲染层 —— 判定早就和画面分开了,44 项无头用例原样继续跑着当保险。
 * 这就是当初把 `sim/` 做成纯函数的回报:换引擎是一次局部替换,不是重写。
 *
 * 2D 在这一款反而更顺手:棋盘本来就是正俯视的格子网,`layout.ts` 给的 (行, 列)
 * 直接就是屏幕坐标 —— 不用翻 y 轴、不用发射线做点击命中,也不会出现
 * "棋子立着、棋盘躺着"的视角打架。
 *
 * 按仓库约定:**必须 `import * as Phaser`**(phaser 的 ESM 产物没有 default export,
 * 默认导入会让 Turbopack 构建直接失败),而且这个模块只能由 PhaserCanvas 动态 import 进来。
 */
export function startGame(parent: HTMLElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: '#06184c',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    // 没有物理:棋子走的是离散格子,靠 tween 推进,arcade 世界在这里没有任何用处
    scene: [GameScene],
  });
}
