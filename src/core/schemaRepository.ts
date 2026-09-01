/**
 * テンプレート保存のリポジトリ層。
 *
 * 保存先はログイン状態で切り替わる:
 *  - **ログイン済み** かつ バックエンド(/api)が使える → サーバー(DB)を正とする。
 *  - それ以外(未ログイン / サーバー無し) → このブラウザの localStorage。
 *
 * ゲスト(localStorage)のデータとログインユーザー(DB)のデータが混ざらないよう、
 * API モードのときは localStorage への複製は行わない(ログイン時にゲストの
 * ローカルデータを上書きしない)。保存されるのはテンプレート定義のみ。
 */
import type { TargetSchema } from '../types';
import { apiUrl } from './apiBase';
import { authHeaders, isAuthenticated } from './auth';
import {
  deleteCustomSchema,
  loadCustomSchemas,
  upsertCustomSchema,
} from './schemaStore';

export type StorageMode = 'api' | 'local';

let healthPromise: Promise<boolean> | null = null;

/** APIベースURLを変更したときに疎通判定のキャッシュを破棄する */
export function resetStorageModeCache(): void {
  healthPromise = null;
}

/**
 * バックエンド(相対パス `/api`)の有無を一度だけ判定してキャッシュ。
 * ログイン状態に関わらず判定するため、未ログイン時の「接続先の詳細設定」
 * (`AccountPanel.tsx`)が「別オリジン配信の案内が必要か」を判断するのにも使う。
 */
export function detectBackend(): Promise<boolean> {
  if (!healthPromise) {
    healthPromise = (async () => {
      try {
        const ctrl = new AbortController();
        // サーバーレス(Cloud Functions等)のコールドスタートは数秒かかるため、
        // 1.5秒では「バックエンド無し」と誤判定してログイン中でも localStorage に
        // フォールバックしてしまう。余裕を持たせる。
        const timer = setTimeout(() => ctrl.abort(), 6000);
        const res = await fetch(apiUrl('/api/health'), { signal: ctrl.signal });
        clearTimeout(timer);
        return res.ok;
      } catch {
        return false;
      }
    })();
  }
  return healthPromise;
}

/** 実効的な保存先。API はログイン済み かつ バックエンドありのときだけ */
export async function detectStorageMode(): Promise<StorageMode> {
  if (!isAuthenticated()) return 'local';
  return (await detectBackend()) ? 'api' : 'local';
}

function jsonHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json', ...authHeaders() };
}

/** 一覧取得。API モードならサーバーから、そうでなければローカルから */
export async function listSchemas(): Promise<TargetSchema[]> {
  if ((await detectStorageMode()) === 'api') {
    try {
      const res = await fetch(apiUrl('/api/schemas'), {
        headers: authHeaders(),
      });
      if (res.ok) return (await res.json()) as TargetSchema[];
    } catch {
      /* fall through to local */
    }
  }
  return loadCustomSchemas();
}

/** 追加/更新。更新後の全一覧を返す */
export async function persistSchema(
  schema: TargetSchema,
): Promise<TargetSchema[]> {
  const next: TargetSchema = { ...schema, origin: 'custom' };
  if ((await detectStorageMode()) === 'api') {
    try {
      const res = await fetch(
        apiUrl(`/api/schemas/${encodeURIComponent(next.id)}`),
        {
          method: 'PUT',
          headers: jsonHeaders(),
          body: JSON.stringify(next),
        },
      );
      if (res.ok) return (await res.json()) as TargetSchema[];
    } catch {
      /* fall through to local */
    }
  }
  return upsertCustomSchema(next);
}

/** 削除。削除後の全一覧を返す */
export async function removeSchemaFromRepo(
  id: string,
): Promise<TargetSchema[]> {
  if ((await detectStorageMode()) === 'api') {
    try {
      const res = await fetch(
        apiUrl(`/api/schemas/${encodeURIComponent(id)}`),
        {
          method: 'DELETE',
          headers: authHeaders(),
        },
      );
      if (res.ok) return (await res.json()) as TargetSchema[];
    } catch {
      /* fall through to local */
    }
  }
  return deleteCustomSchema(id);
}
