/**
 * 行の絞り込みエディタ。
 *
 * 「解約済みの行は取り込まない」「テスト行を落とす」のように、
 * 変換の前に対象の行を間引くための条件を組み立てる。
 * 除外した行は変換も検証も重複チェックも通らない。
 */
import { useMemo } from 'react';
import { useStore } from '../state/store';
import type { ConditionOp, RowFilter, RowFilterRule } from '../types';
import {
  activeRules,
  countRowFilter,
  createRowFilter,
} from '../core/rowFilter';

const OP_LABELS: Record<ConditionOp, string> = {
  equals: 'と等しい',
  contains: 'を含む',
  startsWith: 'で始まる',
  endsWith: 'で終わる',
  isEmpty: 'が空欄',
  notEmpty: 'が空欄でない',
};

const OPS = Object.keys(OP_LABELS) as ConditionOp[];

/** 値の入力欄が要らない演算子 */
function needsValue(op: ConditionOp): boolean {
  return op !== 'isEmpty' && op !== 'notEmpty';
}

export function RowFilterEditor({
  filter,
  columnNames,
  onChange,
}: {
  filter: RowFilter | undefined;
  columnNames: string[];
  onChange: (next: RowFilter | undefined) => void;
}) {
  const source = useStore((s) => s.source);
  const rules = filter?.rules ?? [];

  const counts = useMemo(
    () => countRowFilter(source?.rows ?? [], filter),
    [source, filter],
  );
  const effective = activeRules(filter).length;

  const setRule = (i: number, patch: Partial<RowFilterRule>) => {
    if (!filter) return;
    onChange({
      ...filter,
      rules: rules.map((r, j) => (j === i ? { ...r, ...patch } : r)),
    });
  };

  if (!filter) {
    return (
      <div className="value-map-toggle">
        <button
          type="button"
          className="ghost"
          onClick={() =>
            onChange({
              ...createRowFilter(),
              rules: [
                { column: columnNames[0] ?? '', op: 'equals', value: '' },
              ],
            })
          }
        >
          行を絞り込む
        </button>
        <span className="subtitle" style={{ margin: 0 }}>
          条件に合う行だけを取り込む、または特定の行を除外します。
        </span>
      </div>
    );
  }

  return (
    <div className="value-map">
      <div className="value-map-head">
        <span className="value-map-title">行の絞り込み</span>
        <label className="read-options-inline">
          条件に合う行を
          <select
            value={filter.mode}
            onChange={(e) =>
              onChange({ ...filter, mode: e.target.value as RowFilter['mode'] })
            }
          >
            <option value="exclude">除く</option>
            <option value="include">だけ残す</option>
          </select>
        </label>
        {rules.length > 1 && (
          <label className="read-options-inline">
            条件は
            <select
              value={filter.match}
              onChange={(e) =>
                onChange({
                  ...filter,
                  match: e.target.value as RowFilter['match'],
                })
              }
            >
              <option value="any">どれか1つ満たす</option>
              <option value="all">すべて満たす</option>
            </select>
          </label>
        )}
        <div className="spacer" />
        <button
          type="button"
          className="ghost"
          onClick={() => onChange(undefined)}
        >
          絞り込みをやめる
        </button>
      </div>

      {rules.map((rule, i) => (
        <div className="row-filter-rule" key={i}>
          <select
            value={rule.column}
            onChange={(e) => setRule(i, { column: e.target.value })}
            aria-label="対象の列"
          >
            <option value="">（列を選ぶ）</option>
            {columnNames.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={rule.op}
            onChange={(e) => setRule(i, { op: e.target.value as ConditionOp })}
            aria-label="条件"
          >
            {OPS.map((op) => (
              <option key={op} value={op}>
                {OP_LABELS[op]}
              </option>
            ))}
          </select>
          {needsValue(rule.op) ? (
            <input
              type="text"
              value={rule.value}
              placeholder="値"
              aria-label="比較する値"
              onChange={(e) => setRule(i, { value: e.target.value })}
            />
          ) : (
            <span />
          )}
          <button
            type="button"
            className="ghost"
            aria-label={`${i + 1}つ目の条件を削除`}
            onClick={() =>
              onChange({ ...filter, rules: rules.filter((_, j) => j !== i) })
            }
          >
            ×
          </button>
        </div>
      ))}

      <div className="value-map-foot">
        <button
          type="button"
          className="ghost"
          onClick={() =>
            onChange({
              ...filter,
              rules: [
                ...rules,
                { column: columnNames[0] ?? '', op: 'equals', value: '' },
              ],
            })
          }
        >
          + 条件を追加
        </button>
        <div className="spacer" />
        <span className="subtitle" style={{ margin: 0 }}>
          {effective === 0
            ? '条件が未設定のため、全行が対象です。'
            : `${(source?.rows.length ?? 0).toLocaleString()} 行のうち ${counts.kept.toLocaleString()} 行が対象（${counts.removed.toLocaleString()} 行を除外）`}
        </span>
      </div>
    </div>
  );
}
