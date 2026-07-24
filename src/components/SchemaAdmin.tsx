import { useRef, useState } from 'react';
import { useStore } from '../state/store';
import type { DataType, TargetField, TargetSchema } from '../types';
import { PRESET_SCHEMAS, schemaFromUploadedHeader } from '../core/targetSchemas';
import { parseWorkbook } from '../core/parse';
import {
  createEmptyField,
  createEmptySchema,
  duplicateSchema,
  schemaFromImport,
} from '../core/schemaStore';

const TYPE_LABELS: Record<DataType, string> = {
  string: '文字列',
  number: '数値',
  date: '日付',
  email: 'メール',
  phone: '電話番号',
  url: 'URL',
  boolean: '真偽',
  empty: '空',
};
const EDITABLE_TYPES: DataType[] = [
  'string',
  'number',
  'date',
  'email',
  'phone',
  'url',
  'boolean',
];

/**
 * テンプレート管理ページ。整形プロセスとは独立して、インポート先フォーマット
 * (ターゲットスキーマ)をユーザーが自由に追加・編集・削除できる。
 */
export function SchemaAdmin() {
  const customSchemas = useStore((s) => s.customSchemas);
  const storageMode = useStore((s) => s.storageMode);
  const saveSchema = useStore((s) => s.saveSchema);
  const removeSchema = useStore((s) => s.removeSchema);

  // 編集中スキーマ(ドラフト)。null なら一覧表示。
  const [draft, setDraft] = useState<TargetSchema | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(customSchemas, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'auto-shaper-templates.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleImport = async (file: File) => {
    // .json はエクスポートしたテンプレート定義として取り込む。
    // それ以外(CSV/TSV/Excel)はヘッダー行から列を読み取り、型を推定して
    // 「編集画面」を開く → ユーザーが確認・調整してから保存する。
    const isJson = /\.json$/i.test(file.name);
    try {
      if (isJson) {
        const parsed = JSON.parse(await file.text());
        const list = Array.isArray(parsed) ? parsed : [parsed];
        for (const raw of list) {
          await saveSchema(schemaFromImport(raw));
        }
      } else {
        const buf = await file.arrayBuffer();
        const dataset = await parseWorkbook(file.name, buf);
        if (dataset.columns.length === 0) {
          alert('列が読み取れませんでした。1行目にヘッダーがあるCSV/Excelを選んでください。');
          return;
        }
        const base = file.name.replace(/\.[^.]+$/, '');
        const inferred = schemaFromUploadedHeader(dataset);
        // 確認・編集できるドラフトとして開く(保存時に custom として永続化)
        setDraft({ ...inferred, origin: 'custom', name: base });
      }
    } catch {
      alert(
        'ファイルの読み込みに失敗しました。テンプレートJSON、またはヘッダー行のあるCSV/Excelを選んでください。',
      );
    }
  };

  if (draft) {
    return (
      <SchemaEditor
        draft={draft}
        onChange={setDraft}
        onSave={() => {
          saveSchema(draft);
          setDraft(null);
        }}
        onCancel={() => setDraft(null)}
      />
    );
  }

  return (
    <div className="panel">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>テンプレート管理</h2>
        <span className={`storage-badge ${storageMode === 'api' ? 'api' : ''}`}>
          <span className="dot" />
          {storageMode === 'api'
            ? '保存先: SQLite（サーバー同期）'
            : storageMode === 'local'
              ? '保存先: このブラウザ（localStorage）'
              : '保存先を確認中…'}
        </span>
        <div className="spacer" />
        <button onClick={handleExport} disabled={customSchemas.length === 0}>
          エクスポート
        </button>
        <button onClick={() => importRef.current?.click()}>
          インポート（JSON / CSV / Excel）
        </button>
        <input
          ref={importRef}
          type="file"
          accept="application/json,.json,.csv,.tsv,.txt,.xlsx,.xls"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleImport(f);
            e.target.value = '';
          }}
        />
        <button className="primary" onClick={() => setDraft(createEmptySchema())}>
          + 新規テンプレートを作成
        </button>
      </div>
      <p className="subtitle" style={{ marginTop: 8 }}>
        整形後（インポート先）のフォーマットをここで管理します。エクスポートしたJSONに加え、
        <b>CSV / Excel のヘッダー行からもテンプレートを作成</b>できます（読み込むと型を推定した
        編集画面が開くので、確認・調整してから保存します）。
        {storageMode === 'api'
          ? 'テンプレートはSQLiteサーバーに保存され、他の端末やチームでも共有できます。'
          : 'テンプレートはこのブラウザに保存されます（サーバーを起動すると自動でSQLite保存に切り替わります）。'}
      </p>

      <h3>あなたのテンプレート</h3>
      {customSchemas.length === 0 ? (
        <div className="alert info">
          まだテンプレートがありません。「+ 新規テンプレートを作成」から追加するか、
          下のプリセットを複製して編集できます。
        </div>
      ) : (
        <div className="card-grid">
          {customSchemas.map((s) => (
            <div key={s.id} className="mapping-row" style={{ marginBottom: 0 }}>
              <div className="mapping-head">
                <span className="target-name" style={{ minWidth: 0 }}>
                  {s.name}
                </span>
              </div>
              <p className="rationale">{s.fields.length} フィールド</p>
              <div className="btn-row" style={{ marginTop: 10 }}>
                <button onClick={() => setDraft(structuredClone(s))}>編集</button>
                <button
                  className="ghost"
                  onClick={() => setDraft(duplicateSchema(s))}
                >
                  複製
                </button>
                <div className="spacer" />
                <button
                  className="ghost"
                  onClick={() => {
                    if (confirm(`「${s.name}」を削除しますか？`)) removeSchema(s.id);
                  }}
                >
                  削除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <h3>プリセット（読み取り専用・複製して編集可）</h3>
      <div className="card-grid">
        {PRESET_SCHEMAS.map((s) => (
          <div key={s.id} className="mapping-row" style={{ marginBottom: 0 }}>
            <div className="mapping-head">
              <span className="target-name" style={{ minWidth: 0 }}>
                {s.name}
              </span>
            </div>
            <p className="rationale">{s.fields.length} フィールド</p>
            <div className="btn-row" style={{ marginTop: 10 }}>
              <button onClick={() => setDraft(duplicateSchema(s))}>
                複製して編集
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface EditorProps {
  draft: TargetSchema;
  onChange: (s: TargetSchema) => void;
  onSave: () => void;
  onCancel: () => void;
}

function SchemaEditor({ draft, onChange, onSave, onCancel }: EditorProps) {
  const setField = (i: number, patch: Partial<TargetField>) => {
    const fields = draft.fields.map((f, idx) =>
      idx === i ? { ...f, ...patch } : f,
    );
    onChange({ ...draft, fields });
  };
  const removeField = (i: number) =>
    onChange({ ...draft, fields: draft.fields.filter((_, idx) => idx !== i) });
  const addField = () =>
    onChange({ ...draft, fields: [...draft.fields, createEmptyField()] });
  const moveField = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= draft.fields.length) return;
    const fields = [...draft.fields];
    [fields[i], fields[j]] = [fields[j], fields[i]];
    onChange({ ...draft, fields });
  };

  // 保存可能条件: 名前があり、全フィールドにキーがあり、キーが重複しない
  const keys = draft.fields.map((f) => f.key.trim());
  const dupKeys = keys.filter((k, i) => k !== '' && keys.indexOf(k) !== i);
  const emptyKey = draft.fields.some((f) => f.key.trim() === '');
  const problems: string[] = [];
  if (draft.name.trim() === '') problems.push('テンプレート名を入力してください');
  if (draft.fields.length === 0) problems.push('項目を1つ以上追加してください');
  if (emptyKey) problems.push('すべての項目にキー（出力列名）が必要です');
  if (dupKeys.length > 0)
    problems.push(`キーが重複しています: ${[...new Set(dupKeys)].join(', ')}`);

  return (
    <div className="panel">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>テンプレートを編集</h2>
      </div>

      <div style={{ marginTop: 14, marginBottom: 8 }}>
        <label className="field-label">
          テンプレート名
          <input
            type="text"
            style={{ maxWidth: 360 }}
            value={draft.name}
            placeholder="例: 自社CRM インポート用"
            onChange={(e) => onChange({ ...draft, name: e.target.value })}
          />
        </label>
      </div>

      <h3>項目（出力フィールド）</h3>
      <p className="subtitle" style={{ marginBottom: 12 }}>
        「キー」は出力CSVの列名になります。「別名」はカンマ区切りで、AIが元データの
        どの列を割り当てるかの判定に使われます（多いほどマッチ精度が上がります）。
      </p>

      <div className="admin-head">
        <span>キー（出力列名）</span>
        <span>表示名</span>
        <span>型</span>
        <span>別名（カンマ区切り）</span>
        <span>必須</span>
        <span></span>
      </div>

      {draft.fields.map((f, i) => (
        <div key={i} className="admin-row">
          <input
            type="text"
            placeholder="Company"
            value={f.key}
            onChange={(e) => setField(i, { key: e.target.value })}
          />
          <input
            type="text"
            placeholder="会社名"
            value={f.label}
            onChange={(e) => setField(i, { label: e.target.value })}
          />
          <select
            value={f.type}
            onChange={(e) => setField(i, { type: e.target.value as DataType })}
          >
            {EDITABLE_TYPES.map((t) => (
              <option key={t} value={t}>
                {TYPE_LABELS[t]}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="会社名, 企業名, company"
            value={f.aliases.join(', ')}
            onChange={(e) =>
              setField(i, {
                aliases: e.target.value
                  .split(',')
                  .map((a) => a.trim())
                  .filter((a) => a !== ''),
              })
            }
          />
          <label style={{ display: 'flex', justifyContent: 'center' }}>
            <input
              type="checkbox"
              checked={f.required}
              onChange={(e) => setField(i, { required: e.target.checked })}
            />
          </label>
          <div className="admin-actions">
            <button className="icon" title="上へ" onClick={() => moveField(i, -1)}>
              ↑
            </button>
            <button className="icon" title="下へ" onClick={() => moveField(i, 1)}>
              ↓
            </button>
            <button className="icon" title="削除" onClick={() => removeField(i)}>
              ×
            </button>
          </div>
        </div>
      ))}

      <div className="btn-row">
        <button onClick={addField}>+ 項目を追加</button>
      </div>

      {problems.length > 0 && (
        <div className="alert error" style={{ marginTop: 16 }}>
          {problems.map((p) => (
            <div key={p}>・{p}</div>
          ))}
        </div>
      )}

      <div className="btn-row">
        <button className="ghost" onClick={onCancel}>
          キャンセル
        </button>
        <div className="spacer" />
        <button className="primary" disabled={problems.length > 0} onClick={onSave}>
          保存
        </button>
      </div>
    </div>
  );
}
