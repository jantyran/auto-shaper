/**
 * 汎用コレクションのリポジトリ(ローカルファースト + API同期)。
 * スキーマ以外の「任意のオブジェクト配列」(レシピ等)を、
 * schemaRepository と同じ方式で永続化する。
 */
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

/** 名前付きコレクションの list/put/remove を提供するリポジトリを作る */
export function makeCollectionRepo<T extends HasId>(name: string) {
  const base = `/api/collections/${name}`;
  return {
    async list(): Promise<T[]> {
      if ((await detectStorageMode()) === 'api') {
        try {
          const res = await fetch(base);
          if (res.ok) {
            const items = (await res.json()) as T[];
            saveLocal(name, items);
            return items;
          }
        } catch {
          /* fall through */
        }
      }
      return loadLocal<T>(name);
    },

    async put(item: T): Promise<T[]> {
      if ((await detectStorageMode()) === 'api') {
        try {
          const res = await fetch(`${base}/${encodeURIComponent(item.id)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item),
          });
          if (res.ok) {
            const items = (await res.json()) as T[];
            saveLocal(name, items);
            return items;
          }
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
          const res = await fetch(`${base}/${encodeURIComponent(id)}`, {
            method: 'DELETE',
          });
          if (res.ok) {
            const items = (await res.json()) as T[];
            saveLocal(name, items);
            return items;
          }
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
