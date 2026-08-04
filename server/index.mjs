/**
 * テンプレート/レシピ永続化と認証のための小さな REST API(Express)。
 *
 * このサーバーが扱うのはテンプレート定義・マッピング(レシピ)などのメタ情報のみ。
 * 整形対象の実データはブラウザ内で処理され、このサーバーには送られない。
 *
 * データはログインユーザー単位で保存する(未ログインのフロントは localStorage で動作)。
 * DBドライバは storage/ 層で差し替え可能(既定は SQLite、DB_DRIVER で選択)。
 *
 * 開発時は Vite の proxy 設定により、フロントの `/api/*` がここへ転送される。
 * サーバーを起動しない/ログインしない場合、フロントは localStorage 保存で動作する。
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

const app = express();

/**
 * CORS。フロントを別オリジン(例: Live Server の http://localhost:5502)で配信する場合に
 * 必要。認証は Cookie ではなく Authorization ヘッダ(Bearer)なので、資格情報付きCORSは使わない。
 * 既定は全オリジン許可(ローカル個人利用向け)。`CORS_ORIGIN` で特定オリジンに限定可能。
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

/** 疎通確認(フロントが API の有無を判定するのに使う) */
app.get('/api/health', (_req, res) =>
  res.json({ ok: true, storage: storageDriver }),
);

// ─────────────────────────────────────────────
// 認証(メール + パスワード)
// ─────────────────────────────────────────────

/** 新規登録。成功時はセッショントークンとユーザー情報を返す */
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
    // DB書き込み等で失敗したときは、原因が分かるようにメッセージを返す
    console.error('signup failed:', e);
    res.status(500).json({ error: `登録に失敗しました: ${e?.message ?? e}` });
  }
});

/** ログイン */
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

/** ログアウト(セッション破棄) */
app.post('/api/auth/logout', requireAuth, (req, res) => {
  try {
    store.deleteSession(req.sessionToken);
    res.json({ ok: true });
  } catch (e) {
    console.error('logout failed:', e);
    res.status(500).json({ error: `ログアウトに失敗しました: ${e?.message ?? e}` });
  }
});

/** 現在のユーザー情報(トークン検証) */
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

function issueSession(userId) {
  const token = newSessionToken();
  store.createSession({ token, userId, expiresAt: sessionExpiry() });
  return token;
}

// ─────────────────────────────────────────────
// LLM プロキシ(認証不要・ステートレス)
// ─────────────────────────────────────────────

/**
 * LLM マッピング推論。受け取るのはマスキング済みコンテキストと接続情報のみ。
 * APIキーはこのリクエストで受け取り、プロバイダ呼び出しに使うだけで保存しない。
 */
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

/**
 * フリーテキスト → テンプレート抽出。受け取るのは（マスク済みの）本文・テンプレ定義・接続情報のみ。
 * APIキーはこのリクエストで受け取り、プロバイダ呼び出しに使うだけで保存しない。
 */
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

// ─────────────────────────────────────────────
// テンプレート(ユーザー単位・要ログイン)
// ─────────────────────────────────────────────

/** 一覧 */
app.get('/api/schemas', requireAuth, (req, res) => {
  res.json(store.listSchemas(req.userId));
});

/** 追加/更新(冪等・URLのidを正とする)。更新後の全一覧を返す */
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

/** 削除。削除後の全一覧を返す */
app.delete('/api/schemas/:id', requireAuth, (req, res) => {
  store.deleteSchema(req.userId, req.params.id);
  res.json(store.listSchemas(req.userId));
});

// ── 汎用コレクション(レシピ等・ユーザー単位・要ログイン) ──
const ALLOWED_COLLECTIONS = new Set(['recipes']);
function guardCollection(req, res, next) {
  if (!ALLOWED_COLLECTIONS.has(req.params.name)) {
    return res.status(404).json({ error: 'unknown collection' });
  }
  next();
}

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

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => {
  console.log(
    `Auto Shaper API: http://localhost:${PORT} (DB driver: ${storageDriver})`,
  );
});
