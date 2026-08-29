import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { transformAll } from '../core/transformEngine';
import { applyRowFilter } from '../core/rowFilter';
import { importContextToRow } from '../core/importContext';
import { toCsv, downloadCsv, downloadXlsx } from '../core/exportCsv';
import { validateRows, ISSUE_LABELS } from '../core/validate';
import { applyDedupe } from '../core/dedupe';
import type {
  TransformRequest,
  TransformResponse,
} from '../worker/transform.worker';
import type { TargetField } from '../types';
import { fieldDisplayName, visibleTargetFields } from '../core/fieldMeta';
import { DedupePanel } from './DedupePanel';

/** ステップ4: 全件変換の実行と出力 */
export function ResultView() {
  const source = useStore((s) => s.source);
  const target = useStore((s) => s.target);
  const mapping = useStore((s) => s.mapping);
  const transformedRows = useStore((s) => s.transformedRows);
  const importContext = useStore((s) => s.importContext);
  const contextRow = useMemo(
    () => importContextToRow(importContext),
    [importContext],
  );
  const isTransforming = useStore((s) => s.isTransforming);
  const progress = useStore((s) => s.transformProgress);
  const setTransformState = useStore((s) => s.setTransformState);
  const dropEmptyColumns = useStore((s) => s.dropEmptyColumns);
  const setDropEmptyColumns = useStore((s) => s.setDropEmptyColumns);
  const markExported = useStore((s) => s.markExported);

  const workerRef = useRef<Worker | null>(null);

  // 絞り込み条件で残った行だけを変換にかける
  const targetRows = useMemo(
    () => (source ? applyRowFilter(source.rows, mapping?.rowFilter) : []),
    [source, mapping?.rowFilter],
  );
  const removedRows = (source?.rows.length ?? 0) - targetRows.length;

  // 変換をまだ実行していなければ実行する
  useEffect(() => {
    if (!source || !mapping) return;
    if (transformedRows || isTransforming) return;

    setTransformState({ isTransforming: true, transformProgress: 0 });

    // 大量データはWeb Workerで処理。失敗時はメインスレッドにフォールバック。
    let worker: Worker | null = null;
    try {
      worker = new Worker(
        new URL('../worker/transform.worker.ts', import.meta.url),
        { type: 'module' },
      );
      workerRef.current = worker;
      worker.onmessage = (e: MessageEvent<TransformResponse>) => {
        const msg = e.data;
        if (msg.type === 'progress') {
          setTransformState({
            transformProgress: msg.total === 0 ? 1 : msg.done / msg.total,
          });
        } else if (msg.type === 'done') {
          setTransformState({
            transformedRows: msg.rows,
            isTransforming: false,
            transformProgress: 1,
          });
          worker?.terminate();
        }
      };
      worker.onerror = () => {
        // フォールバック: メインスレッドで同期実行
        const rows = transformAll(targetRows, mapping, contextRow);
        setTransformState({
          transformedRows: rows,
          isTransforming: false,
          transformProgress: 1,
        });
        worker?.terminate();
      };
      const req: TransformRequest = {
        rows: targetRows,
        config: mapping,
        context: contextRow,
      };
      worker.postMessage(req);
    } catch {
      const rows = transformAll(targetRows, mapping, contextRow);
      setTransformState({
        transformedRows: rows,
        isTransforming: false,
        transformProgress: 1,
      });
    }

    return () => {
      worker?.terminate();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, mapping, contextRow, targetRows]);

  const dedupeEnabled = useStore((s) => s.settings.features.duplicateDetection);
  const dedupeConfig = useStore((s) => s.dedupeConfig);

  // 重複の処理は検証より前に走らせる。順番が逆だと、統合すれば埋まる項目が
  // 「必須が空」として報告され、存在しない問題を追いかけることになる。
  const duplicates = useMemo(
    () =>
      transformedRows && dedupeEnabled && dedupeConfig
        ? applyDedupe(transformedRows, dedupeConfig)
        : null,
    [transformedRows, dedupeEnabled, dedupeConfig],
  );

  /** 検証・プレビュー・出力の対象になる、重複処理まで済ませた行 */
  const outputRows = duplicates?.rows ?? transformedRows;

  const validation = useMemo(
    () => (outputRows && target ? validateRows(outputRows, target) : null),
    [outputRows, target],
  );

  if (!source || !target || !mapping) return null;

  const outputFields = visibleTargetFields(
    target.fields,
    mapping.fields,
    dropEmptyColumns,
  );

  const base = source.fileName.replace(/\.[^.]+$/, '');
  const handleExportCsv = () => {
    if (!outputRows) return;
    downloadCsv(toCsv(outputRows, outputFields), `${base}_shaped.csv`);
    markExported();
  };
  const handleExportXlsx = () => {
    if (!outputRows) return;
    void downloadXlsx(outputRows, outputFields, `${base}_shaped.xlsx`);
    markExported();
  };

  return (
    <div className="panel">
      <h2>4. 変換の実行と出力</h2>

      {isTransforming && (
        <>
          <div className="alert info">
            全 {targetRows.length.toLocaleString()} 行をブラウザ内で変換中…
          </div>
          <div className="progress">
            <div style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        </>
      )}

      {outputRows && (
        <>
          <div className="stat-row" data-tour="tour-result-stats">
            <div className="stat">
              <span className="val">{outputRows.length.toLocaleString()}</span>
              <span className="lbl">変換した行数</span>
            </div>
            {removedRows > 0 && (
              <div className="stat">
                <span className="val">{removedRows.toLocaleString()}</span>
                <span className="lbl">絞り込みで除外</span>
              </div>
            )}
            <div className="stat">
              <span className="val">{outputFields.length}</span>
              <span className="lbl">出力フィールド数</span>
            </div>
            <div className="stat">
              <span className="val">{target.name}</span>
              <span className="lbl">フォーマット</span>
            </div>
          </div>

          <label
            className="toggle"
            style={{ marginBottom: 12, display: 'inline-flex' }}
          >
            <input
              type="checkbox"
              checked={!dropEmptyColumns}
              onChange={(e) => setDropEmptyColumns(!e.target.checked)}
            />
            空（未割当）の項目も出力に含める
          </label>

          <div className="security-note">
            変換はすべてこのブラウザ内で完結しました。実データは外部サーバーを通過していません。
          </div>

          {validation && (
            <ValidationPanel
              validation={validation}
              total={outputRows.length}
            />
          )}

          {duplicates && transformedRows && (
            <DedupePanel
              outcome={duplicates}
              sourceRows={transformedRows}
              fields={outputFields}
            />
          )}

          <ResultPreview
            rows={outputRows}
            fields={outputFields}
            invalidRows={validation?.invalidRows ?? new Set()}
            issueCells={validation ? buildIssueCells(validation) : new Set()}
          />

          <div className="btn-row" data-tour="tour-result-export">
            <button className="primary" onClick={handleExportCsv}>
              整形済みCSVをダウンロード
            </button>
            <button onClick={handleExportXlsx}>
              Excel(.xlsx)でダウンロード
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** "row:key" のセット。検証で問題のあったセルを特定する */
function buildIssueCells(
  validation: ReturnType<typeof validateRows>,
): Set<string> {
  const set = new Set<string>();
  for (const iss of validation.issues) set.add(`${iss.row}:${iss.targetKey}`);
  return set;
}

function ValidationPanel({
  validation,
  total,
}: {
  validation: ReturnType<typeof validateRows>;
  total: number;
}) {
  const { counts, invalidRows, issues } = validation;
  const totalIssues = issues.length;

  if (totalIssues === 0) {
    return (
      <div className="alert ok">
        ✓ 検証OK —
        必須項目の欠落やメール/電話の形式エラーは見つかりませんでした（
        {total.toLocaleString()}行）。
      </div>
    );
  }

  return (
    <div className="validation">
      <div className="validation-head">
        <span className="v-title">
          ⚠ 取り込み前に確認すべき点が {totalIssues} 件
        </span>
        <span className="v-sub">
          {invalidRows.size.toLocaleString()} / {total.toLocaleString()}{' '}
          行に問題があります
        </span>
      </div>
      <div className="v-counts">
        {(Object.keys(counts) as (keyof typeof counts)[])
          .filter((k) => counts[k] > 0)
          .map((k) => (
            <span key={k} className="v-count">
              {ISSUE_LABELS[k]}: <b>{counts[k]}</b>
            </span>
          ))}
      </div>
      <ul className="v-list">
        {issues.slice(0, 8).map((iss, i) => (
          <li key={i}>
            <span className="v-row">{iss.row + 1}行目</span>「{iss.label}」
            {ISSUE_LABELS[iss.kind]}
            {iss.value ? `（値: ${iss.value}）` : ''}
          </li>
        ))}
        {issues.length > 8 && (
          <li className="v-more">…ほか {issues.length - 8} 件</li>
        )}
      </ul>
    </div>
  );
}

function ResultPreview({
  rows,
  fields,
  invalidRows,
  issueCells,
}: {
  rows: Record<string, string>[];
  fields: TargetField[];
  invalidRows: Set<number>;
  issueCells: Set<string>;
}) {
  const [onlyIssues, setOnlyIssues] = useState(false);

  const indexed = rows.map((r, i) => ({ r, i }));
  const filtered = onlyIssues
    ? indexed.filter(({ i }) => invalidRows.has(i))
    : indexed;
  const preview = filtered.slice(0, 12);

  return (
    <>
      <div className="preview-bar">
        <h3 style={{ margin: 0 }}>
          出力プレビュー（
          {onlyIssues
            ? '問題のある行'
            : `先頭${Math.min(12, filtered.length)}行`}
          ）
        </h3>
        {invalidRows.size > 0 && (
          <label className="toggle">
            <input
              type="checkbox"
              checked={onlyIssues}
              onChange={(e) => setOnlyIssues(e.target.checked)}
            />
            問題のある行のみ表示
          </label>
        )}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 44 }}>#</th>
              {fields.map((field) => (
                <th key={field.key}>{fieldDisplayName(field)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.map(({ r, i }) => (
              <tr key={i}>
                <td className="rownum">{i + 1}</td>
                {fields.map((field) => (
                  <td
                    key={field.key}
                    className={
                      issueCells.has(`${i}:${field.key}`) ? 'invalid' : ''
                    }
                    title={r[field.key]}
                  >
                    {r[field.key] ? r[field.key].replace(/\n/g, ' ⏎ ') : '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
