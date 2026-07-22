/**
 * 学習辞書。
 * ユーザーがマッピングを手で直した履歴(「この列名は結局この項目だった」)を蓄積し、
 * 次回以降のサジェスト精度を上げる。使うほど自社に馴染む。
 *
 * 個人/自社の学習データなのでブラウザ内(localStorage)に保存する。
 */
import { normalizeHeader } from './inference/dictionary';

export interface LearnedEntry {
  /** 正規化済みのソース列名 */
  header: string;
  /** 割り当て先のターゲットキー */
  targetKey: string;
  /** 確定された回数(多いほど信頼) */
  count: number;
}

const STORAGE_KEY = 'auto-shaper.learning.v1';

export function loadLearned(): LearnedEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(entries: LearnedEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    /* ignore */
  }
}

/** ユーザーが確定した「列名 → ターゲットキー」を記録する */
export function recordAssociation(sourceHeader: string, targetKey: string): LearnedEntry[] {
  const header = normalizeHeader(sourceHeader);
  if (!header || !targetKey) return loadLearned();
  const entries = loadLearned();
  const found = entries.find((e) => e.header === header && e.targetKey === targetKey);
  if (found) {
    found.count++;
  } else {
    // 同じ列名の別ターゲットへの古い学習は残しつつ、新しい対応を追加
    entries.push({ header, targetKey, count: 1 });
  }
  save(entries);
  return entries;
}

/** 学習履歴をすべて消す */
export function clearLearned(): void {
  save([]);
}

/**
 * 学習に基づくスコア加点(0〜0.3)。
 * 過去に (この列名 → このターゲット) を確定したことがあるほど大きい。
 */
export function learnedBoost(
  sourceHeader: string,
  targetKey: string,
  entries: LearnedEntry[],
): number {
  const header = normalizeHeader(sourceHeader);
  const e = entries.find((x) => x.header === header && x.targetKey === targetKey);
  if (!e) return 0;
  return Math.min(0.3, 0.12 + 0.06 * (e.count - 1));
}
