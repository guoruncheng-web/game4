import type { DifficultyId, GameMode } from './config';
import { loadAssets, type Assets } from './three/assets';
import { Fx } from './three/fx';
import { Stage } from './three/stage';
import { Hud } from './ui/hud';
import { gameOverScreen, loadingScreen, menuScreen, pauseScreen } from './ui/screens';
import { preloadSfx } from './sfx';
import { ensureStyles, removeStyles } from './ui/style';
import { World } from './world';

export type GameHandle = { destroy(): void };

/**
 * 霓虹突击(Three.js 版)的入口与状态机。
 *
 * 分层:Stage 管渲染,World 管玩法,ui/ 管 DOM 覆盖层,这里只负责把三者串起来
 * —— 加载 → 菜单 → 战斗 → 暂停 / 结算 → 回菜单,以及主循环和销毁。
 *
 * HUD 和菜单一律走 DOM 而不是画进 3D 场景:文字在透视投影里既会被辉光糊掉、
 * 又要为不同分辨率单独缩放,而 DOM 天生就是清晰、可点、能自适应的。
 */
export function startGame(parent: HTMLElement): GameHandle {
  ensureStyles();
  // Three 的画布是底层,UI 全部绝对定位叠在它上面
  if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';

  const overlay = document.createElement('div');
  overlay.className = 'ns3';
  parent.append(overlay);

  const stage = new Stage(parent);
  let assets: Assets | null = null;
  let fx: Fx | null = null;
  let world: World | null = null;
  let hud: Hud | null = null;
  let screen: HTMLElement | null = null;
  let lastRun: { mode: GameMode; difficulty: DifficultyId } | null = null;
  let paused = false;
  let destroyed = false;
  let raf = 0;
  let lastFrame = performance.now();

  /** 同一时刻只允许有一个弹层,传 null 就是回到纯战斗画面 */
  const show = (node: HTMLElement | null) => {
    screen?.remove();
    screen = node;
    if (node) overlay.append(node);
  };

  const stopBattle = () => {
    world?.dispose();
    world = null;
    hud?.dispose();
    hud = null;
    // 上一局的爆炸残骸不清掉的话,新局第一帧会闪出来
    fx?.reset();
    paused = false;
  };

  const toMenu = () => {
    stopBattle();
    show(menuScreen(startBattle).root);
    stage.setFlowSpeed(14);
  };

  function startBattle(mode: GameMode, difficulty: DifficultyId) {
    if (!assets || !fx) return;
    stopBattle();
    show(null);
    lastRun = { mode, difficulty };
    hud = new Hud(pause);
    overlay.append(hud.root);
    world = new World(stage, fx, assets, mode, difficulty, {
      onHud: (state) => hud?.update(state),
      onBanner: (text, boss) => hud?.showBanner(text, boss),
      onFloat: (text, tone) => hud?.showFloat(text, tone),
      onFlash: (strength) => hud?.showFlash(strength),
      onFinish: (result) => {
        // 结算面板出来之后战场留在原地当背景,只是不再推进
        paused = true;
        show(gameOverScreen({
          ...result, mode, difficulty,
          onAgain: () => startBattle(mode, difficulty),
          onMenu: toMenu,
        }).root);
      },
    });
  }

  function pause() {
    if (!world || paused) return;
    paused = true;
    show(pauseScreen({
      ...world.progress,
      onResume: resume,
      onMenu: toMenu,
      onRestart: () => { if (lastRun) startBattle(lastRun.mode, lastRun.difficulty); },
    }).root);
  }

  function resume() {
    if (!world || !paused) return;
    paused = false;
    show(null);
  }

  // ---------------------------------------------------------------- 输入与循环

  const onKey = (e: KeyboardEvent) => {
    if (e.code !== 'KeyP' && e.code !== 'Escape') return;
    // 结算面板也把 paused 置了位,但那时 world 已经跑完,不该被 P 键重新唤醒
    if (!world || screen?.querySelector('.ns3-big')) return;
    if (paused) resume(); else pause();
  };
  const onHidden = () => { if (document.hidden) pause(); };
  const onResize = () => stage.resize();

  window.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onHidden);
  window.addEventListener('resize', onResize);
  const observer = new ResizeObserver(onResize);
  observer.observe(parent);

  const loop = () => {
    if (destroyed) return;
    raf = requestAnimationFrame(loop);
    const now = performance.now();
    // 切回标签页时 dt 可能是几十秒,钳住上限,免得世界瞬间跳过一大段
    const dt = Math.min((now - lastFrame) / 1000, 0.1);
    lastFrame = now;
    // 菜单和暂停时不推进玩法,但星空照旧流动 —— 静止的背景会让人以为游戏卡死了
    if (world && !paused) world.update(dt);
    else stage.update(dt, 0, 0);
    stage.render();
  };
  loop();

  // ---------------------------------------------------------------- 加载

  const loading = loadingScreen();
  show(loading.root);
  stage.setFlowSpeed(60);
  // 音效是 6 个 rFXGen 生成的小 wav(合计 200KB),和模型并行下载;
  // 单条失败也不挡开局,只是那一声不响 —— 所以不参与 loading 进度、不进 catch 分支
  void preloadSfx();
  loadAssets(loading.progress)
    .then((loaded) => {
      if (destroyed) return;
      assets = loaded;
      fx = new Fx(stage.root, loaded);
      // 两侧的占位柱体换成 Blender 产出的桁架塔 / 空间站段 / 残骸
      stage.setProps(loaded.props);
      toMenu();
    })
    .catch((error) => {
      console.error('[neon-strike] 资源加载失败', error);
      loading.fail('战机模型加载失败,请刷新重试');
    });

  return {
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('resize', onResize);
      observer.disconnect();
      stopBattle();
      fx?.dispose();
      stage.dispose();
      overlay.remove();
      removeStyles();
    },
  };
}
