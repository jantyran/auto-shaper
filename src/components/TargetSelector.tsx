import { useStore } from '../state/store';
import { PRESET_SCHEMAS } from '../core/targetSchemas';
import { FileDrop } from './FileDrop';

/** ステップ2: インポート先フォーマット(ターゲットスキーマ)の選択 */
export function TargetSelector() {
  const selectPreset = useStore((s) => s.selectPreset);
  const loadUploadedTarget = useStore((s) => s.loadUploadedTarget);
  const isSuggesting = useStore((s) => s.isSuggesting);
  const source = useStore((s) => s.source);

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

      <h3>プリセットから選ぶ</h3>
      <div className="card-grid">
        {PRESET_SCHEMAS.map((schema) => (
          <button
            key={schema.id}
            className="select-card"
            disabled={isSuggesting}
            onClick={() => void selectPreset(schema.id)}
          >
            <span className="name">{schema.name}</span>
            <span className="meta">{schema.fields.length} フィールド</span>
          </button>
        ))}
      </div>

      <h3>独自フォーマットをアップロード</h3>
      <p className="subtitle" style={{ marginBottom: 10 }}>
        インポート用シート（1行目がヘッダー）をアップロードすると、その列構成を
        ターゲットとして使います。
      </p>
      <FileDrop
        title="インポート用シートをドロップ"
        hint="CSV / Excel（ヘッダー行のみでもOK）"
        onFile={(name, data) => void loadUploadedTarget(name, data)}
      />
    </div>
  );
}
