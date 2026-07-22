/**
 * 変換済みデータのCSV出力。
 * ブラウザ内で Blob を生成し、そのままダウンロードさせる(サーバー経由なし)。
 * Excelでの文字化けを防ぐため UTF-8 BOM を付与する。
 */
import type { TargetField } from '../types';

type Row = Record<string, string>;

function escapeCell(value: string): string {
  const v = value ?? '';
  if (/[",\n\r]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

/** ターゲットフィールドの順序でCSV文字列を生成 */
export function toCsv(rows: Row[], fields: TargetField[]): string {
  const header = fields.map((f) => escapeCell(f.key)).join(',');
  const body = rows
    .map((r) => fields.map((f) => escapeCell(r[f.key] ?? '')).join(','))
    .join('\r\n');
  return `${header}\r\n${body}`;
}

/** CSV文字列をファイルとしてダウンロード */
export function downloadCsv(csv: string, fileName: string): void {
  const bom = '﻿';
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
