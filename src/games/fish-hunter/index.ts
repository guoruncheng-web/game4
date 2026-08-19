import { takeFishBridge } from './net/bridge';
import { createLocalTransport } from './net/local';
import { createWsTransport } from './net/ws';
import { preload as preloadSfx } from './sfx';
import { loadAssets } from './three/assets';
import { Stage } from './three/stage';
import { createHud } from './ui/hud';
import { World } from './world';

export type GameHandle = { destroy(): void };

/**
 * 深海捕鱼(Three.js 版)。横屏,正交相机,鱼是带骨骼动画的 glb。
 *
 * 分层:Stage 管渲染,World 管接线,ui/ 管 DOM 覆盖层,这里只把三者串起来。
 * 和霓虹突击 3D 版同一套结构。
 *
 * 单机和联机的区别**只有这里的一行**:带着桥进来就走 WsTransport(权威模拟在服务端),
 * 否则走 LocalTransport(权威模拟在本 tab)。World 一行都不用分支 ——
 * 这正是 Transport 这个接口存在的理由(DESIGN.md §3.6)。
 *
 * **从 Phaser 换到 Three 时,`sim/`、`net/`、协议、服务端一个字都没改。**
 * 换掉的只有"怎么画"。
 */
export function startGame(parent: HTMLElement): GameHandle {
  if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';

  const bridge = takeFishBridge();
  const transport = bridge ? createWsTransport(bridge) : createLocalTransport();

  const stage = new Stage(parent);
  const hud = createHud(parent);
  hud.hint('下网中…', 60_000);

  let world: World | null = null;
  let raf = 0;
  let last = performance.now();
  let destroyed = false;

  void (async () => {
    try {
      const assets = await loadAssets();
      if (destroyed) return;
      preloadSfx();
      world = new World(stage, assets, transport, hud);

      const loop = () => {
        raf = requestAnimationFrame(loop);
        const now = performance.now();
        const dt = now - last;
        last = now;
        world?.update(dt);
        stage.render();
      };
      loop();
    } catch (error) {
      // 模型下不来就明说。静默失败会让人对着一片空水面猜是不是自己网络的问题
      console.error('[fish-hunter] 模型加载失败', error);
      hud.hint('模型加载失败,刷新试试', 60_000);
    }
  })();

  return {
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      world?.destroy();
      hud.destroy();
      stage.destroy();
      transport.close();
    },
  };
}
