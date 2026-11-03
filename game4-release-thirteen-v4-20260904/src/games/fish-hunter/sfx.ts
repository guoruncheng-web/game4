/**
 * 音效 —— 播放 rFXGen 生成的 wav(`public/fish-hunter/audio/*.wav`)。
 *
 * 素材由 `tools/audio/fish-hunter/build_sfx.mjs` 出:
 * 脚本写 .rfx 参数文件 → 调 rFXGen 渲染每一层 → 混层 + 峰值归一 → 落 public。
 * 想改音色就改脚本里的参数(或用 rFXGen GUI 打开 `presets/*.rfx` 调完存回),再跑一遍。
 * **改了 wav 记得把 `public/sw.js` 的 VERSION 加一档**,否则装过 PWA 的人拿到的是旧缓存。
 *
 * 响度关系已经在生成时归一化好了(ART.md §6),这里不再逐个调音量 ——
 * 在两个地方调音量,最后一定会对不上。
 *
 * 音量和静音沿用全站那两个 key,和盒子里其它游戏一致。
 */

const NAMES = ['fire', 'pop', 'catch', 'jackpot', 'coin', 'deny'] as const;
export type Sound = (typeof NAMES)[number];

const BASE = '/fish-hunter/audio';
const MASTER = 0.9;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const buffers = new Map<Sound, AudioBuffer>();
/** 解码失败/还没下完的音不要反复重试,否则每次开炮都会再发一次请求 */
const failed = new Set<Sound>();

function muted(): boolean {
  if (typeof window === 'undefined') return true;
  try { return localStorage.getItem('game-box-muted') === 'true'; } catch { return false; }
}

export function getVolume(): number {
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

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = MASTER * getVolume();
    master.connect(ctx.destination);
  }
  // 自动播放策略:AudioContext 要在用户手势之后才能出声。第一次开炮就是那个手势
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/**
 * 预加载。**在第一次开炮之前调**,否则第一发的声音会晚一个网络往返 ——
 * 而这一款每 220ms 就开一炮,首发延迟很明显。
 */
export function preload(): void {
  const ac = audio();
  if (!ac) return;
  for (const name of NAMES) void load(ac, name);
}

async function load(ac: AudioContext, name: Sound): Promise<AudioBuffer | null> {
  if (buffers.has(name)) return buffers.get(name)!;
  if (failed.has(name)) return null;
  try {
    const res = await fetch(`${BASE}/${name}.wav`);
    if (!res.ok) throw new Error(String(res.status));
    const buffer = await ac.decodeAudioData(await res.arrayBuffer());
    buffers.set(name, buffer);
    return buffer;
  } catch {
    // 素材缺失不该让游戏出错,静音继续
    failed.add(name);
    return null;
  }
}

export function play(sound: Sound): void {
  if (muted()) return;
  const ac = audio();
  if (!ac || !master) return;
  if (master.gain.value !== MASTER * getVolume()) master.gain.value = MASTER * getVolume();

  const buffer = buffers.get(sound);
  if (!buffer) {
    // 还没加载好:补一次加载,这一声就放弃。
    // 不排队补播 —— 迟到几百毫秒的开炮声比没有声音更出戏
    void load(ac, sound);
    return;
  }
  const src = ac.createBufferSource();
  src.buffer = buffer;
  src.connect(master);
  src.start();
}
