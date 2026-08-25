/**
 * Express アプリの組み立て(listen はしない)。
 *
 * この `createApp()` を、
 *  - スタンドアロン起動(`server/index.mjs` → `npm run server`)
 *  - Vite への組み込み(`vite.config.ts` の dev / preview に in-process でマウント)
 * の両方で共有する。これにより `npm run dev` / `npm run preview` 単体でも
 * API が同一オリジンで動く(別プロセス・proxy・CORS 不要)。
 *
 * 扱うのはテンプレート定義・マッピング(レシピ)などのメタ情報のみ。整形対象の
 * 実データはブラウザ内で処理され、このサーバーには送られない。
 * データはログインユーザー単位で保存(未ログインのフロントは localStorage で動作)。
 */
import express from 'express';
import { store, storageDriver } from './storage/index.mjs';
import {
  hashPassword,
  verifyPassword,
  newSessionToken,
  sessionExpiry,
  isValidEmail,
  newUserId,
  makeRequireAuth,
} from './auth.mjs';
import { runSuggest } from './suggest.mjs';
import { runExtract } from './extract.mjs';
import { rateLimit } from './rateLimit.mjs';

export { storageDriver };

export function createApp() {
  const app = express();

  // Firebase Hosting / Cloud Functions のような「信頼できるリバースプロキシ配下」
  // でだけ有効にする(TRUST_PROXY=1、server/firebase.mjs が既定で設定)。
  // プロキシが無い状態(npm run server を直接インターネットに公開等)で無条件に
  // 信頼すると、クライアントが X-Forwarded-For を偽装して req.ip を詐称でき、
  // IPベースのレート制限(server/rateLimit.mjs)を簡単に回避されてしまう。
  if (process.env.TRUST_PROXY === '1') {
    app.set('trust proxy', true);
  }

  /**
   * CORS。フロントを別オリジン(例: Live Server の http://host:5502)で配信する場合に必要。
   * 同一オリジン(Vite組み込み/同一ホスト配信)では実質不要だが付けても無害。
   * 認証は Cookie ではなく Authorization ヘッダ(Bearer)なので資格情報付きCORSは使わない。
   * 既定は全オリジン許可(ローカル個人利用向け)。`CORS_ORIGIN` で限定可能。
   */
  const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader(
        'Access-Control-Allow-Origin',
        CORS_ORIGIN === '*' ? origin : CORS_ORIGIN,
      );
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader(
      'Access-Control-Allow-Methods',
      'GET,POST,PUT,DELETE,OPTIONS',
    );
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization',
    );
    res.setHeader('Access-Control-Max-Age', '86400');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  app.use(express.json({ limit: '4mb' }));

  const requireAuth = makeRequireAuth(store);

  // ログイン試行のブルートフォース対策(IP単位)。
  const authLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 10,
    keyFn: (req) => req.ip,
    message: 'ログイン試行が多すぎます。5分ほど待ってから再試行してください。',
  });
  // LLM中継の乱打・スクリプト濫用対策(ユーザー単位。requireAuthの後に付ける)。
  const llmLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 30,
    keyFn: (req) => req.userId ?? req.ip,
    message: 'リクエストが多すぎます。5分ほど待ってから再試行してください。',
  });

  const issueSession = async (userId) => {
    const token = newSessionToken();
    await store.createSession({ token, userId, expiresAt: sessionExpiry() });
    return token;
  };

  /** 疎通確認(フロントが API の有無を判定するのに使う) */
  app.get('/api/health', (_req, res) =>
    res.json({ ok: true, storage: storageDriver }),
  );

  // ── 認証(メール + パスワード) ──

  app.post('/api/auth/signup', authLimiter, async (req, res) => {
    try {
      const { email, password } = req.body ?? {};
      if (!isValidEmail(email)) {
        return res
          .status(400)
          .json({ error: 'メールアドレスの形式が正しくありません' });
      }
      if (typeof password !== 'string' || password.length < 8) {
        return res
          .status(400)
          .json({ error: 'パスワードは8文字以上にしてください' });
      }
      if (await store.getUserByEmail(email)) {
        return res
          .status(409)
          .json({ error: 'このメールアドレスは登録済みです' });
      }
      const { hash, salt } = hashPassword(password);
      const user = await store.createUser({
        id: newUserId(),
        email,
        passwordHash: hash,
        salt,
      });
      const token = await issueSession(user.id);
      res.json({ token, user });
    } catch (e) {
      console.error('signup failed:', e);
      res.status(500).json({ error: `登録に失敗しました: ${e?.message ?? e}` });
    }
  });

  app.post('/api/auth/login', authLimiter, async (req, res) => {
    try {
      const { email, password } = req.body ?? {};
      const user = isValidEmail(email)
        ? await store.getUserByEmail(email)
        : undefined;
      // ユーザー不在でも同じレスポンスにして存在有無を漏らさない
      if (
        !user ||
        !verifyPassword(password ?? '', user.salt, user.passwordHash)
      ) {
        return res
          .status(401)
          .json({ error: 'メールアドレスまたはパスワードが違います' });
      }
      const token = await issueSession(user.id);
      res.json({ token, user: { id: user.id, email: user.email } });
    } catch (e) {
      console.error('login failed:', e);
      res
        .status(500)
        .json({ error: `ログインに失敗しました: ${e?.message ?? e}` });
    }
  });

  app.post('/api/auth/logout', requireAuth, async (req, res) => {
    try {
      await store.deleteSession(req.sessionToken);
      res.json({ ok: true });
    } catch (e) {
      console.error('logout failed:', e);
      res
        .status(500)
        .json({ error: `ログアウトに失敗しました: ${e?.message ?? e}` });
    }
  });

  app.get('/api/auth/me', requireAuth, async (req, res) => {
    try {
      const user = await store.getUserById(req.userId);
      if (!user)
        return res.status(401).json({ error: 'ユーザーが見つかりません' });
      res.json({ user: { id: user.id, email: user.email } });
    } catch (e) {
      console.error('me failed:', e);
      res.status(500).json({
        error: `ユーザー情報の取得に失敗しました: ${e?.message ?? e}`,
      });
    }
  });

  // ── LLM プロキシ(要ログイン。運営のサーバー費用を無関係な第三者の
  //    連打から守るため、ログイン必須 + レート制限を付ける) ──

  app.post('/api/suggest', requireAuth, llmLimiter, async (req, res) => {
    try {
      const { provider, model, apiKey, context } = req.body ?? {};
      const mapping = await runSuggest({ provider, model, apiKey, context });
      res.json(mapping);
    } catch (e) {
      const status = e.status ?? 502;
      res.status(status).json({ error: e.message ?? 'LLM推論に失敗しました' });
    }
  });

  app.post('/api/extract', requireAuth, llmLimiter, async (req, res) => {
    try {
      const { provider, model, apiKey, text, target } = req.body ?? {};
      const result = await runExtract({
        provider,
        model,
        apiKey,
        text,
        target,
      });
      res.json(result);
    } catch (e) {
      const status = e.status ?? 502;
      res
        .status(status)
        .json({ error: e.message ?? 'テキスト抽出に失敗しました' });
    }
  });

  // ── テンプレート(ユーザー単位・要ログイン) ──

  app.get('/api/schemas', requireAuth, async (req, res) => {
    try {
      res.json(await store.listSchemas(req.userId));
    } catch (e) {
      console.error('list schemas failed:', e);
      res.status(500).json({
        error: `テンプレートの取得に失敗しました: ${e?.message ?? e}`,
      });
    }
  });

  app.put('/api/schemas/:id', requireAuth, async (req, res) => {
    try {
      const body = req.body ?? {};
      const schema = {
        id: req.params.id,
        name: typeof body.name === 'string' ? body.name : '',
        fields: Array.isArray(body.fields) ? body.fields : null,
      };
      if (!schema.name.trim() || !schema.fields) {
        return res
          .status(400)
          .json({ error: 'name と fields(配列) は必須です' });
      }
      await store.upsertSchema(req.userId, schema);
      res.json(await store.listSchemas(req.userId));
    } catch (e) {
      console.error('upsert schema failed:', e);
      res.status(500).json({
        error: `テンプレートの保存に失敗しました: ${e?.message ?? e}`,
      });
    }
  });

  app.delete('/api/schemas/:id', requireAuth, async (req, res) => {
    try {
      await store.deleteSchema(req.userId, req.params.id);
      res.json(await store.listSchemas(req.userId));
    } catch (e) {
      console.error('delete schema failed:', e);
      res.status(500).json({
        error: `テンプレートの削除に失敗しました: ${e?.message ?? e}`,
      });
    }
  });

  // ── 汎用コレクション(レシピ等・ユーザー単位・要ログイン) ──
  const ALLOWED_COLLECTIONS = new Set(['recipes']);
  const guardCollection = (req, res, next) => {
    if (!ALLOWED_COLLECTIONS.has(req.params.name)) {
      return res.status(404).json({ error: 'unknown collection' });
    }
    next();
  };

  app.get(
    '/api/collections/:name',
    requireAuth,
    guardCollection,
    async (req, res) => {
      try {
        res.json(await store.listCollection(req.userId, req.params.name));
      } catch (e) {
        console.error('list collection failed:', e);
        res
          .status(500)
          .json({ error: `一覧の取得に失敗しました: ${e?.message ?? e}` });
      }
    },
  );

  app.put(
    '/api/collections/:name/:id',
    requireAuth,
    guardCollection,
    async (req, res) => {
      try {
        const item = { ...(req.body ?? {}), id: req.params.id };
        await store.upsertCollectionItem(req.userId, req.params.name, item);
        res.json(await store.listCollection(req.userId, req.params.name));
      } catch (e) {
        console.error('upsert collection item failed:', e);
        res
          .status(500)
          .json({ error: `保存に失敗しました: ${e?.message ?? e}` });
      }
    },
  );

  app.delete(
    '/api/collections/:name/:id',
    requireAuth,
    guardCollection,
    async (req, res) => {
      try {
        await store.deleteCollectionItem(
          req.userId,
          req.params.name,
          req.params.id,
        );
        res.json(await store.listCollection(req.userId, req.params.name));
      } catch (e) {
        console.error('delete collection item failed:', e);
        res
          .status(500)
          .json({ error: `削除に失敗しました: ${e?.message ?? e}` });
      }
    },
  );

  return app;
}
