/**
 * テンプレート(ターゲットスキーマ)の SQLite 永続化層。
 *
 * 保存するのは「インポート先フォーマットの定義(列名・型・別名など)」のみ。
 * 顧客の実データはここには一切入らない — アプリの中核である
 * 「実データはブラウザから出さない」という約束は維持される。
 */
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR || join(here, 'data');
mkdirSync(dataDir, { recursive: true });

const db = new Database(join(dataDir, 'auto-shaper.db'));
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS schemas (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    fields     TEXT NOT NULL,   -- JSON: TargetField[]
    updated_at INTEGER NOT NULL
  )
`);

const stmtList = db.prepare('SELECT id, name, fields FROM schemas ORDER BY updated_at DESC');
const stmtUpsert = db.prepare(`
  INSERT INTO schemas (id, name, fields, updated_at)
  VALUES (@id, @name, @fields, @updated_at)
  ON CONFLICT(id) DO UPDATE SET name = @name, fields = @fields, updated_at = @updated_at
`);
const stmtDelete = db.prepare('DELETE FROM schemas WHERE id = ?');

/** 全テンプレートを更新日時の新しい順で返す */
export function listSchemas() {
  return stmtList.all().map((row) => ({
    id: row.id,
    name: row.name,
    origin: 'custom',
    fields: JSON.parse(row.fields),
  }));
}

/** 1件を追加/更新 */
export function upsertSchema(schema) {
  stmtUpsert.run({
    id: String(schema.id),
    name: String(schema.name),
    fields: JSON.stringify(schema.fields ?? []),
    updated_at: Date.now(),
  });
}

/** 1件を削除 */
export function deleteSchema(id) {
  stmtDelete.run(String(id));
}
