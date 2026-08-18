#!/usr/bin/env node
/**
 * 霓虹突击音效生成 —— 用 rFXGen(raysan5, sfxr 系)出音,不再用采样式 AI 生成。
 *
 * 流程:
 *   1. 本脚本把每个音效的每一层写成 rFXGen 原生的 .rfx 参数文件(presets/ 下,进仓库);
 *   2. 调 rFXGen 命令行把每层渲染成 44100/16bit/mono 的 wav;
 *   3. 本脚本把各层按增益混起来、峰值归一化、加 2ms 淡入淡出,
 *      写到 public/neon-strike/assets/audio/<name>.wav。
 *
 * 为什么要分层:rFXGen 单个音是 8-bit 味的单薄合成音,爆炸/中弹这类需要"肉",
 * 于是每个冲击音都垫一层低频正弦 sub;金属碎裂另起一层方波。混音在这里做,
 * 运行时就只有一个 buffer,不用在 WebAudio 里叠。
 *
 * 用法(需要能访问到 rFXGen 二进制):
 *   node tools/audio/neon-strike/build_sfx.mjs --rfxgen /path/to/rfxgen
 *   node tools/audio/neon-strike/build_sfx.mjs --ssh mac@192.168.64.1   # 在 Mac 上远程渲染
 *
 * 想手调音色:用 rFXGen GUI 打开 presets/*.rfx,拖参数,存回原文件,再跑一遍本脚本。
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../../..');
const PRESETS = join(HERE, 'presets');
const OUT = join(ROOT, 'public/neon-strike/assets/audio');
const WORK = join(HERE, '.work');

const MAC_RFXGEN = '~/Applications/rFXGen/rfxgen_v5.0_macos/rfxgen.app/Contents/MacOS/rfxgen';

// ---------------------------------------------------------------- 参数模型
/** WaveParams 字段顺序,和 rfxgen.h 里的结构体一一对应(2 个 int + 22 个 float = 96 字节) */
const FIELDS = [
  'randSeed', 'waveType',
  'attackTime', 'sustainTime', 'sustainPunch', 'decayTime',
  'startFrequency', 'minFrequency', 'slide', 'deltaSlide', 'vibratoDepth', 'vibratoSpeed',
  'changeAmount', 'changeSpeed',
  'squareDuty', 'dutySweep',
  'repeatSpeed',
  'phaserOffset', 'phaserSweep',
  'lpfCutoff', 'lpfCutoffSweep', 'lpfResonance', 'hpfCutoff', 'hpfCutoffSweep',
];

/** rFXGen ResetWaveParams() 的默认值;randSeed 固定,保证每次生成的噪声完全一样 */
const DEFAULTS = {
  randSeed: 0x4e53, waveType: 0,
  attackTime: 0, sustainTime: 0.3, sustainPunch: 0, decayTime: 0.4,
  startFrequency: 0.3, minFrequency: 0, slide: 0, deltaSlide: 0, vibratoDepth: 0, vibratoSpeed: 0,
  changeAmount: 0, changeSpeed: 0,
  squareDuty: 0, dutySweep: 0,
  repeatSpeed: 0,
  phaserOffset: 0, phaserSweep: 0,
  lpfCutoff: 1, lpfCutoffSweep: 0, lpfResonance: 0, hpfCutoff: 0, hpfCutoffSweep: 0,
};

const SQUARE = 0, SAW = 1, SINE = 2, NOISE = 3;

/**
 * 写一个 .rfx:8 字节头("rFX " + version 200 + 96) + 96 字节 WaveParams。
 *
 * 注意 rFXGen 生成时有一句保护:slide < deltaSlide 就把 slide 顶成 deltaSlide。
 * 所以凡是要往下扫频(slide 为负)的层,deltaSlide 必须 ≤ slide,否则下扫会被抹平成 0。
 */
function writeRfx(path, params) {
  const p = { ...DEFAULTS, ...params };
  if (p.slide < p.deltaSlide) throw new Error(`${path}: deltaSlide 必须 ≤ slide,否则 rFXGen 会把 slide 清零`);
  const buf = Buffer.alloc(8 + 96);
  buf.write('rFX ', 0, 'ascii');
  buf.writeUInt16LE(200, 4);
  buf.writeUInt16LE(96, 6);
  FIELDS.forEach((name, i) => {
    const at = 8 + i * 4;
    if (i < 2) buf.writeInt32LE(p[name], at);
    else buf.writeFloatLE(p[name], at);
  });
  writeFileSync(path, buf);
}

// ---------------------------------------------------------------- 音效定义
/** gain 是这一层在混音里的相对音量;at 是这一层在整条音效里的起始秒数;peak 是最终归一化到的峰值 */
const SOUNDS = [
  {
    name: 'shoot', peak: 0.55,
    // 等离子脉冲:锯齿快速下扫出"啾",底下垫 sub 给推力
    layers: [
      { gain: 1, params: { waveType: SAW, startFrequency: 0.50, minFrequency: 0.10, slide: -0.38, deltaSlide: -0.38,
        sustainTime: 0.12, sustainPunch: 0.42, decayTime: 0.22,
        lpfCutoff: 0.62, lpfResonance: 0.22, hpfCutoff: 0.08, phaserOffset: 0.12, phaserSweep: -0.18 } },
      { gain: 0.75, params: { waveType: SINE, startFrequency: 0.16, slide: -0.30, deltaSlide: -0.30,
        sustainTime: 0.10, sustainPunch: 0.50, decayTime: 0.20, lpfCutoff: 0.35 } },
    ],
  },
  {
    name: 'enemy-hit', peak: 0.80,
    // 敌机爆碎:带通感噪声 + 低频肉 + 一点金属方波尾
    layers: [
      { gain: 1, params: { waveType: NOISE, startFrequency: 0.42, slide: -0.28, deltaSlide: -0.28,
        attackTime: 0.01, sustainTime: 0.14, sustainPunch: 0.50, decayTime: 0.36,
        lpfCutoff: 0.50, lpfCutoffSweep: -0.12, lpfResonance: 0.15, hpfCutoff: 0.05 } },
      { gain: 0.90, params: { waveType: SINE, startFrequency: 0.13, slide: -0.20, deltaSlide: -0.20,
        sustainTime: 0.06, sustainPunch: 0.55, decayTime: 0.32, lpfCutoff: 0.30 } },
      { gain: 0.45, params: { waveType: SQUARE, startFrequency: 0.30, slide: -0.35, deltaSlide: -0.35,
        sustainTime: 0.04, decayTime: 0.14, squareDuty: 0.35, dutySweep: -0.30, lpfCutoff: 0.55 } },
    ],
  },
  {
    name: 'pickup', peak: 0.60,
    // 拾取:方波 + 一次上行 arpeggio,底下一层短 sub 免得太"塑料"
    layers: [
      { gain: 1, params: { waveType: SQUARE, startFrequency: 0.46, sustainTime: 0.06, sustainPunch: 0.30,
        decayTime: 0.30, changeAmount: 0.36, changeSpeed: 0.62, squareDuty: 0.30, lpfCutoff: 0.85 } },
      { gain: 0.50, params: { waveType: SINE, startFrequency: 0.18, sustainTime: 0.05, decayTime: 0.20,
        lpfCutoff: 0.50 } },
    ],
  },
  {
    name: 'player-hurt', peak: 0.90,
    // 中弹:低锯齿 + 共振低通做闷响,噪声层只做冲击瞬间
    layers: [
      { gain: 1, params: { waveType: SAW, startFrequency: 0.24, slide: -0.22, deltaSlide: -0.22,
        attackTime: 0.005, sustainTime: 0.10, sustainPunch: 0.50, decayTime: 0.38,
        lpfCutoff: 0.28, lpfResonance: 0.35 } },
      { gain: 0.60, params: { waveType: NOISE, startFrequency: 0.30, slide: -0.25, deltaSlide: -0.25,
        sustainTime: 0.07, decayTime: 0.26, lpfCutoff: 0.32 } },
    ],
  },
  {
    name: 'boss-warning', peak: 0.85,
    // Boss 警报:三声下沉的低频脉冲。
    // 不用 rFXGen 自带的 repeatSpeed —— 它只复位音高、不复位音量包络,听起来是一条连续的长音;
    // 真正的"三下"必须是三段独立的音,所以这里渲三个逐次降调的脉冲,再按 0.36s 的间隔摆位。
    layers: [0, 1, 2].flatMap((i) => [
      { gain: 1, at: i * 0.36, params: { waveType: SAW, startFrequency: 0.17 - i * 0.010,
        attackTime: 0.03, sustainTime: 0.18, sustainPunch: 0.30, decayTime: 0.32,
        vibratoDepth: 0.10, vibratoSpeed: 0.35, lpfCutoff: 0.32, lpfResonance: 0.25 } },
      { gain: 0.80, at: i * 0.36, params: { waveType: SINE, startFrequency: 0.11 - i * 0.006,
        attackTime: 0.02, sustainTime: 0.18, decayTime: 0.32, lpfCutoff: 0.25 } },
    ]),
  },
  {
    name: 'ui', peak: 0.45,
    // 界面确认:极短方波点击
    layers: [
      { gain: 1, params: { waveType: SQUARE, startFrequency: 0.58, slide: -0.12, deltaSlide: -0.12,
        sustainTime: 0.08, sustainPunch: 0.20, decayTime: 0.16, squareDuty: 0.45, lpfCutoff: 0.75 } },
    ],
  },
];

// ---------------------------------------------------------------- wav 读写
function readWavMono16(path) {
  const buf = readFileSync(path);
  if (buf.toString('ascii', 0, 4) !== 'RIFF') throw new Error(`${path} 不是 wav`);
  let at = 12, fmt = null, data = null;
  while (at + 8 <= buf.length) {
    const id = buf.toString('ascii', at, at + 4);
    const size = buf.readUInt32LE(at + 4);
    const body = buf.subarray(at + 8, at + 8 + size);
    if (id === 'fmt ') fmt = { channels: body.readUInt16LE(2), rate: body.readUInt32LE(4), bits: body.readUInt16LE(14) };
    if (id === 'data') data = body;
    at += 8 + size + (size % 2);
  }
  if (!fmt || !data) throw new Error(`${path} 缺 fmt/data 块`);
  if (fmt.bits !== 16 || fmt.channels !== 1) throw new Error(`${path} 期望 16bit mono,实际 ${fmt.bits}bit ${fmt.channels}ch`);
  const out = new Float32Array(data.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = data.readInt16LE(i * 2) / 32768;
  return { rate: fmt.rate, samples: out };
}

function writeWavMono16(path, rate, samples) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write('WAVEfmt ', 8, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);          // PCM
  buf.writeUInt16LE(1, 22);          // mono
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  writeFileSync(path, buf);
}

// ---------------------------------------------------------------- 渲染
const argv = process.argv.slice(2);
const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const ssh = flag('--ssh');
const local = flag('--rfxgen');
if (!ssh && !local) {
  console.error('用法: --rfxgen <rfxgen 可执行文件> 或 --ssh <user@host>(在远端 Mac 上渲染)');
  process.exit(1);
}

mkdirSync(PRESETS, { recursive: true });
mkdirSync(WORK, { recursive: true });
mkdirSync(OUT, { recursive: true });

const jobs = [];
for (const sound of SOUNDS) {
  sound.layers.forEach((layer, i) => {
    const id = sound.layers.length > 1 ? `${sound.name}-${i + 1}` : sound.name;
    writeRfx(join(PRESETS, `${id}.rfx`), layer.params);
    jobs.push(id);
  });
}
console.log(`写出 ${jobs.length} 个 .rfx 预设 → ${PRESETS}`);

if (ssh) {
  const remote = '/tmp/neon-strike-rfx';
  const sh = (cmd) => execFileSync('ssh', ['-o', 'BatchMode=yes', ssh, cmd], { stdio: ['ignore', 'inherit', 'inherit'] });
  sh(`rm -rf ${remote} && mkdir -p ${remote}`);
  execFileSync('scp', ['-q', '-o', 'BatchMode=yes', ...jobs.map((id) => join(PRESETS, `${id}.rfx`)), `${ssh}:${remote}/`]);
  sh(`cd ${remote} && for f in *.rfx; do ${MAC_RFXGEN} --input "$f" --output "\${f%.rfx}.wav" --format 44100,16,1 >/dev/null; done`);
  execFileSync('scp', ['-q', '-o', 'BatchMode=yes', `${ssh}:${remote}/*.wav`, `${WORK}/`], { shell: false });
} else {
  for (const id of jobs) {
    execFileSync(local, ['--input', join(PRESETS, `${id}.rfx`), '--output', join(WORK, `${id}.wav`), '--format', '44100,16,1'],
      { stdio: ['ignore', 'ignore', 'inherit'] });
  }
}

// ---------------------------------------------------------------- 混音
for (const sound of SOUNDS) {
  const rendered = sound.layers.map((layer, i) => ({
    gain: layer.gain,
    at: layer.at ?? 0,
    wav: readWavMono16(join(WORK, `${sound.layers.length > 1 ? `${sound.name}-${i + 1}` : sound.name}.wav`)),
  }));
  const rate = rendered[0].wav.rate;
  const length = Math.max(...rendered.map((r) => Math.round(r.at * rate) + r.wav.samples.length));
  const mix = new Float32Array(length);
  for (const { gain, at, wav } of rendered) {
    const offset = Math.round(at * rate);
    for (let i = 0; i < wav.samples.length; i++) mix[offset + i] += wav.samples[i] * gain;
  }
  // 峰值归一化到设计音量,各音效之间的相对响度由 peak 决定
  let max = 0;
  for (const v of mix) max = Math.max(max, Math.abs(v));
  const scale = max > 0 ? sound.peak / max : 1;
  // 首尾各 2ms 淡入淡出,消掉 DC 跳变引起的咔哒声
  const fade = Math.round(rate * 0.002);
  for (let i = 0; i < length; i++) {
    let g = scale;
    if (i < fade) g *= i / fade;
    if (i > length - fade) g *= (length - i) / fade;
    mix[i] *= g;
  }
  writeWavMono16(join(OUT, `${sound.name}.wav`), rate, mix);
  console.log(`✔ ${sound.name}.wav  ${(length / rate).toFixed(2)}s  ${sound.layers.length} 层  peak ${sound.peak}`);
}

rmSync(WORK, { recursive: true, force: true });
console.log(`\n输出目录: ${OUT}`);
