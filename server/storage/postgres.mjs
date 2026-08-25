/**
 * Postgres(Neon)ストレージドライバ。
 *
 * `storage/index.mjs` が公開するストア契約(ユーザー・セッション・
 * テンプレート・コレクション)を Neon のサーバーレス HTTP ドライバで実装する。
 * `sqlite.mjs` と同じテーブル構成・同じ upsert 方針(ON CONFLICT)なので、
 * クエリの組み立ても ほぼ 1:1 で対応する。
 *
 * Cloud Functions / Cloud Run のようなステートレスな実行環境から使う想定のため、
 * 常駐コネクションプールを持たない HTTP ベースのドライバ(`@neondatabase/serverless`)
 * を使う。DATA_DIR のようなローカルファイルは持たない。
 *
 * 必須環境変数: `DATABASE_URL`(Neon の接続文字列)。
 */
import { neon } from '@neondatabase/serverless';

async function ensureSchema(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      email         TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      salt          TEXT NOT NULL,
      created_at    BIGINT NOT NULL
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      token      TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      expires_at BIGINT NOT NULL
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS schemas (
      user_id    TEXT NOT NULL,
      id         TEXT NOT NULL,
      name       TEXT NOT NULL,
      fields     TEXT NOT NULL,
      updated_at BIGINT NOT NULL,
      PRIMARY KEY (user_id, id)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS collections (
      user_id    TEXT NOT NULL,
      collection TEXT NOT NULL,
      id         TEXT NOT NULL,
      data       TEXT NOT NULL,
      updated_at BIGINT NOT NULL,
      PRIMARY KEY (user_id, collection, id)
    )
  `;
}

export async function createPostgresStore() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DB_DRIVER=postgres には環境変数 DATABASE_URL が必要です(Neon の接続文字列。'postgresql://...'形式)",
    );
  }
  const sql = neon(connectionString);
  await ensureSchema(sql);

  return {
    async createUser({ id, email, passwordHash, salt }) {
      await sql`
        INSERT INTO users (id, email, password_hash, salt, created_at)
        VALUES (${id}, ${email}, ${passwordHash}, ${salt}, ${Date.now()})
      `;
      return { id, email };
    },
    async getUserByEmail(email) {
      const rows =
        await sql`SELECT * FROM users WHERE email = ${String(email)}`;
      return rows[0] ? mapUser(rows[0]) : undefined;
    },
    async getUserById(id) {
      const rows = await sql`SELECT * FROM users WHERE id = ${String(id)}`;
      return rows[0] ? mapUser(rows[0]) : undefined;
    },

    async createSession({ token, userId, expiresAt }) {
      await sql`DELETE FROM sessions WHERE expires_at < ${Date.now()}`;
      await sql`
        INSERT INTO sessions (token, user_id, expires_at)
        VALUES (${token}, ${userId}, ${expiresAt})
      `;
    },
    async getSession(token) {
      const rows = await sql`
        SELECT user_id, expires_at FROM sessions WHERE token = ${String(token)}
      `;
      const row = rows[0];
      if (!row) return undefined;
      if (Number(row.expires_at) < Date.now()) {
        await sql`DELETE FROM sessions WHERE token = ${String(token)}`;
        return undefined;
      }
      return { userId: row.user_id, expiresAt: Number(row.expires_at) };
    },
    async deleteSession(token) {
      await sql`DELETE FROM sessions WHERE token = ${String(token)}`;
    },

    async listSchemas(userId) {
      const rows = await sql`
        SELECT id, name, fields FROM schemas
        WHERE user_id = ${String(userId)}
        ORDER BY updated_at DESC
      `;
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        origin: 'custom',
        fields: JSON.parse(row.fields),
      }));
    },
    async upsertSchema(userId, schema) {
      await sql`
        INSERT INTO schemas (user_id, id, name, fields, updated_at)
        VALUES (
          ${String(userId)}, ${String(schema.id)}, ${String(schema.name)},
          ${JSON.stringify(schema.fields ?? [])}, ${Date.now()}
        )
        ON CONFLICT (user_id, id) DO UPDATE
        SET name = EXCLUDED.name, fields = EXCLUDED.fields, updated_at = EXCLUDED.updated_at
      `;
    },
    async deleteSchema(userId, id) {
      await sql`DELETE FROM schemas WHERE user_id = ${String(userId)} AND id = ${String(id)}`;
    },

    async listCollection(userId, name) {
      const rows = await sql`
        SELECT id, data FROM collections
        WHERE user_id = ${String(userId)} AND collection = ${String(name)}
        ORDER BY updated_at DESC
      `;
      return rows.map((row) => ({ id: row.id, ...JSON.parse(row.data) }));
    },
    async upsertCollectionItem(userId, name, item) {
      await sql`
        INSERT INTO collections (user_id, collection, id, data, updated_at)
        VALUES (
          ${String(userId)}, ${String(name)}, ${String(item.id)},
          ${JSON.stringify(item)}, ${Date.now()}
        )
        ON CONFLICT (user_id, collection, id) DO UPDATE
        SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at
      `;
    },
    async deleteCollectionItem(userId, name, id) {
      await sql`
        DELETE FROM collections
        WHERE user_id = ${String(userId)} AND collection = ${String(name)} AND id = ${String(id)}
      `;
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
