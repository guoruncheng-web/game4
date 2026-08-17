/**
 * 霓虹突击音效 —— 纯 WebAudio 合成,不依赖任何音频文件。
 *
 * 上一版用 Stable Audio 生成的 wav 有三个问题:不够科幻、高频刺耳、低频没打击感。
 * 这三条在采样式生成里只能靠改 prompt 抽卡,在合成里则分别对应三组明确的参数:
 *
 * - 科幻感  → 锯齿/方波振荡器 + 快速下扫音高 + 轻微失谐产生的拍频
 * - 不刺耳  → 每层各自的低通 + 一道全局安全低通;噪声一律走带通,不用宽频白噪
 * - 打击感  → 每个冲击类音效都垫一层正弦低频下扫(sub),配 1~3ms 的极短 attack
 *
 * 想调手感直接改下面的常量,改完刷新即可,不需要重新生成资源。
 */

const MASTER = 0.55;
/** 全局安全低通:兜住所有音效里没压干净的高频毛刺 */
const SAFETY_HZ = 10500;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
let shaper: Float32Array<ArrayBuffer> | null = null;
let lastShoot = 0;

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
  if (master && ctx) master.gain.setTargetAtTime(MASTER * clamped, ctx.currentTime, 0.01);
  return clamped;
}

export function isMuted() {
  return typeof window !== 'undefined' && muted();
}

export function setMuted(value: boolean) {
  try { localStorage.setItem('game-box-muted', String(value)); } catch { /* 忽略 */ }
  return value;
}

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = MASTER * getVolume();
    const safety = ctx.createBiquadFilter();
    safety.type = 'lowpass';
    safety.frequency.value = SAFETY_HZ;
    safety.Q.value = 0.7;
    master.connect(safety).connect(ctx.destination);
  }
  // 首次交互前浏览器会把 context 挂起,每次播放都顺手唤醒一次
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/** 0.6 秒白噪声,所有爆裂/摩擦层共用一份 */
function getNoise(ac: AudioContext) {
  if (!noiseBuffer) {
    const length = Math.floor(ac.sampleRate * 0.6);
    noiseBuffer = ac.createBuffer(1, length, ac.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

/** 软削波曲线,给受伤音效做"破音"用 */
function getShaper() {
  if (!shaper) {
    shaper = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      shaper[i] = Math.tanh(x * 3.2);
    }
  }
  return shaper;
}

type Layer = {
  /** 波形;省略即为噪声层 */
  type?: OscillatorType;
  /** 起始频率 */
  f0: number;
  /** 终止频率,省略即不扫频 */
  f1?: number;
  /** 峰值音量(相对本音效的 peak) */
  gain: number;
  attack?: number;
  decay: number;
  /** 相对音效起点的延迟 */
  at?: number;
  /** 失谐(音分),两个振荡器差几音分会产生拍频,听感更"机械" */
  detune?: number;
  filter?: { type: BiquadFilterType; hz: number; to?: number; q?: number };
  /** 过软削波 */
  drive?: boolean;
};

function play(peak: number, layers: Layer[]) {
  if (muted()) return;
  const volume = getVolume();
  if (volume <= 0) return;
  const ac = audio();
  if (!ac || !master) return;
  const now = ac.currentTime;

  for (const layer of layers) {
    const t0 = now + (layer.at ?? 0);
    const attack = layer.attack ?? 0.002;
    const stop = t0 + attack + layer.decay;

    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(peak * layer.gain, 0.0002), t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, stop);

    let tail: AudioNode = gain;
    if (layer.filter) {
      const biquad = ac.createBiquadFilter();
      biquad.type = layer.filter.type;
      biquad.frequency.setValueAtTime(layer.filter.hz, t0);
      if (layer.filter.to !== undefined) {
        biquad.frequency.exponentialRampToValueAtTime(layer.filter.to, stop);
      }
      biquad.Q.value = layer.filter.q ?? 1;
      tail = tail.connect(biquad);
    }
    if (layer.drive) {
      const wave = ac.createWaveShaper();
      wave.curve = getShaper();
      tail = tail.connect(wave);
    }
    tail.connect(master);

    if (layer.type) {
      const osc = ac.createOscillator();
      osc.type = layer.type;
      osc.detune.value = layer.detune ?? 0;
      osc.frequency.setValueAtTime(layer.f0, t0);
      if (layer.f1 !== undefined) osc.frequency.exponentialRampToValueAtTime(layer.f1, stop);
      osc.connect(gain);
      osc.start(t0);
      osc.stop(stop + 0.02);
    } else {
      const src = ac.createBufferSource();
      src.buffer = getNoise(ac);
      src.playbackRate.value = 1;
      src.connect(gain);
      src.start(t0, Math.random() * 0.4);
      src.stop(stop + 0.02);
    }
  }
}

/** 每次射击轻微变调,避免连发时听成一条直线 */
function cents() {
  return (Math.random() * 2 - 1) * 45;
}

/**
 * 保留原来的接口:BootScene 会在加载页调用它。
 * 合成音效没有文件要下载,这里只负责建好 AudioContext 和噪声缓冲,永远不会失败。
 */
export async function preloadSfx(onProgress?: (loaded: number, total: number) => void) {
  const ac = audio();
  onProgress?.(1, 2);
  if (ac) getNoise(ac);
  onProgress?.(2, 2);
  return { failed: [] as string[] };
}

export const sfx = {
  /** 等离子脉冲:短、亮但不扎,底下垫一层 sub 给推力 */
  shoot() {
    const now = performance.now();
    if (now - lastShoot < 120) return;
    lastShoot = now;
    play(0.1, [
      { type: 'sine', f0: 190, f1: 62, gain: 0.55, attack: 0.001, decay: 0.085 },
      { type: 'sawtooth', f0: 940, f1: 180, gain: 1, attack: 0.001, decay: 0.1, detune: cents(),
        filter: { type: 'lowpass', hz: 5200, to: 1600, q: 1.1 } },
      { f0: 0, gain: 0.3, attack: 0.001, decay: 0.012,
        filter: { type: 'bandpass', hz: 2600, q: 1.3 } },
    ]);
  },

  /** 敌机爆碎:低频肉 + 带通噪声碎裂 + 一点金属尾 */
  hit: () => play(0.22, [
    { type: 'sine', f0: 155, f1: 42, gain: 0.9, attack: 0.001, decay: 0.2 },
    { f0: 0, gain: 0.7, attack: 0.002, decay: 0.22,
      filter: { type: 'bandpass', hz: 2400, to: 380, q: 1.1 } },
    { type: 'square', f0: 330, f1: 72, gain: 0.4, attack: 0.001, decay: 0.11,
      filter: { type: 'lowpass', hz: 3400, q: 0.9 } },
  ]),

  /** 拾取:三级上行,亮度靠高频而不是音量,顶部压在 7k 以内 */
  pickup: () => play(0.18, [
    { type: 'sine', f0: 130, gain: 0.5, attack: 0.004, decay: 0.16 },
    { type: 'triangle', f0: 523, gain: 0.9, attack: 0.002, decay: 0.075, at: 0,
      filter: { type: 'lowpass', hz: 7000, q: 0.8 } },
    { type: 'triangle', f0: 784, gain: 0.9, attack: 0.002, decay: 0.075, at: 0.075,
      filter: { type: 'lowpass', hz: 7000, q: 0.8 } },
    { type: 'sawtooth', f0: 1046, gain: 0.55, attack: 0.002, decay: 0.16, at: 0.15, detune: 6,
      filter: { type: 'lowpass', hz: 6200, q: 0.9 } },
  ]),

  /** 中弹:闷响 + 软削波破音,高频全部压掉,听感是"挨了一记"而不是"被扎了一下" */
  hurt: () => play(0.3, [
    { type: 'sine', f0: 210, f1: 44, gain: 1, attack: 0.001, decay: 0.32 },
    { type: 'sawtooth', f0: 150, f1: 58, gain: 0.5, attack: 0.002, decay: 0.28, drive: true,
      filter: { type: 'lowpass', hz: 900, q: 1.2 } },
    { f0: 0, gain: 0.42, attack: 0.001, decay: 0.16,
      filter: { type: 'bandpass', hz: 700, q: 0.8 } },
  ]),

  /** Boss 警报:三下失谐锯齿脉冲,压在 1.4k 以下,靠拍频出压迫感而不是靠亮度 */
  boss: () => play(0.26, [
    ...[0, 0.36, 0.72].flatMap((at, i) => [
      { type: 'sine' as OscillatorType, f0: 58 - i * 4, gain: 0.8, attack: 0.006, decay: 0.26, at },
      { type: 'sawtooth' as OscillatorType, f0: 112 - i * 6, gain: 0.62, attack: 0.02, decay: 0.26,
        at, detune: 7, filter: { type: 'lowpass' as BiquadFilterType, hz: 1400, q: 1.1 } },
      { type: 'sawtooth' as OscillatorType, f0: 112 - i * 6, gain: 0.62, attack: 0.02, decay: 0.26,
        at, detune: -7, filter: { type: 'lowpass' as BiquadFilterType, hz: 1400, q: 1.1 } },
    ]),
  ]),

  /** 界面确认:干净的方波点击,极短 */
  ui: () => play(0.16, [
    { type: 'square', f0: 1180, f1: 880, gain: 1, attack: 0.001, decay: 0.055,
      filter: { type: 'lowpass', hz: 5200, q: 0.9 } },
    { f0: 0, gain: 0.25, attack: 0.001, decay: 0.008,
      filter: { type: 'bandpass', hz: 3200, q: 1.4 } },
  ]),
};
