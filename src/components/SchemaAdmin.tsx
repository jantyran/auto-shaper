import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { createTranslator, type TranslationKey } from '../core/i18n';
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
import { validateAutoFillExpression } from '../core/autoFillExpression';

const TYPE_LABELS: Record<DataType, TranslationKey> = {
  string: 'admin.type.string',
  number: 'admin.type.number',
  date: 'admin.type.date',
  email: 'admin.type.email',
  phone: 'admin.type.phone',
  url: 'admin.type.url',
  boolean: 'admin.type.boolean',
  empty: 'admin.type.empty',
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

const INPUT_KIND_LABELS: Record<FieldInputKind, TranslationKey> = {
  text: 'admin.input.text',
  textarea: 'admin.input.textarea',
  select: 'admin.input.select',
};

const INPUT_KINDS: FieldInputKind[] = ['text', 'textarea', 'select'];

const CONDITION_LABELS: Record<ConditionOp, TranslationKey> = {
  contains: 'condition.contains',
  equals: 'condition.equals',
  startsWith: 'condition.startsWith',
  endsWith: 'condition.endsWith',
  isEmpty: 'condition.isEmpty',
  notEmpty: 'condition.notEmpty',
};

// The expression engine retains its locale-independent error contract.
// Translate known errors only at this UI boundary, preserving offending tokens.
function expressionErrorText(
  message: string,
  t: ReturnType<typeof createTranslator>,
): string {
  const ja = createTranslator('ja');
  const simpleKeys: TranslationKey[] = [
    'admin.expressionSyntaxError',
    'admin.expressionMissingBrace',
  ];
  for (const key of simpleKeys) {
    if (message === ja(key)) return t(key);
  }
  const tokenKeys: TranslationKey[] = [
    'admin.expressionUnknownFunction',
    'admin.expressionUnsupportedCharacter',
  ];
  for (const key of tokenKeys) {
    const prefix = ja(key, { token: '' });
    if (message.startsWith(prefix))
      return t(key, { token: message.slice(prefix.length) });
  }
  return message;
}

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
  const locale = useStore((s) => s.settings.locale);
  const t = createTranslator(locale);
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
          alert(t('admin.noTemplatesInFile'));
          return;
        }
        setPending({ fileName: file.name, candidates });
      } else {
        const buf = await file.arrayBuffer();
        const dataset = await parseWorkbook(file.name, buf);
        if (dataset.columns.length === 0) {
          alert(t('admin.noColumns'));
          return;
        }
        const base = file.name.replace(/\.[^.]+$/, '');
        const inferred = schemaFromUploadedHeader(dataset);
        // 確認・編集できるドラフトとして開く(保存時に custom として永続化)
        setDraft({ ...inferred, origin: 'custom', name: base });
      }
    } catch {
      alert(t('admin.readFailed'));
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
        <h2 style={{ margin: 0 }}>{t('admin.heading')}</h2>
        <span className={`storage-badge ${storageMode === 'api' ? 'api' : ''}`}>
          <span className="dot" />
          {storageMode === 'api'
            ? t('admin.storageApi')
            : storageMode === 'local'
              ? t('admin.storageLocal')
              : t('admin.storageLoading')}
        </span>
        <div className="spacer" />
        <button
          onClick={() => setExporting(true)}
          disabled={customSchemas.length === 0}
        >
          {t('admin.exportSelected')}
        </button>
        <button onClick={() => importRef.current?.click()}>
          {t('admin.import')}
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
          onClick={() =>
            setDraft(createEmptySchema(t('admin.newTemplateName')))
          }
        >
          {t('admin.create')}
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
        {t('admin.description')}{' '}
        {storageMode === 'api'
          ? t('admin.descriptionApi')
          : t('admin.descriptionLocal')}
      </p>

      <div data-tour="tour-admin-list">
        <h3>{t('admin.yourTemplates')}</h3>
        {sortedCustomSchemas.length === 0 ? (
          <div className="alert info">{t('admin.emptyTemplates')}</div>
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
                    <span className="field-kind-badge">
                      {t('admin.default')}
                    </span>
                  )}
                </div>
                <p className="rationale">
                  {t('admin.fieldCount', { count: s.fields.length })}
                </p>
                <div className="btn-row" style={{ marginTop: 10 }}>
                  <button onClick={() => setDraft(structuredClone(s))}>
                    {t('admin.edit')}
                  </button>
                  <button
                    className="ghost"
                    onClick={() =>
                      setDraft({
                        ...duplicateSchema(s),
                        name: t('admin.copyName', { name: s.name }),
                      })
                    }
                  >
                    {t('admin.duplicate')}
                  </button>
                  <button
                    className="ghost"
                    disabled={s.isDefault}
                    onClick={() => void makeDefaultSchema(s.id)}
                  >
                    {t('admin.makeDefault')}
                  </button>
                  <button
                    className="icon"
                    title={t('admin.moveUp')}
                    disabled={i === 0}
                    onClick={() => moveSchema(i, -1)}
                  >
                    ↑
                  </button>
                  <button
                    className="icon"
                    title={t('admin.moveDown')}
                    disabled={i === sortedCustomSchemas.length - 1}
                    onClick={() => moveSchema(i, 1)}
                  >
                    ↓
                  </button>
                  <div className="spacer" />
                  <button
                    className="ghost"
                    onClick={() => {
                      if (confirm(t('admin.confirmDelete', { name: s.name })))
                        removeSchema(s.id);
                    }}
                  >
                    {t('admin.delete')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <h3>{t('admin.presets')}</h3>
      <div className="card-grid">
        {PRESET_SCHEMAS.map((s) => (
          <div key={s.id} className="mapping-row" style={{ marginBottom: 0 }}>
            <div className="mapping-head">
              <span className="target-name" style={{ minWidth: 0 }}>
                {s.name}
              </span>
            </div>
            <p className="rationale">
              {t('admin.fieldCount', { count: s.fields.length })}
            </p>
            <div className="btn-row" style={{ marginTop: 10 }}>
              <button
                onClick={() =>
                  setDraft({
                    ...duplicateSchema(s),
                    name: t('admin.copyName', { name: s.name }),
                  })
                }
              >
                {t('admin.duplicateEdit')}
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
  const locale = useStore((s) => s.settings.locale);
  const t = createTranslator(locale);
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
  if (draft.name.trim() === '') problems.push(t('admin.templateNameRequired'));
  if (draft.fields.length === 0) problems.push(t('admin.fieldsRequired'));
  if (emptyKey) problems.push(t('admin.keysRequired'));
  if (dupKeys.length > 0)
    problems.push(
      t('admin.duplicateKeys', { keys: [...new Set(dupKeys)].join(', ') }),
    );
  for (const field of draft.fields) {
    const message = validateAutoFillExpression(
      field.autoFill?.expression,
      draft.fields,
    );
    if (message) {
      problems.push(
        t('admin.autoFillValidation', {
          field: fieldDisplayName(field),
          message: expressionErrorText(message, t),
        }),
      );
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
        <h2 style={{ margin: 0 }}>{t('admin.editTitle')}</h2>
      </div>

      <div style={{ marginTop: 14, marginBottom: 8 }}>
        <label className="field-label">
          {t('admin.templateName')}
          <input
            type="text"
            style={{ maxWidth: 360 }}
            value={draft.name}
            placeholder={t('admin.templateNamePlaceholder')}
            onChange={(e) => onChange({ ...draft, name: e.target.value })}
          />
        </label>
      </div>

      <h3>{t('admin.fields')}</h3>
      <p className="subtitle" style={{ marginBottom: 12 }}>
        {t('admin.fieldsDescription')}
      </p>

      <div className="field-list-head">
        <span>{t('admin.field')}</span>
        <span>{t('admin.typeInput')}</span>
        <span>{t('admin.settings')}</span>
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
                    title={t('admin.dragReorder')}
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
                    {f.key || t('admin.unsetKey')}
                  </span>
                  <span className="field-summary-label">
                    {f.label.trim() ? f.label : t('admin.noDisplayName')}
                  </span>
                </div>
                <div className="field-summary-meta">
                  <span className="field-kind-badge subtle">
                    {t(TYPE_LABELS[f.type])}
                  </span>
                  <span className={`field-kind-badge ${inputKind}`}>
                    {t(INPUT_KIND_LABELS[inputKind])}
                  </span>
                  {f.required && (
                    <span className="required-badge">
                      {t('admin.required')}
                    </span>
                  )}
                  {inputKind === 'select' &&
                    f.options &&
                    f.options.length > 0 && (
                      <span className="field-kind-badge subtle">
                        {t('admin.optionsCount', { count: f.options.length })}
                      </span>
                    )}
                </div>
                <div className="admin-actions summary-actions">
                  <button
                    type="button"
                    className="icon"
                    title={t('admin.moveUp')}
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
                    title={t('admin.moveDown')}
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
                    title={t('admin.delete')}
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
                <div className="detail-section-title">{t('admin.basic')}</div>
                <div className="admin-detail-grid basic">
                  <label className="field-label">
                    {t('admin.key')}
                    <input
                      type="text"
                      placeholder="Company"
                      value={f.key}
                      onChange={(e) => setField(i, { key: e.target.value })}
                    />
                  </label>
                  <label className="field-label">
                    {t('admin.displayName')}
                    <input
                      type="text"
                      aria-label={t('admin.displayName')}
                      placeholder={f.key || t('admin.displayNamePlaceholder')}
                      value={f.label}
                      onChange={(e) => setField(i, { label: e.target.value })}
                    />
                  </label>
                  <label className="field-label">
                    {t('admin.type')}
                    <select
                      value={f.type}
                      onChange={(e) =>
                        setField(i, { type: e.target.value as DataType })
                      }
                    >
                      {EDITABLE_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {t(TYPE_LABELS[type])}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field-label">
                    {t('admin.inputKind')}
                    <select
                      value={inputKind}
                      onChange={(e) => {
                        const nextKind = e.target.value as FieldInputKind;
                        setField(i, { inputKind: nextKind });
                      }}
                    >
                      {INPUT_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {t(INPUT_KIND_LABELS[k])}
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
                    {t('admin.required')}
                  </label>
                  <label className="field-label">
                    {t('admin.maxLength')}
                    <input
                      type="number"
                      min={1}
                      placeholder={t('admin.noLimit')}
                      value={f.maxLength ?? ''}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        setField(i, {
                          maxLength:
                            e.target.value === '' ||
                            !Number.isFinite(n) ||
                            n < 1
                              ? undefined
                              : Math.floor(n),
                        });
                      }}
                    />
                  </label>
                </div>

                <div className="detail-section-title">
                  {t('admin.additional')}
                </div>
                <div className="admin-detail-grid compact">
                  <label className="field-label detail-wide">
                    {t('admin.aliases')}
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
                    <div className="detail-section-title">
                      {t('admin.options')}
                    </div>
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
                  <div className="detail-section-title">
                    {t('admin.autoFill')}
                  </div>
                  <AutoFillRuleEditor
                    rule={f.autoFill}
                    fields={draft.fields}
                    currentFieldKey={f.key}
                    onChange={(autoFill) => setField(i, { autoFill })}
                  />
                </div>

                <div className="detail-section-title">
                  {t('admin.defaultValue')}
                </div>
                <div className="admin-detail-grid compact">
                  <label className="field-label detail-wide">
                    {t('admin.defaultValueDescription')}
                    <input
                      type="text"
                      list={
                        f.options && f.options.length ? `opts-${i}` : undefined
                      }
                      placeholder={
                        f.options?.[0]
                          ? t('admin.exampleValue', {
                              value:
                                f.optionLabels?.[f.options[0]] ?? f.options[0],
                            })
                          : t('admin.defaultValuePlaceholder')
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
        <button onClick={addField}>{t('admin.addField')}</button>
      </div>

      {problems.length > 0 && (
        <div className="alert error" style={{ marginTop: 16 }}>
          {problems.map((p) => (
            <div key={p}>{p}</div>
          ))}
        </div>
      )}

      <div className="btn-row">
        <button className="ghost" onClick={onCancel}>
          {t('admin.cancel')}
        </button>
        <div className="spacer" />
        <button
          className="primary"
          disabled={problems.length > 0}
          onClick={onSave}
        >
          {t('admin.save')}
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
  const locale = useStore((state) => state.settings.locale);
  const t = createTranslator(locale);
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
        {t('admin.addAutoFill')}
      </button>
    );
  }

  return (
    <div className="auto-fill-editor">
      <label className="field-label">
        {t('admin.miniExpression')}
        <textarea
          ref={expressionRef}
          value={active.expression ?? ''}
          rows={3}
          aria-label={t('admin.miniExpression')}
          placeholder={t('admin.expressionPlaceholder')}
          onChange={(e) => commit({ ...active, expression: e.target.value })}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const snippet = e.dataTransfer.getData('text/plain');
            if (snippet) insertExpressionText(snippet);
          }}
        />
        {expressionError && (
          <span className="form-error">
            {expressionErrorText(expressionError, t)}
          </span>
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
                title={t('admin.insertExpression', { snippet })}
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
        <summary>{t('admin.expressionHelp')}</summary>
        <pre>{t('admin.expressionHelpText')}</pre>
      </details>

      <label className="field-label">
        {t('admin.baseTemplate')}
        <textarea
          value={active.template}
          rows={2}
          placeholder={t('admin.baseTemplatePlaceholder')}
          onChange={(e) => commit({ ...active, template: e.target.value })}
        />
      </label>
      <label className="field-label check-row inline-check">
        <input
          type="checkbox"
          checked={Boolean(active.overwrite)}
          onChange={(e) => commit({ ...active, overwrite: e.target.checked })}
        />
        {t('admin.overwrite')}
      </label>

      {(active.cases ?? []).length > 0 && (
        <>
          <div className="auto-fill-case-head">
            <span>{t('admin.conditionField')}</span>
            <span>{t('admin.condition')}</span>
            <span>{t('admin.compareValue')}</span>
            <span>{t('admin.resultTemplate')}</span>
            <span></span>
          </div>
          {(active.cases ?? []).map((c, index) => (
            <div className="auto-fill-case-row" key={index}>
              <select
                aria-label={t('admin.conditionField')}
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
                aria-label={t('admin.condition')}
                value={c.op}
                onChange={(e) =>
                  patchCase(index, { op: e.target.value as ConditionOp })
                }
              >
                {CONDITION_OPS.map((op) => (
                  <option key={op} value={op}>
                    {t(CONDITION_LABELS[op])}
                  </option>
                ))}
              </select>
              <input
                type="text"
                aria-label={t('admin.compareValue')}
                value={c.value}
                disabled={c.op === 'isEmpty' || c.op === 'notEmpty'}
                onChange={(e) => patchCase(index, { value: e.target.value })}
              />
              <input
                type="text"
                aria-label={t('admin.resultTemplate')}
                value={c.template}
                placeholder={t('admin.caseTemplatePlaceholder')}
                onChange={(e) => patchCase(index, { template: e.target.value })}
              />
              <button
                type="button"
                className="icon"
                aria-label={t('admin.deleteCondition', { count: index + 1 })}
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
          {t('admin.addCondition')}
        </button>
        <div className="spacer" />
        <button
          type="button"
          className="ghost"
          onClick={() => onChange(undefined)}
        >
          {t('admin.deleteRule')}
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
  const locale = useStore((state) => state.settings.locale);
  const t = createTranslator(locale);
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
          aria-label={t('admin.optionsAria')}
          placeholder={t('admin.optionBulkPlaceholder')}
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
          {t('admin.addOption')}
        </button>
      </div>
      {items.length > 0 && (
        <>
          <div className="option-tags" aria-label={t('admin.options')}>
            {items.map((item, index) => (
              <span className="option-tag" key={`${item.value}-${index}`}>
                {item.label === item.value
                  ? item.value
                  : `${item.label} = ${item.value}`}
                <button
                  type="button"
                  aria-label={t('admin.removeOption', { label: item.label })}
                  onClick={() => removeAt(index)}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="option-pair-head">
            <span></span>
            <span>{t('admin.optionLabel')}</span>
            <span>{t('admin.optionValue')}</span>
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
                  title={t('admin.moveUp')}
                  disabled={index === 0}
                  onClick={() => moveItem(index, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="icon"
                  title={t('admin.moveDown')}
                  disabled={index === items.length - 1}
                  onClick={() => moveItem(index, 1)}
                >
                  ↓
                </button>
              </div>
              <input
                type="text"
                aria-label={t('admin.optionLabel')}
                value={item.label}
                placeholder={item.value}
                onChange={(e) => patchItem(index, { label: e.target.value })}
              />
              <input
                type="text"
                aria-label={t('admin.optionValue')}
                value={item.value}
                onChange={(e) => patchItem(index, { value: e.target.value })}
              />
              <button
                type="button"
                className="icon"
                aria-label={t('admin.removeOption', { label: item.label })}
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
