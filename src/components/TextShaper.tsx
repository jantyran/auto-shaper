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
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../state/store';
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

const PLACEHOLDER = `例）問合せフォームやメールの本文をそのまま貼り付けてください。

お世話になっております。株式会社サンプルの山田と申します。
新製品のお見積もりについてお問い合わせいたします。
連絡先: yamada@example.co.jp / 03-1234-5678
ご担当者よりご連絡いただけますと幸いです。`;

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

function recordTitle(item: ShapedTextRecord, fields: TargetField[]): string {
  const topic = fields.find((f) =>
    /topic|TOPIC|トピック/i.test(f.key + f.label),
  );
  const company = fields.find((f) => /company|会社/i.test(f.key + f.label));
  const primary =
    (topic && item.record[topic.key]?.trim()) ||
    (company && item.record[company.key]?.trim()) ||
    fields.map((f) => item.record[f.key]?.trim()).find(Boolean) ||
    '';
  return primary ? `${item.index}. ${primary}` : `${item.index}. 整形結果`;
}

export function TextShaper() {
  const settings = useStore((s) => s.settings);
  const customSchemas = useStore((s) => s.customSchemas);
  const setView = useStore((s) => s.setView);

  const schemas = useMemo(() => getAllSchemas(customSchemas), [customSchemas]);
  const defaultSchema = useMemo(
    () => getDefaultSchema(customSchemas),
    [customSchemas],
  );
  const [schemaId, setSchemaId] = useState<string>('');
  const target = schemas.find((s) => s.id === schemaId) ?? defaultSchema;

  useEffect(() => {
    if (!schemaId || !schemas.some((s) => s.id === schemaId)) {
      setSchemaId(defaultSchema?.id ?? schemas[0]?.id ?? '');
    }
  }, [defaultSchema?.id, schemaId, schemas]);

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
      const ok = confirm(
        'テンプレートを変更すると、現在ためている整形結果はクリアされます。変更しますか？',
      );
      if (!ok) return;
      setRecords([]);
      setOpenRecordIds(new Set());
      setManualRecordFields({});
    }
    setSchemaId(nextSchemaId);
  };

  const handleExtract = async (forceLocal: boolean) => {
    if (!target) {
      setError('テンプレートを選択してください。');
      return;
    }
    if (!text.trim()) {
      setError('本文を入力してください。');
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
            `LLM抽出に失敗したためローカル抽出に切り替えました（${
              e instanceof Error ? e.message : ''
            }）`,
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
      setError(e instanceof Error ? e.message : '整形に失敗しました。');
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
      <h2>雑多なテキストをテンプレートへ整形</h2>
      <p className="subtitle" style={{ marginBottom: 12 }}>
        問合せメールやメモをそのまま貼り付けると、AIが内容を読み取って、選んだテンプレートの
        各項目へ当てはめ・整理します。AIに見せたくない情報は、貼り付け後にマスクしてから渡せます。
      </p>

      <div className="security-note">
        マスクした情報は<b>このブラウザ内にのみ</b>保持され、AIへはトークン（例:
        [EMAIL_1]）だけが送られます。AIの応答はローカルで元の値へ復元してから表示します。
      </div>

      {/* テンプレート選択 */}
      <label className="field-label" style={{ maxWidth: 480, marginTop: 8 }}>
        当てはめ先テンプレート
        <select
          value={schemaId}
          onChange={(e) => handleSchemaChange(e.target.value)}
        >
          {schemas.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.isDefault ? '（既定）' : ''}（{s.fields.length}項目）
            </option>
          ))}
        </select>
      </label>
      <p className="subtitle" style={{ margin: '6px 0 14px' }}>
        目的に合う項目が無いときは
        <button
          className="ghost"
          style={{ padding: '2px 8px', margin: '0 2px' }}
          onClick={() => setView('admin')}
        >
          テンプレート管理
        </button>
        で独自の項目のテンプレートを作れます。
      </p>

      {/* マスキング・ツールバー */}
      <div className="mask-toolbar">
        <button
          className="btn-mini"
          onClick={runAutoMask}
          disabled={!text.trim()}
        >
          🛡 自動スキャンでマスク
        </button>
        <span className="mask-sep">選択範囲をマスク:</span>
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
          マスク解除
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
          placeholder={PLACEHOLDER}
          spellCheck={false}
        />
      </div>

      {/* トークン一覧 */}
      <div className="mask-tokens">
        {tokens.length === 0 ? (
          <span className="empty">
            マスクしたトークンはまだありません（AIに見せたくない箇所を選択して上のボタンでマスク）。
          </span>
        ) : (
          tokens.map((t) => (
            <span
              key={t.display}
              className="token-pill"
              style={{ borderColor: t.color, color: t.color }}
              title={`元の値: ${t.original}`}
            >
              {t.display}
              <button
                onClick={() => removeToken(t.display)}
                title="このマスクを解除"
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
        >
          {isExtracting
            ? '整形中…'
            : llmReady
              ? '✨ AIで整形する'
              : '⚙ ローカルで整形する'}
        </button>
        {llmReady && (
          <button onClick={() => handleExtract(true)} disabled={isExtracting}>
            AIを使わずローカル抽出
          </button>
        )}
        {records.length > 0 && (
          <span className="v-sub text-batch-count">
            現在 {records.length} 件をまとめ中
          </span>
        )}
      </div>

      {!llmReady && (
        <div className="alert info" style={{ marginTop: 12 }}>
          AI接続が未設定のため、ラベル・パターンによるローカル抽出で動作します。精度を上げるには
          <button
            className="ghost"
            style={{ padding: '2px 8px', margin: '0 2px' }}
            onClick={() => setView('settings')}
          >
            設定
          </button>
          でLLMのAPIキーを登録してください。
        </div>
      )}

      {error && (
        <div className="alert error" style={{ marginTop: 12 }}>
          {error}
        </div>
      )}

      {/* 整形結果 */}
      {records.length > 0 && target && (
        <div className="text-result-list">
          <div className="preview-bar">
            <h3 style={{ margin: 0 }}>整形結果（{records.length}件）</h3>
            <span className="v-sub">
              各項目は編集できます。値はマスク解除済み（元の値）です。
            </span>
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
                <span>{recordTitle(item, target.fields)}</span>
                <span className="field-kind-badge">
                  {item.method === 'llm' ? 'AI抽出' : 'ローカル抽出'}
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
              + さらに追加
            </button>
            <button onClick={exportCsv}>CSVでダウンロード</button>
            <button onClick={exportXlsx}>Excel(.xlsx)でダウンロード</button>
            <div className="spacer" />
            <button onClick={copyAsText}>
              {copied === 'text' ? '✓ コピーしました' : 'テキストでコピー'}
            </button>
            <button onClick={copyAsJson}>
              {copied === 'json' ? '✓ コピーしました' : 'JSONでコピー'}
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
  const opts = fieldOptionItems(field);
  const values = opts.map((o) => o.value);
  const inputKind = fieldInputKind(field);

  return (
    <>
      <div className="fill-label">
        {fieldDisplayName(field)}
        {field.required && <span className="required-badge"> ※必須</span>}
        <span className="field-kind-badge">
          {inputKind === 'select'
            ? '選択式'
            : inputKind === 'textarea'
              ? '長文'
              : '短文'}
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
            <option value="">選択…</option>
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
            placeholder="—（自由入力も可）"
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
