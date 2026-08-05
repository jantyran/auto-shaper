/**
 * スタンドアロンの API サーバー(`npm run server`)。
 *
 * `createApp()` で組み立てた Express アプリを 8787 で listen するだけ。
 * フロントを別オリジン(Live Server 等)や別ホスト/本番で配信する場合に使う。
 *
 * `npm run dev` / `npm run preview` では、この listen は不要で、`vite.config.ts`
 * が同じ `createApp()` を dev/preview サーバーへ in-process でマウントする。
 */
import { createApp, storageDriver } from './app.mjs';

const app = createApp();
const PORT = process.env.PORT || 8787;
app.listen(PORT, () => {
  console.log(
    `Auto Shaper API: http://localhost:${PORT} (DB driver: ${storageDriver})`,
  );
});
