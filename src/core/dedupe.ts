/**
 * 重複検出・名寄せ。
 *
 * 変換後のデータから、同じ相手を指している行を見つけ、指定に応じて
 * 「知らせるだけ」「1行だけ残す」「1行に統合する」まで行う。
 *
 * 統合は検証より前に走らせる前提で書いている。順番が逆だと、統合すれば
 * 埋まるはずの必須項目が「欠落」として報告され、ユーザーが存在しない
 * 問題を追いかけることになるため。
 */
import type { TargetSchema } from '../types';
import { normalizeHeader } from './inference/dictionary';

/** 重複を見つけたあとの処理 */
export type DedupeAction = 'report' | 'keepFirst' | 'keepLast' | 'merge';

/** 統合するときに、どの値を採用するか */
export type MergeRule = 'firstNonEmpty' | 'lastNonEmpty';

export interface DedupeConfig {
  /** 突き合わせに使う出力項目のキー。複数指定するとすべて一致で重複とみなす。 */
  keyFields: string[];
  /** true なら空白・記号・全角半角・英字の大小を無視して照合する */
  loose: boolean;
  action: DedupeAction;
  mergeRule: MergeRule;
}

export interface DuplicateGroup {
  /** 正規化した突き合わせキー */
  key: string;
  /** このキーを共有する行インデックス(0始まり・処理前の並び) */
  rows: number[];
}

export interface DedupeResult {
  groups: DuplicateGroup[];
  /** 重複に含まれる行インデックスの集合(処理前の並び) */
  duplicateRows: Set<number>;
  /** どのフィールドで突き合わせたか(UI表示用) */
  keyFields: string[];
}

export interface DedupeOutcome extends DedupeResult {
  /** 処理後の行。action が 'report' なら入力と同じ。 */
  rows: Record<string, string>[];
  /** 処理で減った行数 */
  removed: number;
}

export const DEFAULT_MERGE_RULE: MergeRule = 'firstNonEmpty';

/**
 * ターゲットの項目から、突き合わせに使えそうなキーを推定する。
 * 既定値として使うので、設定を触らないユーザーにも従来どおり効く。
 */
export function suggestDedupeKeys(target: TargetSchema): string[] {
  const emailField = target.fields.find((f) => f.type === 'email');
  if (emailField) return [emailField.key];

  const companyField = target.fields.find((f) =>
    /company|会社|企業|法人|account|組織/i.test(`${f.key} ${f.label}`),
  );
  const lastNameField = target.fields.find((f) =>
    /lastname|姓|苗字|名字/i.test(`${f.key} ${f.label}`),
  );
  return [companyField?.key, lastNameField?.key].filter(
    (k): k is string => !!k,
  );
}

/** ターゲットに対する既定の重複設定(従来と同じ「検出のみ」) */
export function defaultDedupeConfig(target: TargetSchema): DedupeConfig {
  return {
    keyFields: suggestDedupeKeys(target),
    loose: true,
    action: 'report',
    mergeRule: DEFAULT_MERGE_RULE,
  };
}

/** 照合用のキーに揃える */
function matchKey(value: string, loose: boolean): string {
  return loose ? normalizeHeader(value) : value.trim();
}

/** 変換後の行から重複グループを検出 */
export function findDuplicates(
  rows: Record<string, string>[],
  config: DedupeConfig,
): DedupeResult {
  const keyFields = config.keyFields;
  const duplicateRows = new Set<number>();

  if (keyFields.length === 0) {
    return { groups: [], duplicateRows, keyFields };
  }

  const buckets = new Map<string, number[]>();
  rows.forEach((row, i) => {
    const parts = keyFields.map((k) => matchKey(row[k] ?? '', config.loose));
    // すべて空のキーは突き合わせ対象外(空欄同士を同一視しない)
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

/**
 * 同じ相手を指す複数行を1行にまとめる。
 *
 * 項目ごとに「空でない値」を拾うのが要点。単に1行を残すだけだと、
 * 別のリストにしか入っていなかった電話番号や役職が落ちる。
 * どちらの端から拾うかは、後から足したファイルほど新しい運用があるため選べる。
 */
export function mergeRows(
  rows: Record<string, string>[],
  indices: number[],
  rule: MergeRule = DEFAULT_MERGE_RULE,
): Record<string, string> {
  // order の先頭から順に見て、最初に見つかった空でない値を採用する
  const order = rule === 'lastNonEmpty' ? [...indices].reverse() : indices;
  const out: Record<string, string> = {};
  for (const i of order) {
    const row = rows[i];
    if (!row) continue;
    for (const [key, value] of Object.entries(row)) {
      // まず列を作る。どの行にも値が無くても列自体は欠落させない。
      if (!(key in out)) out[key] = '';
      if (out[key] === '' && value.trim() !== '') out[key] = value;
    }
  }
  return out;
}

/** 検出結果に応じて行を処理し、処理後の行と検出内容を返す */
export function applyDedupe(
  rows: Record<string, string>[],
  config: DedupeConfig,
): DedupeOutcome {
  const found = findDuplicates(rows, config);
  if (config.action === 'report' || found.groups.length === 0) {
    return { ...found, rows, removed: 0 };
  }

  // グループごとに「残す行」を決め、それ以外は落とす
  const replacement = new Map<number, Record<string, string>>();
  const drop = new Set<number>();
  for (const group of found.groups) {
    const keepAt =
      config.action === 'keepLast'
        ? group.rows[group.rows.length - 1]
        : group.rows[0];
    if (config.action === 'merge') {
      replacement.set(keepAt, mergeRows(rows, group.rows, config.mergeRule));
    }
    for (const i of group.rows) if (i !== keepAt) drop.add(i);
  }

  const out: Record<string, string>[] = [];
  rows.forEach((row, i) => {
    if (drop.has(i)) return;
    out.push(replacement.get(i) ?? row);
  });

  return { ...found, rows: out, removed: rows.length - out.length };
}
