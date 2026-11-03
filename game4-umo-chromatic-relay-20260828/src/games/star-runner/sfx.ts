/**
 * 极简 WebAudio 音效,不需要任何音频文件。
 */
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

type Tone = {
  freq: number;
  to?: number;
  duration?: number;
  type?: OscillatorType;
  volume?: number;
};

export function tone({ freq, to, duration = 0.12, type = 'square', volume = 0.06 }: Tone) {
  if (typeof localStorage !== 'undefined' && localStorage.getItem('game-box-muted') === 'true') {
    return;
  }
  const ac = audio();
  if (!ac) return;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ac.currentTime);
  if (to !== undefined) osc.frequency.exponentialRampToValueAtTime(to, ac.currentTime + duration);
  gain.gain.setValueAtTime(volume, ac.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start();
  osc.stop(ac.currentTime + duration);
}

export const sfx = {
  jump: () => tone({ freq: 320, to: 620, duration: 0.14 }),
  collect: () => tone({ freq: 880, to: 1320, duration: 0.12, type: 'triangle', volume: 0.08 }),
  hurt: () => tone({ freq: 260, to: 80, duration: 0.3, type: 'sawtooth', volume: 0.08 }),
  levelUp: () => {
    tone({ freq: 523, duration: 0.1, type: 'triangle', volume: 0.08 });
    setTimeout(() => tone({ freq: 784, duration: 0.16, type: 'triangle', volume: 0.08 }), 110);
  },
  gameOver: () => tone({ freq: 200, to: 60, duration: 0.7, type: 'sawtooth', volume: 0.09 }),
};
