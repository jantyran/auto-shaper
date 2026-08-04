/**
 * フリーテキスト → テンプレート整形（抽出器）。
 *
 * 問合せメールなどの雑多なテキストから、選んだテンプレート（TargetSchema）の
 * 各項目に当てはまる値を抜き出して 1 レコードに整理する。
 *
 * 2 経路を用意する:
 *  - llmTextExtract:   自前バックエンド `/api/extract` 経由で LLM に抽出させる。
 *                      送るのは（呼び出し側でマスク済みの）テキストとテンプレ定義のみ。
 *  - localTextExtract: ネットワークを使わず、ラベル一致・型ヒューリスティックで抽出する。
 *
 * LLM の出力は信頼せず、必ずテンプレの項目キーだけに絞った文字列レコードへ整える。
 * マスクした値の復元（unmask）は呼び出し側で行う（services/textMasking.unmaskRecord）。
 */
import type { TargetField, TargetSchema } from '../types';
import type { LlmSettings } from './settings';

/** 抽出結果（key = テンプレ項目キー, value = 値。まだマスクトークンを含みうる） */
export type ExtractedRecord = Record<string, string>;

const EMAIL_RE = /[^\s@<>()[\]{}",;]+@[^\s@<>()[\]{}",;]+\.[^\s@<>()[\]{}",;.]+/;
const URL_RE = /https?:\/\/[^\s<>()"']+/i;
const PHONE_RE = /\+?\d[\d\s()-]{7,}\d/;
/** マスク済みのトークン（例: [EMAIL_1]）も型別フォールバックで拾えるようにする */
const TOKEN_RE = /\[[A-Z]+_\d+\]/;

/** ラベル照合用の正規化（全半角・記号・空白差を吸収） */
function norm(s: string): string {
  return s.normalize('NFKC').toLowerCase().replace(/[\s_\-.・:：/（）()【】「」]/g, '');
}

/**
 * LLM 応答を安全な ExtractedRecord に整える。
 * `{ fields: {key: value} }` でも、フラットな `{key: value}` でも受け付ける。
 * テンプレに無いキーは捨て、値は文字列化・トリムする。
 */
export function sanitizeExtraction(raw: unknown, target: TargetSchema): ExtractedRecord {
  const container =
    raw && typeof raw === 'object' && 'fields' in (raw as Record<string, unknown>)
      ? (raw as { fields: unknown }).fields
      : raw;
  const obj =
    container && typeof container === 'object'
      ? (container as Record<string, unknown>)
      : {};

  const out: ExtractedRecord = {};
  for (const f of target.fields) {
    const v = obj[f.key];
    if (v == null) continue;
    const str = typeof v === 'string' ? v : String(v);
    const trimmed = str.trim();
    if (trimmed) out[f.key] = trimmed;
  }
  return out;
}

/**
 * ローカル抽出（ネットワーク不使用）。
 * 1) 「ラベル: 値」形式の行をテンプレ項目名・別名と突き合わせる
 * 2) 埋まらなかった email/phone/url 型は本文全体からパターンで補完する
 */
export function localTextExtract(text: string, target: TargetSchema): ExtractedRecord {
  const out: ExtractedRecord = {};

  // 1) ラベル付き行の抽出
  const pairs: { labelNorm: string; value: string }[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = line.match(/^(.{1,24}?)\s*[:：]\s*(.+)$/);
    if (m && m[2].trim()) {
      pairs.push({ labelNorm: norm(m[1]), value: m[2].trim() });
    }
  }

  const usedPairs = new Set<number>();
  for (const f of target.fields) {
    const cands = [f.label, f.key, ...f.aliases]
      .map(norm)
      .filter((c) => c.length >= 2);
    if (cands.length === 0) continue;

    // 完全一致を優先し、無ければ部分一致
    let hitIdx = pairs.findIndex(
      (p, i) => !usedPairs.has(i) && cands.some((c) => p.labelNorm === c),
    );
    if (hitIdx < 0) {
      hitIdx = pairs.findIndex(
        (p, i) =>
          !usedPairs.has(i) &&
          cands.some((c) => p.labelNorm.includes(c) || c.includes(p.labelNorm)),
      );
    }
    if (hitIdx >= 0) {
      usedPairs.add(hitIdx);
      out[f.key] = pairs[hitIdx].value;
    }
  }

  // 2) 型別フォールバック（本文全体から最初の一致を拾う）
  for (const f of target.fields) {
    if (out[f.key]) continue;
    const found = fallbackByType(text, f);
    if (found) out[f.key] = found;
  }

  return out;
}

/** email/phone/url 型の項目を本文全体からパターンで補完する */
function fallbackByType(text: string, field: TargetField): string | undefined {
  if (field.type === 'email') return firstMatch(text, EMAIL_RE, 'EMAIL');
  if (field.type === 'url') return firstMatch(text, URL_RE);
  if (field.type === 'phone') {
    const token = firstMatch(text, TOKEN_RE, 'PHONE');
    if (token) return token;
    const m = text.match(PHONE_RE);
    if (m && m[0].replace(/\D/g, '').length >= 9) return m[0].trim();
  }
  return undefined;
}

/** 生パターンの最初の一致か、対応するマスクトークンのどちらかを返す */
function firstMatch(text: string, re: RegExp, tokenPrefix?: string): string | undefined {
  const m = text.match(re);
  if (m) return m[0].trim();
  if (tokenPrefix) {
    const t = text.match(new RegExp(`\\[${tokenPrefix}_\\d+\\]`));
    if (t) return t[0];
  }
  return undefined;
}

/**
 * LLM 抽出（自前バックエンド経由）。
 * 送るのはマスク済みテキストとテンプレ定義のみ。応答は sanitizeExtraction で整える。
 */
export async function llmTextExtract(
  text: string,
  target: TargetSchema,
  llm: LlmSettings,
): Promise<ExtractedRecord> {
  const res = await fetch('/api/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: llm.provider,
      model: llm.model,
      apiKey: llm.apiKey,
      text,
      target,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`抽出 API エラー (${res.status}): ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as unknown;
  return sanitizeExtraction(json, target);
}
