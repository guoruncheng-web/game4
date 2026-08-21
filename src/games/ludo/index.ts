import { DEFAULT_DURATION } from './config';
import { Stage } from './three/stage';
import { World } from './world';
import { createHud } from './ui/hud';
import type { GameState } from './sim/game';

export type GameHandle = { destroy(): void };

/**
 * Ludo 棋盘。**只在房主点「开始」之后才挂载**(DESIGN §2 的第 ⑤ 步)。
 *
 * 分层和霓虹突击 3D 版一致:Stage 管渲染、World 管接线、ui/ 管 DOM 覆盖层,
 * 这里只把三者串起来 + 跑主循环。
 *
 * 现在是本地对局(自己 + 3 个机器人)。接服务端时替换的是 World 里 roll/play 的
 * 调用方式,这一层不用动。
 */
export function startGame(parent: HTMLElement, options: { seat?: number; duration?: number } = {}): GameHandle {
  if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';

  const stage = new Stage(parent);
  const hud = createHud(parent);

  let raf = 0;
  let autoRollTimer = 0;
  let last = performance.now();

  const world = new World(stage, {
    onState: (state: GameState, scores: number[]) => hud.update(state, scores),
    onYourTurn: () => {
      window.clearTimeout(autoRollTimer);
      autoRollTimer = window.setTimeout(() => world.rollDice(), 320);
    },
    onOver: (state: GameState) => hud.showResult(state),
  }, options.seat ?? 0, options.duration ?? DEFAULT_DURATION);

  const loop = () => {
    raf = requestAnimationFrame(loop);
    const now = performance.now();
    const dt = now - last;
    last = now;
    world.update(dt);
    hud.tick(world.snapshot);
    stage.render();
  };
  loop();

  return {
    destroy() {
      cancelAnimationFrame(raf);
      window.clearTimeout(autoRollTimer);
      world.destroy();
      hud.destroy();
      stage.destroy();
    },
  };
}
