/**
 * 読み込み設定(シート選択 / ヘッダー行の指定)。
 *
 * 業務Excelは1行目がタイトルや注記で、実際の見出しが数行下にあることが多い。
 * 自動判定した行を明示しつつ、外れていたらプレビューから選び直せるようにする。
 */
import { useState } from 'react';
import { useStore } from '../state/store';
import type { SourceDataset } from '../types';

/** 見出しが取れていない疑いを持つ閾値(自動生成名の割合) */
const FALLBACK_NAME_RATIO = 0.3;

/** buildColumnNames が付ける仮の列名(`列3` など)か */
function isFallbackName(name: string): boolean {
  return /^列\d+$/.test(name);
}

/** ヘッダー行が間違っている可能性が高いか */
function looksMisdetected(source: SourceDataset): boolean {
  if (source.columns.length === 0) return true;
  const fallback = source.columns.filter((c) => isFallbackName(c.name)).length;
  return fallback / source.columns.length > FALLBACK_NAME_RATIO;
}

export function SourceReadOptions() {
  const source = useStore((s) => s.source);
  const selectSheet = useStore((s) => s.selectSheet);
  const setHeaderRow = useStore((s) => s.setHeaderRow);
  // null = ユーザーが開閉していない(自動判定に任せる)。一度触ったらその意思を優先する。
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);

  const suspicious = source ? looksMisdetected(source) : false;
  // 見出しが取れていない疑いがあるときは、最初から開いて気づけるようにする
  const open = manualOpen ?? suspicious;

  if (!source) return null;

  const previewRows = source.previewRows ?? [];
  const headerRow = source.headerRow ?? 1;
  const multiSheet = (source.sheetNames?.length ?? 0) > 1;

  return (
    <div className="read-options">
      <div className="read-options-head">
        <span className="read-options-title">読み込み設定</span>
        {multiSheet && (
          <label className="read-options-inline">
            シート
            <select
              value={source.activeSheet}
              onChange={(e) => void selectSheet(e.target.value)}
            >
              {source.sheetNames?.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        )}
        <span className="read-options-inline">
          見出し行: <b>{headerRow}行目</b>
          {source.headerRowAuto && (
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
                      onClick={() => void setHeaderRow(rowNo)}
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
          {(source.sheetRowCount ?? 0) > previewRows.length && (
            <p className="subtitle" style={{ margin: '6px 0 0' }}>
              先頭 {previewRows.length} 行のみ表示しています（シート全体は
              {(source.sheetRowCount ?? 0).toLocaleString()} 行）。
            </p>
          )}
        </>
      )}
    </div>
  );
}
