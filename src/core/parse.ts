/**
 * ソースファイル(CSV/Excel)のパースとスキーマ抽出。
 * SheetJS(xlsx)を用いてブラウザ内で完結させる。実データは外部送信しない。
 * xlsx は重いため動的 import で遅延読込し、初期バンドルを軽くする。
 */
import type { DataType, SourceColumn, SourceDataset } from '../types';
type XLSXModule = typeof import('xlsx');
type WorkSheet = import('xlsx').WorkSheet;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[\d\-+()\s　０-９]{7,}$/;
const URL_RE = /^https?:\/\/\S+$/i;
const DATE_RE =
  /^(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{4})/;
const NUMBER_RE = /^-?[\d,]+(\.\d+)?$/;
const BOOL_RE = /^(true|false|yes|no|はい|いいえ|有|無|○|×)$/i;

/** 先頭の UTF-8 BOM を除去 */
function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

/** 単一セルの型を推定 */
function inferCellType(value: string): DataType {
  const v = value.trim();
  if (v === '') return 'empty';
  if (EMAIL_RE.test(v)) return 'email';
  if (URL_RE.test(v)) return 'url';
  if (BOOL_RE.test(v)) return 'boolean';
  if (PHONE_RE.test(v) && /\d/.test(v) && v.replace(/\D/g, '').length >= 7)
    return 'phone';
  if (DATE_RE.test(v)) return 'date';
  if (NUMBER_RE.test(v)) return 'number';
  return 'string';
}

/** サンプル値の多数決でカラムの型を決める(emptyは除外) */
function inferColumnType(values: string[]): DataType {
  const counts = new Map<DataType, number>();
  let nonEmpty = 0;
  for (const v of values) {
    const t = inferCellType(v);
    if (t === 'empty') continue;
    nonEmpty++;
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  if (nonEmpty === 0) return 'empty';
  let best: DataType = 'string';
  let bestCount = -1;
  for (const [t, c] of counts) {
    if (c > bestCount) {
      best = t;
      bestCount = c;
    }
  }
  return best;
}

/** テキスト系(CSV/TSV/TXT)拡張子か */
function isTextFormat(fileName: string): boolean {
  return /\.(csv|tsv|txt)$/i.test(fileName);
}

/**
 * ArrayBuffer(アップロードされたファイル)をパースして SourceDataset を返す。
 *
 * CSV/TSV は SheetJS のバイナリ読み込みだと UTF-8 の日本語が文字化けするため、
 * TextDecoder で明示的に UTF-8 デコードしてから文字列として読み込む。
 * Excel(.xlsx/.xls) は ZIP/バイナリなので array のまま読む。
 *
 * @param sheetName Excel 複数シート時に読むシート名(省略時は先頭シート)
 */
export async function parseWorkbook(
  fileName: string,
  data: ArrayBuffer,
  sheetName?: string,
): Promise<SourceDataset> {
  const XLSX: XLSXModule = await import('xlsx');
  const wb = isTextFormat(fileName)
    ? XLSX.read(stripBom(new TextDecoder('utf-8').decode(data)), { type: 'string' })
    : XLSX.read(data, { type: 'array' });

  const sheetNames = wb.SheetNames;
  if (sheetNames.length === 0) {
    throw new Error('シートが見つかりませんでした。');
  }
  const activeSheet =
    sheetName && sheetNames.includes(sheetName) ? sheetName : sheetNames[0];
  const sheet = wb.Sheets[activeSheet];

  // ヘッダー行をキーにしてオブジェクト配列化。defval で欠損セルを空文字に。
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
  });

  const rows: Record<string, string>[] = raw.map((r) => {
    const o: Record<string, string> = {};
    for (const [k, v] of Object.entries(r)) {
      o[k] = v == null ? '' : String(v);
    }
    return o;
  });

  const columnNames =
    rows.length > 0 ? Object.keys(rows[0]) : extractHeaderOnly(XLSX, sheet);

  const columns: SourceColumn[] = columnNames.map((name) => {
    const allValues = rows.map((r) => r[name] ?? '');
    const nonEmpty = allValues.filter((v) => v.trim() !== '');
    return {
      name,
      inferredType: inferColumnType(allValues.slice(0, 50)),
      sampleValues: nonEmpty.slice(0, 5),
      fillRate: rows.length === 0 ? 0 : nonEmpty.length / rows.length,
    };
  });

  return { fileName, columns, rows, sheetNames, activeSheet };
}

/** データ行が無い(ヘッダーのみ)の場合の見出し抽出 */
function extractHeaderOnly(XLSX: XLSXModule, sheet: WorkSheet): string[] {
  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
  const header = rows[0];
  return Array.isArray(header) ? header.map((h) => String(h)) : [];
}
