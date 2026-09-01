/**
 * 重複の照合設定と、見つけたときの処理。
 *
 * 照合キーはターゲットから推定した値を初期値にしているので、何も触らなければ
 * 従来どおり「検出して知らせるだけ」で動く。統合は結果が見えないと怖い処理なので、
 * 1グループ分の統合前後をその場で展開できるようにしている。
 */
import { useState } from 'react';
import { useStore } from '../state/store';
import type { TargetField } from '../types';
import {
  mergeRows,
  type DedupeAction,
  type DedupeOutcome,
  type MergeRule,
} from '../core/dedupe';
import { fieldDisplayName } from '../core/fieldMeta';

const ACTION_LABELS: Record<DedupeAction, string> = {
  report: '検出して知らせるだけ（出力は全行）',
  keepFirst: '最初の1行だけ残す',
  keepLast: '最後の1行だけ残す',
  merge: '1行に統合する',
};

const ACTIONS = Object.keys(ACTION_LABELS) as DedupeAction[];

const MERGE_RULE_LABELS: Record<MergeRule, string> = {
  firstNonEmpty: '空でない最初の値',
  lastNonEmpty: '空でない最後の値',
};

/** 展開表示するグループ数の上限 */
const SHOWN_GROUPS = 6;

export function DedupePanel({
  outcome,
  sourceRows,
  fields,
}: {
  outcome: DedupeOutcome;
  /** 重複処理をかける前の行(統合前後の比較に使う) */
  sourceRows: Record<string, string>[];
  fields: TargetField[];
}) {
  const config = useStore((s) => s.dedupeConfig);
  const setDedupeConfig = useStore((s) => s.setDedupeConfig);
  const [expanded, setExpanded] = useState<number | null>(null);

  if (!config) return null;

  const toggleKey = (key: string) => {
    const has = config.keyFields.includes(key);
    setDedupeConfig({
      ...config,
      keyFields: has
        ? config.keyFields.filter((k) => k !== key)
        : [...config.keyFields, key],
    });
  };

  const found = outcome.groups.length > 0;

  return (
    <div className="dedupe-panel">
      <div className="dedupe-head">
        <span className="dedupe-title">
          {found
            ? `🔎 重複の可能性: ${outcome.groups.length} グループ / ${outcome.duplicateRows.size} 行`
            : '🔎 重複は見つかりませんでした'}
        </span>
        {outcome.removed > 0 && (
          <span className="dedupe-removed">
            {sourceRows.length.toLocaleString()} 行 →{' '}
            {outcome.rows.length.toLocaleString()} 行（
            {outcome.removed.toLocaleString()} 行を
            {config.action === 'merge' ? '統合' : '除外'}）
          </span>
        )}
      </div>

      <div className="dedupe-config">
        <div className="dedupe-row">
          <span className="dedupe-label">照合キー</span>
          <div className="dedupe-keys">
            {fields.map((f) => (
              <label key={f.key} className="chip-check">
                <input
                  type="checkbox"
                  checked={config.keyFields.includes(f.key)}
                  onChange={() => toggleKey(f.key)}
                />
                {fieldDisplayName(f)}
              </label>
            ))}
          </div>
        </div>
        <p className="subtitle" style={{ margin: '2px 0 8px' }}>
          複数選ぶと、そのすべてが一致した行を重複とみなします。キーを1つも選ばないと重複判定は行いません。
        </p>

        <div className="dedupe-row">
          <span className="dedupe-label">照合の緩さ</span>
          <select
            value={config.loose ? 'loose' : 'strict'}
            onChange={(e) =>
              setDedupeConfig({ ...config, loose: e.target.value === 'loose' })
            }
          >
            <option value="loose">
              緩い（空白・記号・全角半角・大小を無視）
            </option>
            <option value="strict">厳密（文字が完全に一致）</option>
          </select>
        </div>

        <div className="dedupe-row dedupe-actions">
          <span className="dedupe-label">見つけたら</span>
          <div className="dedupe-choices">
            {ACTIONS.map((a) => (
              <label key={a} className="read-options-inline">
                <input
                  type="radio"
                  name="dedupe-action"
                  checked={config.action === a}
                  onChange={() => setDedupeConfig({ ...config, action: a })}
                />
                {ACTION_LABELS[a]}
              </label>
            ))}
          </div>
        </div>

        {config.action === 'merge' && (
          <div className="dedupe-row">
            <span className="dedupe-label">値の採用</span>
            <select
              value={config.mergeRule}
              onChange={(e) =>
                setDedupeConfig({
                  ...config,
                  mergeRule: e.target.value as MergeRule,
                })
              }
            >
              {(Object.keys(MERGE_RULE_LABELS) as MergeRule[]).map((r) => (
                <option key={r} value={r}>
                  {MERGE_RULE_LABELS[r]}
                </option>
              ))}
            </select>
            <span className="subtitle" style={{ margin: 0 }}>
              後から追加したファイルほど新しい場合は「最後の値」を選びます。
            </span>
          </div>
        )}
      </div>

      {found && (
        <ul className="v-list">
          {outcome.groups.slice(0, SHOWN_GROUPS).map((g, i) => (
            <li key={i}>
              <button
                type="button"
                className="linkish"
                onClick={() => setExpanded(expanded === i ? null : i)}
                aria-expanded={expanded === i}
              >
                {g.rows.map((r) => `${r + 1}行目`).join('、')} が重複
                {config.action === 'merge' && `（1行に統合）`}
              </button>
              {expanded === i && (
                <GroupPreview
                  group={g.rows}
                  sourceRows={sourceRows}
                  fields={fields}
                  merged={
                    config.action === 'merge'
                      ? mergeRows(sourceRows, g.rows, config.mergeRule)
                      : undefined
                  }
                />
              )}
            </li>
          ))}
          {outcome.groups.length > SHOWN_GROUPS && (
            <li className="v-more">
              …ほか {outcome.groups.length - SHOWN_GROUPS} グループ
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/** 1グループ分の、統合前の各行と統合結果 */
function GroupPreview({
  group,
  sourceRows,
  fields,
  merged,
}: {
  group: number[];
  sourceRows: Record<string, string>[];
  fields: TargetField[];
  merged?: Record<string, string>;
}) {
  // 全項目を出すと横に広がりすぎるので、このグループで値が入っている項目に絞る
  const shown = fields.filter((f) =>
    group.some((i) => (sourceRows[i]?.[f.key] ?? '').trim() !== ''),
  );
  return (
    <div className="preview-scroll" style={{ margin: '6px 0 10px' }}>
      <table className="preview-table">
        <thead>
          <tr>
            <th />
            {shown.map((f) => (
              <th key={f.key}>{fieldDisplayName(f)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {group.map((i) => (
            <tr key={i}>
              <th scope="row" className="preview-rowno">
                {i + 1}行目
              </th>
              {shown.map((f) => (
                <td key={f.key}>{sourceRows[i]?.[f.key] || '—'}</td>
              ))}
            </tr>
          ))}
          {merged && (
            <tr className="preview-row is-header">
              <th scope="row" className="preview-rowno">
                統合後
              </th>
              {shown.map((f) => (
                <td key={f.key}>{merged[f.key] || '—'}</td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
