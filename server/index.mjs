/**
 * テンプレート永続化のためのごく小さな REST API(Express + SQLite)。
 *
 * このサーバーが扱うのはテンプレート定義のみ。整形対象の実データは
 * ブラウザ内で処理され、このサーバーには送られない。
 *
 * 開発時は Vite の proxy 設定により、フロントの `/api/*` がここへ転送される。
 * サーバーを起動しない場合、フロントは自動的に localStorage 保存へフォールバックする。
 */
import express from 'express';
import {
  listSchemas,
  upsertSchema,
  deleteSchema,
  listCollection,
  upsertCollectionItem,
  deleteCollectionItem,
} from './db.mjs';
import { runSuggest } from './suggest.mjs';

const app = express();
app.use(express.json({ limit: '4mb' }));

/** 疎通確認(フロントが API の有無を判定するのに使う) */
app.get('/api/health', (_req, res) => res.json({ ok: true, storage: 'sqlite' }));

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

/** 一覧 */
app.get('/api/schemas', (_req, res) => {
  res.json(listSchemas());
});

/** 追加/更新(冪等・URLのidを正とする)。更新後の全一覧を返す */
app.put('/api/schemas/:id', (req, res) => {
  const body = req.body ?? {};
  const schema = {
    id: req.params.id,
    name: typeof body.name === 'string' ? body.name : '',
    fields: Array.isArray(body.fields) ? body.fields : null,
  };
  if (!schema.name.trim() || !schema.fields) {
    return res.status(400).json({ error: 'name と fields(配列) は必須です' });
  }
  upsertSchema(schema);
  res.json(listSchemas());
});

/** 削除。削除後の全一覧を返す */
app.delete('/api/schemas/:id', (req, res) => {
  deleteSchema(req.params.id);
  res.json(listSchemas());
});

// ── 汎用コレクション(レシピ等) ──
const ALLOWED_COLLECTIONS = new Set(['recipes']);
function guardCollection(req, res, next) {
  if (!ALLOWED_COLLECTIONS.has(req.params.name)) {
    return res.status(404).json({ error: 'unknown collection' });
  }
  next();
}

app.get('/api/collections/:name', guardCollection, (req, res) => {
  res.json(listCollection(req.params.name));
});

app.put('/api/collections/:name/:id', guardCollection, (req, res) => {
  const item = { ...(req.body ?? {}), id: req.params.id };
  upsertCollectionItem(req.params.name, item);
  res.json(listCollection(req.params.name));
});

app.delete('/api/collections/:name/:id', guardCollection, (req, res) => {
  deleteCollectionItem(req.params.name, req.params.id);
  res.json(listCollection(req.params.name));
});

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => {
  console.log(`Auto Shaper テンプレートAPI: http://localhost:${PORT} (SQLite)`);
});
