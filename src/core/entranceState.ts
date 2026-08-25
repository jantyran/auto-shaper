/** 初回のエントランス画面を既に見た(またはスキップした)かどうかを localStorage に記録する */
const STORAGE_KEY = 'auto-shaper.entrance.seen.v1';

export function hasSeenEntrance(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return true;
  }
}

export function markEntranceSeen(): void {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    /* 保存失敗は握りつぶす */
  }
}
