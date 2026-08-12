let ctx: AudioContext | null = null;
let lastWhoosh = 0;

function muted() {
  return typeof localStorage !== 'undefined' && localStorage.getItem('game-box-muted') === 'true';
}

function audio() {
  if (typeof window === 'undefined' || muted()) return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(freq: number, to: number, duration: number, volume: number, type: OscillatorType = 'triangle') {
  const ac = audio();
  if (!ac) return;
  const oscillator = ac.createOscillator();
  const gain = ac.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(freq, ac.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), ac.currentTime + duration);
  gain.gain.setValueAtTime(volume, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + duration);
  oscillator.connect(gain).connect(ac.destination);
  oscillator.start();
  oscillator.stop(ac.currentTime + duration);
}

export const sfx = {
  whoosh(speed: number) {
    const now = performance.now();
    if (now - lastWhoosh < 60) return;
    lastWhoosh = now;
    tone(240 + Math.min(speed, 900) * 0.35, 110, 0.08, 0.025, 'sawtooth');
  },
  slice(pitch = 1) { tone(620 * pitch, 230 * pitch, 0.11, 0.055, 'triangle'); },
  combo(count: number) {
    const start = 500 + Math.min(count, 8) * 35;
    tone(start, start * 1.5, 0.18, 0.07, 'sine');
    setTimeout(() => tone(start * 1.4, start * 1.9, 0.16, 0.055, 'sine'), 90);
  },
  critical() { tone(960, 1480, 0.22, 0.065, 'sine'); },
  miss() { tone(240, 75, 0.27, 0.07, 'triangle'); },
  explosion() { tone(150, 34, 0.58, 0.12, 'sawtooth'); },
  ui() { tone(520, 780, 0.13, 0.05, 'triangle'); },
  newBest() {
    tone(523, 659, 0.18, 0.05);
    setTimeout(() => tone(659, 784, 0.2, 0.05), 150);
  },
};
