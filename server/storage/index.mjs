/**
 * ストレージ層の入口(DBドライバの選択)。
 *
 * 環境変数 `DB_DRIVER` でドライバを選ぶ。既定は 'sqlite'。
 * 本番で別DB(Postgres 等)を使う場合は、`sqlite.mjs` と同じ「ストア契約」を
 * 満たすドライバを作り、ここの分岐に追加するだけで差し替えられる。
 *
 * ストア契約(すべて同期 or 同期的に扱える想定):
 *   createUser({ id, email, passwordHash, salt }) -> { id, email }
 *   getUserByEmail(email) -> { id, email, passwordHash, salt } | undefined
 *   getUserById(id)       -> { id, email, passwordHash, salt } | undefined
 *   createSession({ token, userId, expiresAt })
 *   getSession(token)     -> { userId, expiresAt } | undefined
 *   deleteSession(token)
 *   listSchemas(userId) / upsertSchema(userId, schema) / deleteSchema(userId, id)
 *   listCollection(userId, name) / upsertCollectionItem(userId, name, item)
 *   deleteCollectionItem(userId, name, id)
 */
import { createSqliteStore } from './sqlite.mjs';

const driver = (process.env.DB_DRIVER || 'sqlite').toLowerCase();

function createStore() {
  switch (driver) {
    case 'sqlite':
      return createSqliteStore();
    default:
      throw new Error(
        `未対応の DB ドライバです: "${driver}"。現状は 'sqlite' のみ実装しています。` +
          `本番用ドライバは server/storage/ に追加し、この分岐へ接続してください。`,
      );
  }
}

export const store = createStore();
export const storageDriver = driver;
