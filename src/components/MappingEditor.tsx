import { useMemo } from 'react';
import { useStore } from '../state/store';
import type {
  FieldMapping,
  Normalizer,
  TargetField,
  Transform,
} from '../types';
import { evalTransform } from '../core/transformEngine';
import { applyNormalizers } from '../core/normalize';

const NORMALIZER_LABELS: Record<Normalizer, string> = {
  trim: '前後空白除去',
  toHalfWidth: '半角化',
  toFullWidth: '全角化',
  normalizeCompany: '(株)→株式会社',
  normalizePhone: '電話番号正規化',
  normalizeEmail: 'メール正規化',
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
  const update = useStore((s) => s.updateFieldMapping);

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
        AIの提案です。確信度が低いものや違和感のある割り当てだけ直せばOKです。
      </p>
      <div className="security-note">
        AIに渡したのはカラム名と匿名化した数行サンプルのみです。実データ（{source.rows.length.toLocaleString()}
        行）はこのブラウザから出ていません。
      </div>

      {missingRequired.length > 0 && (
        <div className="alert error">
          必須項目が未割り当てです:{' '}
          {missingRequired.map((f) => f.label).join('、')}
        </div>
      )}

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

      <PreviewTable />
    </div>
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
          {field.label}{' '}
          {field.required && <span className="required-badge">*必須</span>}
        </span>
        <span className={`confidence ${confidenceClass(mapping.confidence)}`}>
          確信度 {Math.round(mapping.confidence * 100)}%
        </span>
        <span className="meta" style={{ fontSize: 12, color: 'var(--muted)' }}>
          → {field.key}
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
                  setTransform({ kind: 'direct', source: columnNames[0] ?? '' });
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
                  setTransform({ kind: 'constant', value: '' });
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
              onChange={(e) => setTransform({ kind: 'direct', source: e.target.value })}
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
                onChange={(e) => setTransform({ ...t, delimiter: e.target.value })}
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
          <label className="field-label">
            固定値
            <input
              type="text"
              value={t.value}
              onChange={(e) => setTransform({ kind: 'constant', value: e.target.value })}
            />
          </label>
        )}

        {t.kind === 'conditional' && (
          <ConditionalEditor
            transform={t}
            columnNames={columnNames}
            onChange={setTransform}
          />
        )}
      </div>

      {t.kind !== 'empty' && (
        <div className="norm-chips">
          {ALL_NORMALIZERS.map((n) => (
            <span
              key={n}
              className={`chip${mapping.normalizers.includes(n) ? ' on' : ''}`}
              onClick={() => toggleNormalizer(n)}
            >
              {NORMALIZER_LABELS[n]}
            </span>
          ))}
        </div>
      )}
    </div>
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

  const preset = SEP_PRESETS.find((p) => p.value === transform.separator);
  const isCustom = !preset;

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
            <span
              key={c}
              className={`chip${transform.sources.includes(c) ? ' on' : ''}`}
              onClick={() => toggle(c)}
            >
              {transform.sources.includes(c)
                ? `${transform.sources.indexOf(c) + 1}. ${c}`
                : c}
            </span>
          ))}
        </div>
      </div>

      <label className="field-label">
        区切り
        <select
          value={isCustom ? '__custom__' : transform.separator}
          onChange={(e) => {
            const v = e.target.value;
            onChange({ ...transform, separator: v === '__custom__' ? ' / ' : v });
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
            onChange={(e) => onChange({ ...transform, separator: e.target.value })}
          />
        </label>
      )}

      <label className="field-label" style={{ justifyContent: 'flex-end' }}>
        <span
          className={`chip${transform.withLabels ? ' on' : ''}`}
          onClick={() =>
            onChange({
              ...transform,
              withLabels: !transform.withLabels,
              labelSeparator: transform.labelSeparator ?? ': ',
            })
          }
        >
          項目名を付ける（例: 役職: 部長）
        </span>
      </label>

      {transform.withLabels && (
        <div className="field-label" style={{ width: '100%' }}>
          項目名の表示（未入力なら元の列名を使用）
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>項目名と値の区切り:</span>
            <input
              type="text"
              style={{ width: 60 }}
              value={transform.labelSeparator ?? ': '}
              onChange={(e) => onChange({ ...transform, labelSeparator: e.target.value })}
            />
          </div>
          {transform.sources.map((c) => (
            <div key={c} style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center' }}>
              <span style={{ minWidth: 90, fontSize: 12, color: 'var(--muted)' }}>{c}</span>
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
  const setCase = (i: number, patch: Partial<(typeof transform.cases)[number]>) => {
    const cases = transform.cases.map((c, idx) =>
      idx === i ? { ...c, ...patch } : c,
    );
    onChange({ ...transform, cases });
  };
  return (
    <div className="field-label" style={{ width: '100%' }}>
      条件分岐
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
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
        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
          <select value={c.op} onChange={(e) => setCase(i, { op: e.target.value as typeof c.op })}>
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
            cases: [...transform.cases, { op: 'contains', value: '', then: '' }],
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

  const preview = useMemo(() => {
    if (!source || !mapping) return [];
    return source.rows.slice(0, 8).map((row) =>
      mapping.fields.map((m) => {
        const raw = evalTransform(row, m.transform);
        const out = applyNormalizers(raw, m.normalizers);
        // 「変換された」= 単純な1列コピー以外、または正規化で値が変化
        const primarySource =
          m.transform.kind === 'direct' ? row[m.transform.source] ?? '' : undefined;
        const changed =
          m.transform.kind !== 'direct' || out !== (primarySource ?? '');
        return { out, changed, empty: out === '' };
      }),
    );
  }, [source, mapping]);

  if (!source || !target || !mapping) return null;

  return (
    <>
      <h3>変換プレビュー（先頭{Math.min(8, source.rows.length)}行）</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {mapping.fields.map((m) => (
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
          AIが整形・変換したセル
        </span>
        <span>— 空欄</span>
      </div>
    </>
  );
}
