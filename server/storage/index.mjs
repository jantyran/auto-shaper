/**
 * ストレージ層の入口(DBドライバの選択)。
 *
 * 環境変数 `DB_DRIVER` でドライバを選ぶ。既定は 'sqlite'。本番で別DBを使う
 * 場合は、`sqlite.mjs` / `postgres.mjs` と同じ「ストア契約」を満たすドライバを
 * 作り、ここの分岐に追加するだけで差し替えられる。
 *
 * ストア契約(呼び出し側は常に `await` する。sqlite ドライバは内部同期実装だが
 * async 関数でラップしても実害はなく、契約上はどのドライバも Promise を返す):
 *   createUser({ id, email, passwordHash, salt }) -> { id, email }
 *   getUserByEmail(email) -> { id, email, passwordHash, salt } | undefined
 *   getUserById(id)       -> { id, email, passwordHash, salt } | undefined
 *   createSession({ token, userId, expiresAt })
 *   getSession(token)     -> { userId, expiresAt } | undefined
 *   deleteSession(token)
 *   listSchemas(userId) / upsertSchema(userId, schema) / deleteSchema(userId, id)
 *   listCollection(userId, name) / upsertCollectionItem(userId, name, item)
 *   deleteCollectionItem(userId, name, id)
 *
 * 'postgres' は Neon 等のサーバーレス Postgres を想定(`DATABASE_URL` が必要、
 * `server/storage/postgres.mjs` 参照)。Cloud Functions / Cloud Run のような
 * ファイルシステムが永続しない実行環境ではこちらを使う。
 *
 * 各ドライバは動的 import で選んだものだけを読み込む(`sqlite.mjs` はネイティブ
 * モジュール `better-sqlite3` に依存するため、Cloud Functions 等の sqlite を
 * 使わない環境で不要にロード・ビルドされないようにする)。
 */
const driver = (process.env.DB_DRIVER || 'sqlite').toLowerCase();

async function createStore() {
  switch (driver) {
    case 'sqlite': {
      const { createSqliteStore } = await import('./sqlite.mjs');
      return createSqliteStore();
    }
    case 'postgres': {
      const { createPostgresStore } = await import('./postgres.mjs');
      return createPostgresStore();
    }
    default:
      throw new Error(
        `未対応の DB ドライバです: "${driver}"。現状は 'sqlite' / 'postgres' を実装しています。` +
          `本番用ドライバは server/storage/ に追加し、この分岐へ接続してください。`,
      );
  }
}

export const store = await createStore();
export const storageDriver = driver;
