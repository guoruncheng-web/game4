const ROOT = '/fruit-slasher/assets/audio';

const NAMES = ['whoosh', 'slice', 'combo', 'miss', 'bomb', 'ui', 'new-best'] as const;
type SfxName = (typeof NAMES)[number];

/**
 * 音效走 WebAudio,不用 HTMLAudioElement。
 *
 * 之前每个音效维护 2~3 个 <audio> 实例轮着 play():
 * 1. 第一次响起来才去下载 wav(bomb.wav 有 512KB),正好卡在切中炸弹那一帧;
 * 2. 每次 play() 都要走一遍媒体元素管线(pause → seek → play 的 Promise),
 *    切水果这种一秒好几次的高频音在主线程上攒出可感知的掉帧。
 * 现在改成开局解码一次成 AudioBuffer,之后每声只是新建一个 BufferSource,
 * 调度全在音频线程上,主线程几乎零开销。
 */
let ctx: AudioContext | null = null;
const buffers = new Map<string, AudioBuffer>();
const loading = new Set<string>();
let lastWhoosh = 0;

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try { ctx = new Ctor(); } catch { return null; }
  }
  // 自动播放策略:首次真正发声一般发生在玩家点过屏幕之后,这里顺手唤醒
  // 还没有用户手势时 resume() 会被拒绝,这里必须自己吞掉,别抛成未处理的 rejection
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  return ctx;
}

function load(name: string) {
  if (buffers.has(name) || loading.has(name)) return;
  const ac = context();
  if (!ac) return;
  loading.add(name);
  void fetch(`${ROOT}/${name}.wav`)
    .then((res) => res.arrayBuffer())
    .then((raw) => ac.decodeAudioData(raw))
    .then((buffer) => { buffers.set(name, buffer); })
    .catch(() => undefined)
    .finally(() => loading.delete(name));
}

/** Boot 阶段调用:把全部音效提前下载并解码好,避免开局后第一次发声时卡一下 */
export function warmupSfx() {
  for (const name of NAMES) load(name);
}

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

function play(name: SfxName, volume: number, playbackRate = 1) {
  if (muted()) return;
  const master = getVolume();
  if (master <= 0) return;
  const ac = context();
  if (!ac) return;
  const buffer = buffers.get(name);
  // 还没解码完就悄悄跳过这一声,绝不在这里等 —— 宁可少响一次也不要卡帧
  if (!buffer) { load(name); return; }
  const source = ac.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = playbackRate;
  const gain = ac.createGain();
  gain.gain.value = Math.min(1, volume * master);
  source.connect(gain);
  gain.connect(ac.destination);
  source.start();
  source.onended = () => { source.disconnect(); gain.disconnect(); };
}

export const sfx = {
  whoosh(speed: number) {
    const now = performance.now();
    if (now - lastWhoosh < 130 || speed < 220) return;
    lastWhoosh = now;
    play('whoosh', 0.07, Math.min(1.05, 0.78 + speed / 4200));
  },
  slice(pitch = 1) {
    play('slice', 0.14, pitch * 0.92);
  },
  combo(count: number) {
    play('combo', 0.085, Math.min(1.08, 0.9 + count * 0.018));
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
