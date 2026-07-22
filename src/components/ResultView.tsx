import { useEffect, useRef } from 'react';
import { useStore } from '../state/store';
import { transformAll } from '../core/transformEngine';
import { toCsv, downloadCsv } from '../core/exportCsv';
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

  if (!source || !target || !mapping) return null;

  const handleExport = () => {
    if (!transformedRows) return;
    const csv = toCsv(transformedRows, target.fields);
    const base = source.fileName.replace(/\.[^.]+$/, '');
    downloadCsv(csv, `${base}_shaped.csv`);
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

          <ResultPreview rows={transformedRows} keys={target.fields.map((f) => f.key)} />

          <div className="btn-row">
            <button className="primary" onClick={handleExport}>
              整形済みCSVをダウンロード
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function ResultPreview({
  rows,
  keys,
}: {
  rows: Record<string, string>[];
  keys: string[];
}) {
  const preview = rows.slice(0, 10);
  return (
    <div className="table-wrap" style={{ marginTop: 12 }}>
      <table>
        <thead>
          <tr>
            {keys.map((k) => (
              <th key={k}>{k}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {preview.map((r, i) => (
            <tr key={i}>
              {keys.map((k) => (
                <td key={k} title={r[k]}>
                  {r[k] || '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
