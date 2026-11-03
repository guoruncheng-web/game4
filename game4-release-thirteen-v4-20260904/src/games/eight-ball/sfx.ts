/**
 * 音效全部用 WebAudio 现场合成,不加载任何音频文件。
 *
 * 桌球的声音其实就三种:硬碰硬的"哒"(球撞球)、闷一点的"咚"(撞库)、
 * 以及落袋后袋内的滚动声。用振荡器 + 一小段噪声缓冲就够,
 * 而且能按撞击速度连续改音高音量 —— 这是采样音效做不到的,轻碰和重击听起来必须不一样。
 */
const MUTE_KEY = 'game-box-muted';
const VOLUME_KEY = 'game-box-volume';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;

function audio() {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try { ctx = new Ctor(); } catch { return null; }
    master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);
    const length = Math.floor(ctx.sampleRate * 0.4);
    noise = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  if (master) master.gain.value = isMuted() ? 0 : getVolume();
  return ctx;
}

export function isMuted() {
  if (typeof window === 'undefined') return true;
  try { return localStorage.getItem(MUTE_KEY) === 'true'; } catch { return false; }
}

export function setMuted(value: boolean) {
  try { localStorage.setItem(MUTE_KEY, String(value)); } catch { /* 忽略 */ }
  if (master) master.gain.value = value ? 0 : getVolume();
  return value;
}

export function getVolume() {
  if (typeof window === 'undefined') return 1;
  try {
    const raw = localStorage.getItem(VOLUME_KEY);
    if (raw === null) return 1;
    const value = Number(raw);
    return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
  } catch {
    return 1;
  }
}

export function setVolume(value: number) {
  const clamped = Math.min(1, Math.max(0, value));
  try { localStorage.setItem(VOLUME_KEY, String(clamped)); } catch { /* 忽略 */ }
  if (master && !isMuted()) master.gain.value = clamped;
  return clamped;
}

/** 一记打击音:一个快速衰减的振荡器 */
function ping(freq: number, duration: number, volume: number, type: OscillatorType = 'triangle') {
  const ac = audio();
  if (!ac || !master) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ac.currentTime);
  osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.55), ac.currentTime + duration);
  gain.gain.setValueAtTime(volume, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + duration);
  osc.connect(gain);
  gain.connect(master);
  osc.start();
  osc.stop(ac.currentTime + duration + 0.02);
}

/** 一撮噪声,过一道低通,用来做木头/皮革那种钝响 */
function thud(duration: number, volume: number, cutoff: number) {
  const ac = audio();
  if (!ac || !master || !noise) return;
  const source = ac.createBufferSource();
  source.buffer = noise;
  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(cutoff, ac.currentTime);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(volume, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  source.start();
  source.stop(ac.currentTime + duration + 0.02);
}

/** speed 是碰撞时的相对速度(px/s),用它连续控制音高和音量 */
function loudness(speed: number, max: number) {
  return Math.min(max, 0.02 + (speed / 1400) * max);
}

export const sfx = {
  /** 出杆:皮头打在球上,力度越大越脆 */
  cue(power: number) {
    ping(240 + power * 260, 0.06, 0.06 + power * 0.1, 'square');
    thud(0.08, 0.05 + power * 0.08, 1800);
  },
  /** 球撞球 */
  collide(speed: number) {
    const level = loudness(speed, 0.22);
    ping(1500 + Math.min(1200, speed * 0.9), 0.045, level, 'triangle');
    thud(0.03, level * 0.4, 5200);
  },
  /** 撞库:同样是硬碰,但库皮把高频吃掉了 */
  cushion(speed: number) {
    const level = loudness(speed, 0.14);
    ping(320 + Math.min(260, speed * 0.2), 0.07, level * 0.7, 'sine');
    thud(0.07, level, 900);
  },
  /** 落袋:一记闷响加袋内的滚动 */
  pot() {
    thud(0.16, 0.16, 700);
    ping(180, 0.22, 0.1, 'sine');
    window.setTimeout(() => thud(0.12, 0.06, 500), 90);
  },
  /** 犯规提示 */
  foul() {
    ping(320, 0.12, 0.12, 'sawtooth');
    window.setTimeout(() => ping(240, 0.18, 0.1, 'sawtooth'), 110);
  },
  ui() {
    ping(880, 0.05, 0.07, 'triangle');
  },
  win() {
    [523, 659, 784, 1047].forEach((freq, i) => window.setTimeout(() => ping(freq, 0.24, 0.12, 'triangle'), i * 110));
  },
  lose() {
    [392, 330, 262].forEach((freq, i) => window.setTimeout(() => ping(freq, 0.3, 0.11, 'sine'), i * 150));
  },
};
