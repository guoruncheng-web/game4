import { DIFFICULTIES, type DifficultyId, type GameMode } from './config';

const KEYS = {
  /** 首页卡片也读这个 key,格式不能改 */
  best: 'neon-strike-2d-best',
  scores: 'neon-strike-2d-scores',
  settings: 'neon-strike-2d-settings',
  /** 全站共用的静音开关 */
  muted: 'game-box-muted',
  /** 全站共用的主音量,0~1 */
  volume: 'game-box-volume',
} as const;

export type RunRecord = {
  score: number;
  wave: number;
  difficulty: DifficultyId;
  mode: GameMode;
  victory: boolean;
  at: number;
};

export type Settings = {
  difficulty: DifficultyId;
  /** 通关战役后解锁无尽模式 */
  endlessUnlocked: boolean;
};

const MAX_RECORDS = 8;

function read(key: string) {
  if (typeof localStorage === 'undefined') return null;
  try { return localStorage.getItem(key); } catch { return null; }
}

function write(key: string, value: string) {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(key, value); } catch { /* 隐私模式下写入失败不影响游戏 */ }
}

export function loadSettings(): Settings {
  const raw = read(KEYS.settings);
  const fallback: Settings = { difficulty: 'normal', endlessUnlocked: false };
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      difficulty: parsed.difficulty && parsed.difficulty in DIFFICULTIES ? parsed.difficulty : 'normal',
      endlessUnlocked: parsed.endlessUnlocked === true,
    };
  } catch {
    return fallback;
  }
}

export function saveSettings(patch: Partial<Settings>) {
  const next = { ...loadSettings(), ...patch };
  write(KEYS.settings, JSON.stringify(next));
  return next;
}

export function bestScore() {
  return Number(read(KEYS.best) || 0);
}

export function loadScores(): RunRecord[] {
  const raw = read(KEYS.scores);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as RunRecord[]).filter((r) => typeof r?.score === 'number').slice(0, MAX_RECORDS);
  } catch {
    return [];
  }
}

/** 写入一局战绩,返回它在本地榜上的名次(1 起)和刷新后的最高分 */
export function pushScore(record: RunRecord) {
  const list = [...loadScores(), record].sort((a, b) => b.score - a.score).slice(0, MAX_RECORDS);
  write(KEYS.scores, JSON.stringify(list));
  const best = Math.max(record.score, bestScore());
  write(KEYS.best, String(best));
  const rank = list.findIndex((r) => r === record) + 1;
  return { rank: rank > 0 ? rank : 0, best };
}

export function clearRecords() {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(KEYS.scores);
    localStorage.removeItem(KEYS.best);
  } catch { /* 忽略 */ }
}

export const STORAGE_KEYS = KEYS;
