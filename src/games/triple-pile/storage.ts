/**
 * localStorage 读写。全部 try/catch 包住,隐私模式或配额满都不能影响开局。
 * DESIGN.md §12:解析失败或值不认识 → 回退到「只解锁第 1 关」。
 */

import { LEVEL_COUNT } from './levels';

const KEYS = {
  progress: 'triple-pile-progress',
  stats: 'triple-pile-stats',
  /** 全站共用 */
  muted: 'game-box-muted',
  volume: 'game-box-volume',
} as const;

export type Progress = {
  /** 已解锁到第几关(1 起) */
  unlocked: number;
  /** 首次三消之后就不再显示开局提示 */
  tutorialDone: boolean;
};

export type LevelStat = { score: number; timeMs: number };
export type Stats = Record<string, LevelStat>;

const FALLBACK: Progress = { unlocked: 1, tutorialDone: false };

function read(key: string): string | null {
  if (typeof localStorage === 'undefined') return null;
  try { return localStorage.getItem(key); } catch { return null; }
}

function write(key: string, value: string) {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(key, value); } catch { /* 写不进去就算了,不影响这一局 */ }
}

export function loadProgress(): Progress {
  const raw = read(KEYS.progress);
  if (!raw) return { ...FALLBACK };
  try {
    const parsed = JSON.parse(raw) as Partial<Progress>;
    const unlocked = Number(parsed.unlocked);
    return {
      unlocked: Number.isFinite(unlocked) ? Math.min(Math.max(Math.floor(unlocked), 1), LEVEL_COUNT) : 1,
      tutorialDone: parsed.tutorialDone === true,
    };
  } catch {
    return { ...FALLBACK };
  }
}

export function saveProgress(patch: Partial<Progress>): Progress {
  const next = { ...loadProgress(), ...patch };
  write(KEYS.progress, JSON.stringify(next));
  return next;
}

export function loadStats(): Stats {
  const raw = read(KEYS.stats);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Stats = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const v = value as Partial<LevelStat>;
      if (typeof v?.score === 'number' && typeof v?.timeMs === 'number') {
        out[key] = { score: v.score, timeMs: v.timeMs };
      }
    }
    return out;
  } catch {
    return {};
  }
}

/** 写入一关的成绩,只在「分更高」或「用时更短」时更新 */
export function recordLevel(levelId: number, score: number, timeMs: number): Stats {
  const stats = loadStats();
  const key = String(levelId);
  const prev = stats[key];
  stats[key] = {
    score: Math.max(score, prev?.score ?? 0),
    timeMs: prev ? Math.min(timeMs, prev.timeMs) : timeMs,
  };
  write(KEYS.stats, JSON.stringify(stats));
  return stats;
}

export function isMuted(): boolean {
  return read(KEYS.muted) === '1';
}

export function masterVolume(): number {
  const v = Number(read(KEYS.volume));
  return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 0.8;
}

export const STORAGE_KEYS = KEYS;
