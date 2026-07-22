/**
 * 匿名化サンプリング。
 * AI(推論器)に渡すサンプルから、個人情報・機密情報をマスキングする。
 * 「構造は保ちつつ無害化されたダミーデータ」を作るのが目的。
 *
 * ローカル推論のMVPでは実際には外部送信しないが、
 * 将来 LLM API に切り替えても同じ SuggestContext を渡せるよう、
 * サジェスト入力は常にこの匿名化を通す設計にしている。
 */
import type { SourceColumn, SuggestContext, TargetSchema } from '../types';

const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
const PHONE_RE = /(\+?\d[\d\-\s()]{6,}\d)/g;
const LONG_DIGITS_RE = /\d{5,}/g;

/** 1つの値を匿名化する。型に応じて構造を保った置換を行う */
export function anonymizeValue(value: string): string {
  let v = value;
  v = v.replace(EMAIL_RE, 'user@example.com');
  v = v.replace(PHONE_RE, (m) => m.replace(/\d/g, '0'));
  // 残った長い数字列(口座・ID等)もマスク
  v = v.replace(LONG_DIGITS_RE, (m) => '0'.repeat(m.length));
  return v;
}

/**
 * カラム定義とサンプルから、AIに渡す安全なコンテキストを構築する。
 * カラム名と型は残すが、サンプル値の中身は匿名化する。
 */
export function buildSuggestContext(
  columns: SourceColumn[],
  target: TargetSchema,
): SuggestContext {
  // 先頭最大5行分の匿名化サンプルを列ごとに組み立てる
  const sampleRows = 5;
  const anonymizedSamples: Record<string, string>[] = [];
  for (let i = 0; i < sampleRows; i++) {
    const row: Record<string, string> = {};
    let hasAny = false;
    for (const col of columns) {
      const raw = col.sampleValues[i];
      if (raw != null) {
        row[col.name] = anonymizeValue(raw);
        hasAny = true;
      } else {
        row[col.name] = '';
      }
    }
    if (hasAny) anonymizedSamples.push(row);
  }

  return {
    columns: columns.map((c) => ({
      name: c.name,
      inferredType: c.inferredType,
      fillRate: c.fillRate,
    })),
    anonymizedSamples,
    target,
  };
}
