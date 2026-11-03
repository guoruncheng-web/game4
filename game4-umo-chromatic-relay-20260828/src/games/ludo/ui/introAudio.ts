import {
  DICE_DROP_DELAY_MS,
  DICE_SPIN_DURATION_MS,
  VS_IMPACT_DELAY_MS,
} from './introTiming';

type Cue = { at: number; src: string; volume: number; rate?: number; pan?: number };

const DICE_LAND_DELAY_MS = DICE_DROP_DELAY_MS + 520;

const CUES: Cue[] = [
  // 四块画面同时拼合，听觉上收束成左右两股掠入，避免复制四次造成梳状相位。
  { at: 0, src: '/ludo/audio/intro-piece-sweep.wav', volume: 0.2, rate: 0.94, pan: -0.68 },
  { at: 42, src: '/ludo/audio/intro-piece-sweep.wav', volume: 0.18, rate: 1.08, pan: 0.68 },
  // VS 是整段唯一的最大爆点：低频居中，裂响与星光略微展开。
  { at: VS_IMPACT_DELAY_MS, src: '/ludo/audio/intro-vs-sub.wav', volume: 0.34 },
  { at: VS_IMPACT_DELAY_MS, src: '/ludo/audio/intro-vs-crack.wav', volume: 0.3, pan: -0.12 },
  { at: VS_IMPACT_DELAY_MS + 18, src: '/ludo/audio/intro-vs-spark.wav', volume: 0.22, pan: 0.18 },
  { at: DICE_DROP_DELAY_MS, src: '/ludo/audio/intro-dice-fall.wav', volume: 0.11 },
  // 单颗骰子：一次有重量的触桌主体，随后触点间隔拉长、音量降低、音高变化。
  // 禁止使用连续密集滚动录音，否则听感会退化成骰盅摇动。
  { at: DICE_LAND_DELAY_MS, src: '/ludo/audio/intro-dice-land-body.wav', volume: 0.33 },
  { at: DICE_LAND_DELAY_MS, src: '/ludo/audio/intro-dice-land-click.wav', volume: 0.3, rate: 0.92 },
  { at: DICE_LAND_DELAY_MS + 190, src: '/ludo/audio/intro-dice-land-click.wav', volume: 0.23, rate: 1.08, pan: 0.08 },
  { at: DICE_LAND_DELAY_MS + 315, src: '/ludo/audio/intro-dice-land-click.wav', volume: 0.19, rate: 0.97, pan: -0.1 },
  { at: DICE_LAND_DELAY_MS + 405, src: '/ludo/audio/intro-dice-land-click.wav', volume: 0.16, rate: 1.14, pan: 0.12 },
  { at: DICE_LAND_DELAY_MS + 520, src: '/ludo/audio/intro-dice-land-click.wav', volume: 0.14, rate: 1.02, pan: -0.1 },
  { at: DICE_LAND_DELAY_MS + 680, src: '/ludo/audio/intro-dice-land-click.wav', volume: 0.12, rate: 1.18, pan: 0.09 },
  { at: DICE_LAND_DELAY_MS + 900, src: '/ludo/audio/intro-dice-land-click.wav', volume: 0.1, rate: 0.95, pan: -0.07 },
  { at: DICE_LAND_DELAY_MS + 1190, src: '/ludo/audio/intro-dice-land-click.wav', volume: 0.08, rate: 1.1, pan: 0.06 },
  { at: DICE_LAND_DELAY_MS + 1560, src: '/ludo/audio/intro-dice-land-click.wav', volume: 0.06, rate: 1, pan: -0.04 },
  { at: DICE_LAND_DELAY_MS + 2010, src: '/ludo/audio/intro-dice-land-click.wav', volume: 0.045, rate: 1.16 },
  { at: DICE_DROP_DELAY_MS + DICE_SPIN_DURATION_MS, src: '/ludo/audio/intro-dice-six.wav', volume: 0.25 },
];

let context: AudioContext | null = null;
let preloadPromise: Promise<void> | null = null;
const buffers = new Map<string, AudioBuffer>();

function getContext(): AudioContext {
  context ??= new AudioContext({ latencyHint: 'interactive' });
  return context;
}

/** 首次加载页调用：不仅下载，还提前解码，避免关键帧到来时才产生启动延迟。 */
export function preloadIntroAudio(): Promise<void> {
  if (preloadPromise) return preloadPromise;
  const audioContext = getContext();
  const sources = [...new Set(CUES.map((cue) => cue.src))];
  preloadPromise = Promise.all(sources.map(async (src) => {
    const response = await fetch(src);
    if (!response.ok) throw new Error(`开局音效加载失败：${src}`);
    buffers.set(src, await audioContext.decodeAudioData(await response.arrayBuffer()));
  })).then(() => undefined).catch((error) => {
    console.error(error);
  });
  return preloadPromise;
}

/** 必须在“开始游戏”的点击栈内调用，只解锁移动端音频权限，不启动时间轴。 */
export function unlockIntroAudio(): void {
  void getContext().resume();
}

/**
 * 必须在“开始游戏”的用户点击栈内调用。全部 cue 由同一个 AudioContext
 * 在同一条硬件时钟上预排程，不再依赖多个 setTimeout + HTMLAudio 的解码漂移。
 */
export function playIntroAudio(): () => void {
  const audioContext = getContext();
  let cancelled = false;
  const active: AudioBufferSourceNode[] = [];
  const mixNodes: AudioNode[] = [];

  void preloadIntroAudio().then(() => {
    if (cancelled) return;
    // useLayoutEffect 发生在首次绘制前；仅留一个很小的硬件排程余量。
    const timelineStart = audioContext.currentTime + 0.005;
    const compressor = audioContext.createDynamicsCompressor();
    const master = audioContext.createGain();
    compressor.threshold.value = -14;
    compressor.knee.value = 8;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.16;
    master.gain.value = 0.88;
    compressor.connect(master).connect(audioContext.destination);
    mixNodes.push(compressor, master);
    for (const cue of CUES) {
      const buffer = buffers.get(cue.src);
      if (!buffer) continue;
      const source = audioContext.createBufferSource();
      const gain = audioContext.createGain();
      source.buffer = buffer;
      source.playbackRate.value = cue.rate ?? 1;
      gain.gain.value = cue.volume;
      if (cue.pan === undefined) {
        source.connect(gain).connect(compressor);
      } else {
        const panner = audioContext.createStereoPanner();
        panner.pan.value = cue.pan;
        source.connect(gain).connect(panner).connect(compressor);
        mixNodes.push(panner);
      }
      mixNodes.push(gain);
      source.start(timelineStart + cue.at / 1000);
      active.push(source);
    }
  });

  return () => {
    cancelled = true;
    for (const source of active) {
      try { source.stop(); } catch { /* 已自然结束 */ }
      source.disconnect();
    }
    for (const node of mixNodes) node.disconnect();
  };
}
