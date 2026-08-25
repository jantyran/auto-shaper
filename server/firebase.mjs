/**
 * Firebase Cloud Functions(2nd gen)のエントリポイント。
 *
 * Firebase Hosting の rewrite(`firebase.json`)で `/api/**` をこの `api` 関数へ
 * ルーティングする。Express アプリ本体は `createApp()`(`server/app.mjs`)を
 * そのまま使う(listen はしない。Functions Framework がリクエストを渡す)。
 *
 * Cloud Functions はファイルシステムが永続しないため、DB は既定で
 * `postgres`(Neon 等)を使う。`DATABASE_URL` は Secret Manager 経由で渡す
 * (`firebase functions:secrets:set DATABASE_URL`)。
 */
import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';

process.env.DB_DRIVER = process.env.DB_DRIVER || 'postgres';
// Hosting/Cloud Functions は信頼できるリバースプロキシなので、req.ip をそこから
// 復元してよい(server/app.mjs 参照。IPベースのレート制限が正しく効くために必要)。
process.env.TRUST_PROXY = process.env.TRUST_PROXY || '1';

const databaseUrl = defineSecret('DATABASE_URL');

// createApp() は storage/index.mjs の初期化(DB接続含む)を待つ必要があるため、
// シークレットが注入されてから動的 import する。
const appPromise = import('./app.mjs').then((m) => m.createApp());

export const api = onRequest({ secrets: [databaseUrl] }, async (req, res) => {
  const app = await appPromise;
  app(req, res);
});
