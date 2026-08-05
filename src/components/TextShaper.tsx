/**
 * テキスト整形モード。
 *
 * 問合せメールなどの雑多なテキストをコピペ → 必要なら機微情報をマスク（自動＋手動）
 * → テンプレートを選ぶ → AI（またはローカル）が各項目へ当てはめて 1 レコードに整理する。
 *
 * 安全性の考え方（Maskify 由来）:
 *  - AI に送るのはマスク済みのテキストだけ。元の値はこのブラウザ内の辞書にのみ残る。
 *  - AI の応答に含まれるトークンは、ローカルで元の値へ復元してから表示・出力する。
 */
import { useMemo, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { getAllSchemas } from '../core/schemaStore';
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
import { toCsv, downloadCsv, downloadXlsx } from '../core/exportCsv';
import type { TargetField } from '../types';

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

export function TextShaper() {
  const settings = useStore((s) => s.settings);
  const customSchemas = useStore((s) => s.customSchemas);
  const setView = useStore((s) => s.setView);

  const schemas = useMemo(() => getAllSchemas(customSchemas), [customSchemas]);
  const [schemaId, setSchemaId] = useState<string>(schemas[0]?.id ?? '');
  const target = schemas.find((s) => s.id === schemaId) ?? schemas[0];

  const [text, setText] = useState('');
  const [dict, setDict] = useState<MaskDictionary>(new Map());
  const [record, setRecord] = useState<ExtractedRecord | null>(null);
  const [method, setMethod] = useState<'llm' | 'local' | null>(null);
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
    const res = manualMaskSelection(text, el.selectionStart, el.selectionEnd, category, dict);
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
    setRecord(null);
    setMethod(null);

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
      let used: 'llm' | 'local';
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

      // マスクを元に戻し、対応が無い項目にはテンプレートの既定値を入れてから表示・出力する
      setRecord(applyRecordDefaults(unmaskRecord(raw, workingDict), target));
      setMethod(used);
    } catch (e) {
      setError(e instanceof Error ? e.message : '整形に失敗しました。');
    } finally {
      setExtracting(false);
    }
  };

  const updateField = (key: string, value: string) => {
    setRecord((prev) => ({ ...(prev ?? {}), [key]: value }));
  };

  const flashCopied = (id: string) => {
    setCopied(id);
    setTimeout(() => setCopied((c) => (c === id ? null : c)), 1600);
  };

  const copyAsText = () => {
    if (!record || !target) return;
    const body = target.fields
      .map((f) => `${f.label}: ${record[f.key] ?? ''}`)
      .join('\n');
    void navigator.clipboard.writeText(body).then(() => flashCopied('text'));
  };

  const copyAsJson = () => {
    if (!record || !target) return;
    const obj: Record<string, string> = {};
    for (const f of target.fields) obj[f.key] = record[f.key] ?? '';
    void navigator.clipboard
      .writeText(JSON.stringify(obj, null, 2))
      .then(() => flashCopied('json'));
  };

  const exportCsv = () => {
    if (!record || !target) return;
    downloadCsv(toCsv([record], target.fields), 'inquiry_shaped.csv');
  };

  const exportXlsx = () => {
    if (!record || !target) return;
    void downloadXlsx([record], target.fields, 'inquiry_shaped.xlsx');
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
        <select value={schemaId} onChange={(e) => setSchemaId(e.target.value)}>
          {schemas.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}（{s.fields.length}項目）
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
        <button className="btn-mini" onClick={runAutoMask} disabled={!text.trim()}>
          🛡 自動スキャンでマスク
        </button>
        <span className="mask-sep">選択範囲をマスク:</span>
        {MANUAL_CATEGORIES.map((cat) => (
          <button key={cat} className="btn-mini" onClick={() => maskSelection(cat)}>
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
        <div ref={backdropRef} className="mask-layer mask-backdrop" aria-hidden="true">
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
              <button onClick={() => removeToken(t.display)} title="このマスクを解除">
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
      {record && target && (
        <div style={{ marginTop: 20 }}>
          <div className="preview-bar">
            <h3 style={{ margin: 0 }}>
              整形結果（{method === 'llm' ? 'AI抽出' : 'ローカル抽出'}）
            </h3>
            <span className="v-sub">
              各項目は編集できます。値はマスク解除済み（元の値）です。
            </span>
          </div>

          <div className="fill-grid">
            {target.fields.map((f) => (
              <FillRow
                key={f.key}
                field={f}
                value={record[f.key] ?? ''}
                onChange={(v) => updateField(f.key, v)}
              />
            ))}
          </div>

          <div className="btn-row">
            <button className="primary" onClick={exportCsv}>
              CSVでダウンロード
            </button>
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
  const opts = field.options ?? [];

  return (
    <>
      <div className="fill-label">
        {field.label}
        {field.required && <span className="required-badge"> ※必須</span>}
      </div>
      {opts.length === 0 ? (
        <input
          type="text"
          value={value}
          placeholder="—"
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        // 選択肢はクイック選択。テキスト欄は常に編集可能で自由な上書きもできる
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select
            value={opts.includes(value) ? value : ''}
            onChange={(e) => {
              if (e.target.value) onChange(e.target.value);
            }}
          >
            <option value="">選択…</option>
            {opts.map((o) => (
              <option key={o} value={o}>
                {o}
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
      )}
    </>
  );
}
