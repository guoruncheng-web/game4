import { DIFFICULTIES, MODES, type DifficultyId, type GameMode } from './config';

const KEYS = {
  /** 首页卡片也读这个 key,格式不能改 */
  best: 'fruit-slasher-best',
  scores: 'fruit-slasher-scores',
  settings: 'fruit-slasher-settings',
  /** 全站共用的静音开关 */
  muted: 'game-box-muted',
  /** 全站共用的主音量,0~1 */
  volume: 'game-box-volume',
} as const;

export type RunRecord = {
  score: number;
  sliced: number;
  bestCombo: number;
  mode: GameMode;
  difficulty: DifficultyId;
  /** 限时/禅意撑到时间结束 = 完成,经典模式永远是 false */
  completed: boolean;
  at: number;
};

export type Settings = {
  mode: GameMode;
  difficulty: DifficultyId;
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
  const fallback: Settings = { mode: 'classic', difficulty: 'standard' };
  const raw = read(KEYS.settings);
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      mode: parsed.mode && parsed.mode in MODES ? parsed.mode : 'classic',
      difficulty: parsed.difficulty && parsed.difficulty in DIFFICULTIES ? parsed.difficulty : 'standard',
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

/** 跨模式的全局最高分,首页卡片读的就是它 */
export function bestScore() {
  const value = Number(read(KEYS.best) || 0);
  return Number.isFinite(value) ? value : 0;
}

/**
 * 单个模式的最高分。
 * 禅意模式没炸弹、不扣命、还有 90 秒,分数结构性地高于经典;
 * 共用一个 best 的话,打过一局禅意之后经典模式永远不会再出"新纪录"。
 */
export function bestScoreOf(mode: GameMode) {
  return loadScores(mode).reduce((max, r) => Math.max(max, r.score), 0);
}

export function loadScores(mode?: GameMode): RunRecord[] {
  const raw = read(KEYS.scores);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const all = (parsed as RunRecord[]).filter((r) => typeof r?.score === 'number');
    const scoped = mode ? all.filter((r) => r.mode === mode) : all;
    return scoped.sort((a, b) => b.score - a.score).slice(0, MAX_RECORDS);
  } catch {
    return [];
  }
}

/** 写入一局战绩,返回它在本模式榜上的名次(1 起,掉出榜单为 0)和刷新后的全局最高分 */
export function pushScore(record: RunRecord) {
  const raw = read(KEYS.scores);
  let all: RunRecord[] = [];
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) all = (parsed as RunRecord[]).filter((r) => typeof r?.score === 'number');
  } catch { /* 坏数据直接从头来 */ }

  // 每个模式各留 MAX_RECORDS 条,免得禅意局把经典局挤出榜单
  all.push(record);
  const kept: RunRecord[] = [];
  for (const mode of Object.keys(MODES) as GameMode[]) {
    kept.push(...all.filter((r) => r.mode === mode).sort((a, b) => b.score - a.score).slice(0, MAX_RECORDS));
  }
  write(KEYS.scores, JSON.stringify(kept));

  const best = Math.max(record.score, bestScore());
  write(KEYS.best, String(best));
  const rank = kept
    .filter((r) => r.mode === record.mode)
    .sort((a, b) => b.score - a.score)
    .findIndex((r) => r === record) + 1;
  return { rank: rank > 0 ? rank : 0, best };
}

export function clearRecords() {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(KEYS.scores);
    localStorage.removeItem(KEYS.best);
  } catch { /* 忽略 */ }
}
