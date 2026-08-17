const ROOT = '/fruit-slasher/assets/audio';
const pools = new Map<string, HTMLAudioElement[]>();
const cursors = new Map<string, number>();
let lastWhoosh = 0;

function muted() {
  return typeof window === 'undefined' || localStorage.getItem('game-box-muted') === 'true';
}

function play(name: string, volume: number, playbackRate = 1, voices = 3) {
  if (muted()) return;
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
  critical() {
    play('critical', 0.16, 0.92);
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
