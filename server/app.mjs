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

export { storageDriver };

export function createApp() {
  const app = express();

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
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  app.use(express.json({ limit: '4mb' }));

  const requireAuth = makeRequireAuth(store);

  const issueSession = (userId) => {
    const token = newSessionToken();
    store.createSession({ token, userId, expiresAt: sessionExpiry() });
    return token;
  };

  /** 疎通確認(フロントが API の有無を判定するのに使う) */
  app.get('/api/health', (_req, res) =>
    res.json({ ok: true, storage: storageDriver }),
  );

  // ── 認証(メール + パスワード) ──

  app.post('/api/auth/signup', (req, res) => {
    try {
      const { email, password } = req.body ?? {};
      if (!isValidEmail(email)) {
        return res.status(400).json({ error: 'メールアドレスの形式が正しくありません' });
      }
      if (typeof password !== 'string' || password.length < 8) {
        return res.status(400).json({ error: 'パスワードは8文字以上にしてください' });
      }
      if (store.getUserByEmail(email)) {
        return res.status(409).json({ error: 'このメールアドレスは登録済みです' });
      }
      const { hash, salt } = hashPassword(password);
      const user = store.createUser({
        id: newUserId(),
        email,
        passwordHash: hash,
        salt,
      });
      const token = issueSession(user.id);
      res.json({ token, user });
    } catch (e) {
      console.error('signup failed:', e);
      res.status(500).json({ error: `登録に失敗しました: ${e?.message ?? e}` });
    }
  });

  app.post('/api/auth/login', (req, res) => {
    try {
      const { email, password } = req.body ?? {};
      const user = isValidEmail(email) ? store.getUserByEmail(email) : undefined;
      // ユーザー不在でも同じレスポンスにして存在有無を漏らさない
      if (!user || !verifyPassword(password ?? '', user.salt, user.passwordHash)) {
        return res.status(401).json({ error: 'メールアドレスまたはパスワードが違います' });
      }
      const token = issueSession(user.id);
      res.json({ token, user: { id: user.id, email: user.email } });
    } catch (e) {
      console.error('login failed:', e);
      res.status(500).json({ error: `ログインに失敗しました: ${e?.message ?? e}` });
    }
  });

  app.post('/api/auth/logout', requireAuth, (req, res) => {
    try {
      store.deleteSession(req.sessionToken);
      res.json({ ok: true });
    } catch (e) {
      console.error('logout failed:', e);
      res.status(500).json({ error: `ログアウトに失敗しました: ${e?.message ?? e}` });
    }
  });

  app.get('/api/auth/me', requireAuth, (req, res) => {
    try {
      const user = store.getUserById(req.userId);
      if (!user) return res.status(401).json({ error: 'ユーザーが見つかりません' });
      res.json({ user: { id: user.id, email: user.email } });
    } catch (e) {
      console.error('me failed:', e);
      res.status(500).json({ error: `ユーザー情報の取得に失敗しました: ${e?.message ?? e}` });
    }
  });

  // ── LLM プロキシ(認証不要・ステートレス) ──

  app.post('/api/suggest', async (req, res) => {
    try {
      const { provider, model, apiKey, context } = req.body ?? {};
      const mapping = await runSuggest({ provider, model, apiKey, context });
      res.json(mapping);
    } catch (e) {
      const status = e.status ?? 502;
      res.status(status).json({ error: e.message ?? 'LLM推論に失敗しました' });
    }
  });

  app.post('/api/extract', async (req, res) => {
    try {
      const { provider, model, apiKey, text, target } = req.body ?? {};
      const result = await runExtract({ provider, model, apiKey, text, target });
      res.json(result);
    } catch (e) {
      const status = e.status ?? 502;
      res.status(status).json({ error: e.message ?? 'テキスト抽出に失敗しました' });
    }
  });

  // ── テンプレート(ユーザー単位・要ログイン) ──

  app.get('/api/schemas', requireAuth, (req, res) => {
    res.json(store.listSchemas(req.userId));
  });

  app.put('/api/schemas/:id', requireAuth, (req, res) => {
    const body = req.body ?? {};
    const schema = {
      id: req.params.id,
      name: typeof body.name === 'string' ? body.name : '',
      fields: Array.isArray(body.fields) ? body.fields : null,
    };
    if (!schema.name.trim() || !schema.fields) {
      return res.status(400).json({ error: 'name と fields(配列) は必須です' });
    }
    store.upsertSchema(req.userId, schema);
    res.json(store.listSchemas(req.userId));
  });

  app.delete('/api/schemas/:id', requireAuth, (req, res) => {
    store.deleteSchema(req.userId, req.params.id);
    res.json(store.listSchemas(req.userId));
  });

  // ── 汎用コレクション(レシピ等・ユーザー単位・要ログイン) ──
  const ALLOWED_COLLECTIONS = new Set(['recipes']);
  const guardCollection = (req, res, next) => {
    if (!ALLOWED_COLLECTIONS.has(req.params.name)) {
      return res.status(404).json({ error: 'unknown collection' });
    }
    next();
  };

  app.get('/api/collections/:name', requireAuth, guardCollection, (req, res) => {
    res.json(store.listCollection(req.userId, req.params.name));
  });

  app.put('/api/collections/:name/:id', requireAuth, guardCollection, (req, res) => {
    const item = { ...(req.body ?? {}), id: req.params.id };
    store.upsertCollectionItem(req.userId, req.params.name, item);
    res.json(store.listCollection(req.userId, req.params.name));
  });

  app.delete('/api/collections/:name/:id', requireAuth, guardCollection, (req, res) => {
    store.deleteCollectionItem(req.userId, req.params.name, req.params.id);
    res.json(store.listCollection(req.userId, req.params.name));
  });

  return app;
}
