/**
 * テキスト整形モード。
 *
 * 問合せメールなどの雑多なテキストをコピペ → 必要なら機微情報をマスク（自動＋手動）
 * → テンプレートを選ぶ → AI（またはローカル）が各項目へ当てはめてレコードに整理する。
 * 整形結果は複数件ためて、最後にまとめてコピー/CSV/Excel出力できる。
 *
 * 安全性の考え方（Maskify 由来）:
 *  - AI に送るのはマスク済みのテキストだけ。元の値はこのブラウザ内の辞書にのみ残る。
 *  - AI の応答に含まれるトークンは、ローカルで元の値へ復元してから表示・出力する。
 */
import { useMemo, useRef, useState } from 'react';
import { Check, Settings, Shield, Sparkles } from 'lucide-react';
import { useStore } from '../state/store';
import { createTranslator } from '../core/i18n';
import { getAllSchemas, getDefaultSchema } from '../core/schemaStore';
import {
  autoMaskText,
  manualMaskSelection,
  unmaskText,
  unmaskRecord,
  splitByTokens,
  CATEGORY_LABEL,
  type MaskCategory,
  type MaskDictionary,
} from '../core/textMasking';
import {
  localTextExtract,
  llmTextExtract,
  type ExtractedRecord,
} from '../core/textExtract';
import { applyRecordDefaults } from '../core/mappingDefaults';
import { DEMO_INQUIRY_TEXT } from '../core/demoData';
import { applyAutoFillRules } from '../core/autoFillRules';
import { toCsv, downloadCsv, downloadXlsx } from '../core/exportCsv';
import type { TargetField } from '../types';
import {
  fieldDisplayName,
  fieldInputKind,
  fieldOptionItems,
} from '../core/fieldMeta';

/** 手動マスクで選べるカテゴリ（自動検出する NUMBER/CARD は手動ボタンから除外） */
const MANUAL_CATEGORIES: MaskCategory[] = [
  'NAME',
  'COMPANY',
  'EMAIL',
  'PHONE',
  'ADDRESS',
  'CUSTOM',
];

type TextRecordMethod = 'llm' | 'local';

interface ShapedTextRecord {
  id: string;
  index: number;
  method: TextRecordMethod;
  record: ExtractedRecord;
}

function newRecordId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'text-' + Date.now() + '-' + Math.random().toString(36).slice(2);
}

function recordTitle(
  item: ShapedTextRecord,
  fields: TargetField[],
  t: ReturnType<typeof createTranslator>,
): string {
  const topic = fields.find((f) =>
    /topic|TOPIC|トピック/i.test(f.key + f.label),
  );
  const company = fields.find((f) => /company|会社/i.test(f.key + f.label));
  const primary =
    (topic && item.record[topic.key]?.trim()) ||
    (company && item.record[company.key]?.trim()) ||
    fields.map((f) => item.record[f.key]?.trim()).find(Boolean) ||
    '';
  return primary
    ? `${item.index}. ${primary}`
    : `${item.index}. ${t('text.results', { count: 1 })}`;
}

export function TextShaper() {
  const settings = useStore((s) => s.settings);
  const t = createTranslator(settings.locale);
  const customSchemas = useStore((s) => s.customSchemas);
  const setView = useStore((s) => s.setView);
  const demoActive = useStore((s) => s.demoActive);

  const schemas = useMemo(() => getAllSchemas(customSchemas), [customSchemas]);
  const defaultSchema = useMemo(
    () => getDefaultSchema(customSchemas),
    [customSchemas],
  );
  // ユーザーが選んだテンプレート。未選択、または選択後にそのテンプレートが
  // 消えた場合は既定テンプレートへ自動フォールバックする(状態を同期する必要は
  // ないので、useEffect ではなくレンダー時の派生値として解決する)。
  const [pickedSchemaId, setPickedSchemaId] = useState<string>('');
  const schemaId =
    pickedSchemaId && schemas.some((s) => s.id === pickedSchemaId)
      ? pickedSchemaId
      : (defaultSchema?.id ?? schemas[0]?.id ?? '');
  const target = schemas.find((s) => s.id === schemaId) ?? defaultSchema;

  const [text, setText] = useState('');
  const [dict, setDict] = useState<MaskDictionary>(new Map());
  const [records, setRecords] = useState<ShapedTextRecord[]>([]);
  const [openRecordIds, setOpenRecordIds] = useState<Set<string>>(new Set());
  const [manualRecordFields, setManualRecordFields] = useState<
    Record<string, Set<string>>
  >({});
  const [isExtracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [copied, setCopied] = useState<string | null>(null);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  const llmReady = settings.features.llm && settings.llm.apiKey.trim() !== '';
  const maskingOn = settings.features.masking;

  // ガイドツアーのデモ中は、空欄なら体験用の文面を自動で入れておく。
  // demoActiveがtrueになった最初のレンダーでだけ判定し、後から手動で空にしても
  // 再投入しない(一度きりのフラグを保持)。
  const [demoPrefilled, setDemoPrefilled] = useState(false);
  if (demoActive && !demoPrefilled) {
    setDemoPrefilled(true);
    if (!text) setText(DEMO_INQUIRY_TEXT);
  } else if (!demoActive && demoPrefilled) {
    setDemoPrefilled(false);
  }

  const syncScroll = () => {
    if (inputRef.current && backdropRef.current) {
      backdropRef.current.scrollTop = inputRef.current.scrollTop;
      backdropRef.current.scrollLeft = inputRef.current.scrollLeft;
    }
  };

  const runAutoMask = () => {
    const { maskedText, dictionary } = autoMaskText(text, dict);
    setText(maskedText);
    setDict(dictionary);
  };

  const maskSelection = (category: MaskCategory) => {
    const el = inputRef.current;
    if (!el) return;
    const res = manualMaskSelection(
      text,
      el.selectionStart,
      el.selectionEnd,
      category,
      dict,
    );
    if (res) {
      setText(res.maskedText);
      setDict(res.dictionary);
    }
  };

  const removeToken = (display: string) => {
    const token = dict.get(display);
    if (!token) return;
    setText((prev) => prev.split(display).join(token.original));
    const next = new Map(dict);
    next.delete(display);
    setDict(next);
  };

  const clearMasks = () => {
    if (dict.size === 0) return;
    setText((prev) => unmaskText(prev, dict));
    setDict(new Map());
  };

  const handleSchemaChange = (nextSchemaId: string) => {
    if (records.length > 0) {
      const ok = confirm(t('text.confirmChangeTemplate'));
      if (!ok) return;
      setRecords([]);
      setOpenRecordIds(new Set());
      setManualRecordFields({});
    }
    setPickedSchemaId(nextSchemaId);
  };

  const handleExtract = async (forceLocal: boolean) => {
    if (!target) {
      setError(t('text.selectTemplate'));
      return;
    }
    if (!text.trim()) {
      setError(t('text.enterText'));
      return;
    }
    setError(undefined);
    setExtracting(true);

    try {
      const useLlm = llmReady && !forceLocal;
      let workingText = text;
      let workingDict = dict;

      // LLM に送る場合、マスキングONなら送信前に最低限の個人情報を自動でトークン化する
      if (useLlm && maskingOn) {
        const masked = autoMaskText(text, dict);
        workingText = masked.maskedText;
        workingDict = masked.dictionary;
        setText(workingText);
        setDict(workingDict);
      }

      let raw: ExtractedRecord;
      let used: TextRecordMethod;
      if (useLlm) {
        try {
          raw = await llmTextExtract(workingText, target, settings.llm);
          used = 'llm';
        } catch (e) {
          // LLM が失敗したらローカル抽出へフォールバック
          raw = localTextExtract(workingText, target);
          used = 'local';
          setError(
            t('text.llmFallback', {
              message: e instanceof Error ? e.message : '',
            }),
          );
        }
      } else {
        raw = localTextExtract(workingText, target);
        used = 'local';
      }

      const item: ShapedTextRecord = {
        id: newRecordId(),
        index: records.length + 1,
        method: used,
        record: applyRecordDefaults(unmaskRecord(raw, workingDict), target),
      };
      setRecords((prev) => [...prev, item]);
      setOpenRecordIds((prev) => new Set([...prev, item.id]));
      setManualRecordFields((prev) => ({ ...prev, [item.id]: new Set() }));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('text.extractFailed'));
    } finally {
      setExtracting(false);
    }
  };

  const updateField = (recordId: string, key: string, value: string) => {
    if (!target) {
      setRecords((prev) =>
        prev.map((item) =>
          item.id === recordId
            ? { ...item, record: { ...item.record, [key]: value } }
            : item,
        ),
      );
      return;
    }
    const protectedKeys = new Set(manualRecordFields[recordId] ?? []);
    protectedKeys.add(key);
    setManualRecordFields((prev) => ({ ...prev, [recordId]: protectedKeys }));
    setRecords((prev) =>
      prev.map((item) =>
        item.id === recordId
          ? {
              ...item,
              record: applyAutoFillRules(
                { ...item.record, [key]: value },
                target,
                {
                  force: true,
                  skipKeys: protectedKeys,
                },
              ),
            }
          : item,
      ),
    );
  };

  const startNextRecord = () => {
    setText('');
    setDict(new Map());
    setOpenRecordIds(new Set());
    setError(undefined);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  const flashCopied = (id: string) => {
    setCopied(id);
    setTimeout(() => setCopied((c) => (c === id ? null : c)), 1600);
  };

  const copyAsText = () => {
    if (records.length === 0 || !target) return;
    const body = records
      .map((item) =>
        target.fields
          .map((f) => `${fieldDisplayName(f)}: ${item.record[f.key] ?? ''}`)
          .join('\n'),
      )
      .join('\n\n---\n\n');
    void navigator.clipboard.writeText(body).then(() => flashCopied('text'));
  };

  const copyAsJson = () => {
    if (records.length === 0 || !target) return;
    const rows = records.map((item) => {
      const obj: Record<string, string> = {};
      for (const f of target.fields) obj[f.key] = item.record[f.key] ?? '';
      return obj;
    });
    void navigator.clipboard
      .writeText(JSON.stringify(rows, null, 2))
      .then(() => flashCopied('json'));
  };

  const exportCsv = () => {
    if (records.length === 0 || !target) return;
    downloadCsv(
      toCsv(
        records.map((item) => item.record),
        target.fields,
      ),
      'inquiry_shaped.csv',
    );
  };

  const exportXlsx = () => {
    if (records.length === 0 || !target) return;
    void downloadXlsx(
      records.map((item) => item.record),
      target.fields,
      'inquiry_shaped.xlsx',
    );
  };

  const tokens = [...dict.values()];

  return (
    <div className="panel">
      <h2>{t('text.heading')}</h2>
      <p className="subtitle" style={{ marginBottom: 12 }}>
        {t('text.description')}
      </p>

      <div className="security-note">{t('text.security')}</div>

      {/* テンプレート選択 */}
      <label className="field-label" style={{ maxWidth: 480, marginTop: 8 }}>
        {t('text.template')}
        <select
          value={schemaId}
          onChange={(e) => handleSchemaChange(e.target.value)}
        >
          {schemas.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.isDefault ? t('text.default') : ''}
              {t('text.fieldCount', { count: s.fields.length })}
            </option>
          ))}
        </select>
      </label>
      <p className="subtitle" style={{ margin: '6px 0 14px' }}>
        {t('text.managePrefix')}
        <button
          className="ghost"
          style={{ padding: '2px 8px', margin: '0 2px' }}
          onClick={() => setView('admin')}
        >
          {t('text.manage')}
        </button>
        {t('text.manageSuffix')}
      </p>

      {/* マスキング・ツールバー */}
      <div className="mask-toolbar" data-tour="tour-text-input">
        <button
          className="btn-mini"
          onClick={runAutoMask}
          disabled={!text.trim()}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <Shield size={14} aria-hidden="true" />
          {t('text.autoMask')}
        </button>
        <span className="mask-sep">{t('text.maskSelection')}</span>
        {MANUAL_CATEGORIES.map((cat) => (
          <button
            key={cat}
            className="btn-mini"
            onClick={() => maskSelection(cat)}
          >
            {CATEGORY_LABEL[cat]}
          </button>
        ))}
        <div className="spacer" />
        <button
          className="btn-mini ghost"
          onClick={clearMasks}
          disabled={dict.size === 0}
        >
          {t('text.clearMasks')}
        </button>
      </div>

      {/* 入力エディタ（背面ハイライト + 透明テキストエリア） */}
      <div className="mask-editor">
        <div
          ref={backdropRef}
          className="mask-layer mask-backdrop"
          aria-hidden="true"
        >
          {splitByTokens(text).map((part, i) => {
            const tok = dict.get(part);
            if (tok) {
              return (
                <span
                  key={i}
                  className="mask-token"
                  style={{
                    background: `${tok.color}33`,
                    color: tok.color,
                    boxShadow: `inset 0 0 0 1px ${tok.color}`,
                  }}
                >
                  {part}
                </span>
              );
            }
            return <span key={i}>{part}</span>;
          })}
          {'\u200b'}
        </div>
        <textarea
          ref={inputRef}
          className="mask-layer mask-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onScroll={syncScroll}
          aria-label={t('text.source')}
          placeholder={t('text.placeholder')}
          spellCheck={false}
        />
      </div>

      {/* トークン一覧 */}
      <div className="mask-tokens">
        {tokens.length === 0 ? (
          <span className="empty">{t('text.noTokens')}</span>
        ) : (
          tokens.map((token) => (
            <span
              key={token.display}
              className="token-pill"
              style={{ borderColor: token.color, color: token.color }}
              title={t('text.originalValue', { value: token.original })}
            >
              {token.display}
              <button
                onClick={() => removeToken(token.display)}
                title={t('text.removeMask')}
              >
                ×
              </button>
            </span>
          ))
        )}
      </div>

      <div className="btn-row">
        <button
          className="primary"
          onClick={() => handleExtract(false)}
          disabled={isExtracting || !text.trim()}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          {isExtracting ? (
            t('text.extracting')
          ) : llmReady ? (
            <>
              <Sparkles size={14} aria-hidden="true" />
              {t('text.extractAi')}
            </>
          ) : (
            <>
              <Settings size={14} aria-hidden="true" />
              {t('text.extractLocal')}
            </>
          )}
        </button>
        {llmReady && (
          <button onClick={() => handleExtract(true)} disabled={isExtracting}>
            {t('text.extractWithoutAi')}
          </button>
        )}
        {records.length > 0 && (
          <span className="v-sub text-batch-count">
            {t('text.batch', { count: records.length })}
          </span>
        )}
      </div>

      {!llmReady && (
        <div className="alert info" style={{ marginTop: 12 }}>
          {t('text.llmUnavailablePrefix')}
          <button
            className="ghost"
            style={{ padding: '2px 8px', margin: '0 2px' }}
            onClick={() => setView('settings')}
          >
            {t('nav.settings')}
          </button>
          {t('text.llmUnavailableSuffix')}
        </div>
      )}

      {error && (
        <div className="alert error" style={{ marginTop: 12 }}>
          {error}
        </div>
      )}

      {/* 整形結果 */}
      {records.length > 0 && target && (
        <div className="text-result-list" data-tour="tour-text-results">
          <div className="preview-bar">
            <h3 style={{ margin: 0 }}>
              {t('text.results', { count: records.length })}
            </h3>
            <span className="v-sub">{t('text.resultsHint')}</span>
          </div>

          {records.map((item) => (
            <details
              key={item.id}
              className="text-result-item"
              open={openRecordIds.has(item.id)}
              onToggle={(e) => {
                const isOpen = e.currentTarget.open;
                setOpenRecordIds((prev) => {
                  const next = new Set(prev);
                  if (isOpen) next.add(item.id);
                  else next.delete(item.id);
                  return next;
                });
              }}
            >
              <summary className="text-result-summary">
                <span>{recordTitle(item, target.fields, t)}</span>
                <span className="field-kind-badge">
                  {item.method === 'llm'
                    ? t('text.llmMethod')
                    : t('text.localMethod')}
                </span>
              </summary>
              <div className="fill-grid">
                {target.fields.map((f) => (
                  <FillRow
                    key={f.key}
                    field={f}
                    value={item.record[f.key] ?? ''}
                    onChange={(v) => updateField(item.id, f.key, v)}
                  />
                ))}
              </div>
            </details>
          ))}

          <div className="btn-row">
            <button className="primary" onClick={startNextRecord}>
              {t('text.addAnother')}
            </button>
            <button onClick={exportCsv}>{t('text.downloadCsv')}</button>
            <button onClick={exportXlsx}>{t('text.downloadXlsx')}</button>
            <div className="spacer" />
            <button
              onClick={copyAsText}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              {copied === 'text' && <Check size={14} aria-hidden="true" />}
              {copied === 'text' ? t('text.copied') : t('text.copyText')}
            </button>
            <button
              onClick={copyAsJson}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              {copied === 'json' && <Check size={14} aria-hidden="true" />}
              {copied === 'json' ? t('text.copied') : t('text.copyJson')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function FillRow({
  field,
  value,
  onChange,
}: {
  field: TargetField;
  value: string;
  onChange: (v: string) => void;
}) {
  const locale = useStore((state) => state.settings.locale);
  const t = createTranslator(locale);
  const opts = fieldOptionItems(field);
  const values = opts.map((o) => o.value);
  const inputKind = fieldInputKind(field);

  return (
    <>
      <div className="fill-label">
        {fieldDisplayName(field)}
        {field.required && (
          <span className="required-badge">{t('text.required')}</span>
        )}
        <span className="field-kind-badge">
          {inputKind === 'select'
            ? t('text.selectKind')
            : inputKind === 'textarea'
              ? t('text.longKind')
              : t('text.shortKind')}
        </span>
      </div>
      {inputKind === 'textarea' ? (
        <textarea
          value={value}
          placeholder="—"
          rows={3}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : inputKind === 'select' && opts.length > 0 ? (
        // 選択肢はクイック選択。テキスト欄は常に編集可能で自由な上書きもできる
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select
            value={values.includes(value) ? value : ''}
            onChange={(e) => {
              if (e.target.value) onChange(e.target.value);
            }}
          >
            <option value="">{t('text.selectOption')}</option>
            {opts.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label === o.value ? o.value : o.label + ' (' + o.value + ')'}
              </option>
            ))}
          </select>
          <input
            type="text"
            style={{ flex: 1 }}
            value={value}
            placeholder={t('text.freeInput')}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      ) : (
        <input
          type="text"
          value={value}
          placeholder="—"
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </>
  );
}
