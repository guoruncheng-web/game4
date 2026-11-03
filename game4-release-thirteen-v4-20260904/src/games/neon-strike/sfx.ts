/**
 * 霓虹突击音效 —— 素材由 rFXGen(raysan5,sfxr 系参数合成器)离线生成。
 *
 * 生成脚本:tools/audio/neon-strike/build_sfx.mjs
 * 参数预设:tools/audio/neon-strike/presets/*.rfx(可以直接用 rFXGen GUI 打开手调)
 * 产物:public/neon-strike/assets/audio/*.wav(44100Hz / 16bit / 单声道)
 *
 * 之前这里是一整套 WebAudio 振荡器合成,音色靠代码里的常量堆出来;
 * 现在音色全部前移到 .rfx 参数里,拖滑块就能试听,运行时只负责播 buffer。
 * 每条音效在生成阶段就混好了层(冲击音都垫了低频 sub)、做过峰值归一化,
 * 所以这里不再需要分层调度,一次 play 只起一个 BufferSource。
 *
 * 播放链路:BufferSource → 单音增益 → 主增益(音量/静音)→ 安全低通 → 输出。
 */

const ROOT = '/neon-strike/assets/audio';

const NAMES = ['shoot', 'enemy-hit', 'pickup', 'player-hurt', 'boss-warning', 'ui'] as const;
type SfxName = (typeof NAMES)[number];

const MASTER = 0.55;
/** 全局安全低通:兜住素材里没压干净的高频毛刺 */
const SAFETY_HZ = 10500;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const buffers = new Map<SfxName, AudioBuffer>();
const loading = new Map<SfxName, Promise<void>>();
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
    try { ctx = new Ctor(); } catch { return null; }
    master = ctx.createGain();
    master.gain.value = MASTER * getVolume();
    const safety = ctx.createBiquadFilter();
    safety.type = 'lowpass';
    safety.frequency.value = SAFETY_HZ;
    safety.Q.value = 0.7;
    master.connect(safety).connect(ctx.destination);
  }
  // 首次交互前浏览器会把 context 挂起,每次播放都顺手唤醒一次;
  // 还没有用户手势时 resume() 会被拒绝,必须自己吞掉,别抛成未处理的 rejection
  if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
  return ctx;
}

/** 下载 + 解码一条音效;同一条并发只会真下一次,失败返回 false 交给调用方统计 */
function load(name: SfxName): Promise<void> {
  const inflight = loading.get(name);
  if (inflight) return inflight;
  if (buffers.has(name)) return Promise.resolve();
  const ac = audio();
  if (!ac) return Promise.reject(new Error('no AudioContext'));
  const task = fetch(`${ROOT}/${name}.wav`)
    .then((res) => {
      if (!res.ok) throw new Error(`${name}.wav ${res.status}`);
      return res.arrayBuffer();
    })
    .then((raw) => ac.decodeAudioData(raw))
    .then((buffer) => { buffers.set(name, buffer); })
    .finally(() => { loading.delete(name); });
  loading.set(name, task);
  return task;
}

/**
 * Boot 阶段调用:把全部音效提前下载解码好,避免开局后第一次发声卡一下。
 * 单条失败不影响其它条,失败的名字回给调用方(整包 100KB 出头,一般不会走到)。
 */
export async function preloadSfx(onProgress?: (loaded: number, total: number) => void) {
  const total = NAMES.length;
  const failed: string[] = [];
  let done = 0;
  await Promise.all(NAMES.map(async (name) => {
    try {
      await load(name);
    } catch {
      failed.push(name);
    } finally {
      done += 1;
      onProgress?.(done, total);
    }
  }));
  return { failed };
}

/**
 * 播一条音效。
 * @param rate 播放速率,兼作变调 —— 连发时轻微抖一下,避免听成一条直线
 * @param gain 相对音量,素材之间的响度平衡已经在生成阶段做过,这里只做临时压制
 */
function play(name: SfxName, rate = 1, gain = 1) {
  if (muted()) return;
  const volume = getVolume();
  if (volume <= 0) return;
  const ac = audio();
  if (!ac || !master) return;

  const buffer = buffers.get(name);
  if (!buffer) {
    // 没预加载到(或还没解码完)就补一发,这一声放弃,下一声就有了
    void load(name).catch(() => undefined);
    return;
  }

  const src = ac.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = rate;
  if (gain === 1) {
    src.connect(master);
  } else {
    const node = ac.createGain();
    node.gain.value = gain;
    src.connect(node).connect(master);
  }
  src.start();
}

/** ±6% 的随机变速,连发时听起来不像复读 */
function wobble(amount = 0.06) {
  return 1 + (Math.random() * 2 - 1) * amount;
}

export const sfx = {
  /** 等离子脉冲:120ms 内只响一次,免得连发糊成噪声 */
  shoot() {
    const now = performance.now();
    if (now - lastShoot < 120) return;
    lastShoot = now;
    play('shoot', wobble(0.08));
  },

  /** 敌机爆碎 */
  hit: () => play('enemy-hit', wobble()),

  /** 拾取道具 */
  pickup: () => play('pickup', wobble(0.03)),

  /** 玩家中弹 */
  hurt: () => play('player-hurt', wobble(0.04)),

  /** Boss 来袭警报 */
  boss: () => play('boss-warning'),

  /** 界面确认 */
  ui: () => play('ui', wobble(0.04)),
};
