import { ArrowLeftRight } from 'lucide-react';
import { createTranslator, type TranslationKey } from '../core/i18n';
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

const MULTIPLE_LABELS: Record<LookupMultiple, TranslationKey> = {
  first: 'lookup.first',
  last: 'lookup.last',
  joinAll: 'lookup.joinAll',
};

const MATCH_ACTION_LABELS: Record<LookupMatchAction, TranslationKey> = {
  none: 'lookup.keep',
  excludeMatched: 'lookup.exclude',
  keepMatched: 'rowFilter.include',
};

/** 一致状況を残すときの既定の列名 */
const DEFAULT_STATUS_COLUMN = '参照結果';

export function LookupPanel() {
  const locale = useStore((s) => s.settings.locale);
  const t = createTranslator(locale);

  const source = useStore((s) => s.source);
  const tables = useStore((s) => s.lookupTables);
  const files = useStore((s) => s.lookupFiles);
  const pending = useStore((s) => s.pendingLookups);
  const addLookupFile = useStore((s) => s.addLookupFile);
  const [adding, setAdding] = useState(false);

  if (!source) return null;
  if (tables.length === 0 && pending.length === 0 && !adding) {
    return (
      <div className="read-options">
        <div className="read-options-head">
          <span className="read-options-title">{t('lookup.heading')}</span>
          <span className="read-options-inline">{t('lookup.description')}</span>
          <div className="spacer" />
          <button
            type="button"
            className="ghost"
            onClick={() => setAdding(true)}
          >
            {t('lookup.add')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="read-options">
      <div className="read-options-head">
        <span className="read-options-title">{t('lookup.heading')}</span>
        <span className="read-options-inline">
          {t('lookup.count', { count: tables.length })}
          {pending.length > 0 && (
            <span className="read-options-auto">
              {t('lookup.pending', { count: pending.length })}
            </span>
          )}
        </span>
        <div className="spacer" />
        <button
          type="button"
          className="ghost"
          onClick={() => setAdding((v) => !v)}
          aria-expanded={adding}
        >
          {adding ? t('common.close') : t('lookup.add')}
        </button>
      </div>

      {adding && (
        <div style={{ margin: '10px 0' }}>
          <FileDrop
            title={t('lookup.dropTitle')}
            hint={t('lookup.dropHint')}
            onFile={(fileName, data) => {
              void addLookupFile({ fileName, data });
              setAdding(false);
            }}
          />
        </div>
      )}

      {pending.length > 0 && (
        <div className="source-units">
          {pending.map((saved, i) => (
            <PendingLookupRow key={`${saved.fileName}:${i}`} index={i} />
          ))}
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

/**
 * レシピが覚えている参照設定のうち、ファイルがまだ無いもの。
 * 実データは保存しない方針なので、ここで再投入してもらう。
 */
function PendingLookupRow({ index }: { index: number }) {
  const locale = useStore((s) => s.settings.locale);
  const t = createTranslator(locale);

  const saved = useStore((s) => s.pendingLookups[index]);
  const attach = useStore((s) => s.attachPendingLookup);
  const dismiss = useStore((s) => s.dismissPendingLookup);

  if (!saved) return null;

  const keys = saved.table.keys
    .filter((k) => k.sourceColumn && k.lookupColumn)
    .map((k) => `${k.sourceColumn} ↔ ${k.lookupColumn}`)
    .join('、');
  const columns = saved.table.columns.map((c) => c.as).join('、');

  return (
    <div className="source-unit is-pending">
      <div className="source-unit-head">
        <span className="source-unit-name">{saved.fileName}</span>
        <span className="source-unit-meta">{t('lookup.restore')}</span>
        <div className="spacer" />
        <button type="button" className="ghost" onClick={() => dismiss(index)}>
          {t('lookup.dismiss')}
        </button>
      </div>
      <p className="subtitle" style={{ margin: '6px 0 8px' }}>
        {t('lookup.savedKeys', { keys: keys || t('common.unset') })}
        {columns && t('lookup.savedColumns', { columns })}
      </p>
      <FileDrop
        title={t('lookup.attach', { fileName: saved.fileName })}
        hint={t('lookup.restoreHint')}
        onFile={(fileName, data) => void attach(index, { fileName, data })}
      />
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
  const locale = useStore((s) => s.settings.locale);
  const t = createTranslator(locale);

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
          {t('lookup.dimensions', {
            count: lookupRowCount.toLocaleString(locale),
            columns: lookupColumns.length,
          })}
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
          aria-label={t('lookup.remove', { fileName })}
          onClick={() => void remove(table.id)}
        >
          ×
        </button>
      </div>

      <div className="lookup-body">
        <div className="dedupe-row">
          <span className="dedupe-label">{t('lookup.keys')}</span>
          <div className="lookup-keys">
            {table.keys.map((pair, i) => (
              <div className="lookup-key-pair" key={i}>
                <select
                  value={pair.sourceColumn}
                  aria-label={t('lookup.sourceColumn')}
                  onChange={(e) =>
                    patch({
                      keys: table.keys.map((k, j) =>
                        j === i ? { ...k, sourceColumn: e.target.value } : k,
                      ),
                    })
                  }
                >
                  <option value="">{t('lookup.selectSource')}</option>
                  {sourceColumns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <span
                  className="value-map-arrow"
                  style={{ display: 'inline-flex', alignItems: 'center' }}
                >
                  <ArrowLeftRight size={14} aria-hidden="true" />
                </span>
                <select
                  value={pair.lookupColumn}
                  aria-label={t('lookup.lookupColumn')}
                  onChange={(e) =>
                    patch({
                      keys: table.keys.map((k, j) =>
                        j === i ? { ...k, lookupColumn: e.target.value } : k,
                      ),
                    })
                  }
                >
                  <option value="">{t('lookup.selectLookup')}</option>
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
                    aria-label={t('lookup.deleteKey', { count: i + 1 })}
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
              {t('lookup.addKey')}
            </button>
          </div>
        </div>

        <div className="dedupe-row">
          <span className="dedupe-label">{t('lookup.columns')}</span>
          <div className="dedupe-keys">
            {lookupColumns.length === 0 && (
              <span className="subtitle" style={{ margin: 0 }}>
                {t('lookup.noColumns')}
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
          <span className="dedupe-label">{t('lookup.multiple')}</span>
          <select
            value={table.multiple}
            onChange={(e) =>
              patch({ multiple: e.target.value as LookupMultiple })
            }
          >
            {(Object.keys(MULTIPLE_LABELS) as LookupMultiple[]).map((m) => (
              <option key={m} value={m}>
                {t(MULTIPLE_LABELS[m])}
              </option>
            ))}
          </select>
          <span className="dedupe-label">{t('lookup.notFound')}</span>
          <input
            type="text"
            style={{ maxWidth: 160 }}
            value={table.notFound}
            placeholder={t('lookup.emptyPlaceholder')}
            onChange={(e) => patch({ notFound: e.target.value })}
          />
        </div>

        <div className="dedupe-row">
          <span className="dedupe-label">{t('lookup.action')}</span>
          <select
            value={table.matchAction}
            onChange={(e) =>
              patch({ matchAction: e.target.value as LookupMatchAction })
            }
          >
            {(Object.keys(MATCH_ACTION_LABELS) as LookupMatchAction[]).map(
              (a) => (
                <option key={a} value={a}>
                  {t(MATCH_ACTION_LABELS[a])}
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
            {t('lookup.status', { column: DEFAULT_STATUS_COLUMN })}
          </label>
          <label className="read-options-inline">
            <input
              type="checkbox"
              checked={table.loose}
              onChange={(e) => patch({ loose: e.target.checked })}
            />
            {t('lookup.loose')}
          </label>
        </div>

        {ready && stats ? (
          <div
            className={`alert ${stats.matched === 0 ? 'warn' : 'ok'}`}
            style={{ margin: '4px 0 0' }}
          >
            {stats.matched === 0
              ? t('lookup.noneMatched')
              : t('lookup.matched', {
                  total: (stats.matched + stats.unmatched).toLocaleString(
                    locale,
                  ),
                  count: stats.matched.toLocaleString(locale),
                  unmatched: stats.unmatched.toLocaleString(locale),
                })}
            {stats.multiple > 0 && (
              <>
                {t('lookup.multipleCount', {
                  count: stats.multiple.toLocaleString(locale),
                  action: t(MULTIPLE_LABELS[table.multiple]),
                })}
              </>
            )}
          </div>
        ) : (
          <p className="subtitle" style={{ margin: '4px 0 0' }}>
            {t('lookup.chooseKeys')}
          </p>
        )}
      </div>
    </div>
  );
}
