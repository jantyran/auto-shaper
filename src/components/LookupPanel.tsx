/**
 * 参照テーブル(横引き)の設定。
 *
 * 別ファイルの表をキーで突き合わせ、必要な列だけを元データに足す。
 * 行数は増えないので「行が勝手に増えた」事故が起きない代わりに、
 * 複数の候補が見つかった件数は必ず画面に出す(黙って1件を選んだことを隠さない)。
 *
 * 「一致した行を除く / だけ残す」を選べるので、既に取り込み済みのリストと
 * 突き合わせて新規だけを出す、という使い方も同じ画面でできる。
 */
import { useState } from 'react';
import { useStore } from '../state/store';
import type { LookupMatchAction, LookupMultiple, LookupTable } from '../types';
import { activeColumns, activeKeys } from '../core/lookup';
import { FileDrop } from './FileDrop';

const MULTIPLE_LABELS: Record<LookupMultiple, string> = {
  first: '最初の1件',
  last: '最後の1件',
  joinAll: 'すべて連結',
};

const MATCH_ACTION_LABELS: Record<LookupMatchAction, string> = {
  none: 'そのまま',
  excludeMatched: '除外する',
  keepMatched: 'だけ残す',
};

/** 一致状況を残すときの既定の列名 */
const DEFAULT_STATUS_COLUMN = '参照結果';

export function LookupPanel() {
  const source = useStore((s) => s.source);
  const tables = useStore((s) => s.lookupTables);
  const files = useStore((s) => s.lookupFiles);
  const addLookupFile = useStore((s) => s.addLookupFile);
  const [adding, setAdding] = useState(false);

  if (!source) return null;

  return (
    <div className="read-options">
      <div className="read-options-head">
        <span className="read-options-title">参照テーブル（横引き）</span>
        <span className="read-options-inline">
          {tables.length === 0
            ? '別ファイルの情報をキーで突き合わせて取り込みます'
            : `${tables.length} 件`}
        </span>
        <div className="spacer" />
        <button
          type="button"
          className="ghost"
          onClick={() => setAdding((v) => !v)}
          aria-expanded={adding}
        >
          {adding ? '閉じる' : '+ 参照テーブルを追加'}
        </button>
      </div>

      {adding && (
        <div style={{ margin: '10px 0' }}>
          <FileDrop
            title="突き合わせ先のファイルをドロップ"
            hint="CSV / Excel — キーが一致する行から、必要な列だけを取り込みます（行数は増えません）"
            onFile={(fileName, data) => {
              void addLookupFile({ fileName, data });
              setAdding(false);
            }}
          />
        </div>
      )}

      {tables.length > 0 && (
        <div className="source-units">
          {tables.map((table) => (
            <LookupRow
              key={table.id}
              table={table}
              fileName={files[table.fileIndex]?.fileName ?? ''}
              sheetNames={files[table.fileIndex]?.sheetNames ?? []}
              sourceColumns={source.columns.map((c) => c.name)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LookupRow({
  table,
  fileName,
  sheetNames,
  sourceColumns,
}: {
  table: LookupTable;
  fileName: string;
  sheetNames: string[];
  sourceColumns: string[];
}) {
  const tables = useStore((s) => s.lookupTables);
  const data = useStore((s) => s.lookupData);
  const stats = useStore((s) => s.lookupStats[table.id]);
  const update = useStore((s) => s.updateLookupTable);
  const remove = useStore((s) => s.removeLookupTable);

  const index = tables.findIndex((t) => t.id === table.id);
  const lookupColumns = (data[index]?.columns ?? []).map((c) => c.name);
  const lookupRowCount = data[index]?.rows.length ?? 0;
  const ready = activeKeys(table).length > 0;
  const taken = new Set(activeColumns(table).map((c) => c.from));

  const patch = (p: Partial<LookupTable>) => void update(table.id, p);

  return (
    <div className="source-unit">
      <div className="source-unit-head">
        <span className="source-unit-name">
          {fileName}
          {sheetNames.length > 1 && (
            <span className="source-unit-sheet">{table.sheet}</span>
          )}
        </span>
        <span className="source-unit-meta">
          {lookupRowCount.toLocaleString()} 行 / {lookupColumns.length} 列
        </span>
        {sheetNames.length > 1 && (
          <select
            value={table.sheet}
            onChange={(e) =>
              // シートが変われば列名も変わるので、キーと持ってくる列は作り直す
              patch({
                sheet: e.target.value,
                headerRow: undefined,
                keys: [{ sourceColumn: '', lookupColumn: '' }],
                columns: [],
              })
            }
          >
            {sheetNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        )}
        <div className="spacer" />
        <button
          type="button"
          className="ghost"
          aria-label={`${fileName} を参照テーブルから外す`}
          onClick={() => void remove(table.id)}
        >
          ×
        </button>
      </div>

      <div className="lookup-body">
        <div className="dedupe-row">
          <span className="dedupe-label">突き合わせ</span>
          <div className="lookup-keys">
            {table.keys.map((pair, i) => (
              <div className="lookup-key-pair" key={i}>
                <select
                  value={pair.sourceColumn}
                  aria-label="元データの列"
                  onChange={(e) =>
                    patch({
                      keys: table.keys.map((k, j) =>
                        j === i ? { ...k, sourceColumn: e.target.value } : k,
                      ),
                    })
                  }
                >
                  <option value="">（元データの列）</option>
                  {sourceColumns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <span className="value-map-arrow">↔</span>
                <select
                  value={pair.lookupColumn}
                  aria-label="参照表の列"
                  onChange={(e) =>
                    patch({
                      keys: table.keys.map((k, j) =>
                        j === i ? { ...k, lookupColumn: e.target.value } : k,
                      ),
                    })
                  }
                >
                  <option value="">（参照表の列）</option>
                  {lookupColumns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                {table.keys.length > 1 && (
                  <button
                    type="button"
                    className="ghost"
                    aria-label={`${i + 1}つ目のキーを削除`}
                    onClick={() =>
                      patch({ keys: table.keys.filter((_, j) => j !== i) })
                    }
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              className="ghost"
              onClick={() =>
                patch({
                  keys: [...table.keys, { sourceColumn: '', lookupColumn: '' }],
                })
              }
            >
              + キーを追加
            </button>
          </div>
        </div>

        <div className="dedupe-row">
          <span className="dedupe-label">持ってくる列</span>
          <div className="dedupe-keys">
            {lookupColumns.length === 0 && (
              <span className="subtitle" style={{ margin: 0 }}>
                参照表の列を読み取れませんでした。
              </span>
            )}
            {lookupColumns.map((name) => (
              <label key={name} className="chip-check">
                <input
                  type="checkbox"
                  checked={taken.has(name)}
                  onChange={(e) =>
                    patch({
                      columns: e.target.checked
                        ? [...table.columns, { from: name, as: name }]
                        : table.columns.filter((c) => c.from !== name),
                    })
                  }
                />
                {name}
              </label>
            ))}
          </div>
        </div>

        <div className="dedupe-row">
          <span className="dedupe-label">複数一致</span>
          <select
            value={table.multiple}
            onChange={(e) =>
              patch({ multiple: e.target.value as LookupMultiple })
            }
          >
            {(Object.keys(MULTIPLE_LABELS) as LookupMultiple[]).map((m) => (
              <option key={m} value={m}>
                {MULTIPLE_LABELS[m]}
              </option>
            ))}
          </select>
          <span className="dedupe-label">見つからないとき</span>
          <input
            type="text"
            style={{ maxWidth: 160 }}
            value={table.notFound}
            placeholder="空欄のまま"
            onChange={(e) => patch({ notFound: e.target.value })}
          />
        </div>

        <div className="dedupe-row">
          <span className="dedupe-label">一致した行を</span>
          <select
            value={table.matchAction}
            onChange={(e) =>
              patch({ matchAction: e.target.value as LookupMatchAction })
            }
          >
            {(Object.keys(MATCH_ACTION_LABELS) as LookupMatchAction[]).map(
              (a) => (
                <option key={a} value={a}>
                  {MATCH_ACTION_LABELS[a]}
                </option>
              ),
            )}
          </select>
          <label className="read-options-inline">
            <input
              type="checkbox"
              checked={!!table.statusColumn}
              onChange={(e) =>
                patch({
                  statusColumn: e.target.checked
                    ? DEFAULT_STATUS_COLUMN
                    : undefined,
                })
              }
            />
            一致状況を「{DEFAULT_STATUS_COLUMN}」列に残す
          </label>
          <label className="read-options-inline">
            <input
              type="checkbox"
              checked={table.loose}
              onChange={(e) => patch({ loose: e.target.checked })}
            />
            緩く照合（空白・全角半角・大小を無視）
          </label>
        </div>

        {ready && stats ? (
          <div
            className={`alert ${stats.matched === 0 ? 'warn' : 'ok'}`}
            style={{ margin: '4px 0 0' }}
          >
            {stats.matched === 0
              ? 'どの行も一致しませんでした。突き合わせるキーの列が正しいか確認してください。'
              : `${(stats.matched + stats.unmatched).toLocaleString()} 行中 ${stats.matched.toLocaleString()} 行が一致（${stats.unmatched.toLocaleString()} 行は未一致）`}
            {stats.multiple > 0 && (
              <>
                {' '}
                / {stats.multiple.toLocaleString()}{' '}
                行は参照表に複数の候補があり、 「
                {MULTIPLE_LABELS[table.multiple]}」を採用しました。
              </>
            )}
          </div>
        ) : (
          <p className="subtitle" style={{ margin: '4px 0 0' }}>
            突き合わせるキーを両側とも選ぶと、一致件数を表示します。
          </p>
        )}
      </div>
    </div>
  );
}
