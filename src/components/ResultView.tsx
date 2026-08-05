import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { transformAll } from '../core/transformEngine';
import { toCsv, downloadCsv, downloadXlsx } from '../core/exportCsv';
import { validateRows, ISSUE_LABELS } from '../core/validate';
import { findDuplicates } from '../core/dedupe';
import type {
  TransformRequest,
  TransformResponse,
} from '../worker/transform.worker';

/** ステップ4: 全件変換の実行と出力 */
export function ResultView() {
  const source = useStore((s) => s.source);
  const target = useStore((s) => s.target);
  const mapping = useStore((s) => s.mapping);
  const transformedRows = useStore((s) => s.transformedRows);
  const isTransforming = useStore((s) => s.isTransforming);
  const progress = useStore((s) => s.transformProgress);
  const setTransformState = useStore((s) => s.setTransformState);

  const workerRef = useRef<Worker | null>(null);

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
        const rows = transformAll(source.rows, mapping);
        setTransformState({
          transformedRows: rows,
          isTransforming: false,
          transformProgress: 1,
        });
        worker?.terminate();
      };
      const req: TransformRequest = { rows: source.rows, config: mapping };
      worker.postMessage(req);
    } catch {
      const rows = transformAll(source.rows, mapping);
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
  }, [source, mapping]);

  const dedupeEnabled = useStore((s) => s.settings.features.duplicateDetection);

  const validation = useMemo(
    () => (transformedRows && target ? validateRows(transformedRows, target) : null),
    [transformedRows, target],
  );

  const duplicates = useMemo(
    () =>
      transformedRows && target && dedupeEnabled
        ? findDuplicates(transformedRows, target)
        : null,
    [transformedRows, target, dedupeEnabled],
  );

  if (!source || !target || !mapping) return null;

  const base = source.fileName.replace(/\.[^.]+$/, '');
  const handleExportCsv = () => {
    if (!transformedRows) return;
    downloadCsv(toCsv(transformedRows, target.fields), `${base}_shaped.csv`);
  };
  const handleExportXlsx = () => {
    if (!transformedRows) return;
    void downloadXlsx(transformedRows, target.fields, `${base}_shaped.xlsx`);
  };

  return (
    <div className="panel">
      <h2>4. 変換の実行と出力</h2>

      {isTransforming && (
        <>
          <div className="alert info">
            全 {source.rows.length.toLocaleString()} 行をブラウザ内で変換中…
          </div>
          <div className="progress">
            <div style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        </>
      )}

      {transformedRows && (
        <>
          <div className="stat-row">
            <div className="stat">
              <span className="val">{transformedRows.length.toLocaleString()}</span>
              <span className="lbl">変換した行数</span>
            </div>
            <div className="stat">
              <span className="val">{target.fields.length}</span>
              <span className="lbl">出力フィールド数</span>
            </div>
            <div className="stat">
              <span className="val">{target.name}</span>
              <span className="lbl">フォーマット</span>
            </div>
          </div>

          <div className="security-note">
            変換はすべてこのブラウザ内で完結しました。データは外部サーバーを通過していません。
          </div>

          {validation && (
            <ValidationPanel validation={validation} total={transformedRows.length} />
          )}

          {duplicates && duplicates.groups.length > 0 && (
            <div className="validation" style={{ borderColor: 'var(--accent)', background: 'var(--accent-soft)' }}>
              <div className="validation-head">
                <span className="v-title" style={{ color: 'var(--accent)' }}>
                  🔎 重複の可能性: {duplicates.groups.length} グループ
                </span>
                <span className="v-sub">
                  {duplicates.duplicateRows.size} 行が重複候補（照合キー:{' '}
                  {duplicates.keyFields.join(' + ')}）
                </span>
              </div>
              <ul className="v-list">
                {duplicates.groups.slice(0, 6).map((g, i) => (
                  <li key={i}>
                    {g.rows.map((r) => `${r + 1}行目`).join('、')} が重複
                  </li>
                ))}
                {duplicates.groups.length > 6 && (
                  <li className="v-more">…ほか {duplicates.groups.length - 6} グループ</li>
                )}
              </ul>
            </div>
          )}

          <ResultPreview
            rows={transformedRows}
            keys={target.fields.map((f) => f.key)}
            invalidRows={validation?.invalidRows ?? new Set()}
            issueCells={validation ? buildIssueCells(validation) : new Set()}
          />

          <div className="btn-row">
            <button className="primary" onClick={handleExportCsv}>
              整形済みCSVをダウンロード
            </button>
            <button onClick={handleExportXlsx}>Excel(.xlsx)でダウンロード</button>
          </div>
        </>
      )}
    </div>
  );
}

/** "row:key" のセット。検証で問題のあったセルを特定する */
function buildIssueCells(validation: ReturnType<typeof validateRows>): Set<string> {
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
        ✓ 検証OK — 必須項目の欠落やメール/電話の形式エラーは見つかりませんでした（{total.toLocaleString()}行）。
      </div>
    );
  }

  return (
    <div className="validation">
      <div className="validation-head">
        <span className="v-title">⚠ 取り込み前に確認すべき点が {totalIssues} 件</span>
        <span className="v-sub">
          {invalidRows.size.toLocaleString()} / {total.toLocaleString()} 行に問題があります
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
        {issues.length > 8 && <li className="v-more">…ほか {issues.length - 8} 件</li>}
      </ul>
    </div>
  );
}

function ResultPreview({
  rows,
  keys,
  invalidRows,
  issueCells,
}: {
  rows: Record<string, string>[];
  keys: string[];
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
          出力プレビュー（{onlyIssues ? '問題のある行' : `先頭${Math.min(12, filtered.length)}行`}）
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
              {keys.map((k) => (
                <th key={k}>{k}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.map(({ r, i }) => (
              <tr key={i}>
                <td className="rownum">{i + 1}</td>
                {keys.map((k) => (
                  <td
                    key={k}
                    className={issueCells.has(`${i}:${k}`) ? 'invalid' : ''}
                    title={r[k]}
                  >
                    {r[k] ? r[k].replace(/\n/g, ' ⏎ ') : '—'}
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
