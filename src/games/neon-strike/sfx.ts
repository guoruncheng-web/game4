const ROOT = '/neon-strike/assets/audio';

/** 音效清单:名字 → 同时可播放的声部数(决定连打时会不会被自己截断) */
const VOICES: Record<string, number> = {
  shoot: 2,
  'enemy-hit': 2,
  shield: 3,
  'player-hurt': 3,
  'boss-warning': 3,
  ui: 3,
};

export const SFX_NAMES = Object.keys(VOICES);

/** 预加载后指向 blob:,未预加载时回落到网络路径 */
const sources = new Map<string, string>();
const pools = new Map<string, HTMLAudioElement[]>();
const cursors = new Map<string, number>();
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
  return clamped;
}

export function isMuted() {
  return typeof window !== 'undefined' && muted();
}

export function setMuted(value: boolean) {
  try { localStorage.setItem('game-box-muted', String(value)); } catch { /* 忽略 */ }
  return value;
}

function srcOf(name: string) {
  return sources.get(name) ?? `${ROOT}/${name}.wav`;
}

function buildPool(name: string) {
  const pool = Array.from({ length: VOICES[name] ?? 3 }, () => {
    const clip = new Audio(srcOf(name));
    clip.preload = 'auto';
    clip.load();
    return clip;
  });
  pools.set(name, pool);
  return pool;
}

/** 等第一个声部真正可播放(blob 已在内存,解码很快),超时也放行,不卡住加载流程 */
function waitReady(clip: HTMLAudioElement, timeout = 3000) {
  if (clip.readyState >= 3) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const done = () => {
      clip.removeEventListener('canplaythrough', done);
      clip.removeEventListener('error', done);
      resolve();
    };
    clip.addEventListener('canplaythrough', done, { once: true });
    clip.addEventListener('error', done, { once: true });
    window.setTimeout(done, timeout);
  });
}

/**
 * 在 BootScene 里把全部音效抓成 blob 并建好声部池。
 * 抓取失败的名字会原样返回,交给加载页决定是否让玩家重试。
 */
export async function preloadSfx(onProgress?: (loaded: number, total: number) => void) {
  const total = SFX_NAMES.length;
  let loaded = 0;
  const failed: string[] = [];

  await Promise.all(
    SFX_NAMES.map(async (name) => {
      try {
        const res = await fetch(`${ROOT}/${name}.wav`, { cache: 'force-cache' });
        if (!res.ok) throw new Error(String(res.status));
        const url = URL.createObjectURL(await res.blob());
        // 重试时先把上一轮的 blob 释放掉,避免反复重试堆内存
        const stale = sources.get(name);
        if (stale?.startsWith('blob:')) URL.revokeObjectURL(stale);
        sources.set(name, url);
        pools.delete(name);
        await waitReady(buildPool(name)[0]);
      } catch {
        failed.push(name);
      } finally {
        loaded += 1;
        onProgress?.(loaded, total);
      }
    }),
  );

  return { failed };
}

function play(name: string, volume: number, playbackRate = 1) {
  if (muted()) return;
  const master = getVolume();
  if (master <= 0) return;
  volume = Math.min(1, volume * master);
  const pool = pools.get(name) ?? buildPool(name);
  const cursor = cursors.get(name) ?? 0;
  const clip = pool[cursor % pool.length];
  cursors.set(name, cursor + 1);
  clip.pause();
  clip.currentTime = 0;
  clip.volume = volume;
  clip.playbackRate = playbackRate;
  void clip.play().catch(() => undefined);
}

export const sfx = {
  shoot() {
    const now = performance.now();
    if (now - lastShoot < 260) return;
    lastShoot = now;
    play('shoot', 0.045, 0.92);
  },
  hit: () => play('enemy-hit', 0.065, 0.9),
  pickup: () => play('shield', 0.12, 0.94),
  hurt: () => play('player-hurt', 0.16, 0.9),
  boss: () => play('boss-warning', 0.13, 0.9),
  ui: () => play('ui', 0.28, 0.92),
};
