/**
 * 叠叠消(Triple Pile)的入口与状态机。
 *
 * 分层:Stage 管渲染,Session 管一局的玩法,ui/ 管 DOM 覆盖层,
 * 这里只负责把三者串起来 —— 加载 → 关卡选择 → 开局 → 暂停 / 结算 → 回关卡选择,
 * 以及主循环、输入转发和销毁。
 */

import { LEVEL_COUNT, assertSolvable, getLevel } from './levels';
import { Session, type Result } from './game/session';
import { PieceField } from './three/field';
import { Stage } from './three/stage';
import { TrayView } from './three/tray';
import { Vfx } from './three/vfx';
import { initPhysics } from './physics/world';
import { disposeAssets, loadGameAssets, type GameAssets } from './three/assets';
import { Hud } from './ui/hud';
import { levelSelectScreen, loadingScreen, pauseScreen, resultScreen } from './ui/screens';
import { ensureStyles, removeStyles } from './ui/style';
import { loadProgress, recordLevel, saveProgress } from './storage';
import { closeSfx, sfxFail, sfxWin } from './sfx';
import type { PowerupId } from './config';

export type GameHandle = { destroy(): void };

/** 场上物件的峰值(第 12 关)。InstancedMesh 的容量按它开,每关不用重建 */
const MAX_PIECES = 120;
/** 道具按钮从第 3 关开始出现 —— 那是首次可能死于槽位塞满的一关 */
const POWERUP_FROM_LEVEL = 3;

export function startGame(parent: HTMLElement): GameHandle {
  ensureStyles();
  if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';

  // 关卡表的可解性(每类数量都是 3 的倍数)在这里兜一道底。
  // 崩关 bug 的代价是玩家玩到一半发现这关根本清不完,值得开局就炸出来
  assertSolvable();

  const overlay = document.createElement('div');
  overlay.className = 'tp';
  parent.append(overlay);

  const stage = new Stage(parent);
  const canvas = stage.renderer.domElement;

  let assets: GameAssets | null = null;
  let field: PieceField | null = null;
  let tray: TrayView | null = null;
  let vfx: Vfx | null = null;
  let session: Session | null = null;
  let hud: Hud | null = null;
  let screenNode: HTMLElement | null = null;
  let currentLevel = 1;
  let paused = false;
  let destroyed = false;
  let raf = 0;
  let lastFrame = performance.now();
  let progress = loadProgress();

  const show = (node: HTMLElement | null) => {
    screenNode?.remove();
    screenNode = node;
    if (node) overlay.append(node);
  };

  // ---------------------------------------------------------------- 局的生命周期

  const stopSession = () => {
    session?.dispose();
    session = null;
    hud?.dispose();
    hud = null;
    field?.reset();
    vfx?.reset();
    tray?.setWarn(false);
    paused = false;
  };

  const toMenu = () => {
    stopSession();
    progress = loadProgress();
    show(levelSelectScreen(progress, startLevel));
  };

  function startLevel(id: number) {
    if (!field || !tray || !vfx) return;
    stopSession();
    show(null);
    currentLevel = id;
    const level = getLevel(id);

    const showTip = id === 1 && !progress.tutorialDone;
    hud = new Hud(pause, usePowerup, showTip);
    hud.setPowerupsVisible(id >= POWERUP_FROM_LEVEL);
    overlay.append(hud.root);

    session = new Session(level, stage, field, tray, vfx, {
      onHud: (state) => hud?.update(state),
      onFloat: (text) => hud?.showFloat(text),
      onFirstClear: () => {
        hud?.dismissTip();
        progress = saveProgress({ tutorialDone: true });
      },
      onFinish: (result) => finish(result),
    });
  }

  function finish(result: Result) {
    if (result.won) {
      sfxWin();
      recordLevel(currentLevel, result.score, result.elapsedMs);
      if (currentLevel < LEVEL_COUNT) {
        progress = saveProgress({ unlocked: Math.max(progress.unlocked, currentLevel + 1) });
      }
    } else {
      sfxFail();
    }
    const reason = result.won ? 'win' : result.remainMs <= 0 ? 'time' : 'stuck';
    // 结算面板出来之后这一锅留在原地当背景,只是不再接受拾取(Session 自己会拒)
    show(resultScreen(currentLevel, result, reason, {
      onNext: () => startLevel(Math.min(currentLevel + 1, LEVEL_COUNT)),
      onRetry: () => startLevel(currentLevel),
      onMenu: toMenu,
    }));
  }

  function usePowerup(id: PowerupId) {
    session?.use(id);
  }

  function pause() {
    if (!session || paused || session.phase === 'cleared' || session.phase === 'failed') return;
    paused = true;
    show(pauseScreen(currentLevel, {
      onResume: resume,
      onRestart: () => startLevel(currentLevel),
      onMenu: toMenu,
    }));
  }

  function resume() {
    if (!session || !paused) return;
    paused = false;
    show(null);
    // 把暂停期间攒下的时间丢掉,不做补帧 —— 一次 3 秒的补帧会让整锅炸开
    session.resetClock();
    lastFrame = performance.now();
  }

  // ---------------------------------------------------------------- 输入

  const onPointerDown = (e: PointerEvent) => {
    if (paused || !session) return;
    session.pointerDown(e.clientX, e.clientY, canvas.getBoundingClientRect());
  };
  const onPointerMove = (e: PointerEvent) => session?.pointerMove(e.clientX, e.clientY);
  const onPointerUp = (e: PointerEvent) => {
    if (paused || !session) return;
    session.pointerUp(e.clientX, e.clientY, canvas.getBoundingClientRect());
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  // 指针离开画布(滑到 HUD 上再松手)也要把按下状态清掉
  canvas.addEventListener('pointercancel', onPointerMove);

  const onKey = (e: KeyboardEvent) => {
    if (e.code !== 'KeyP' && e.code !== 'Escape') return;
    if (!session || session.phase === 'cleared' || session.phase === 'failed') return;
    if (paused) resume(); else pause();
  };
  const onHidden = () => { if (document.hidden) pause(); };
  const onResize = () => {
    stage.resize();
    // 槽位是世界坐标里的物件,屏幕一变就得重算它贴在哪
    tray?.layout();
  };

  window.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onHidden);
  window.addEventListener('resize', onResize);
  const observer = new ResizeObserver(onResize);
  observer.observe(parent);

  // ---------------------------------------------------------------- 主循环

  const loop = () => {
    if (destroyed) return;
    raf = requestAnimationFrame(loop);
    const now = performance.now();
    const dt = Math.min((now - lastFrame) / 1000, 0.1);
    lastFrame = now;
    if (session && !paused) session.update(dt);
    // 汤面的流动和蒸汽属于场景,菜单和结算页也照旧翻滚 —— 静止的锅会让人以为卡死了。
    // 但暂停时停住:暂停就该是「一切都停下来」
    if (!paused) stage.update(dt);
    stage.render();
  };
  loop();

  // ---------------------------------------------------------------- 加载

  const loading = loadingScreen();
  const loadingLabel = loading.querySelector('.tp-loading');
  show(loading);
  // 物理的 WASM 和 12 个模型并行下载,谁也不等谁
  Promise.all([
    initPhysics(),
    loadGameAssets((ratio) => {
      if (loadingLabel) loadingLabel.textContent = `正在烧这一锅… ${Math.round(ratio * 100)}%`;
    }),
  ])
    .then(([, loaded]) => {
      if (destroyed) return;
      // 注意这一段的报错也会落进下面的 catch,所以错误文案不能写死成「物理引擎初始化失败」——
      // 渲染层的构造错误被贴上物理的标签,会把排查方向带偏一整轮
      assets = loaded;
      field = new PieceField(stage.scene, loaded.pieces, MAX_PIECES);
      tray = new TrayView(stage.scene, stage, loaded.pieces, loaded.tray);
      vfx = new Vfx(stage.scene);
      toMenu();
    })
    .catch((error) => {
      console.error('[triple-pile] 初始化失败', error);
      // 失败后必须停在一个「明确坏了」的画面上。回退到加载页会一直转,
      // 让人以为还在加载,而其实永远不会好
      show(loadingScreen('这一锅烧糊了,刷新页面重试'));
    });

  return {
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerMove);
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('resize', onResize);
      observer.disconnect();
      stopSession();
      // WASM 侧的内存不归 GC 管,Session.dispose 里 world.free() 是必须的
      vfx?.dispose();
      tray?.dispose();
      field?.dispose();
      // geometry / material / 贴图归 assets 所有,统一在这里释放
      if (assets) disposeAssets(assets);
      stage.dispose();
      overlay.remove();
      removeStyles();
      closeSfx();
    },
  };
}
