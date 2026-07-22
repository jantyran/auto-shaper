/**
 * 正規化処理群。
 * マーケ/CRM投入前に必須となる「泥臭い」クレンジングをここに集約する。
 * すべて純粋関数なので、メインスレッドのプレビューでもWeb Worker内でも共有できる。
 */
import type { Normalizer } from '../types';

/** 全角英数記号 → 半角 */
export function toHalfWidth(input: string): string {
  return input
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
    )
    // 全角記号の一部
    .replace(/　/g, ' ')
    .replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
}

/** 半角英数記号 → 全角 */
export function toFullWidth(input: string): string {
  return input
    .replace(/[A-Za-z0-9]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) + 0xfee0),
    )
    .replace(/ /g, '　');
}

const COMPANY_SUFFIX_MAP: Array<[RegExp, string]> = [
  [/\(株\)|（株）/g, '株式会社'],
  [/\(有\)|（有）/g, '有限会社'],
  [/\(合\)|（合）/g, '合同会社'],
  [/\(社\)|（社）/g, '社団法人'],
  [/\(財\)|（財）/g, '財団法人'],
];

/**
 * 会社名の表記ゆれを正規化する。
 * (株)→株式会社 のような略記を展開し、前後の余分な空白を除く。
 */
export function normalizeCompany(input: string): string {
  let out = input;
  for (const [pattern, replacement] of COMPANY_SUFFIX_MAP) {
    out = out.replace(pattern, replacement);
  }
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * 電話番号を正規化する。
 * 全角→半角化し、数字とプラス以外の記号を除いたうえでハイフンなしの
 * 連続数字に統一する(CRM側の再整形を容易にするため)。
 * 元が数字を含まない場合はそのまま返す。
 */
export function normalizePhone(input: string): string {
  const half = toHalfWidth(input).trim();
  // 数字, +, ハイフン系, 括弧, スペースのみを対象にする
  if (!/[0-9]/.test(half)) return input.trim();
  const digits = half.replace(/[^\d+]/g, '');
  return digits;
}

/** メールアドレスを正規化(trim + 小文字化 + 全角→半角) */
export function normalizeEmail(input: string): string {
  return toHalfWidth(input).trim().toLowerCase();
}

/** 単一の正規化子を適用 */
export function applyNormalizer(value: string, normalizer: Normalizer): string {
  switch (normalizer) {
    case 'trim':
      return value.trim();
    case 'toHalfWidth':
      return toHalfWidth(value);
    case 'toFullWidth':
      return toFullWidth(value);
    case 'normalizeCompany':
      return normalizeCompany(value);
    case 'normalizePhone':
      return normalizePhone(value);
    case 'normalizeEmail':
      return normalizeEmail(value);
    case 'upperCase':
      return value.toUpperCase();
    case 'lowerCase':
      return value.toLowerCase();
    case 'removeSpaces':
      return value.replace(/[\s　]/g, '');
    default:
      return value;
  }
}

/** 正規化子を順番に適用 */
export function applyNormalizers(
  value: string,
  normalizers: Normalizer[],
): string {
  return normalizers.reduce((acc, n) => applyNormalizer(acc, n), value);
}
