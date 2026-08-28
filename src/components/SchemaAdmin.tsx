import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import type {
  AutoFillCase,
  ConditionOp,
  DataType,
  FieldAutoFillRule,
  FieldInputKind,
  TargetField,
  TargetSchema,
} from '../types';
import {
  PRESET_SCHEMAS,
  schemaFromUploadedHeader,
} from '../core/targetSchemas';
import { parseWorkbook } from '../core/parse';
import {
  createEmptyField,
  createEmptySchema,
  duplicateSchema,
  schemaFromImport,
  sortCustomSchemas,
} from '../core/schemaStore';
import { fieldDisplayName, fieldInputKind } from '../core/fieldMeta';
import { TemplateExportDialog, TemplateImportDialog } from './TemplateTransfer';
import {
  expressionHelpText,
  validateAutoFillExpression,
} from '../core/autoFillExpression';

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

const INPUT_KIND_LABELS: Record<FieldInputKind, string> = {
  text: '短文入力',
  textarea: '長文入力',
  select: '選択式',
};

const INPUT_KINDS: FieldInputKind[] = ['text', 'textarea', 'select'];

const CONDITION_LABELS: Record<ConditionOp, string> = {
  contains: '含む',
  equals: '一致',
  startsWith: 'で始まる',
  endsWith: 'で終わる',
  isEmpty: '空欄',
  notEmpty: '空欄ではない',
};

const CONDITION_OPS: ConditionOp[] = [
  'contains',
  'equals',
  'startsWith',
  'endsWith',
  'isEmpty',
  'notEmpty',
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
  // JSONから読み取って、まだ追加していないテンプレート(選択ダイアログ用)
  const [pending, setPending] = useState<{
    fileName: string;
    candidates: TargetSchema[];
  } | null>(null);
  const [exporting, setExporting] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const sortedCustomSchemas = sortCustomSchemas(customSchemas);

  const saveOrderedSchemas = async (schemas: TargetSchema[]) => {
    for (const [index, schema] of schemas.entries()) {
      await saveSchema({ ...schema, sortOrder: index });
    }
  };

  const moveSchema = (index: number, dir: -1 | 1) => {
    const nextIndex = index + dir;
    if (nextIndex < 0 || nextIndex >= sortedCustomSchemas.length) return;
    const next = [...sortedCustomSchemas];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    void saveOrderedSchemas(next);
  };

  const makeDefaultSchema = async (id: string) => {
    for (const schema of sortedCustomSchemas) {
      await saveSchema({ ...schema, isDefault: schema.id === id });
    }
  };

  const handleImport = async (file: File) => {
    // .json はエクスポートしたテンプレート定義として取り込む。中身を一覧で
    // 見せてから選ばせるため、ここでは読み取るだけで保存はしない。
    // それ以外(CSV/TSV/Excel)はヘッダー行から列を読み取り、型を推定して
    // 「編集画面」を開く → ユーザーが確認・調整してから保存する。
    const isJson = /\.json$/i.test(file.name);
    try {
      if (isJson) {
        const parsed = JSON.parse(await file.text());
        const list = (Array.isArray(parsed) ? parsed : [parsed]) as unknown[];
        const candidates = list
          .filter((raw) => raw && typeof raw === 'object')
          .map((raw) => schemaFromImport(raw));
        if (candidates.length === 0) {
          alert('テンプレートが見つかりませんでした。');
          return;
        }
        setPending({ fileName: file.name, candidates });
      } else {
        const buf = await file.arrayBuffer();
        const dataset = await parseWorkbook(file.name, buf);
        if (dataset.columns.length === 0) {
          alert(
            '列が読み取れませんでした。見出し行のあるCSV/Excelを選んでください。',
          );
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
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
        data-tour="tour-admin-toolbar"
      >
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
        <button
          onClick={() => setExporting(true)}
          disabled={customSchemas.length === 0}
        >
          エクスポート（選択）
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
        <button
          className="primary"
          onClick={() => setDraft(createEmptySchema())}
        >
          + 新規テンプレートを作成
        </button>
      </div>

      {exporting && (
        <TemplateExportDialog
          schemas={sortedCustomSchemas}
          onClose={() => setExporting(false)}
        />
      )}
      {pending && (
        <TemplateImportDialog
          fileName={pending.fileName}
          candidates={pending.candidates}
          existingNames={customSchemas.map((s) => s.name)}
          onCancel={() => setPending(null)}
          onConfirm={async (schemas) => {
            setPending(null);
            for (const schema of schemas) {
              await saveSchema(schema);
            }
          }}
        />
      )}
      <p className="subtitle" style={{ marginTop: 8 }}>
        整形後（インポート先）のフォーマットをここで管理します。エクスポートしたJSONに加え、
        <b>CSV / Excel のヘッダー行からもテンプレートを作成</b>
        できます（読み込むと型を推定した
        編集画面が開くので、確認・調整してから保存します）。
        {storageMode === 'api'
          ? 'テンプレートはSQLiteサーバーに保存され、他の端末やチームでも共有できます。'
          : 'テンプレートはこのブラウザに保存されます（サーバーを起動すると自動でSQLite保存に切り替わります）。'}
      </p>

      <div data-tour="tour-admin-list">
        <h3>あなたのテンプレート</h3>
        {sortedCustomSchemas.length === 0 ? (
          <div className="alert info">
            {
              'まだテンプレートがありません。「+ 新規テンプレートを作成」から追加するか、下のプリセットを複製して編集できます。'
            }
          </div>
        ) : (
          <div className="card-grid">
            {sortedCustomSchemas.map((s, i) => (
              <div
                key={s.id}
                className="mapping-row"
                style={{ marginBottom: 0 }}
              >
                <div className="mapping-head">
                  <span className="target-name" style={{ minWidth: 0 }}>
                    {s.name}
                  </span>
                  {s.isDefault && (
                    <span className="field-kind-badge">既定</span>
                  )}
                </div>
                <p className="rationale">{s.fields.length} フィールド</p>
                <div className="btn-row" style={{ marginTop: 10 }}>
                  <button onClick={() => setDraft(structuredClone(s))}>
                    編集
                  </button>
                  <button
                    className="ghost"
                    onClick={() => setDraft(duplicateSchema(s))}
                  >
                    複製
                  </button>
                  <button
                    className="ghost"
                    disabled={s.isDefault}
                    onClick={() => void makeDefaultSchema(s.id)}
                  >
                    既定にする
                  </button>
                  <button
                    className="icon"
                    title="上へ"
                    disabled={i === 0}
                    onClick={() => moveSchema(i, -1)}
                  >
                    ↑
                  </button>
                  <button
                    className="icon"
                    title="下へ"
                    disabled={i === sortedCustomSchemas.length - 1}
                    onClick={() => moveSchema(i, 1)}
                  >
                    ↓
                  </button>
                  <div className="spacer" />
                  <button
                    className="ghost"
                    onClick={() => {
                      if (confirm(`「${s.name}」を削除しますか？`))
                        removeSchema(s.id);
                    }}
                  >
                    削除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

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
  const [dragIndex, setDragIndex] = useState<number | null>(null);

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
  const reorderField = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return;
    const fields = [...draft.fields];
    const [moved] = fields.splice(from, 1);
    if (!moved) return;
    fields.splice(to, 0, moved);
    onChange({ ...draft, fields });
  };

  // 保存可能条件: 名前があり、全フィールドにキーがあり、キーが重複しない
  const keys = draft.fields.map((f) => f.key.trim());
  const dupKeys = keys.filter((k, i) => k !== '' && keys.indexOf(k) !== i);
  const emptyKey = draft.fields.some((f) => f.key.trim() === '');
  const problems: string[] = [];
  if (draft.name.trim() === '')
    problems.push('テンプレート名を入力してください');
  if (draft.fields.length === 0) problems.push('項目を1つ以上追加してください');
  if (emptyKey) problems.push('すべての項目にキー（出力列名）が必要です');
  if (dupKeys.length > 0)
    problems.push(`キーが重複しています: ${[...new Set(dupKeys)].join(', ')}`);
  for (const field of draft.fields) {
    const message = validateAutoFillExpression(
      field.autoFill?.expression,
      draft.fields,
    );
    if (message) {
      problems.push(`${fieldDisplayName(field)} の自動記入式: ${message}`);
    }
  }

  return (
    <div className="panel">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
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
        一覧ではキーと表示名だけを確認し、詳細編集が必要な項目だけ開いて設定します。
      </p>

      <div className="field-list-head">
        <span>項目</span>
        <span>型 / 入力形式</span>
        <span>設定</span>
      </div>

      <div className="field-accordion-list">
        {draft.fields.map((f, i) => {
          const inputKind = fieldInputKind(f);
          const displayName = fieldDisplayName(f);
          return (
            <details
              key={i}
              className={`admin-field${dragIndex === i ? ' dragging' : ''}`}
              open={f.key.trim() === ''}
              onDragOver={(e) => {
                if (dragIndex == null || dragIndex === i) return;
                e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIndex == null) return;
                reorderField(dragIndex, i);
                setDragIndex(null);
              }}
            >
              <summary className="admin-field-summary">
                <div className="field-summary-main">
                  <span
                    className="drag-handle"
                    title="ドラッグして並び替え"
                    draggable
                    onClick={(e) => e.preventDefault()}
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', String(i));
                      setDragIndex(i);
                    }}
                    onDragEnd={() => setDragIndex(null)}
                  >
                    ⋮⋮
                  </span>
                  <span className="field-summary-index">{i + 1}</span>
                  <span className="field-summary-key">
                    {f.key || '未設定のキー'}
                  </span>
                  <span className="field-summary-label">
                    {f.label.trim() ? f.label : '表示名なし'}
                  </span>
                </div>
                <div className="field-summary-meta">
                  <span className="field-kind-badge subtle">
                    {TYPE_LABELS[f.type]}
                  </span>
                  <span className={`field-kind-badge ${inputKind}`}>
                    {INPUT_KIND_LABELS[inputKind]}
                  </span>
                  {f.required && <span className="required-badge">必須</span>}
                  {inputKind === 'select' &&
                    f.options &&
                    f.options.length > 0 && (
                      <span className="field-kind-badge subtle">
                        {f.options.length}候補
                      </span>
                    )}
                </div>
                <div className="admin-actions summary-actions">
                  <button
                    type="button"
                    className="icon"
                    title="上へ"
                    onClick={(e) => {
                      e.preventDefault();
                      moveField(i, -1);
                    }}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="icon"
                    title="下へ"
                    onClick={(e) => {
                      e.preventDefault();
                      moveField(i, 1);
                    }}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="icon"
                    title="削除"
                    onClick={(e) => {
                      e.preventDefault();
                      removeField(i);
                    }}
                  >
                    ×
                  </button>
                </div>
              </summary>

              <div className="admin-detail-panel">
                <div className="detail-section-title">基本</div>
                <div className="admin-detail-grid basic">
                  <label className="field-label">
                    キー（出力列名）
                    <input
                      type="text"
                      placeholder="Company"
                      value={f.key}
                      onChange={(e) => setField(i, { key: e.target.value })}
                    />
                  </label>
                  <label className="field-label">
                    表示名
                    <input
                      type="text"
                      placeholder={f.key || '会社名'}
                      value={f.label}
                      onChange={(e) => setField(i, { label: e.target.value })}
                    />
                  </label>
                  <label className="field-label">
                    型
                    <select
                      value={f.type}
                      onChange={(e) =>
                        setField(i, { type: e.target.value as DataType })
                      }
                    >
                      {EDITABLE_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {TYPE_LABELS[t]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field-label">
                    入力形式
                    <select
                      value={inputKind}
                      onChange={(e) => {
                        const nextKind = e.target.value as FieldInputKind;
                        setField(i, { inputKind: nextKind });
                      }}
                    >
                      {INPUT_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {INPUT_KIND_LABELS[k]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field-label check-row inline-check">
                    <input
                      type="checkbox"
                      checked={f.required}
                      onChange={(e) =>
                        setField(i, { required: e.target.checked })
                      }
                    />
                    必須
                  </label>
                </div>

                <div className="detail-section-title">補助設定</div>
                <div className="admin-detail-grid compact">
                  <label className="field-label detail-wide">
                    別名（カンマ区切り）
                    <CommaListInput
                      syncKey={`${draft.id}:${i}:${f.key}`}
                      placeholder={`${displayName}, ${f.key}, alias`}
                      value={f.aliases}
                      onChange={(aliases) => setField(i, { aliases })}
                    />
                  </label>
                </div>

                {inputKind === 'select' && (
                  <div className="detail-section">
                    <div className="detail-section-title">選択肢</div>
                    <label className="field-label">
                      <OptionListEditor
                        values={f.options ?? []}
                        labels={f.optionLabels}
                        onChange={(options, optionLabels) =>
                          setField(i, {
                            options: options.length ? options : undefined,
                            optionLabels,
                          })
                        }
                      />
                    </label>
                  </div>
                )}

                <div className="detail-section">
                  <div className="detail-section-title">自動記入ルール</div>
                  <AutoFillRuleEditor
                    rule={f.autoFill}
                    fields={draft.fields}
                    currentFieldKey={f.key}
                    onChange={(autoFill) => setField(i, { autoFill })}
                  />
                </div>

                <div className="detail-section-title">既定値</div>
                <div className="admin-detail-grid compact">
                  <label className="field-label detail-wide">
                    対応列が無いとき自動で入る値
                    <input
                      type="text"
                      list={
                        f.options && f.options.length ? `opts-${i}` : undefined
                      }
                      placeholder={
                        f.options?.[0]
                          ? `例: ${f.optionLabels?.[f.options[0]] ?? f.options[0]}`
                          : '例: 外部リスト'
                      }
                      value={f.defaultValue ?? ''}
                      onChange={(e) =>
                        setField(i, {
                          defaultValue: e.target.value || undefined,
                        })
                      }
                    />
                    {f.options && f.options.length > 0 && (
                      <datalist id={`opts-${i}`}>
                        {f.options.map((o) => (
                          <option
                            key={o}
                            value={o}
                            label={f.optionLabels?.[o] ?? o}
                          />
                        ))}
                      </datalist>
                    )}
                  </label>
                </div>
              </div>
            </details>
          );
        })}
      </div>

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
        <button
          className="primary"
          disabled={problems.length > 0}
          onClick={onSave}
        >
          保存
        </button>
      </div>
    </div>
  );
}

function emptyAutoFillCase(
  fields: TargetField[],
  currentFieldKey: string,
): AutoFillCase {
  const source =
    fields.find((f) => f.key && f.key !== currentFieldKey) ?? fields[0];
  return {
    sourceFieldKey: source?.key ?? '',
    op: 'equals',
    value: '',
    template: '',
  };
}

function normalizeAutoFillRule(
  rule: FieldAutoFillRule,
): FieldAutoFillRule | undefined {
  const expression = rule.expression?.trim() ?? '';
  const template = rule.template.trim();
  const cases = (rule.cases ?? [])
    .map((c) => ({
      ...c,
      sourceFieldKey: c.sourceFieldKey.trim(),
      value: c.value,
      template: c.template.trim(),
    }))
    .filter((c) => c.sourceFieldKey && c.template);
  if (!expression && !template && cases.length === 0) return undefined;
  return {
    expression: expression || undefined,
    template,
    cases: cases.length ? cases : undefined,
    overwrite: rule.overwrite || undefined,
  };
}

function AutoFillRuleEditor({
  rule,
  fields,
  currentFieldKey,
  onChange,
}: {
  rule?: FieldAutoFillRule;
  fields: TargetField[];
  currentFieldKey: string;
  onChange: (rule?: FieldAutoFillRule) => void;
}) {
  const active: FieldAutoFillRule = rule ?? { template: '', cases: [] };
  const selectableFields = fields.filter((f) => f.key.trim() !== '');
  const expressionError = validateAutoFillExpression(active.expression, fields);
  const expressionRef = useRef<HTMLTextAreaElement>(null);

  const commit = (next: FieldAutoFillRule) => {
    onChange(normalizeAutoFillRule(next));
  };

  const insertExpressionText = (snippet: string) => {
    const el = expressionRef.current;
    const current = active.expression ?? '';
    if (!el) {
      commit({ ...active, expression: current + snippet });
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = current.slice(0, start) + snippet + current.slice(end);
    commit({ ...active, expression: next });
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + snippet.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const patchCase = (index: number, patch: Partial<AutoFillCase>) => {
    const cases = active.cases ?? [];
    commit({
      ...active,
      cases: cases.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    });
  };

  const removeCase = (index: number) => {
    commit({
      ...active,
      cases: (active.cases ?? []).filter((_, i) => i !== index),
    });
  };

  if (!rule) {
    return (
      <button
        type="button"
        className="ghost"
        onClick={() => onChange({ template: '', cases: [] })}
      >
        + 自動記入ルールを追加
      </button>
    );
  }

  return (
    <div className="auto-fill-editor">
      <label className="field-label">
        ミニ式
        <textarea
          ref={expressionRef}
          value={active.expression ?? ''}
          rows={3}
          placeholder={
            '例: if({LeadSource} == "Web", "Webリード: {Company}", "会社名: {Company}")'
          }
          onChange={(e) => commit({ ...active, expression: e.target.value })}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const snippet = e.dataTransfer.getData('text/plain');
            if (snippet) insertExpressionText(snippet);
          }}
        />
        {expressionError && (
          <span className="form-error">{expressionError}</span>
        )}
      </label>

      <div className="auto-fill-tools">
        <div className="field-chip-row">
          {selectableFields.map((f) => {
            const snippet = `{${f.key}}`;
            return (
              <button
                key={f.key}
                type="button"
                className="field-chip"
                draggable
                title={`式へ挿入: ${snippet}`}
                onClick={() => insertExpressionText(snippet)}
                onDragStart={(e) =>
                  e.dataTransfer.setData('text/plain', snippet)
                }
              >
                {fieldDisplayName(f)}
              </button>
            );
          })}
        </div>
        <div className="field-chip-row">
          <button
            type="button"
            className="field-chip"
            onClick={() => insertExpressionText('if(条件, "", "")')}
          >
            if
          </button>
          <button
            type="button"
            className="field-chip"
            onClick={() =>
              insertExpressionText('case(条件1, "", 条件2, "", "")')
            }
          >
            case
          </button>
          <button
            type="button"
            className="field-chip"
            onClick={() => insertExpressionText('contains({Field}, "")')}
          >
            contains
          </button>
          <button
            type="button"
            className="field-chip"
            onClick={() => insertExpressionText('empty({Field})')}
          >
            empty
          </button>
          <button
            type="button"
            className="field-chip"
            onClick={() =>
              insertExpressionText('coalesce({Field1}, {Field2}, "")')
            }
          >
            coalesce
          </button>
          <button
            type="button"
            className="field-chip"
            onClick={() => insertExpressionText('.value')}
          >
            .value
          </button>
          <button
            type="button"
            className="field-chip"
            onClick={() => insertExpressionText('.label')}
          >
            .label
          </button>
          <button
            type="button"
            className="field-chip"
            onClick={() => insertExpressionText(' & ')}
          >
            &
          </button>
        </div>
      </div>

      <details className="mini-doc">
        <summary>式の書き方</summary>
        <pre>{expressionHelpText()}</pre>
      </details>

      <label className="field-label">
        基本テンプレート（式を使わない場合）
        <textarea
          value={active.template}
          rows={2}
          placeholder="例: 会社名: {Company} / {会社名}"
          onChange={(e) => commit({ ...active, template: e.target.value })}
        />
      </label>
      <label className="field-label check-row inline-check">
        <input
          type="checkbox"
          checked={Boolean(active.overwrite)}
          onChange={(e) => commit({ ...active, overwrite: e.target.checked })}
        />
        値が入っている時も上書きする
      </label>

      {(active.cases ?? []).length > 0 && (
        <>
          <div className="auto-fill-case-head">
            <span>条件項目</span>
            <span>条件</span>
            <span>比較値</span>
            <span>入れるテンプレート</span>
            <span></span>
          </div>
          {(active.cases ?? []).map((c, index) => (
            <div className="auto-fill-case-row" key={index}>
              <select
                value={c.sourceFieldKey}
                onChange={(e) =>
                  patchCase(index, { sourceFieldKey: e.target.value })
                }
              >
                {selectableFields.map((f) => (
                  <option key={f.key} value={f.key}>
                    {fieldDisplayName(f)} ({f.key})
                  </option>
                ))}
              </select>
              <select
                value={c.op}
                onChange={(e) =>
                  patchCase(index, { op: e.target.value as ConditionOp })
                }
              >
                {CONDITION_OPS.map((op) => (
                  <option key={op} value={op}>
                    {CONDITION_LABELS[op]}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={c.value}
                disabled={c.op === 'isEmpty' || c.op === 'notEmpty'}
                onChange={(e) => patchCase(index, { value: e.target.value })}
              />
              <input
                type="text"
                value={c.template}
                placeholder="例: Webリード - {Company}"
                onChange={(e) => patchCase(index, { template: e.target.value })}
              />
              <button
                type="button"
                className="icon"
                onClick={() => removeCase(index)}
              >
                ×
              </button>
            </div>
          ))}
        </>
      )}

      <div className="btn-row" style={{ marginTop: 0 }}>
        <button
          type="button"
          onClick={() =>
            commit({
              ...active,
              cases: [
                ...(active.cases ?? []),
                emptyAutoFillCase(fields, currentFieldKey),
              ],
            })
          }
          disabled={selectableFields.length === 0}
        >
          + 条件を追加
        </button>
        <div className="spacer" />
        <button
          type="button"
          className="ghost"
          onClick={() => onChange(undefined)}
        >
          ルールを削除
        </button>
      </div>
    </div>
  );
}

interface DraftOption {
  value: string;
  label: string;
}

function parseOptionBulkText(text: string): DraftOption[] {
  return text
    .split(/[;；]/)
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((item) => {
      const sep = item.search(/[=＝]/);
      if (sep > 0) {
        const label = item.slice(0, sep).trim();
        const value = item.slice(sep + 1).trim();
        return value
          ? { label: label || value, value }
          : { label: item, value: item };
      }
      return { label: item, value: item };
    });
}

function normalizeOptionLabels(
  items: DraftOption[],
): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const item of items) {
    const label = item.label.trim();
    const value = item.value.trim();
    if (value && label && label !== value) out[value] = label;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function OptionListEditor({
  values,
  labels,
  onChange,
}: {
  values: string[];
  labels?: Record<string, string>;
  onChange: (values: string[], labels?: Record<string, string>) => void;
}) {
  const [bulkText, setBulkText] = useState('');

  const items: DraftOption[] = values.map((value) => ({
    value,
    label: labels?.[value] ?? value,
  }));

  const commit = (nextItems: DraftOption[]) => {
    const seen = new Set<string>();
    const normalized = nextItems
      .map((item) => ({
        value: item.value.trim(),
        label: item.label.trim() || item.value.trim(),
      }))
      .filter(
        (item) => item.value && !seen.has(item.value) && seen.add(item.value),
      );
    onChange(
      normalized.map((item) => item.value),
      normalizeOptionLabels(normalized),
    );
  };

  const addBulk = () => {
    const parsed = parseOptionBulkText(bulkText);
    if (parsed.length === 0) return;
    commit([...items, ...parsed]);
    setBulkText('');
  };

  const patchItem = (index: number, patch: Partial<DraftOption>) => {
    commit(
      items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  };

  const removeAt = (index: number) => {
    commit(items.filter((_, i) => i !== index));
  };

  const moveItem = (index: number, dir: -1 | 1) => {
    const nextIndex = index + dir;
    if (nextIndex < 0 || nextIndex >= items.length) return;
    const next = [...items];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    commit(next);
  };

  return (
    <div className="option-input">
      <div className="option-bulk-row">
        <input
          type="text"
          placeholder="例: 表示名=保存値; Web; A, Bを含む候補"
          value={bulkText}
          onChange={(e) => setBulkText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addBulk();
            }
          }}
        />
        <button type="button" onClick={addBulk} disabled={!bulkText.trim()}>
          追加
        </button>
      </div>
      {items.length > 0 && (
        <>
          <div className="option-tags" aria-label="選択肢">
            {items.map((item, index) => (
              <span className="option-tag" key={`${item.value}-${index}`}>
                {item.label === item.value
                  ? item.value
                  : `${item.label} = ${item.value}`}
                <button
                  type="button"
                  aria-label={`${item.label} を削除`}
                  onClick={() => removeAt(index)}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="option-pair-head">
            <span></span>
            <span>ラベル（画面表示）</span>
            <span>値（出力・検証）</span>
            <span></span>
          </div>
          {items.map((item, index) => (
            <div
              className="option-pair-row"
              key={`edit-${item.value}-${index}`}
            >
              <div className="option-order-actions">
                <button
                  type="button"
                  className="icon"
                  title="上へ"
                  disabled={index === 0}
                  onClick={() => moveItem(index, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="icon"
                  title="下へ"
                  disabled={index === items.length - 1}
                  onClick={() => moveItem(index, 1)}
                >
                  ↓
                </button>
              </div>
              <input
                type="text"
                value={item.label}
                placeholder={item.value}
                onChange={(e) => patchItem(index, { label: e.target.value })}
              />
              <input
                type="text"
                value={item.value}
                onChange={(e) => patchItem(index, { value: e.target.value })}
              />
              <button
                type="button"
                className="icon"
                onClick={() => removeAt(index)}
              >
                ×
              </button>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

/**
 * カンマ区切りで文字列配列を編集するテキスト入力。
 *
 * 表示は「編集中の生テキスト」を保持し、配列⇔文字列の往復で毎打鍵ごとに
 * トリム/空要素除去して join し直す実装だと、カンマや末尾スペースが即座に
 * 消えて入力できない問題があったため、ローカルの text state を持つ。
 * 親には常に整形済み配列(トリム・空除去)を渡す。
 */
function parseCommaList(text: string): string[] {
  return text
    .split(/[,、\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function CommaListInput({
  value,
  onChange,
  placeholder,
  syncKey,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  syncKey: string;
}) {
  const [text, setText] = useState(value.join(', '));

  // 別の項目/テンプレートを開いたときだけ、保存済みの別名を入力欄へ戻す。
  // 入力中に毎回 join し直すと、末尾カンマや選択中テキストが壊れて追記しにくくなる。
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setText(value.join(', '));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncKey]);

  const commitText = (nextText: string) => {
    setText(nextText);
    onChange(parseCommaList(nextText));
  };

  return (
    <input
      type="text"
      className="comma-list-input"
      placeholder={placeholder}
      value={text}
      onChange={(e) => commitText(e.target.value)}
      onBlur={() => setText(parseCommaList(text).join(', '))}
    />
  );
}
