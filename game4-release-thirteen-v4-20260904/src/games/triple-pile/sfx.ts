/**
 * WebAudio 合成音效,零音频文件。
 *
 * 其中「槽位告急」是唯一的听觉预警,它必须存在:玩家的视线全程在锅里,
 * 不会一直盯着槽位条,而「占到 6 格」这件事需要一个不占视线的通道来告知。
 */

import { isMuted, masterVolume } from './storage';

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  // 首次交互前浏览器会把 AudioContext 挂起,拾取时顺手恢复
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function gainFor(now: number, volume: number, attack: number, duration: number): GainNode | null {
  const a = audio();
  if (!a) return null;
  const gain = a.createGain();
  const peak = volume * masterVolume();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), now + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  gain.connect(a.destination);
  return gain;
}

function tone(freq: number, duration: number, type: OscillatorType, volume: number, delay = 0, slideTo?: number) {
  if (isMuted()) return;
  const a = audio();
  if (!a) return;
  const now = a.currentTime + delay;
  const gain = gainFor(now, volume, 0.008, duration);
  if (!gain) return;
  const osc = a.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, now + duration);
  osc.connect(gain);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

function noise(duration: number, volume: number, delay = 0, lowpass = 1200) {
  if (isMuted()) return;
  const a = audio();
  if (!a) return;
  const now = a.currentTime + delay;
  const frames = Math.max(1, Math.floor(a.sampleRate * duration));
  const buffer = a.createBuffer(1, frames, a.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  const src = a.createBufferSource();
  src.buffer = buffer;
  const filter = a.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = lowpass;
  const gain = gainFor(now, volume, 0.005, duration);
  if (!gain) return;
  src.connect(filter).connect(gain);
  src.start(now);
}

/** 拾取:短促的木质"笃" */
export function sfxPick() {
  tone(480, 0.06, 'triangle', 0.22);
}

/** 入槽:极短的"嗒" */
export function sfxSlot() {
  tone(320, 0.04, 'square', 0.12);
}

/** 三消:上行三音 C5-E5-G5 + 尾部白噪爆音 */
export function sfxClear() {
  tone(523.25, 0.12, 'sine', 0.24, 0);
  tone(659.25, 0.12, 'sine', 0.24, 0.07);
  tone(783.99, 0.20, 'sine', 0.26, 0.14);
  noise(0.18, 0.10, 0.14, 3200);
}

/** 塌落:低频闷响,音量随塌落物件数缩放 */
export function sfxTumble(strength: number) {
  const v = Math.min(0.06 + strength * 0.05, 0.26);
  tone(120, 0.18, 'sine', v);
  noise(0.14, v * 0.6, 0, 500);
}

/**
 * 食材落进汤里:一声闷响的「咚」+ 一层水花噪声。
 * strength 0~1,轻轻滑进去和整个砸下去不该是同一个动静。
 */
export function sfxSplash(strength: number) {
  const v = 0.06 + Math.min(strength, 1) * 0.16;
  tone(210 - strength * 60, 0.12, 'sine', v, 0, 90);
  noise(0.10 + strength * 0.06, v * 0.7, 0.01, 1800);
}

export function sfxPowerup() {
  tone(300, 0.2, 'triangle', 0.2, 0, 900);
}

/** 槽位告急:低频脉冲 */
export function sfxWarn() {
  tone(180, 0.12, 'sine', 0.16);
}

export function sfxFail() {
  tone(392, 0.25, 'sine', 0.22, 0);
  tone(311, 0.25, 'sine', 0.22, 0.16);
  tone(233, 0.6, 'sine', 0.24, 0.32);
}

export function sfxWin() {
  [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => {
    tone(f, 0.28, 'triangle', 0.2, i * 0.09);
  });
}

/** 卸载时关掉,不然反复进出游戏页会堆积 AudioContext */
export function closeSfx() {
  if (!ctx) return;
  void ctx.close().catch(() => { /* 已经关了就算了 */ });
  ctx = null;
}
