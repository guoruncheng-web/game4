#!/usr/bin/env node
/**
 * Ludo 核心音效生成器。写出 rFXGen 原生预设并无 GUI 渲染为 44.1kHz/16bit/mono WAV。
 *
 * 用法：
 *   node tools/audio/ludo/build_sfx.mjs --rfxgen /path/to/rfxgen
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const PRESETS = join(HERE, 'presets');
const OUT = join(ROOT, 'public/ludo/audio');

const FIELDS = [
  'randSeed', 'waveType',
  'attackTime', 'sustainTime', 'sustainPunch', 'decayTime',
  'startFrequency', 'minFrequency', 'slide', 'deltaSlide', 'vibratoDepth', 'vibratoSpeed',
  'changeAmount', 'changeSpeed', 'squareDuty', 'dutySweep', 'repeatSpeed',
  'phaserOffset', 'phaserSweep', 'lpfCutoff', 'lpfCutoffSweep', 'lpfResonance',
  'hpfCutoff', 'hpfCutoffSweep',
];

const DEFAULTS = {
  randSeed: 0x4c55444f, waveType: 0,
  attackTime: 0, sustainTime: 0.18, sustainPunch: 0, decayTime: 0.24,
  startFrequency: 0.3, minFrequency: 0, slide: 0, deltaSlide: 0,
  vibratoDepth: 0, vibratoSpeed: 0, changeAmount: 0, changeSpeed: 0,
  squareDuty: 0, dutySweep: 0, repeatSpeed: 0, phaserOffset: 0, phaserSweep: 0,
  lpfCutoff: 1, lpfCutoffSweep: 0, lpfResonance: 0, hpfCutoff: 0, hpfCutoffSweep: 0,
};

const SQUARE = 0;
const SAW = 1;
const SINE = 2;
const NOISE = 3;

const SOUNDS = {
  // 开局拼图：四块彩色面板高速掠入，明亮空气感，不做沉重机械声。
  'intro-piece-sweep': { waveType: NOISE, attackTime: 0.015, sustainTime: 0.2, sustainPunch: 0.18, decayTime: 0.28,
    startFrequency: 0.7, slide: -0.22, deltaSlide: -0.22, lpfCutoff: 0.68, lpfCutoffSweep: -0.25, hpfCutoff: 0.18 },
  // VS 爆点三层：低频重量、塑料/能量裂响、高频金色闪光。
  'intro-vs-sub': { waveType: SINE, sustainTime: 0.12, sustainPunch: 0.92, decayTime: 0.55,
    startFrequency: 0.22, slide: -0.28, deltaSlide: -0.28, lpfCutoff: 0.36 },
  'intro-vs-crack': { waveType: NOISE, sustainTime: 0.045, sustainPunch: 0.96, decayTime: 0.28,
    startFrequency: 0.65, slide: -0.42, deltaSlide: -0.42, lpfCutoff: 0.65, hpfCutoff: 0.12 },
  'intro-vs-spark': { waveType: SQUARE, attackTime: 0.005, sustainTime: 0.08, sustainPunch: 0.34, decayTime: 0.52,
    startFrequency: 0.72, slide: 0.18, changeAmount: 0.25, changeSpeed: 0.46,
    squareDuty: 0.22, lpfCutoff: 0.82, hpfCutoff: 0.22 },
  // 骰子下落、落桌和滚动分别拆层，便于和动画关键帧独立对齐。
  'intro-dice-fall': { waveType: NOISE, attackTime: 0.06, sustainTime: 0.3, sustainPunch: 0.15, decayTime: 0.4,
    startFrequency: 0.48, slide: -0.1, deltaSlide: -0.1, lpfCutoff: 0.5, lpfCutoffSweep: 0.12, hpfCutoff: 0.12 },
  'intro-dice-land-body': { waveType: SINE, sustainTime: 0.055, sustainPunch: 0.95, decayTime: 0.4,
    startFrequency: 0.2, slide: -0.38, deltaSlide: -0.38, lpfCutoff: 0.4 },
  'intro-dice-land-click': { waveType: NOISE, sustainTime: 0.03, sustainPunch: 0.9, decayTime: 0.14,
    startFrequency: 0.55, slide: -0.24, deltaSlide: -0.24, lpfCutoff: 0.56, hpfCutoff: 0.2 },
  'intro-dice-spin': { waveType: NOISE, attackTime: 0.025, sustainTime: 0.95, sustainPunch: 0.12, decayTime: 0.65,
    startFrequency: 0.36, slide: -0.08, deltaSlide: -0.08, repeatSpeed: 0.18,
    lpfCutoff: 0.3, lpfCutoffSweep: -0.06, hpfCutoff: 0.1 },
  'intro-dice-six': { waveType: SINE, attackTime: 0.005, sustainTime: 0.12, sustainPunch: 0.38, decayTime: 0.5,
    startFrequency: 0.58, slide: 0.08, changeAmount: 0.3, changeSpeed: 0.48,
    vibratoDepth: 0.025, vibratoSpeed: 0.38, lpfCutoff: 0.82 },
  // 木质骰子杯里的一次短滚动：噪声快速变暗，避免听成爆炸。
  'dice-roll': { waveType: NOISE, sustainTime: 0.16, sustainPunch: 0.32, decayTime: 0.32,
    startFrequency: 0.42, slide: -0.16, deltaSlide: -0.16, repeatSpeed: 0.48,
    lpfCutoff: 0.38, lpfCutoffSweep: -0.12, hpfCutoff: 0.08 },
  // 棋子落格：圆润的中低频木块点击。
  'piece-step': { waveType: SINE, sustainTime: 0.055, sustainPunch: 0.48, decayTime: 0.15,
    startFrequency: 0.28, slide: -0.22, deltaSlide: -0.22, lpfCutoff: 0.56 },
  // 撞子：更重、更短的冲击，带一点噪声质感。
  'piece-capture': { waveType: NOISE, sustainTime: 0.09, sustainPunch: 0.7, decayTime: 0.3,
    startFrequency: 0.34, slide: -0.3, deltaSlide: -0.3, lpfCutoff: 0.3, lpfResonance: 0.2 },
  // 进入终点道：清晰上扬的方波提示。
  'home-lane': { waveType: SQUARE, sustainTime: 0.1, sustainPunch: 0.3, decayTime: 0.3,
    startFrequency: 0.48, slide: 0.12, changeAmount: 0.28, changeSpeed: 0.55,
    squareDuty: 0.35, lpfCutoff: 0.76 },
  // 到家：明亮的短促双音感。
  'piece-home': { waveType: SINE, sustainTime: 0.14, sustainPunch: 0.38, decayTime: 0.42,
    startFrequency: 0.55, slide: 0.1, changeAmount: 0.34, changeSpeed: 0.48,
    vibratoDepth: 0.04, vibratoSpeed: 0.42 },
  // 胜利：较长的上行电玩庆祝音。
  victory: { waveType: SQUARE, attackTime: 0.02, sustainTime: 0.42, sustainPunch: 0.42, decayTime: 0.72,
    startFrequency: 0.4, slide: 0.11, changeAmount: 0.44, changeSpeed: 0.62,
    squareDuty: 0.25, dutySweep: 0.12, vibratoDepth: 0.05, vibratoSpeed: 0.4,
    lpfCutoff: 0.78 },
  // 玩家进房：不打断聊天的轻提示。
  'room-join': { waveType: SAW, sustainTime: 0.07, sustainPunch: 0.2, decayTime: 0.24,
    startFrequency: 0.46, slide: 0.08, changeAmount: 0.22, changeSpeed: 0.58,
    lpfCutoff: 0.62, hpfCutoff: 0.05 },
};

function writePreset(path, params) {
  const values = { ...DEFAULTS, ...params };
  if (values.slide < values.deltaSlide) throw new Error(`${path}: deltaSlide 必须小于等于 slide`);
  const buffer = Buffer.alloc(104);
  buffer.write('rFX ', 0, 'ascii');
  buffer.writeUInt16LE(200, 4);
  buffer.writeUInt16LE(96, 6);
  FIELDS.forEach((field, index) => {
    const offset = 8 + index * 4;
    if (index < 2) buffer.writeInt32LE(values[field], offset);
    else buffer.writeFloatLE(values[field], offset);
  });
  writeFileSync(path, buffer);
}

const args = process.argv.slice(2);
const flagIndex = args.indexOf('--rfxgen');
if (flagIndex < 0 || !args[flagIndex + 1]) {
  console.error('用法：--rfxgen <rFXGen 可执行文件>');
  process.exit(1);
}
const rfxgen = args[flagIndex + 1];

mkdirSync(PRESETS, { recursive: true });
mkdirSync(OUT, { recursive: true });
for (const [name, params] of Object.entries(SOUNDS)) {
  const preset = join(PRESETS, `${name}.rfx`);
  const wav = join(OUT, `${name}.wav`);
  writePreset(preset, params);
  execFileSync(rfxgen, ['--input', preset, '--output', wav, '--format', '44100,16,1'], { stdio: 'inherit' });
  console.log(`EXPORTED ${wav}`);
}
