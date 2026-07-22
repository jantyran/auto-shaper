/**
 * 変換後データの検証。
 *
 * 「AIが気を利かせすぎて壊れたデータをCRMに入れてしまう」リスクへの歯止め。
 * 必須項目の欠落や、メール/電話の形式不正を、インポート前に洗い出す。
 * (CRMのゴミ屋敷化を防ぐ、というこのプロダクトの価値の核)
 */
import type { TargetSchema } from '../types';

export type IssueKind = 'required' | 'email' | 'phone';

export interface RowIssue {
  /** 0始まりの行インデックス(表示は +1) */
  row: number;
  targetKey: string;
  label: string;
  kind: IssueKind;
  value: string;
}

export interface ValidationResult {
  issues: RowIssue[];
  /** 問題のある行インデックスの集合 */
  invalidRows: Set<number>;
  /** 種類ごとの件数 */
  counts: Record<IssueKind, number>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isBadEmail(v: string): boolean {
  return v.trim() !== '' && !EMAIL_RE.test(v.trim());
}
function isBadPhone(v: string): boolean {
  const t = v.trim();
  if (t === '') return false;
  const digits = t.replace(/\D/g, '');
  return digits.length < 7 || digits.length > 15;
}

/** 変換後の行を検証して問題点を集計する */
export function validateRows(
  rows: Record<string, string>[],
  target: TargetSchema,
): ValidationResult {
  const issues: RowIssue[] = [];
  const invalidRows = new Set<number>();
  const counts: Record<IssueKind, number> = { required: 0, email: 0, phone: 0 };

  rows.forEach((row, i) => {
    for (const field of target.fields) {
      const value = row[field.key] ?? '';
      const push = (kind: IssueKind) => {
        issues.push({ row: i, targetKey: field.key, label: field.label, kind, value });
        invalidRows.add(i);
        counts[kind]++;
      };
      if (field.required && value.trim() === '') push('required');
      if (field.type === 'email' && isBadEmail(value)) push('email');
      if (field.type === 'phone' && isBadPhone(value)) push('phone');
    }
  });

  return { issues, invalidRows, counts };
}

export const ISSUE_LABELS: Record<IssueKind, string> = {
  required: '必須項目が空',
  email: 'メール形式が不正',
  phone: '電話番号の桁数が不正',
};
