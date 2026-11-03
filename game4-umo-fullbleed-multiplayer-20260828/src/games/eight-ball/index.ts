import { planShot } from './ai';
import { BREAK_SPOT, DIFFICULTIES, type Difficulty } from './config';
import {
  advance, cloneBalls, emptyOutcome, isFreeSpot, nearestFreeSpot, strike, TABLE_BOUNDS,
  type Ball, type ShotEvent, type ShotOutcome,
} from './physics';
import {
  applyJudgement, ballGroup, createMatch, judgeShot,
  type MatchState,
} from './rules';
import { sfx } from './sfx';
import { createRack, respotEight } from './table';
import { isInKitchen, KITCHEN_TOP } from './table-view';
import { Stage } from './three/stage';
import { Hud } from './ui/hud';
import { gameOverScreen, loadingScreen, menuScreen } from './ui/screens';
import { ensureStyles, removeStyles } from './ui/style';

export type GameHandle = { destroy(): void };
type Phase = 'menu' | 'placing' | 'aiming' | 'rolling' | 'cpu' | 'over';

/**
 * Eight Ball 3D 入口。
 *
 * 玩法仍由原来的纯 TS 物理、规则和 AI 驱动；Three.js 只把同一批 Ball 坐标画成立体球桌。
 * 这样迁移不改变判定，也不会出现“画面一套物理、AI 另一套物理”。
 */
export function startGame(parent: HTMLElement): GameHandle {
  ensureStyles();
  if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
  const stage = new Stage(parent);
  const overlay = document.createElement('div');
  overlay.className = 'eb3';
  parent.append(overlay);

  let destroyed = false;
  let raf = 0;
  let lastFrame = performance.now();
  let phase: Phase = 'menu';
  let difficulty: Difficulty = 'pro';
  let balls: Ball[] = createRack();
  let ballsBefore: Ball[] = [];
  let state: MatchState = createMatch();
  let outcome: ShotOutcome = emptyOutcome();
  let shotEvents: ShotEvent[] = [];
  let rollingSeconds = 0;
  let aimAngle = -Math.PI / 2;
  let power = 0;
  let keyCharging = false;
  let pottedByPlayer = 0;
  let hud: Hud | null = null;
  let screen: HTMLElement | null = null;
  let activePointer: number | null = null;
  const timers = new Set<number>();

  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => { timers.delete(id); if (!destroyed) fn(); }, ms);
    timers.add(id);
    return id;
  };
  const clearTimers = () => { timers.forEach((id) => window.clearTimeout(id)); timers.clear(); };
  const show = (node: HTMLElement | null) => {
    screen?.remove();
    screen = node;
    if (node) overlay.append(node);
  };
  const cueBall = () => balls.find((ball) => ball.id === 0)!;

  const updateAim = () => {
    const cue = cueBall();
    stage.setAim(cue, aimAngle, power, phase === 'aiming' && !cue.potted);
  };

  const enterPlacing = (kitchenOnly: boolean) => {
    phase = 'placing';
    const cue = cueBall();
    cue.potted = false; cue.vx = 0; cue.vy = 0;
    if (kitchenOnly) { cue.x = BREAK_SPOT.x; cue.y = BREAK_SPOT.y; }
    else {
      const spot = nearestFreeSpot(balls, cue.x, cue.y, 0);
      cue.x = spot.x; cue.y = spot.y;
    }
    stage.syncBalls(balls);
    stage.setAim(cue, aimAngle, 0, false);
    hud?.setMode('placing');
  };

  const placeCue = (clientX: number, clientY: number) => {
    const point = stage.toTable(clientX, clientY);
    if (!point) return;
    const kitchenOnly = !state.broken;
    const x = Math.max(TABLE_BOUNDS.left, Math.min(TABLE_BOUNDS.right, point.x));
    const y = Math.max(kitchenOnly ? KITCHEN_TOP : TABLE_BOUNDS.top, Math.min(TABLE_BOUNDS.bottom, point.y));
    if (kitchenOnly && !isInKitchen(y)) return;
    const spot = isFreeSpot(balls, x, y, 0) ? { x, y } : nearestFreeSpot(balls, x, y, 0);
    const cue = cueBall(); cue.x = spot.x; cue.y = spot.y;
    stage.syncBalls(balls);
  };

  const aimAt = (clientX: number, clientY: number) => {
    const point = stage.toTable(clientX, clientY);
    if (!point) return;
    const cue = cueBall();
    if (Math.hypot(point.x - cue.x, point.y - cue.y) < 4) return;
    aimAngle = Math.atan2(point.y - cue.y, point.x - cue.x);
    updateAim();
  };

  const playEvents = () => {
    let collision = 0; let cushion = 0; let potted = false;
    for (const event of shotEvents) {
      if (event.type === 'collide') collision = Math.max(collision, event.speed);
      else if (event.type === 'cushion') cushion = Math.max(cushion, event.speed);
      else potted = true;
    }
    if (collision > 20) sfx.collide(collision);
    if (cushion > 40) sfx.cushion(cushion);
    if (potted) sfx.pot();
  };

  const shoot = () => {
    if (phase !== 'aiming' || power < 0.04) return;
    const cue = cueBall();
    if (cue.potted) return;
    ballsBefore = cloneBalls(balls);
    outcome = emptyOutcome();
    strike(cue, aimAngle, power);
    sfx.cue(power);
    phase = 'rolling'; rollingSeconds = 0; keyCharging = false; power = 0;
    hud?.resetPower(); hud?.setMessage(''); hud?.setMode('rolling');
    updateAim();
  };

  const startCpuTurn = () => {
    phase = 'cpu'; hud?.setMode('cpu'); hud?.setMessage('CPU is lining up…'); updateAim();
    later(() => {
      if (phase !== 'cpu') return;
      const plan = planShot(balls, state, DIFFICULTIES[difficulty]);
      const cue = cueBall();
      if (state.ballInHand || cue.potted) {
        const spot = plan.placeCue ?? nearestFreeSpot(balls, BREAK_SPOT.x, BREAK_SPOT.y, 0);
        cue.potted = false; cue.x = spot.x; cue.y = spot.y; cue.vx = 0; cue.vy = 0;
        state.ballInHand = false;
        stage.syncBalls(balls);
      }
      aimAngle = plan.angle; power = plan.power;
      stage.setAim(cue, aimAngle, power, true);
      later(() => {
        if (phase !== 'cpu') return;
        ballsBefore = cloneBalls(balls); outcome = emptyOutcome();
        strike(cue, aimAngle, power); sfx.cue(power);
        phase = 'rolling'; rollingSeconds = 0; power = 0;
        hud?.setMode('rolling'); updateAim();
      }, 520);
    }, 620);
  };

  const finishShot = () => {
    const judged = judgeShot(state, ballsBefore, outcome);
    const shooter = state.turn;
    if (judged.respotEight) respotEight(balls);
    if (shooter === 'you') {
      const group = state.groups.you ?? judged.assigned;
      pottedByPlayer += outcome.potted.filter((id) => id !== 0 && id !== 8 && (!group || ballGroup(id) === group)).length;
    }
    applyJudgement(state, judged);
    stage.syncBalls(balls); hud?.update(state, balls);
    if (judged.foul) sfx.foul();
    if (judged.message) hud?.toast(judged.message);

    if (state.winner) {
      phase = 'over'; updateAim();
      const won = state.winner === 'you';
      if (won) sfx.win(); else sfx.lose();
      later(() => {
        show(gameOverScreen({
          winner: state.winner ?? 'cpu', reason: state.endReason, difficulty, potted: pottedByPlayer,
          onAgain: () => startMatch(difficulty), onMenu: toMenu,
        }));
      }, 850);
      return;
    }
    hud?.setMessage(judged.message, judged.foul);
    if (state.turn === 'you') {
      if (state.ballInHand) enterPlacing(false);
      else { phase = 'aiming'; hud?.setMode('aiming'); updateAim(); }
    } else startCpuTurn();
  };

  const stopMatch = () => {
    clearTimers();
    hud?.dispose(); hud = null;
    keyCharging = false; activePointer = null; power = 0;
  };

  function toMenu() {
    stopMatch(); phase = 'menu';
    stage.setAim(cueBall(), aimAngle, 0, false);
    show(menuScreen(startMatch));
  }

  function startMatch(nextDifficulty: Difficulty) {
    stopMatch(); show(null);
    difficulty = nextDifficulty; balls = createRack(); state = createMatch('you');
    outcome = emptyOutcome(); ballsBefore = []; aimAngle = -Math.PI / 2; power = 0; pottedByPlayer = 0;
    hud = new Hud(toMenu, (value) => { if (phase === 'aiming') { power = value; updateAim(); } }, shoot);
    overlay.append(hud.root);
    hud.update(state, balls);
    stage.syncBalls(balls);
    enterPlacing(true);
    hud.setMessage('Place the cue ball, then break');
  }

  const onPointerDown = (event: PointerEvent) => {
    if (activePointer !== null || (phase !== 'placing' && phase !== 'aiming')) return;
    activePointer = event.pointerId;
    stage.canvas.setPointerCapture(event.pointerId);
    if (phase === 'placing') placeCue(event.clientX, event.clientY); else aimAt(event.clientX, event.clientY);
  };
  const onPointerMove = (event: PointerEvent) => {
    if (event.pointerId !== activePointer) return;
    if (phase === 'placing') placeCue(event.clientX, event.clientY);
    else if (phase === 'aiming') aimAt(event.clientX, event.clientY);
  };
  const onPointerUp = (event: PointerEvent) => {
    if (event.pointerId !== activePointer) return;
    activePointer = null;
    if (phase === 'placing') {
      phase = 'aiming'; state.ballInHand = false; hud?.setMode('aiming');
      hud?.setMessage(state.broken ? 'Your shot' : 'Break them'); updateAim();
    }
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.code === 'ArrowLeft' && phase === 'aiming') { aimAngle -= 0.012; updateAim(); }
    if (event.code === 'ArrowRight' && phase === 'aiming') { aimAngle += 0.012; updateAim(); }
    if (event.code === 'Space' && phase === 'aiming' && !keyCharging) { event.preventDefault(); keyCharging = true; power = 0; }
    if (event.code === 'Escape' && hud) toMenu();
  };
  const onKeyUp = (event: KeyboardEvent) => {
    if (event.code !== 'Space' || !keyCharging) return;
    event.preventDefault(); keyCharging = false; shoot();
  };
  const onVisibility = () => { if (document.hidden && phase === 'aiming') { keyCharging = false; power = 0; hud?.resetPower(); updateAim(); } };

  stage.canvas.addEventListener('pointerdown', onPointerDown);
  stage.canvas.addEventListener('pointermove', onPointerMove);
  stage.canvas.addEventListener('pointerup', onPointerUp);
  stage.canvas.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  document.addEventListener('visibilitychange', onVisibility);

  const loop = () => {
    if (destroyed) return;
    raf = requestAnimationFrame(loop);
    const now = performance.now();
    const dt = Math.min((now - lastFrame) / 1000, 0.05); lastFrame = now;
    if (phase === 'aiming' && keyCharging) {
      power = Math.min(1, power + dt / 0.95);
      if (hud) hud.power.value = String(power);
      updateAim();
    }
    if (phase === 'rolling') {
      shotEvents = [];
      const rest = advance(balls, dt, outcome, shotEvents);
      playEvents(); stage.syncBalls(balls); rollingSeconds += dt;
      if (rest || rollingSeconds > 22) {
        if (!rest) balls.forEach((ball) => { ball.vx = 0; ball.vy = 0; });
        finishShot();
      }
    }
    stage.render();
  };
  loop();

  show(loadingScreen());
  stage.syncBalls(balls);
  stage.load().then(() => { if (!destroyed) toMenu(); });

  return {
    destroy() {
      destroyed = true; cancelAnimationFrame(raf); clearTimers(); stopMatch();
      stage.canvas.removeEventListener('pointerdown', onPointerDown);
      stage.canvas.removeEventListener('pointermove', onPointerMove);
      stage.canvas.removeEventListener('pointerup', onPointerUp);
      stage.canvas.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('visibilitychange', onVisibility);
      show(null); overlay.remove(); stage.dispose(); removeStyles();
    },
  };
}
