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
import { listSchemas, upsertSchema, deleteSchema } from './db.mjs';

const app = express();
app.use(express.json({ limit: '4mb' }));

/** 疎通確認(フロントが API の有無を判定するのに使う) */
app.get('/api/health', (_req, res) => res.json({ ok: true, storage: 'sqlite' }));

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

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => {
  console.log(`Auto Shaper テンプレートAPI: http://localhost:${PORT} (SQLite)`);
});
