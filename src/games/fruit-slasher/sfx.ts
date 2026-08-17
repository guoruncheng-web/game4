const ROOT = '/fruit-slasher/assets/audio';
const pools = new Map<string, HTMLAudioElement[]>();
const cursors = new Map<string, number>();
let lastWhoosh = 0;

function muted() {
  if (typeof window === 'undefined') return true;
  try { return localStorage.getItem('game-box-muted') === 'true'; } catch { return false; }
}

/** 主音量 0~1,和全站静音开关放在一起,首页的喇叭按钮仍然只切 muted */
export function getVolume() {
  if (typeof window === 'undefined') return 1;
  try {
    const raw = localStorage.getItem('game-box-volume');
    if (raw === null) return 1;
    const value = Number(raw);
    return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
  } catch {
    return 1;
  }
}

export function setVolume(value: number) {
  const clamped = Math.min(1, Math.max(0, value));
  try { localStorage.setItem('game-box-volume', String(clamped)); } catch { /* 忽略 */ }
  return clamped;
}

export function isMuted() {
  return typeof window !== 'undefined' && muted();
}

export function setMuted(value: boolean) {
  try { localStorage.setItem('game-box-muted', String(value)); } catch { /* 忽略 */ }
  return value;
}

function play(name: string, volume: number, playbackRate = 1, voices = 3) {
  if (muted()) return;
  const master = getVolume();
  if (master <= 0) return;
  volume = Math.min(1, volume * master);
  let pool = pools.get(name);
  if (!pool) {
    pool = Array.from({ length: voices }, () => {
      const clip = new Audio(`${ROOT}/${name}.wav`);
      clip.preload = 'auto';
      return clip;
    });
    pools.set(name, pool);
  }
  const cursor = cursors.get(name) ?? 0;
  const clip = pool[cursor % pool.length];
  cursors.set(name, cursor + 1);
  clip.pause();
  clip.currentTime = 0;
  clip.volume = volume;
  clip.playbackRate = playbackRate;
  void clip.play().catch(() => undefined);
}

export const sfx = {
  whoosh(speed: number) {
    const now = performance.now();
    if (now - lastWhoosh < 130 || speed < 220) return;
    lastWhoosh = now;
    play('whoosh', 0.07, Math.min(1.05, 0.78 + speed / 4200), 2);
  },
  slice(pitch = 1) {
    play('slice', 0.14, pitch * 0.92, 3);
  },
  combo(count: number) {
    play('combo', 0.085, Math.min(1.08, 0.9 + count * 0.018), 2);
  },
  miss() {
    play('miss', 0.065, 0.88);
  },
  explosion() {
    play('bomb', 0.2, 0.88);
  },
  ui() {
    play('ui', 0.16, 0.92);
  },
  newBest() {
    play('new-best', 0.2, 0.94);
  },
};
