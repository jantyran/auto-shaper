/**
 * SQLite ストレージドライバ。
 *
 * `storage/index.mjs` が公開するストア契約(ユーザー・セッション・
 * テンプレート・コレクション)を better-sqlite3 で実装する。
 *
 * データはすべて **ログインユーザー単位** で保存する(user_id で分離)。
 * 保存するのはテンプレート定義とマッピング(レシピ)などのメタ情報のみで、
 * 顧客の実データは一切入らない(アプリの中核方針を維持)。
 *
 * 本番で別のDBを使う場合は、このファイルと同じ契約を満たすドライバを
 * 追加し、`storage/index.mjs` の分岐に接続する(DB_DRIVER 環境変数で選択)。
 */
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function createSqliteStore() {
  const here = dirname(fileURLToPath(import.meta.url));
  // server/data を既定にしつつ、DATA_DIR で差し替え可能
  const dataDir = process.env.DATA_DIR || join(here, '..', 'data');
  mkdirSync(dataDir, { recursive: true });

  const db = new Database(join(dataDir, 'auto-shaper.db'));
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      email         TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      salt          TEXT NOT NULL,
      created_at    INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token      TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS schemas (
      user_id    TEXT NOT NULL,
      id         TEXT NOT NULL,
      name       TEXT NOT NULL,
      fields     TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, id)
    );
    CREATE TABLE IF NOT EXISTS collections (
      user_id    TEXT NOT NULL,
      collection TEXT NOT NULL,
      id         TEXT NOT NULL,
      data       TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, collection, id)
    );
  `);

  migrateLegacyTables(db);

  // ── users / sessions ──
  const insUser = db.prepare(`
    INSERT INTO users (id, email, password_hash, salt, created_at)
    VALUES (@id, @email, @password_hash, @salt, @created_at)
  `);
  const selUserByEmail = db.prepare('SELECT * FROM users WHERE email = ?');
  const selUserById = db.prepare('SELECT * FROM users WHERE id = ?');
  const insSession = db.prepare(
    'INSERT INTO sessions (token, user_id, expires_at) VALUES (@token, @user_id, @expires_at)',
  );
  const selSession = db.prepare('SELECT user_id, expires_at FROM sessions WHERE token = ?');
  const delSession = db.prepare('DELETE FROM sessions WHERE token = ?');
  const delExpiredSessions = db.prepare('DELETE FROM sessions WHERE expires_at < ?');

  // ── schemas ──
  const selSchemas = db.prepare(
    'SELECT id, name, fields FROM schemas WHERE user_id = ? ORDER BY updated_at DESC',
  );
  const upsSchema = db.prepare(`
    INSERT INTO schemas (user_id, id, name, fields, updated_at)
    VALUES (@user_id, @id, @name, @fields, @updated_at)
    ON CONFLICT(user_id, id) DO UPDATE SET name = @name, fields = @fields, updated_at = @updated_at
  `);
  const delSchema = db.prepare('DELETE FROM schemas WHERE user_id = ? AND id = ?');

  // ── collections ──
  const selCollection = db.prepare(
    'SELECT id, data FROM collections WHERE user_id = ? AND collection = ? ORDER BY updated_at DESC',
  );
  const upsCollection = db.prepare(`
    INSERT INTO collections (user_id, collection, id, data, updated_at)
    VALUES (@user_id, @collection, @id, @data, @updated_at)
    ON CONFLICT(user_id, collection, id) DO UPDATE SET data = @data, updated_at = @updated_at
  `);
  const delCollection = db.prepare(
    'DELETE FROM collections WHERE user_id = ? AND collection = ? AND id = ?',
  );

  return {
    createUser({ id, email, passwordHash, salt }) {
      insUser.run({
        id,
        email,
        password_hash: passwordHash,
        salt,
        created_at: Date.now(),
      });
      return { id, email };
    },
    getUserByEmail(email) {
      const row = selUserByEmail.get(String(email));
      return row ? mapUser(row) : undefined;
    },
    getUserById(id) {
      const row = selUserById.get(String(id));
      return row ? mapUser(row) : undefined;
    },

    createSession({ token, userId, expiresAt }) {
      delExpiredSessions.run(Date.now());
      insSession.run({ token, user_id: userId, expires_at: expiresAt });
    },
    getSession(token) {
      const row = selSession.get(String(token));
      if (!row) return undefined;
      if (row.expires_at < Date.now()) {
        delSession.run(String(token));
        return undefined;
      }
      return { userId: row.user_id, expiresAt: row.expires_at };
    },
    deleteSession(token) {
      delSession.run(String(token));
    },

    listSchemas(userId) {
      return selSchemas.all(String(userId)).map((row) => ({
        id: row.id,
        name: row.name,
        origin: 'custom',
        fields: JSON.parse(row.fields),
      }));
    },
    upsertSchema(userId, schema) {
      upsSchema.run({
        user_id: String(userId),
        id: String(schema.id),
        name: String(schema.name),
        fields: JSON.stringify(schema.fields ?? []),
        updated_at: Date.now(),
      });
    },
    deleteSchema(userId, id) {
      delSchema.run(String(userId), String(id));
    },

    listCollection(userId, name) {
      return selCollection.all(String(userId), String(name)).map((row) => ({
        id: row.id,
        ...JSON.parse(row.data),
      }));
    },
    upsertCollectionItem(userId, name, item) {
      upsCollection.run({
        user_id: String(userId),
        collection: String(name),
        id: String(item.id),
        data: JSON.stringify(item),
        updated_at: Date.now(),
      });
    },
    deleteCollectionItem(userId, name, id) {
      delCollection.run(String(userId), String(name), String(id));
    },
  };
}

function mapUser(row) {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    salt: row.salt,
  };
}

/**
 * 旧スキーマ(user_id 列が無い頃の schemas/collections)からの移行。
 * dev 用ローカルDBのみを想定し、user_id 列が無い古いテーブルは作り直す
 * (server/data は .gitignore 対象の一時データ)。
 */
function migrateLegacyTables(db) {
  for (const table of ['schemas', 'collections']) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    const hasUserId = cols.some((c) => c.name === 'user_id');
    if (cols.length > 0 && !hasUserId) {
      db.exec(`DROP TABLE ${table}`);
    }
  }
  // 落とした場合に備えて、無ければ作り直す
  db.exec(`
    CREATE TABLE IF NOT EXISTS schemas (
      user_id    TEXT NOT NULL,
      id         TEXT NOT NULL,
      name       TEXT NOT NULL,
      fields     TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, id)
    );
    CREATE TABLE IF NOT EXISTS collections (
      user_id    TEXT NOT NULL,
      collection TEXT NOT NULL,
      id         TEXT NOT NULL,
      data       TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, collection, id)
    );
  `);
}
