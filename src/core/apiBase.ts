/**
 * API のベースURL解決。
 *
 * フロントとバックエンドが同一オリジン(本番)や Vite 開発サーバーの proxy 経由
 * (開発時 http://localhost:5173)なら、相対パス `/api/...` のままで届く。
 *
 * 一方、Live Server(例: http://localhost:5502)など**別オリジン**で配信する場合は、
 * `/api` が中継されないため届かない。その場合はここで設定した絶対URL
 * (例: http://localhost:8787)を前置してバックエンドへ直接アクセスする
 * (サーバー側は CORS を許可済み)。
 *
 * 設定の優先順位:
 *   1. localStorage の値(アプリの「APIサーバーURL」欄から設定)
 *   2. ビルド時の環境変数 VITE_API_BASE
 *   3. 空(相対パス = 同一オリジン / 開発プロキシ)
 */
const KEY = 'auto-shaper.apiBase.v1';

function envBase(): string {
  const env = import.meta.env as Record<string, string | undefined>;
  return (env.VITE_API_BASE ?? '').trim();
}

/** 現在のAPIベースURL(末尾スラッシュ無し。未設定なら空文字) */
export function getApiBase(): string {
  try {
    const v = localStorage.getItem(KEY);
    if (v != null) return v.trim().replace(/\/+$/, '');
  } catch {
    /* ignore */
  }
  return envBase().replace(/\/+$/, '');
}

/** APIベースURLを保存(空文字で解除して相対パスに戻す) */
export function setApiBase(base: string): void {
  const v = base.trim().replace(/\/+$/, '');
  try {
    if (v) localStorage.setItem(KEY, v);
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** `/api/...` を、設定に応じて絶対URL or 相対URLへ解決する */
export function apiUrl(path: string): string {
  const base = getApiBase();
  return base ? `${base}${path}` : path;
}
