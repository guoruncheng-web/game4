/** 战绩存档。key 一律带 slug 前缀,免得和盒子里其他游戏互相覆盖 */
import { STORAGE_PREFIX, type Difficulty } from './config';

export type Record = { wins: number; losses: number; streak: number; best: number };

const EMPTY: Record = { wins: 0, losses: 0, streak: 0, best: 0 };

function key(difficulty: Difficulty) {
  return `${STORAGE_PREFIX}-record-${difficulty}`;
}

export function loadRecord(difficulty: Difficulty): Record {
  if (typeof window === 'undefined') return { ...EMPTY };
  try {
    const raw = localStorage.getItem(key(difficulty));
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<Record>;
    return {
      wins: num(parsed.wins), losses: num(parsed.losses),
      streak: num(parsed.streak), best: num(parsed.best),
    };
  } catch {
    return { ...EMPTY };
  }
}

export function saveResult(difficulty: Difficulty, won: boolean): Record {
  const record = loadRecord(difficulty);
  if (won) {
    record.wins += 1;
    record.streak += 1;
    record.best = Math.max(record.best, record.streak);
  } else {
    record.losses += 1;
    record.streak = 0;
  }
  try { localStorage.setItem(key(difficulty), JSON.stringify(record)); } catch { /* 忽略 */ }
  return record;
}

export function loadDifficulty(): Difficulty | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}-difficulty`);
    return raw === 'rookie' || raw === 'pro' || raw === 'shark' ? raw : null;
  } catch {
    return null;
  }
}

export function saveDifficulty(value: Difficulty) {
  try { localStorage.setItem(`${STORAGE_PREFIX}-difficulty`, value); } catch { /* 忽略 */ }
}

function num(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}
