import { createTranslator, type TranslationKey } from '../core/i18n';
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

const OP_LABELS: Record<ConditionOp, TranslationKey> = {
  equals: 'rowFilter.equals',
  contains: 'rowFilter.contains',
  startsWith: 'rowFilter.startsWith',
  endsWith: 'rowFilter.endsWith',
  isEmpty: 'rowFilter.isEmpty',
  notEmpty: 'rowFilter.notEmpty',
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
  const locale = useStore((s) => s.settings.locale);
  const t = createTranslator(locale);

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
          {t('rowFilter.start')}
        </button>
        <span className="subtitle" style={{ margin: 0 }}>
          {t('rowFilter.description')}
        </span>
      </div>
    );
  }

  return (
    <div className="value-map">
      <div className="value-map-head">
        <span className="value-map-title">{t('rowFilter.heading')}</span>
        <label className="read-options-inline">
          {t('rowFilter.mode')}
          <select
            value={filter.mode}
            onChange={(e) =>
              onChange({ ...filter, mode: e.target.value as RowFilter['mode'] })
            }
          >
            <option value="exclude">{t('rowFilter.exclude')}</option>
            <option value="include">{t('rowFilter.include')}</option>
          </select>
        </label>
        {rules.length > 1 && (
          <label className="read-options-inline">
            {t('rowFilter.match')}
            <select
              value={filter.match}
              onChange={(e) =>
                onChange({
                  ...filter,
                  match: e.target.value as RowFilter['match'],
                })
              }
            >
              <option value="any">{t('rowFilter.any')}</option>
              <option value="all">{t('rowFilter.all')}</option>
            </select>
          </label>
        )}
        <div className="spacer" />
        <button
          type="button"
          className="ghost"
          onClick={() => onChange(undefined)}
        >
          {t('rowFilter.stop')}
        </button>
      </div>

      {rules.map((rule, i) => (
        <div className="row-filter-rule" key={i}>
          <select
            value={rule.column}
            onChange={(e) => setRule(i, { column: e.target.value })}
            aria-label={t('rowFilter.column')}
          >
            <option value="">{t('rowFilter.selectColumn')}</option>
            {columnNames.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={rule.op}
            onChange={(e) => setRule(i, { op: e.target.value as ConditionOp })}
            aria-label={t('rowFilter.condition')}
          >
            {OPS.map((op) => (
              <option key={op} value={op}>
                {t(OP_LABELS[op])}
              </option>
            ))}
          </select>
          {needsValue(rule.op) ? (
            <input
              type="text"
              value={rule.value}
              placeholder={t('common.value')}
              aria-label={t('rowFilter.value')}
              onChange={(e) => setRule(i, { value: e.target.value })}
            />
          ) : (
            <span />
          )}
          <button
            type="button"
            className="ghost"
            aria-label={t('rowFilter.delete', { count: i + 1 })}
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
          {t('mapping.addCondition')}
        </button>
        <div className="spacer" />
        <span className="subtitle" style={{ margin: 0 }}>
          {effective === 0
            ? t('rowFilter.unset')
            : t('rowFilter.count', {
                total: (source?.rows.length ?? 0).toLocaleString(locale),
                count: counts.kept.toLocaleString(locale),
                removed: counts.removed.toLocaleString(locale),
              })}
        </span>
      </div>
    </div>
  );
}
