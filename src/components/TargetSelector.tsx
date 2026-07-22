import { useStore } from '../state/store';
import { PRESET_SCHEMAS } from '../core/targetSchemas';
import { FileDrop } from './FileDrop';

/** ステップ2: インポート先フォーマット(ターゲットスキーマ)の選択 */
export function TargetSelector() {
  const selectSchema = useStore((s) => s.selectSchema);
  const loadUploadedTarget = useStore((s) => s.loadUploadedTarget);
  const isSuggesting = useStore((s) => s.isSuggesting);
  const source = useStore((s) => s.source);
  const customSchemas = useStore((s) => s.customSchemas);
  const setView = useStore((s) => s.setView);

  return (
    <div className="panel">
      <h2>2. インポート先フォーマットを選ぶ</h2>
      <p className="subtitle" style={{ marginBottom: 12 }}>
        整形後のデータをどのフォーマットに合わせるかを指定します。
      </p>

      {source && (
        <div className="alert info">
          読み込み済みソース: <b>{source.fileName}</b>（{source.columns.length}列 /{' '}
          {source.rows.length.toLocaleString()}行）
        </div>
      )}

      {isSuggesting && (
        <div className="alert info">AIがマッピングを推論しています…</div>
      )}

      {customSchemas.length > 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <h3 style={{ flex: 1 }}>あなたのテンプレート</h3>
            <button className="ghost" style={{ padding: '4px 12px' }} onClick={() => setView('admin')}>
              管理ページで編集
            </button>
          </div>
          <div className="card-grid">
            {customSchemas.map((schema) => (
              <button
                key={schema.id}
                className="select-card"
                disabled={isSuggesting}
                onClick={() => void selectSchema(schema.id)}
              >
                <span className="name">{schema.name}</span>
                <span className="meta">{schema.fields.length} フィールド・ユーザー定義</span>
              </button>
            ))}
          </div>
        </>
      )}

      <h3>プリセットから選ぶ</h3>
      <div className="card-grid">
        {PRESET_SCHEMAS.map((schema) => (
          <button
            key={schema.id}
            className="select-card"
            disabled={isSuggesting}
            onClick={() => void selectSchema(schema.id)}
          >
            <span className="name">{schema.name}</span>
            <span className="meta">{schema.fields.length} フィールド</span>
          </button>
        ))}
      </div>

      <h3>独自フォーマットをアップロード</h3>
      <p className="subtitle" style={{ marginBottom: 10 }}>
        インポート用シート（1行目がヘッダー）をアップロードすると、その列構成を
        ターゲットとして使います。繰り返し使うなら
        <button
          className="ghost"
          style={{ padding: '2px 8px', margin: '0 2px' }}
          onClick={() => setView('admin')}
        >
          テンプレート管理
        </button>
        で保存しておくと便利です。
      </p>
      <FileDrop
        title="インポート用シートをドロップ"
        hint="CSV / Excel（ヘッダー行のみでもOK）"
        onFile={(name, data) => void loadUploadedTarget(name, data)}
      />
    </div>
  );
}
