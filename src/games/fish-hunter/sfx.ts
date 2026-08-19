/**
 * 音效。先用 WebAudio 振荡器合成,和盒子里其他游戏一致。
 * DESIGN.md §7 规划了后续换 rFXGen 产出的 wav,那时只要替换这里的实现,
 * 调用点(play('fire') 之类)保持不变。
 *
 * AudioContext 必须在用户手势之后才能出声,所以统一走懒初始化 —— 第一次开炮
 * 就是那个手势。
 */

type Sound = 'fire' | 'pop' | 'catch' | 'jackpot' | 'deny' | 'coin';

let ctx: AudioContext | null = null;
let muted = false;

function audio(): AudioContext | null {
  if (muted) return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) { muted = true; return null; }
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(
  type: OscillatorType, from: number, to: number, dur: number, gain: number, delay = 0,
): void {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const vol = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
  vol.gain.setValueAtTime(0.0001, t0);
  vol.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  vol.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(vol).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** 噪声。网炸开、水花这类没有音高的声音 */
function noise(dur: number, gain: number, cutoff: number): void {
  const ac = audio();
  if (!ac) return;
  const frames = Math.floor(ac.sampleRate * dur);
  const buffer = ac.createBuffer(1, frames, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = cutoff;
  const vol = ac.createGain();
  vol.gain.value = gain;
  src.connect(filter).connect(vol).connect(ac.destination);
  src.start();
}

export function play(sound: Sound): void {
  switch (sound) {
    case 'fire':
      tone('square', 620, 240, 0.09, 0.05);
      break;
    case 'pop':
      noise(0.18, 0.09, 2200);
      break;
    case 'catch':
      tone('triangle', 720, 1180, 0.12, 0.07);
      tone('triangle', 1080, 1560, 0.1, 0.05, 0.06);
      break;
    case 'jackpot':
      // 大鱼入账要明显不同 —— 这是这类游戏的记忆点,不能和小鱼共用一个音
      [0, 0.09, 0.18, 0.28].forEach((d, i) => tone('triangle', 520 + i * 190, 900 + i * 240, 0.16, 0.08, d));
      break;
    case 'coin':
      tone('sine', 1400, 2000, 0.06, 0.035);
      break;
    case 'deny':
      tone('sawtooth', 180, 90, 0.14, 0.045);
      break;
    default:
      break;
  }
}
