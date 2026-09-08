import { createTranslator, type TranslationKey } from '../core/i18n';
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
import { RowFilterEditor } from './RowFilterEditor';
import { applyRowFilter } from '../core/rowFilter';

const NORMALIZER_LABELS: Record<Normalizer, TranslationKey> = {
  trim: 'normalizer.trim',
  toHalfWidth: 'normalizer.toHalfWidth',
  toFullWidth: 'normalizer.toFullWidth',
  normalizeCompany: 'normalizer.normalizeCompany',
  normalizePhone: 'normalizer.normalizePhone',
  normalizeEmail: 'normalizer.normalizeEmail',
  normalizeDate: 'normalizer.normalizeDate',
  normalizeNumber: 'normalizer.normalizeNumber',
  upperCase: 'normalizer.upperCase',
  lowerCase: 'normalizer.lowerCase',
  removeSpaces: 'normalizer.removeSpaces',
};

const ALL_NORMALIZERS = Object.keys(NORMALIZER_LABELS) as Normalizer[];

/** これより長い値は、横に並べず1行ずつ全文で見せる */
const LONG_VALUE_CHARS = 24;

function confidenceClass(c: number): string {
  if (c >= 0.75) return 'high';
  if (c >= 0.5) return 'mid';
  return 'low';
}

/** ステップ3: マッピング確認・修正(Human-in-the-loop) */
export function MappingEditor() {
  const locale = useStore((s) => s.settings.locale);
  const t = createTranslator(locale);

  const source = useStore((s) => s.source);
  const target = useStore((s) => s.target);
  const mapping = useStore((s) => s.mapping);
  const importContext = useStore((s) => s.importContext);
  const update = useStore((s) => s.updateFieldMapping);
  const setRowFilter = useStore((s) => s.setRowFilter);
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
      <h2>{t('mapping.heading')}</h2>
      <p className="subtitle" style={{ marginBottom: 8 }}>
        {t('mapping.description')}
      </p>
      <div className="security-note">
        {usedLlm ? (
          <>
            {t('mapping.securityLlm', {
              count: source.rows.length.toLocaleString(locale),
            })}
          </>
        ) : (
          <>
            {t('mapping.securityLocal', {
              count: source.rows.length.toLocaleString(locale),
            })}
          </>
        )}
      </div>

      <ImportContextPanel
        entries={importContext}
        onChange={updateImportContext}
      />

      <RowFilterEditor
        filter={mapping.rowFilter}
        columnNames={columnNames}
        onChange={setRowFilter}
      />

      {missingRequired.length > 0 && (
        <div className="alert error">
          {t('mapping.missingRequired', {
            fields: missingRequired.map(fieldDisplayName).join(', '),
          })}
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

function makeContextEntry(label: string): ImportContextEntry {
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : 'ctx-' + Date.now() + '-' + Math.random().toString(36).slice(2);
  return { id, key: 'EventName', label, value: '' };
}

function ImportContextPanel({
  entries,
  onChange,
}: {
  entries: ImportContextEntry[];
  onChange: (entries: ImportContextEntry[]) => void;
}) {
  const locale = useStore((s) => s.settings.locale);
  const t = createTranslator(locale);

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
    onChange([...entries, makeContextEntry(t('context.eventName'))]);
  };

  return (
    <section className="import-context-panel" data-tour="tour-mapping-context">
      <div className="import-context-head">
        <div>
          <h3>{t('context.heading')}</h3>
          <p className="subtitle">
            {t('context.description', { reference: '{Import.key}' })}
          </p>
        </div>
        <button type="button" className="ghost" onClick={addEntry}>
          {t('common.add')}
        </button>
      </div>

      {entries.length === 0 ? (
        <div className="context-empty">
          {t('context.example', { reference: '{Import.EventName}' })}
        </div>
      ) : (
        <div className="context-list">
          <div className="context-row context-row-head">
            <span>{t('context.key')}</span>
            <span>{t('context.label')}</span>
            <span>{t('common.value')}</span>
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
                  placeholder={t('context.eventName')}
                  onChange={(e) =>
                    setEntry(entry.id, { label: e.target.value })
                  }
                />
                <input
                  type="text"
                  value={entry.value}
                  placeholder={t('context.valuePlaceholder')}
                  onChange={(e) =>
                    setEntry(entry.id, { value: e.target.value })
                  }
                />
                <button
                  type="button"
                  className="icon"
                  title={t('common.delete')}
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
  const locale = useStore((s) => s.settings.locale);
  const t = createTranslator(locale);

  const setTransform = (transform: Transform) =>
    onChange({ ...mapping, transform, confidence: 1 });

  const toggleNormalizer = (n: Normalizer) => {
    const has = mapping.normalizers.includes(n);
    const normalizers = has
      ? mapping.normalizers.filter((x) => x !== n)
      : [...mapping.normalizers, n];
    onChange({ ...mapping, normalizers });
  };

  const transform = mapping.transform;

  return (
    <div className="mapping-row">
      <div className="mapping-head">
        <span className="target-name">
          {fieldDisplayName(field)}{' '}
          {field.required && (
            <span className="required-badge">{t('mapping.required')}</span>
          )}
        </span>
        <span className={`confidence ${confidenceClass(mapping.confidence)}`}>
          {t('mapping.confidence', {
            count: Math.round(mapping.confidence * 100),
          })}
        </span>
        <span className="meta" style={{ fontSize: 14, color: 'var(--muted)' }}>
          → {field.key}
        </span>
        <span className="field-kind-badge">
          {field.inputKind === 'select' || field.options?.length
            ? t('mapping.selectKind')
            : field.inputKind === 'textarea'
              ? t('mapping.longKind')
              : t('mapping.shortKind')}
        </span>
      </div>

      {mapping.rationale && <p className="rationale">{mapping.rationale}</p>}

      <div className="mapping-controls">
        <label className="field-label">
          {t('mapping.method')}
          <select
            value={transform.kind}
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
            <option value="direct">{t('mapping.direct')}</option>
            <option value="concat">{t('mapping.concat')}</option>
            <option value="split">{t('mapping.split')}</option>
            <option value="constant">{t('mapping.constant')}</option>
            <option value="conditional">{t('mapping.conditional')}</option>
            <option value="empty">{t('mapping.empty')}</option>
          </select>
        </label>

        {transform.kind === 'direct' && (
          <label className="field-label">
            {t('mapping.sourceColumn')}
            <select
              value={transform.source}
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

        {transform.kind === 'concat' && (
          <ConcatEditor
            transform={transform}
            columnNames={columnNames}
            onChange={setTransform}
          />
        )}

        {transform.kind === 'split' && (
          <>
            <label className="field-label">
              {t('mapping.sourceColumn')}
              <select
                value={transform.source}
                onChange={(e) =>
                  setTransform({ ...transform, source: e.target.value })
                }
              >
                {columnNames.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              {t('mapping.separator')}
              <input
                type="text"
                style={{ width: 60 }}
                value={transform.delimiter}
                onChange={(e) =>
                  setTransform({ ...transform, delimiter: e.target.value })
                }
              />
            </label>
            <label className="field-label">
              {t('mapping.position')}
              <select
                value={transform.index}
                onChange={(e) =>
                  setTransform({ ...transform, index: Number(e.target.value) })
                }
              >
                <option value={0}>{t('mapping.first')}</option>
                <option value={1}>{t('mapping.second')}</option>
                <option value={2}>{t('mapping.third')}</option>
              </select>
            </label>
          </>
        )}

        {transform.kind === 'constant' && (
          <ConstantEditor
            value={transform.value}
            options={fieldOptionItems(field)}
            onChange={(value) => setTransform({ kind: 'constant', value })}
          />
        )}

        {transform.kind === 'conditional' && (
          <ConditionalEditor
            transform={transform}
            columnNames={columnNames}
            onChange={setTransform}
          />
        )}
      </div>

      <FieldMiniPreview mapping={mapping} />

      {transform.kind !== 'empty' && (
        <ValueMapEditor field={field} mapping={mapping} onChange={onChange} />
      )}

      {transform.kind !== 'empty' && (
        <div className="norm-chips">
          {ALL_NORMALIZERS.map((n) => (
            <button
              type="button"
              key={n}
              className={`chip${mapping.normalizers.includes(n) ? ' on' : ''}`}
              aria-pressed={mapping.normalizers.includes(n)}
              onClick={() => toggleNormalizer(n)}
            >
              {t(NORMALIZER_LABELS[n])}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** 項目1つ分のミニプレビュー。実データの先頭数行でどう変換されるかをその場で見せる */
function FieldMiniPreview({ mapping }: { mapping: FieldMapping }) {
  const locale = useStore((s) => s.settings.locale);
  const t = createTranslator(locale);

  const source = useStore((s) => s.source);
  const rowFilter = useStore((s) => s.mapping?.rowFilter);
  const importContext = useStore((s) => s.importContext);
  const contextRow = useMemo(
    () => importContextToRow(importContext),
    [importContext],
  );

  const values = useMemo(() => {
    if (!source || mapping.transform.kind === 'empty') return [];
    // 絞り込みで残る行から採る(除外される行の値を見せても判断材料にならない)
    return applyRowFilter(source.rows, rowFilter)
      .slice(0, 3)
      .map((row) => applyFieldMapping(row, mapping, contextRow));
  }, [source, rowFilter, mapping, contextRow]);

  if (values.length === 0) return null;

  // 複数列の結合などで値が長くなると、横並びのままでは途中で切れて
  // 「結局どうなるのか」が読めない。長い値は1行ずつ全文を折り返して見せる。
  const longest = values.reduce((max, v) => Math.max(max, v.length), 0);
  const asList =
    longest > LONG_VALUE_CHARS || values.some((v) => v.includes('\n'));

  if (asList) {
    return (
      <div className="mini-preview is-list">
        <span className="mini-preview-label">
          {t('mapping.miniPreview', { count: values.length })}
        </span>
        <ol className="mini-preview-rows">
          {values.map((v, i) => (
            <li key={i}>
              <span className="mini-preview-no">{i + 1}</span>
              <span
                className={`mini-preview-val${v.trim() === '' ? ' is-empty' : ''}`}
              >
                {v.trim() === '' ? t('common.empty') : v}
              </span>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  return (
    <div className="mini-preview">
      <span className="mini-preview-label">{t('mapping.previewLabel')}</span>
      {values.map((v, i) => (
        <span
          key={i}
          className={`mini-preview-chip${v.trim() === '' ? ' is-empty' : ''}`}
        >
          {v.trim() === '' ? t('common.empty') : v}
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
  const locale = useStore((s) => s.settings.locale);
  const t = createTranslator(locale);

  const opts = options ?? [];
  const values = opts.map((o) => o.value);
  const isCustom = opts.length === 0 || !values.includes(value);

  if (opts.length === 0) {
    return (
      <label className="field-label">
        {t('mapping.constant')}
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
        {t('mapping.constantSelect')}
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
          <option value="__custom__">{t('mapping.customValue')}</option>
        </select>
      </label>
      {isCustom && (
        <label className="field-label">
          {t('mapping.override')}
          <input
            type="text"
            value={value}
            placeholder={t('mapping.valuePlaceholder')}
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
      )}
    </>
  );
}

/** 区切りのプリセット(実文字への対応) */
const SEP_PRESETS: { label: TranslationKey; value: string }[] = [
  { label: 'mapping.space', value: ' ' },
  { label: 'mapping.comma', value: ', ' },
  { label: 'mapping.slash', value: ' / ' },
  { label: 'mapping.newline', value: '\n' },
  { label: 'mapping.noSeparator', value: '' },
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
  const locale = useStore((s) => s.settings.locale);
  const t = createTranslator(locale);

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
        {t('mapping.combineColumns')}
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
        {t('mapping.separator')}
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
              {t(p.label)}
            </option>
          ))}
          <option value="__custom__">{t('mapping.customSeparator')}</option>
        </select>
      </label>
      {isCustom && (
        <label className="field-label">
          {t('mapping.separatorChars')}
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
          {t('mapping.withLabels')}
        </button>
      </label>

      {transform.withLabels && (
        <div className="field-label" style={{ width: '100%' }}>
          {t('mapping.labelHint')}
          <div
            style={{
              display: 'flex',
              gap: 6,
              alignItems: 'center',
              marginBottom: 6,
            }}
          >
            <span style={{ fontSize: 14, color: 'var(--muted)' }}>
              {t('mapping.labelSeparator')}
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
  const locale = useStore((s) => s.settings.locale);
  const t = createTranslator(locale);

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
      {t('mapping.conditional')}
      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          marginBottom: 6,
        }}
      >
        <span>{t('mapping.testColumn')}</span>
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
            <option value="contains">{t('condition.contains')}</option>
            <option value="equals">{t('condition.equals')}</option>
            <option value="startsWith">{t('condition.startsWith')}</option>
            <option value="endsWith">{t('condition.endsWith')}</option>
            <option value="isEmpty">{t('condition.isEmpty')}</option>
            <option value="notEmpty">{t('condition.notEmpty')}</option>
          </select>
          <input
            type="text"
            placeholder={t('common.value')}
            style={{ width: 100 }}
            value={c.value}
            onChange={(e) => setCase(i, { value: e.target.value })}
          />
          <span>→</span>
          <input
            type="text"
            placeholder={t('mapping.output')}
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
        {t('mapping.addCondition')}
      </button>
    </div>
  );
}

/** 変換前後のプレビュー(先頭数行)。変換で値が変わったセルをハイライト */
function PreviewTable() {
  const locale = useStore((s) => s.settings.locale);
  const t = createTranslator(locale);

  const source = useStore((s) => s.source);
  const target = useStore((s) => s.target);
  const mapping = useStore((s) => s.mapping);
  const importContext = useStore((s) => s.importContext);
  const dropEmptyColumns = useStore((s) => s.dropEmptyColumns);
  const setDropEmptyColumns = useStore((s) => s.setDropEmptyColumns);
  const [wrapCells, setWrapCells] = useState(false);
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
    // 絞り込みで除外される行はプレビューにも出さない(実際の出力と食い違わせない)
    return applyRowFilter(source.rows, mapping.rowFilter)
      .slice(0, 8)
      .map((row) => {
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
          {t('mapping.preview', { count: preview.length })}
        </h3>
        <label className="toggle">
          <input
            type="checkbox"
            checked={!dropEmptyColumns}
            onChange={(e) => setDropEmptyColumns(!e.target.checked)}
          />
          {t('mapping.showEmpty')}
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={wrapCells}
            onChange={(e) => setWrapCells(e.target.checked)}
          />
          {t('common.wrap')}
        </label>
      </div>
      <div className={`table-wrap${wrapCells ? ' wrap-cells' : ''}`}>
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
                    {cell.empty ? '—' : cell.out}
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
          {t('mapping.changedCell')}
        </span>
        <span>{t('mapping.emptyLegend')}</span>
      </div>
    </div>
  );
}
