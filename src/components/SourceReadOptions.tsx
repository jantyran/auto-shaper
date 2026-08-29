/**
 * 読み込み設定。
 *
 * 取り込むものを「ファイルの、このシート」という単位で並べ、それぞれについて
 * 見出し行を確認・変更できるようにする。同じ形のファイルやシートが分かれている
 * ケースでは、複数を足して縦に結合したうえで1回で整形できる。
 *
 * 業務Excelは1行目がタイトルや注記で、実際の見出しが数行下にあることが多いため、
 * 見出し行は自動判定した結果を必ず表に出し、外れていたら選び直せるようにしている。
 */
import { useState } from 'react';
import { useStore } from '../state/store';
import type { SourceDataset } from '../types';
import { FileDrop } from './FileDrop';

/** 見出しが取れていない疑いを持つ閾値(自動生成名の割合) */
const FALLBACK_NAME_RATIO = 0.3;

/** 取込元の列を足すときの既定の列名 */
const DEFAULT_ORIGIN_COLUMN = '取込元';

/** buildColumnNames が付ける仮の列名(`列3` など)か */
function isFallbackName(name: string): boolean {
  return /^列\d+$/.test(name);
}

/** ヘッダー行が間違っている可能性が高いか */
function looksMisdetected(ds: SourceDataset): boolean {
  if (ds.columns.length === 0) return true;
  const fallback = ds.columns.filter((c) => isFallbackName(c.name)).length;
  return fallback / ds.columns.length > FALLBACK_NAME_RATIO;
}

export function SourceReadOptions() {
  const source = useStore((s) => s.source);
  const files = useStore((s) => s.sourceFiles);
  const units = useStore((s) => s.sourceUnits);
  const unitData = useStore((s) => s.sourceUnitData);
  const originColumn = useStore((s) => s.originColumn);
  const addSourceFiles = useStore((s) => s.addSourceFiles);
  const setOriginColumn = useStore((s) => s.setOriginColumn);
  const [adding, setAdding] = useState(false);

  if (!source) return null;

  const combined = units.length > 1;
  // 参照テーブルで行を絞ると、読み込んだ合計と実際の対象行数がずれる。
  // 「ファイルは4行なのに2行と出ている」と見えるので、差分の理由を添える。
  const readTotal = unitData.reduce((sum, d) => sum + (d?.rows.length ?? 0), 0);
  const filteredOut = readTotal - source.rows.length;

  return (
    <div className="read-options">
      <div className="read-options-head">
        <span className="read-options-title">読み込み設定</span>
        <span className="read-options-inline">
          {source.columns.length} 列 / {source.rows.length.toLocaleString()} 行
          {combined && (
            <span className="read-options-auto">{units.length}件を結合</span>
          )}
          {filteredOut > 0 && (
            <span className="read-options-auto">
              参照テーブルで {filteredOut.toLocaleString()} 行を除外
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
          {adding ? '閉じる' : '+ ファイルを追加'}
        </button>
      </div>

      {adding && (
        <div style={{ margin: '10px 0' }}>
          <FileDrop
            multiple
            title="同じ形のファイルを追加でドロップ"
            hint="CSV / Excel — 追加したぶんは縦につないで1つの表として整形します"
            onFiles={(picked) => {
              void addSourceFiles(picked);
              setAdding(false);
            }}
          />
        </div>
      )}

      <div className="source-units">
        {units.map((unit, i) => (
          <SourceUnitRow
            key={`${unit.fileIndex}:${unit.sheet}:${i}`}
            index={i}
            fileName={files[unit.fileIndex]?.fileName ?? ''}
            sheetNames={files[unit.fileIndex]?.sheetNames ?? []}
            fileIndex={unit.fileIndex}
            sheet={unit.sheet}
            data={unitData[i]}
            removable={units.length > 1}
          />
        ))}
      </div>

      {combined && (
        <label className="read-options-inline" style={{ marginTop: 10 }}>
          <input
            type="checkbox"
            checked={originColumn != null}
            onChange={(e) =>
              void setOriginColumn(
                e.target.checked ? DEFAULT_ORIGIN_COLUMN : undefined,
              )
            }
          />
          どのファイル/シート由来かを「{DEFAULT_ORIGIN_COLUMN}」列として足す
        </label>
      )}
    </div>
  );
}

function SourceUnitRow({
  index,
  fileName,
  sheetNames,
  fileIndex,
  sheet,
  data,
  removable,
}: {
  index: number;
  fileName: string;
  sheetNames: string[];
  fileIndex: number;
  sheet: string;
  data?: SourceDataset;
  removable: boolean;
}) {
  const units = useStore((s) => s.sourceUnits);
  const setUnitHeaderRow = useStore((s) => s.setUnitHeaderRow);
  const removeSourceUnit = useStore((s) => s.removeSourceUnit);
  const toggleSourceSheet = useStore((s) => s.toggleSourceSheet);
  // null = ユーザーが開閉していない(判定に任せる)。一度触ったらその意思を優先する。
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);

  const suspicious = data ? looksMisdetected(data) : false;
  const open = manualOpen ?? suspicious;
  const previewRows = data?.previewRows ?? [];
  const headerRow = data?.headerRow ?? 1;
  const otherSheets = sheetNames.filter((n) => n !== sheet);
  const takenSheets = new Set(
    units.filter((u) => u.fileIndex === fileIndex).map((u) => u.sheet),
  );

  return (
    <div className={`source-unit${suspicious ? ' is-suspicious' : ''}`}>
      <div className="source-unit-head">
        <span className="source-unit-name">
          {fileName}
          {sheetNames.length > 1 && (
            <span className="source-unit-sheet">{sheet}</span>
          )}
        </span>
        <span className="source-unit-meta">
          見出し行 <b>{headerRow}</b> ・{' '}
          {(data?.rows.length ?? 0).toLocaleString()} 行
          {data?.headerRowAuto && (
            <span className="read-options-auto">自動判定</span>
          )}
        </span>
        <div className="spacer" />
        <button
          type="button"
          className="ghost"
          onClick={() => setManualOpen(!open)}
          aria-expanded={open}
        >
          {open ? '閉じる' : '見出し行を選び直す'}
        </button>
        {removable && (
          <button
            type="button"
            className="ghost"
            aria-label={`${fileName} を取り込み対象から外す`}
            onClick={() => void removeSourceUnit(index)}
          >
            ×
          </button>
        )}
      </div>

      {suspicious && (
        <div className="alert warn" style={{ margin: '8px 0 0' }}>
          見出しをうまく読み取れていない可能性があります（列名が
          <code>列1</code>
          のような仮の名前になっています）。下のプレビューから、見出しが書かれている行を選んでください。
        </div>
      )}

      {open && (
        <>
          <p className="subtitle" style={{ margin: '10px 0 6px' }}>
            見出しが書かれている行をクリックしてください。その行より下がデータとして読み込まれます。
          </p>
          <div className="preview-scroll">
            <table className="preview-table">
              <tbody>
                {previewRows.map((cells, i) => {
                  const rowNo = i + 1;
                  const isHeader = rowNo === headerRow;
                  const isSkipped = rowNo < headerRow;
                  return (
                    <tr
                      key={rowNo}
                      className={`preview-row${isHeader ? ' is-header' : ''}${
                        isSkipped ? ' is-skipped' : ''
                      }`}
                      onClick={() => void setUnitHeaderRow(index, rowNo)}
                      title={`${rowNo}行目を見出しにする`}
                    >
                      <th scope="row" className="preview-rowno">
                        {rowNo}
                        {isHeader && (
                          <span className="preview-badge">見出し</span>
                        )}
                      </th>
                      {cells.slice(0, 12).map((c, j) => (
                        <td key={j}>{c}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {(data?.sheetRowCount ?? 0) > previewRows.length && (
            <p className="subtitle" style={{ margin: '6px 0 0' }}>
              先頭 {previewRows.length} 行のみ表示しています（シート全体は
              {(data?.sheetRowCount ?? 0).toLocaleString()} 行）。
            </p>
          )}

          {otherSheets.length > 0 && (
            <div className="source-unit-sheets">
              <span className="subtitle" style={{ margin: 0 }}>
                このファイルの他のシートも結合する:
              </span>
              {otherSheets.map((name) => (
                <label key={name} className="read-options-inline">
                  <input
                    type="checkbox"
                    checked={takenSheets.has(name)}
                    onChange={() => void toggleSourceSheet(fileIndex, name)}
                  />
                  {name}
                </label>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
