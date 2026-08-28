import { useMemo, useState } from 'react';
import { useStore } from '../state/store';
import type {
  FieldMapping,
  ImportContextEntry,
  Normalizer,
  TargetField,
  Transform,
} from '../types';
import { applyFieldMapping, transformRow } from '../core/transformEngine';
import { importContextToRow } from '../core/importContext';
import { fieldDisplayName, fieldOptionItems } from '../core/fieldMeta';
import { ValueMapEditor } from './ValueMapEditor';

const NORMALIZER_LABELS: Record<Normalizer, string> = {
  trim: '前後空白除去',
  toHalfWidth: '半角化',
  toFullWidth: '全角化',
  normalizeCompany: '(株)→株式会社',
  normalizePhone: '電話番号正規化',
  normalizeEmail: 'メール正規化',
  normalizeDate: '日付を統一(2024-01-05)',
  normalizeNumber: '数値を統一(¥1,000→1000)',
  upperCase: '大文字化',
  lowerCase: '小文字化',
  removeSpaces: '空白削除',
};

const ALL_NORMALIZERS = Object.keys(NORMALIZER_LABELS) as Normalizer[];

function confidenceClass(c: number): string {
  if (c >= 0.75) return 'high';
  if (c >= 0.5) return 'mid';
  return 'low';
}

/** ステップ3: マッピング確認・修正(Human-in-the-loop) */
export function MappingEditor() {
  const source = useStore((s) => s.source);
  const target = useStore((s) => s.target);
  const mapping = useStore((s) => s.mapping);
  const importContext = useStore((s) => s.importContext);
  const update = useStore((s) => s.updateFieldMapping);
  const updateImportContext = useStore((s) => s.updateImportContext);
  const settings = useStore((s) => s.settings);
  // LLM は任意機能。OFF のとき(既定)は外部へ一切送っていないので、
  // 「AIに渡した」とは書かない。
  const usedLlm = settings.features.llm && !!settings.llm.apiKey.trim();

  if (!source || !target || !mapping) return null;

  const columnNames = source.columns.map((c) => c.name);

  const missingRequired = target.fields.filter((f) => {
    if (!f.required) return false;
    const m = mapping.fields.find((x) => x.targetKey === f.key);
    return !m || m.transform.kind === 'empty';
  });

  return (
    <div className="panel">
      <h2>3. マッピングを確認・修正</h2>
      <p className="subtitle" style={{ marginBottom: 8 }}>
        列名とデータの形から自動で割り当てました。確信度が低いものや違和感のある箇所だけ直せばOKです。
      </p>
      <div className="security-note">
        {usedLlm ? (
          <>
            AIに渡したのはカラム名と匿名化した数行サンプルのみです。実データ（
            {source.rows.length.toLocaleString()}
            行）はこのブラウザから出ていません。
          </>
        ) : (
          <>
            割り当ての判定も変換も、このブラウザ内で完結しています。実データ（
            {source.rows.length.toLocaleString()}
            行）はどこにも送信されていません。
          </>
        )}
      </div>

      <ImportContextPanel
        entries={importContext}
        onChange={updateImportContext}
      />

      {missingRequired.length > 0 && (
        <div className="alert error">
          必須項目が未割り当てです:{' '}
          {missingRequired.map(fieldDisplayName).join('、')}
        </div>
      )}

      <div data-tour="tour-mapping-rows">
        {target.fields.map((field) => {
          const m =
            mapping.fields.find((x) => x.targetKey === field.key) ??
            ({
              targetKey: field.key,
              transform: { kind: 'empty' },
              normalizers: [],
              confidence: 0,
            } as FieldMapping);
          return (
            <FieldEditorRow
              key={field.key}
              field={field}
              mapping={m}
              columnNames={columnNames}
              onChange={(next) => update(field.key, next)}
            />
          );
        })}
      </div>

      <PreviewTable />
    </div>
  );
}

function makeContextEntry(): ImportContextEntry {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : 'ctx-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  return { id, key: 'EventName', label: 'イベント名', value: '' };
}

function ImportContextPanel({
  entries,
  onChange,
}: {
  entries: ImportContextEntry[];
  onChange: (entries: ImportContextEntry[]) => void;
}) {
  const setEntry = (
    id: string,
    patch: Partial<Omit<ImportContextEntry, 'id'>>,
  ) => {
    onChange(
      entries.map((entry) =>
        entry.id === id ? { ...entry, ...patch } : entry,
      ),
    );
  };
  const removeEntry = (id: string) => {
    onChange(entries.filter((entry) => entry.id !== id));
  };
  const addEntry = () => {
    onChange([...entries, makeContextEntry()]);
  };

  return (
    <section className="import-context-panel" data-tour="tour-mapping-context">
      <div className="import-context-head">
        <div>
          <h3>今回の追加情報</h3>
          <p className="subtitle">
            元ファイルに無いイベント名やキャンペーン名を、この実行だけ式に渡せます。
            効果があるのは、テンプレート管理でその項目に自動記入ルールを設定し、式に
            {' {Import.キー} '}
            を書いた場合だけです（式リファレンス参照）。
          </p>
        </div>
        <button type="button" className="ghost" onClick={addEntry}>
          + 追加
        </button>
      </div>

      {entries.length === 0 ? (
        <div className="context-empty">
          例: キー EventName、値 FOOMA 2026 を追加すると、式で{' '}
          {'{Import.EventName}'} を使えます。
        </div>
      ) : (
        <div className="context-list">
          <div className="context-row context-row-head">
            <span>キー</span>
            <span>画面表示</span>
            <span>値</span>
            <span />
          </div>
          {entries.map((entry) => {
            const ref = entry.key.trim()
              ? '{Import.' + entry.key.trim() + '}'
              : '';
            return (
              <div className="context-row" key={entry.id}>
                <input
                  type="text"
                  value={entry.key}
                  placeholder="EventName"
                  onChange={(e) => setEntry(entry.id, { key: e.target.value })}
                />
                <input
                  type="text"
                  value={entry.label}
                  placeholder="イベント名"
                  onChange={(e) =>
                    setEntry(entry.id, { label: e.target.value })
                  }
                />
                <input
                  type="text"
                  value={entry.value}
                  placeholder="今回だけ使う値"
                  onChange={(e) =>
                    setEntry(entry.id, { value: e.target.value })
                  }
                />
                <button
                  type="button"
                  className="icon"
                  title="削除"
                  onClick={() => removeEntry(entry.id)}
                >
                  ×
                </button>
                {ref && <code className="context-ref">{ref}</code>}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

interface RowProps {
  field: TargetField;
  mapping: FieldMapping;
  columnNames: string[];
  onChange: (m: FieldMapping) => void;
}

function FieldEditorRow({ field, mapping, columnNames, onChange }: RowProps) {
  const setTransform = (transform: Transform) =>
    onChange({ ...mapping, transform, confidence: 1 });

  const toggleNormalizer = (n: Normalizer) => {
    const has = mapping.normalizers.includes(n);
    const normalizers = has
      ? mapping.normalizers.filter((x) => x !== n)
      : [...mapping.normalizers, n];
    onChange({ ...mapping, normalizers });
  };

  const t = mapping.transform;

  return (
    <div className="mapping-row">
      <div className="mapping-head">
        <span className="target-name">
          {fieldDisplayName(field)}{' '}
          {field.required && <span className="required-badge">*必須</span>}
        </span>
        <span className={`confidence ${confidenceClass(mapping.confidence)}`}>
          確信度 {Math.round(mapping.confidence * 100)}%
        </span>
        <span className="meta" style={{ fontSize: 14, color: 'var(--muted)' }}>
          → {field.key}
        </span>
        <span className="field-kind-badge">
          {field.inputKind === 'select' || field.options?.length
            ? '選択式'
            : field.inputKind === 'textarea'
              ? '長文'
              : '短文'}
        </span>
      </div>

      {mapping.rationale && <p className="rationale">{mapping.rationale}</p>}

      <div className="mapping-controls">
        <label className="field-label">
          変換方法
          <select
            value={t.kind}
            onChange={(e) => {
              const kind = e.target.value as Transform['kind'];
              switch (kind) {
                case 'direct':
                  setTransform({
                    kind: 'direct',
                    source: columnNames[0] ?? '',
                  });
                  break;
                case 'concat':
                  setTransform({ kind: 'concat', sources: [], separator: ' ' });
                  break;
                case 'split':
                  setTransform({
                    kind: 'split',
                    source: columnNames[0] ?? '',
                    delimiter: ' ',
                    index: 0,
                  });
                  break;
                case 'constant':
                  setTransform({
                    kind: 'constant',
                    value: field.defaultValue ?? field.options?.[0] ?? '',
                  });
                  break;
                case 'conditional':
                  setTransform({
                    kind: 'conditional',
                    source: columnNames[0] ?? '',
                    cases: [{ op: 'contains', value: '', then: '' }],
                  });
                  break;
                default:
                  setTransform({ kind: 'empty' });
              }
            }}
          >
            <option value="direct">1列をそのまま</option>
            <option value="concat">複数列を結合</option>
            <option value="split">1列を分割</option>
            <option value="constant">固定値</option>
            <option value="conditional">条件分岐</option>
            <option value="empty">空（未割当）</option>
          </select>
        </label>

        {t.kind === 'direct' && (
          <label className="field-label">
            ソース列
            <select
              value={t.source}
              onChange={(e) =>
                setTransform({ kind: 'direct', source: e.target.value })
              }
            >
              {columnNames.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        )}

        {t.kind === 'concat' && (
          <ConcatEditor
            transform={t}
            columnNames={columnNames}
            onChange={setTransform}
          />
        )}

        {t.kind === 'split' && (
          <>
            <label className="field-label">
              ソース列
              <select
                value={t.source}
                onChange={(e) => setTransform({ ...t, source: e.target.value })}
              >
                {columnNames.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              区切り
              <input
                type="text"
                style={{ width: 60 }}
                value={t.delimiter}
                onChange={(e) =>
                  setTransform({ ...t, delimiter: e.target.value })
                }
              />
            </label>
            <label className="field-label">
              位置
              <select
                value={t.index}
                onChange={(e) =>
                  setTransform({ ...t, index: Number(e.target.value) })
                }
              >
                <option value={0}>1つ目</option>
                <option value={1}>2つ目</option>
                <option value={2}>3つ目</option>
              </select>
            </label>
          </>
        )}

        {t.kind === 'constant' && (
          <ConstantEditor
            value={t.value}
            options={fieldOptionItems(field)}
            onChange={(value) => setTransform({ kind: 'constant', value })}
          />
        )}

        {t.kind === 'conditional' && (
          <ConditionalEditor
            transform={t}
            columnNames={columnNames}
            onChange={setTransform}
          />
        )}
      </div>

      <FieldMiniPreview mapping={mapping} />

      {t.kind !== 'empty' && (
        <ValueMapEditor field={field} mapping={mapping} onChange={onChange} />
      )}

      {t.kind !== 'empty' && (
        <div className="norm-chips">
          {ALL_NORMALIZERS.map((n) => (
            <button
              type="button"
              key={n}
              className={`chip${mapping.normalizers.includes(n) ? ' on' : ''}`}
              aria-pressed={mapping.normalizers.includes(n)}
              onClick={() => toggleNormalizer(n)}
            >
              {NORMALIZER_LABELS[n]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** 項目1つ分のミニプレビュー。実データの先頭数行でどう変換されるかをその場で見せる */
function FieldMiniPreview({ mapping }: { mapping: FieldMapping }) {
  const source = useStore((s) => s.source);
  const importContext = useStore((s) => s.importContext);
  const contextRow = useMemo(
    () => importContextToRow(importContext),
    [importContext],
  );

  const values = useMemo(() => {
    if (!source || mapping.transform.kind === 'empty') return [];
    return source.rows
      .slice(0, 3)
      .map((row) => applyFieldMapping(row, mapping, contextRow));
  }, [source, mapping, contextRow]);

  if (values.length === 0) return null;

  return (
    <div className="mini-preview">
      <span className="mini-preview-label">プレビュー:</span>
      {values.map((v, i) => (
        <span
          key={i}
          className={`mini-preview-chip${v.trim() === '' ? ' is-empty' : ''}`}
          title={v}
        >
          {v.trim() === '' ? '（空欄）' : v.replace(/\n/g, ' ⏎ ')}
        </span>
      ))}
    </div>
  );
}

/**
 * 固定値エディタ。
 * テンプレートに選択肢(options)があればプルダウンで選べる。
 * 「（自由入力）」を選ぶと任意の値を上書き入力できる。
 */
function ConstantEditor({
  value,
  options,
  onChange,
}: {
  value: string;
  options?: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const opts = options ?? [];
  const values = opts.map((o) => o.value);
  const isCustom = opts.length === 0 || !values.includes(value);

  if (opts.length === 0) {
    return (
      <label className="field-label">
        固定値
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    );
  }

  return (
    <>
      <label className="field-label">
        固定値（選択）
        <select
          value={isCustom ? '__custom__' : value}
          onChange={(e) => {
            const v = e.target.value;
            onChange(v === '__custom__' ? '' : v);
          }}
        >
          {opts.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label === o.value ? o.value : o.label + ' (' + o.value + ')'}
            </option>
          ))}
          <option value="__custom__">（自由入力）</option>
        </select>
      </label>
      {isCustom && (
        <label className="field-label">
          値（上書き）
          <input
            type="text"
            value={value}
            placeholder="任意の値を入力"
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
      )}
    </>
  );
}

/** 区切りのプリセット(実文字への対応) */
const SEP_PRESETS: { label: string; value: string }[] = [
  { label: 'スペース', value: ' ' },
  { label: 'カンマ', value: ', ' },
  { label: 'スラッシュ', value: ' / ' },
  { label: '改行', value: '\n' },
  { label: '（なし）', value: '' },
];

function ConcatEditor({
  transform,
  columnNames,
  onChange,
}: {
  transform: Extract<Transform, { kind: 'concat' }>;
  columnNames: string[];
  onChange: (t: Transform) => void;
}) {
  const toggle = (col: string) => {
    const has = transform.sources.includes(col);
    const sources = has
      ? transform.sources.filter((c) => c !== col)
      : [...transform.sources, col];
    onChange({ ...transform, sources });
  };

  // 「カスタム…」の選択を明示的に覚えておく。プリセット値と偶然一致する区切り文字
  // (例: 初期値の " / ")を入力しても、プルダウンが「スラッシュ」に戻らないようにする。
  const [customPicked, setCustomPicked] = useState(false);
  const preset = SEP_PRESETS.find((p) => p.value === transform.separator);
  const isCustom = customPicked || !preset;

  const setLabel = (col: string, value: string) => {
    const labels = { ...(transform.labels ?? {}) };
    if (value.trim() === '' || value === col) delete labels[col];
    else labels[col] = value;
    onChange({ ...transform, labels });
  };

  return (
    <>
      <div className="field-label">
        まとめる列（クリックした順に結合）
        <div className="norm-chips">
          {columnNames.map((c) => (
            <button
              type="button"
              key={c}
              className={`chip${transform.sources.includes(c) ? ' on' : ''}`}
              aria-pressed={transform.sources.includes(c)}
              onClick={() => toggle(c)}
            >
              {transform.sources.includes(c)
                ? `${transform.sources.indexOf(c) + 1}. ${c}`
                : c}
            </button>
          ))}
        </div>
      </div>

      <label className="field-label">
        区切り
        <select
          value={isCustom ? '__custom__' : transform.separator}
          onChange={(e) => {
            const v = e.target.value;
            if (v === '__custom__') {
              setCustomPicked(true);
              return;
            }
            setCustomPicked(false);
            onChange({ ...transform, separator: v });
          }}
        >
          {SEP_PRESETS.map((p) => (
            <option key={p.label} value={p.value}>
              {p.label}
            </option>
          ))}
          <option value="__custom__">カスタム…</option>
        </select>
      </label>
      {isCustom && (
        <label className="field-label">
          区切り文字
          <input
            type="text"
            style={{ width: 70 }}
            value={transform.separator}
            onChange={(e) =>
              onChange({ ...transform, separator: e.target.value })
            }
          />
        </label>
      )}

      <label className="field-label" style={{ justifyContent: 'flex-end' }}>
        <button
          type="button"
          className={`chip${transform.withLabels ? ' on' : ''}`}
          aria-pressed={!!transform.withLabels}
          onClick={() =>
            onChange({
              ...transform,
              withLabels: !transform.withLabels,
              labelSeparator: transform.labelSeparator ?? ': ',
            })
          }
        >
          項目名を付ける（例: 役職: 部長）
        </button>
      </label>

      {transform.withLabels && (
        <div className="field-label" style={{ width: '100%' }}>
          項目名の表示（未入力なら元の列名を使用）
          <div
            style={{
              display: 'flex',
              gap: 6,
              alignItems: 'center',
              marginBottom: 6,
            }}
          >
            <span style={{ fontSize: 14, color: 'var(--muted)' }}>
              項目名と値の区切り:
            </span>
            <input
              type="text"
              style={{ width: 60 }}
              value={transform.labelSeparator ?? ': '}
              onChange={(e) =>
                onChange({ ...transform, labelSeparator: e.target.value })
              }
            />
          </div>
          {transform.sources.map((c) => (
            <div
              key={c}
              style={{
                display: 'flex',
                gap: 6,
                marginBottom: 4,
                alignItems: 'center',
              }}
            >
              <span
                style={{ minWidth: 90, fontSize: 14, color: 'var(--muted)' }}
              >
                {c}
              </span>
              <span>→</span>
              <input
                type="text"
                placeholder={c}
                value={transform.labels?.[c] ?? ''}
                onChange={(e) => setLabel(c, e.target.value)}
              />
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function ConditionalEditor({
  transform,
  columnNames,
  onChange,
}: {
  transform: Extract<Transform, { kind: 'conditional' }>;
  columnNames: string[];
  onChange: (t: Transform) => void;
}) {
  const setCase = (
    i: number,
    patch: Partial<(typeof transform.cases)[number]>,
  ) => {
    const cases = transform.cases.map((c, idx) =>
      idx === i ? { ...c, ...patch } : c,
    );
    onChange({ ...transform, cases });
  };
  return (
    <div className="field-label" style={{ width: '100%' }}>
      条件分岐
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          marginBottom: 6,
        }}
      >
        <span>判定する列:</span>
        <select
          value={transform.source}
          onChange={(e) => onChange({ ...transform, source: e.target.value })}
        >
          {columnNames.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      {transform.cases.map((c, i) => (
        <div
          key={i}
          style={{ display: 'flex', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}
        >
          <select
            value={c.op}
            onChange={(e) => setCase(i, { op: e.target.value as typeof c.op })}
          >
            <option value="contains">含む</option>
            <option value="equals">一致</option>
            <option value="startsWith">前方一致</option>
            <option value="endsWith">後方一致</option>
            <option value="isEmpty">空である</option>
            <option value="notEmpty">空でない</option>
          </select>
          <input
            type="text"
            placeholder="値"
            style={{ width: 100 }}
            value={c.value}
            onChange={(e) => setCase(i, { value: e.target.value })}
          />
          <span>→</span>
          <input
            type="text"
            placeholder="出力"
            style={{ width: 100 }}
            value={c.then}
            onChange={(e) => setCase(i, { then: e.target.value })}
          />
        </div>
      ))}
      <button
        className="ghost"
        style={{ alignSelf: 'flex-start', marginTop: 4, padding: '4px 10px' }}
        onClick={() =>
          onChange({
            ...transform,
            cases: [
              ...transform.cases,
              { op: 'contains', value: '', then: '' },
            ],
          })
        }
      >
        + 条件を追加
      </button>
    </div>
  );
}

/** 変換前後のプレビュー(先頭数行)。変換で値が変わったセルをハイライト */
function PreviewTable() {
  const source = useStore((s) => s.source);
  const target = useStore((s) => s.target);
  const mapping = useStore((s) => s.mapping);
  const importContext = useStore((s) => s.importContext);
  const dropEmptyColumns = useStore((s) => s.dropEmptyColumns);
  const setDropEmptyColumns = useStore((s) => s.setDropEmptyColumns);
  const contextRow = useMemo(
    () => importContextToRow(importContext),
    [importContext],
  );

  const visibleFields = useMemo(() => {
    if (!mapping) return [];
    return dropEmptyColumns
      ? mapping.fields.filter((m) => m.transform.kind !== 'empty')
      : mapping.fields;
  }, [mapping, dropEmptyColumns]);

  const preview = useMemo(() => {
    if (!source || !mapping) return [];
    return source.rows.slice(0, 8).map((row) => {
      const outRow = transformRow(row, mapping, contextRow);
      return visibleFields.map((m) => {
        const out = outRow[m.targetKey] ?? '';
        // 「変換された」= 単純な1列コピー以外、または正規化で値が変化
        const primarySource =
          m.transform.kind === 'direct'
            ? (row[m.transform.source] ?? '')
            : undefined;
        const changed =
          m.transform.kind !== 'direct' || out !== (primarySource ?? '');
        return { out, changed, empty: out === '' };
      });
    });
  }, [source, mapping, contextRow, visibleFields]);

  if (!source || !target || !mapping) return null;

  return (
    <div data-tour="tour-mapping-preview">
      <div className="preview-bar">
        <h3 style={{ margin: 0 }}>
          変換プレビュー（先頭{Math.min(8, source.rows.length)}行）
        </h3>
        <label className="toggle">
          <input
            type="checkbox"
            checked={!dropEmptyColumns}
            onChange={(e) => setDropEmptyColumns(!e.target.checked)}
          />
          空欄の項目を表示（出力にも反映されます）
        </label>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {visibleFields.map((m) => (
                <th key={m.targetKey}>{m.targetKey}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    className={`${cell.changed && !cell.empty ? 'changed' : ''} ${
                      cell.empty ? 'empty-cell' : ''
                    }`}
                    title={cell.out}
                  >
                    {cell.empty ? '—' : cell.out.replace(/\n/g, ' ⏎ ')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="legend">
        <span>
          <span className="swatch" />
          整形・変換されたセル
        </span>
        <span>— 空欄</span>
      </div>
    </div>
  );
}
