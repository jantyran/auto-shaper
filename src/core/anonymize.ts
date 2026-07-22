/**
 * マスキング / 匿名化サンプリング。
 *
 * AI(推論器)に渡すサンプルから、個人情報・機密情報をマスキングする。
 * 「構造は保ちつつ無害化されたダミーデータ」を作るのが目的で、
 * これにより AI は生データに直接触れられない。
 *
 * マスキングの強さはユーザー設定(MaskingSettings)で制御できる:
 *  - メール/電話/長い数字列のマスク切り替え
 *  - 機微カラムの完全伏字
 *  - サンプル値を一切送らず「列名と型だけ」を渡す最強モード
 */
import type { SourceColumn, SuggestContext, TargetSchema } from '../types';
import {
  DEFAULT_SETTINGS,
  type MaskingSettings,
} from './settings';

const EMAIL_RE = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
const PHONE_RE = /(\+?\d[\d\-\s()]{6,}\d)/g;
const LONG_DIGITS_RE = /\d{5,}/g;
const REDACTED = '■■■(機微)';

/** 個人情報に該当する列名のキーワード(氏名・会社名・連絡先・住所など) */
const PERSONAL_KEYWORDS = [
  '氏名', '名前', 'お名前', '姓', '名', '苗字', '名字', '担当者', '担当',
  'name', 'firstname', 'first name', 'lastname', 'last name',
  '会社', '企業', '法人', '団体', '組織', '御社', 'company', 'organization', 'account',
  'メール', 'mail', 'email', 'e-mail',
  '電話', 'tel', 'phone', '携帯', 'mobile', '連絡先', 'fax',
  '住所', '所在地', 'address', '郵便', 'zip', 'postal',
  '生年月日', '誕生日', 'birthday', 'dob', 'マイナンバー', '口座',
];

/**
 * 列が個人情報に分類されるかを、型と列名から自動判定する。
 * (会社名・氏名・メール・電話・住所 などを既定でマスクするため)
 */
export function isPersonalColumn(name: string, inferredType: string): boolean {
  if (inferredType === 'email' || inferredType === 'phone') return true;
  const n = name.normalize('NFKC').toLowerCase().replace(/[\s_\-.・:：/]/g, '');
  return PERSONAL_KEYWORDS.some((k) => {
    const nk = k.normalize('NFKC').toLowerCase().replace(/[\s_\-.・:：/]/g, '');
    return n.includes(nk);
  });
}

/** 設定に従って1つの値をマスクする */
export function maskValue(value: string, masking: MaskingSettings): string {
  let v = value;
  if (masking.maskEmails) v = v.replace(EMAIL_RE, 'user@example.com');
  if (masking.maskPhones) v = v.replace(PHONE_RE, (m) => m.replace(/\d/g, '0'));
  if (masking.maskLongNumbers)
    v = v.replace(LONG_DIGITS_RE, (m) => '0'.repeat(m.length));
  return v;
}

/**
 * すべてのマスクを有効にした標準の匿名化(後方互換の既定動作)。
 */
export function anonymizeValue(value: string): string {
  return maskValue(value, DEFAULT_SETTINGS.masking);
}

/**
 * カラム定義とサンプルから、AI に渡す安全なコンテキストを構築する。
 *
 * @param masking マスキング設定。省略時は全マスク有効。
 * @param maskingEnabled false の場合はマスクせず生サンプルを渡す(UIで警告する用途)
 */
export function buildSuggestContext(
  columns: SourceColumn[],
  target: TargetSchema,
  masking: MaskingSettings = DEFAULT_SETTINGS.masking,
  maskingEnabled = true,
): SuggestContext {
  const contextColumns = columns.map((c) => ({
    name: c.name,
    inferredType: c.inferredType,
    fillRate: c.fillRate,
  }));

  // サンプル値を送らないモード: 列名と型だけ
  if (maskingEnabled && !masking.sendSampleValues) {
    return { columns: contextColumns, anonymizedSamples: [], target };
  }

  const sampleRows = 5;
  const sensitive = new Set(masking.sensitiveColumns);
  // 伏字にする列(個人情報の自動判定 + ユーザー追加指定)を事前に確定
  const redactColumns = new Set<string>();
  if (maskingEnabled) {
    for (const col of columns) {
      if (sensitive.has(col.name)) redactColumns.add(col.name);
      else if (masking.maskPersonalInfo && isPersonalColumn(col.name, col.inferredType))
        redactColumns.add(col.name);
    }
  }

  const anonymizedSamples: Record<string, string>[] = [];
  for (let i = 0; i < sampleRows; i++) {
    const row: Record<string, string> = {};
    let hasAny = false;
    for (const col of columns) {
      const raw = col.sampleValues[i];
      if (raw == null) {
        row[col.name] = '';
        continue;
      }
      hasAny = true;
      if (!maskingEnabled) {
        row[col.name] = raw; // マスク無効(生データ)
      } else if (redactColumns.has(col.name)) {
        row[col.name] = REDACTED; // 個人情報・機微列は完全伏字
      } else {
        row[col.name] = maskValue(raw, masking); // 残りはパターンマスク
      }
    }
    if (hasAny) anonymizedSamples.push(row);
  }

  return { columns: contextColumns, anonymizedSamples, target };
}
