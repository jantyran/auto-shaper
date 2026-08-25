/** 初回ガイドツアーを既に見たかどうかを localStorage に記録する */
const STORAGE_KEY = 'auto-shaper.tour.seen.v1';

export function hasSeenTour(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return true;
  }
}

export function markTourSeen(): void {
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    /* 保存失敗は握りつぶす */
  }
}
