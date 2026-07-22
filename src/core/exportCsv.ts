/**
 * 変換済みデータの出力(CSV / Excel)。
 * ブラウザ内で Blob を生成し、そのままダウンロードさせる(サーバー経由なし)。
 * Excelでの文字化けを防ぐため CSV には UTF-8 BOM を付与する。
 */
import * as XLSX from 'xlsx';
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
  triggerDownload(
    new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' }),
    fileName,
  );
}

/** ターゲットフィールドの順序で Excel(.xlsx) をダウンロード */
export function downloadXlsx(
  rows: Record<string, string>[],
  fields: TargetField[],
  fileName: string,
): void {
  const header = fields.map((f) => f.key);
  const aoa = [header, ...rows.map((r) => header.map((k) => r[k] ?? ''))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'shaped');
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
  triggerDownload(
    new Blob([buf], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    fileName,
  );
}

function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
