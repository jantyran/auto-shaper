/**
 * 重複検出・名寄せ。
 * 変換後データから重複の可能性がある行を見つける。
 * キーはメール(あれば最優先)、無ければ会社名+姓の正規化値。
 */
import type { TargetSchema } from '../types';
import { normalizeHeader } from './inference/dictionary';

export interface DuplicateGroup {
  /** 正規化した突き合わせキー */
  key: string;
  /** このキーを共有する行インデックス(0始まり) */
  rows: number[];
}

export interface DedupeResult {
  groups: DuplicateGroup[];
  /** 重複に含まれる行インデックスの集合 */
  duplicateRows: Set<number>;
  /** どのフィールドで突き合わせたか(UI表示用) */
  keyFields: string[];
}

/** ターゲットから突き合わせに使うキー項目を決める */
function pickKeyFields(target: TargetSchema): string[] {
  const emailField = target.fields.find((f) => f.type === 'email');
  if (emailField) return [emailField.key];

  const companyField = target.fields.find((f) =>
    /company|会社|企業|法人|account|組織/i.test(`${f.key} ${f.label}`),
  );
  const lastNameField = target.fields.find((f) =>
    /lastname|姓|苗字|名字/i.test(`${f.key} ${f.label}`),
  );
  const keys = [companyField?.key, lastNameField?.key].filter(
    (k): k is string => !!k,
  );
  return keys;
}

/** 変換後の行から重複グループを検出 */
export function findDuplicates(
  rows: Record<string, string>[],
  target: TargetSchema,
): DedupeResult {
  const keyFields = pickKeyFields(target);
  const duplicateRows = new Set<number>();

  if (keyFields.length === 0) {
    return { groups: [], duplicateRows, keyFields };
  }

  const buckets = new Map<string, number[]>();
  rows.forEach((row, i) => {
    const parts = keyFields.map((k) => normalizeHeader(row[k] ?? ''));
    // すべて空のキーは突き合わせ対象外
    if (parts.every((p) => p === '')) return;
    const key = parts.join('|');
    const arr = buckets.get(key);
    if (arr) arr.push(i);
    else buckets.set(key, [i]);
  });

  const groups: DuplicateGroup[] = [];
  for (const [key, indices] of buckets) {
    if (indices.length > 1) {
      groups.push({ key, rows: indices });
      for (const i of indices) duplicateRows.add(i);
    }
  }
  // 重複件数の多い順
  groups.sort((a, b) => b.rows.length - a.rows.length);

  return { groups, duplicateRows, keyFields };
}
