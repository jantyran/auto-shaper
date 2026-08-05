/**
 * 汎用コレクションのリポジトリ(レシピ等)。
 * schemaRepository と同じ方式で、ログイン状態に応じて保存先を切り替える。
 *  - ログイン済み + バックエンドあり → サーバー(DB, ユーザー単位)
 *  - それ以外 → localStorage
 * API モードではローカルへ複製しない(ゲストデータとの混在を避ける)。
 */
import { apiUrl } from './apiBase';
import { authHeaders } from './auth';
import { detectStorageMode } from './schemaRepository';

interface HasId {
  id: string;
}

function localKey(name: string): string {
  return `auto-shaper.${name}.v1`;
}

function loadLocal<T>(name: string): T[] {
  try {
    const raw = localStorage.getItem(localKey(name));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocal<T>(name: string, items: T[]): void {
  try {
    localStorage.setItem(localKey(name), JSON.stringify(items));
  } catch {
    /* ignore */
  }
}

function jsonHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json', ...authHeaders() };
}

/** 名前付きコレクションの list/put/remove を提供するリポジトリを作る */
export function makeCollectionRepo<T extends HasId>(name: string) {
  const base = `/api/collections/${name}`;
  return {
    async list(): Promise<T[]> {
      if ((await detectStorageMode()) === 'api') {
        try {
          const res = await fetch(apiUrl(base), { headers: authHeaders() });
          if (res.ok) return (await res.json()) as T[];
        } catch {
          /* fall through */
        }
      }
      return loadLocal<T>(name);
    },

    async put(item: T): Promise<T[]> {
      if ((await detectStorageMode()) === 'api') {
        try {
          const res = await fetch(apiUrl(`${base}/${encodeURIComponent(item.id)}`), {
            method: 'PUT',
            headers: jsonHeaders(),
            body: JSON.stringify(item),
          });
          if (res.ok) return (await res.json()) as T[];
        } catch {
          /* fall through */
        }
      }
      const items = loadLocal<T>(name);
      const idx = items.findIndex((x) => x.id === item.id);
      if (idx >= 0) items[idx] = item;
      else items.push(item);
      saveLocal(name, items);
      return items;
    },

    async remove(id: string): Promise<T[]> {
      if ((await detectStorageMode()) === 'api') {
        try {
          const res = await fetch(apiUrl(`${base}/${encodeURIComponent(id)}`), {
            method: 'DELETE',
            headers: authHeaders(),
          });
          if (res.ok) return (await res.json()) as T[];
        } catch {
          /* fall through */
        }
      }
      const items = loadLocal<T>(name).filter((x) => x.id !== id);
      saveLocal(name, items);
      return items;
    },
  };
}
