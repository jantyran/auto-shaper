/**
 * テンプレート保存のリポジトリ層。
 *
 * 「ローカルファースト + API同期」方式:
 *  - SQLite バックエンド(/api)が使えればそれを正とし、localStorage にも複製しておく。
 *  - バックエンドが無い/落ちている場合は localStorage だけで動作する(オフライン可)。
 * これにより「サーバー無しでもすぐ試せる」利便性と「複数端末・チーム共有」の
 * 両立を図る。保存されるのはテンプレート定義のみで、実データは含まれない。
 */
import type { TargetSchema } from '../types';
import {
  deleteCustomSchema,
  loadCustomSchemas,
  saveCustomSchemas,
  upsertCustomSchema,
} from './schemaStore';

export type StorageMode = 'api' | 'local';

const API = '/api';
let modePromise: Promise<StorageMode> | null = null;

/** バックエンドの有無を一度だけ判定してキャッシュ */
export function detectStorageMode(): Promise<StorageMode> {
  if (!modePromise) {
    modePromise = (async () => {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 1500);
        const res = await fetch(`${API}/health`, { signal: ctrl.signal });
        clearTimeout(timer);
        return res.ok ? 'api' : 'local';
      } catch {
        return 'local';
      }
    })();
  }
  return modePromise;
}

/** 一覧取得。API があれば取得して localStorage に複製、無ければローカルを返す */
export async function listSchemas(): Promise<TargetSchema[]> {
  const mode = await detectStorageMode();
  if (mode === 'api') {
    try {
      const res = await fetch(`${API}/schemas`);
      if (res.ok) {
        const list = (await res.json()) as TargetSchema[];
        saveCustomSchemas(list); // オフライン用に複製
        return list;
      }
    } catch {
      /* fall through to local */
    }
  }
  return loadCustomSchemas();
}

/** 追加/更新。更新後の全一覧を返す */
export async function persistSchema(schema: TargetSchema): Promise<TargetSchema[]> {
  const next: TargetSchema = { ...schema, origin: 'custom' };
  const mode = await detectStorageMode();
  if (mode === 'api') {
    try {
      const res = await fetch(`${API}/schemas/${encodeURIComponent(next.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      if (res.ok) {
        const list = (await res.json()) as TargetSchema[];
        saveCustomSchemas(list);
        return list;
      }
    } catch {
      /* fall through to local */
    }
  }
  return upsertCustomSchema(next);
}

/** 削除。削除後の全一覧を返す */
export async function removeSchemaFromRepo(id: string): Promise<TargetSchema[]> {
  const mode = await detectStorageMode();
  if (mode === 'api') {
    try {
      const res = await fetch(`${API}/schemas/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        const list = (await res.json()) as TargetSchema[];
        saveCustomSchemas(list);
        return list;
      }
    } catch {
      /* fall through to local */
    }
  }
  return deleteCustomSchema(id);
}
