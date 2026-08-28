/**
 * 変換にかける行の絞り込み。
 *
 * 実務では「解約済みの行は入れない」「テスト行を落とす」のように、
 * 取り込む前に行を間引く必要がある。変換前に適用するので、
 * 除外した行は変換もされず、検証や重複チェックの対象にもならない。
 *
 * 条件の判定は変換の分岐(conditional)と同じ規則を使う。
 * 画面の中で条件の意味が2通りあると混乱するため。
 */
import type { RowFilter, RowFilterRule } from '../types';
import { evalCondition } from './transformEngine';

type Row = Record<string, string>;

/** 実際に効く条件(列が指定されているもの)だけを残す */
export function activeRules(filter: RowFilter | undefined): RowFilterRule[] {
  if (!filter) return [];
  return filter.rules.filter((r) => r.column.trim() !== '');
}

/** 1行が絞り込み条件に残るか */
export function rowMatchesFilter(row: Row, filter: RowFilter): boolean {
  const rules = activeRules(filter);
  if (rules.length === 0) return true;
  const hit = rules.map((r) =>
    evalCondition(row[r.column] ?? '', {
      op: r.op,
      value: r.value,
      then: '',
    }),
  );
  const matched =
    filter.match === 'all' ? hit.every(Boolean) : hit.some(Boolean);
  return filter.mode === 'include' ? matched : !matched;
}

/** 条件に残る行だけを返す(条件が無ければ元の配列をそのまま返す) */
export function applyRowFilter(rows: Row[], filter?: RowFilter): Row[] {
  if (!filter || activeRules(filter).length === 0) return rows;
  return rows.filter((row) => rowMatchesFilter(row, filter));
}

/** 絞り込みの結果を件数で返す(画面に「N行を除外」と出すため) */
export function countRowFilter(
  rows: Row[],
  filter?: RowFilter,
): { kept: number; removed: number } {
  const kept = applyRowFilter(rows, filter).length;
  return { kept, removed: rows.length - kept };
}

/** 新しい条件の初期値 */
export function createRowFilter(): RowFilter {
  return { mode: 'exclude', match: 'any', rules: [] };
}
