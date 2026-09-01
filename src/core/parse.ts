/**
 * ソースファイル(CSV/Excel)のパースとスキーマ抽出。
 * SheetJS(xlsx)を用いてブラウザ内で完結させる。実データは外部送信しない。
 * xlsx は重いため動的 import で遅延読込し、初期バンドルを軽くする。
 *
 * ヘッダー行は「1行目」とは限らない(業務Excelはタイトル行・空行・注記が
 * 上に載っていることが多い)。既定では自動判定し、外した場合はユーザーが
 * `headerRow` で明示できるようにしている。
 */
import type {
  DataType,
  SourceColumn,
  SourceDataset,
  SourcePart,
} from '../types';
type XLSXModule = typeof import('xlsx');
type WorkSheet = import('xlsx').WorkSheet;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[\d\-+()\s　０-９]{7,}$/;
const URL_RE = /^https?:\/\/\S+$/i;
const DATE_RE =
  /^(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{4})/;
const NUMBER_RE = /^-?[\d,]+(\.\d+)?$/;
const BOOL_RE = /^(true|false|yes|no|はい|いいえ|有|無|○|×)$/i;

/** ヘッダー行選択UIに出す、シート先頭の生データ行数 */
export const PREVIEW_ROW_COUNT = 12;

/** ヘッダー行の自動判定で走査する範囲(これより下は見ない) */
const HEADER_SCAN_LIMIT = 15;

export interface ParseOptions {
  /** Excel 複数シート時に読むシート名(省略時は先頭シート) */
  sheetName?: string;
  /** ヘッダーとして使う行(1始まり)。省略時は自動判定。 */
  headerRow?: number;
}

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

/** シート全体を文字列の二次元配列として取り出す(欠損セルは空文字) */
function readMatrix(XLSX: XLSXModule, sheet: WorkSheet): string[][] {
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
    blankrows: true,
  });
  const width = aoa.reduce((max, row) => Math.max(max, row?.length ?? 0), 0);
  return aoa.map((row) =>
    Array.from({ length: width }, (_, i) => {
      const v = row?.[i];
      return v == null ? '' : String(v);
    }),
  );
}

/** 1列分のメタ情報(推定型・サンプル・充填率)をまとめる */
export function describeColumn(
  name: string,
  rows: Record<string, string>[],
): SourceColumn {
  const allValues = rows.map((r) => r[name] ?? '');
  const nonEmpty = allValues.filter((v) => v.trim() !== '');
  return {
    name,
    inferredType: inferColumnType(allValues.slice(0, 50)),
    sampleValues: nonEmpty.slice(0, 5),
    fillRate: rows.length === 0 ? 0 : nonEmpty.length / rows.length,
  };
}

/** その行の、空でないセルの数 */
function filledCount(row: string[]): number {
  return row.filter((c) => c.trim() !== '').length;
}

/**
 * ヘッダー行を推定して 1始まりの行番号で返す。
 *
 * 業務Excelでよくある「1行目にタイトル、2行目が空、3行目からが表」を
 * 拾えるようにする。判定の骨子は次の2点。
 *  - ヘッダー行は、その下に続くデータ行と同じくらい横に埋まっている
 *  - ヘッダー行のセルは日付や数値ではなく、ラベルらしい文字列である
 *
 * 候補が無ければ 1 を返す(従来どおり先頭行をヘッダーとみなす)。
 */
export function detectHeaderRow(matrix: string[][]): number {
  if (matrix.length === 0) return 1;
  const width = matrix.reduce((max, r) => Math.max(max, filledCount(r)), 0);
  if (width === 0) return 1;

  const scanEnd = Math.min(matrix.length, HEADER_SCAN_LIMIT);
  let best = -1;
  let bestScore = -Infinity;

  for (let i = 0; i < scanEnd; i++) {
    const row = matrix[i];
    const filled = filledCount(row);
    // 1セルしか無い行はタイトル行の可能性が高い。表の見出しとしては採らない。
    if (filled < 2) continue;
    // 下にデータ行が1行も無いならヘッダーになり得ない
    const below = matrix.slice(i + 1, i + 6).filter((r) => filledCount(r) > 0);
    if (below.length === 0) continue;

    // 横の埋まり具合(シート全体の最大幅にどれだけ近いか)
    let score = (filled / width) * 10;
    // 見出しらしさ: 数値・日付・空でないラベル文字列が並んでいるか
    const labelLike = row.filter((c) => {
      const t = c.trim();
      if (t === '') return false;
      const kind = inferCellType(t);
      return kind === 'string' || kind === 'boolean';
    }).length;
    score += (labelLike / filled) * 5;
    // 直下の行と幅が揃っているほどヘッダーらしい
    const belowFilled = filledCount(below[0]);
    score -= Math.abs(filled - belowFilled) / width;
    // 同じ見出しが重複していないほどヘッダーらしい
    const uniq = new Set(row.map((c) => c.trim()).filter((c) => c !== '')).size;
    score += (uniq / filled) * 2;
    // 上にあるほど自然。同点なら先に出てきた行を採る。
    score -= i * 0.15;

    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }

  return best < 0 ? 1 : best + 1;
}

/**
 * ヘッダー行のセルから、重複と空欄を解消した列名を作る。
 * SheetJS 既定の `__EMPTY` / `列_1` のような分かりにくい名前を避ける。
 */
export function buildColumnNames(headerCells: string[]): string[] {
  const used = new Map<string, number>();
  return headerCells.map((cell, i) => {
    const base = cell.trim() || `列${i + 1}`;
    const seen = used.get(base) ?? 0;
    used.set(base, seen + 1);
    return seen === 0 ? base : `${base} (${seen + 1})`;
  });
}

/**
 * ArrayBuffer(アップロードされたファイル)をパースして SourceDataset を返す。
 *
 * CSV/TSV は SheetJS のバイナリ読み込みだと UTF-8 の日本語が文字化けするため、
 * TextDecoder で明示的に UTF-8 デコードしてから文字列として読み込む。
 * Excel(.xlsx/.xls) は ZIP/バイナリなので array のまま読む。
 */
export async function parseWorkbook(
  fileName: string,
  data: ArrayBuffer,
  options: ParseOptions = {},
): Promise<SourceDataset> {
  const XLSX: XLSXModule = await import('xlsx');
  const wb = isTextFormat(fileName)
    ? XLSX.read(stripBom(new TextDecoder('utf-8').decode(data)), {
        type: 'string',
      })
    : XLSX.read(data, { type: 'array' });

  const sheetNames = wb.SheetNames;
  if (sheetNames.length === 0) {
    throw new Error('シートが見つかりませんでした。');
  }
  const activeSheet =
    options.sheetName && sheetNames.includes(options.sheetName)
      ? options.sheetName
      : sheetNames[0];

  const matrix = readMatrix(XLSX, wb.Sheets[activeSheet]);
  const detected = detectHeaderRow(matrix);
  const headerRowAuto = options.headerRow == null;
  // 範囲外の指定は先頭行に丸める(壊れたレシピ等で落とさない)
  const headerRow = headerRowAuto
    ? detected
    : Math.min(
        Math.max(1, Math.floor(options.headerRow as number)),
        Math.max(1, matrix.length),
      );

  const headerCells = matrix[headerRow - 1] ?? [];
  const columnNames = buildColumnNames(headerCells);

  // ヘッダー行より下を、全セルが空の行を除いてデータ行にする
  const rows: Record<string, string>[] = [];
  for (const line of matrix.slice(headerRow)) {
    if (filledCount(line) === 0) continue;
    const o: Record<string, string> = {};
    columnNames.forEach((name, i) => {
      o[name] = line[i] ?? '';
    });
    rows.push(o);
  }

  const columns: SourceColumn[] = columnNames.map((name) =>
    describeColumn(name, rows),
  );

  return {
    fileName,
    columns,
    rows,
    sheetNames,
    activeSheet,
    headerRow,
    headerRowAuto,
    previewRows: matrix.slice(0, PREVIEW_ROW_COUNT),
    sheetRowCount: matrix.length,
  };
}

/**
 * 複数のシート/ファイルを縦に結合して1つのデータセットにする。
 *
 * 「同じ形のファイルが月ごとに分かれている」「支店ごとにシートが分かれている」
 * ケースを、1回の整形で処理できるようにするためのもの。
 *
 * 列は現れた順の和集合にする。片方にしか無い列は、持たない行では空欄になる。
 * 列名が完全一致しない表記ゆれ(`会社名` と `企業名`)までは寄せない。
 * 勝手に同一視すると別物の列を混ぜてしまうため、そこはマッピング側で扱う。
 *
 * @param originColumn 指定すると、その名前の列に取込元(ファイル名/シート名)を入れる
 */
export function mergeDatasets(
  datasets: SourceDataset[],
  originColumn?: string,
): SourceDataset {
  if (datasets.length === 0) {
    throw new Error('結合するデータがありません。');
  }
  if (datasets.length === 1 && !originColumn) return datasets[0];

  const columnNames: string[] = [];
  const seen = new Set<string>();
  for (const ds of datasets) {
    for (const col of ds.columns) {
      if (seen.has(col.name)) continue;
      seen.add(col.name);
      columnNames.push(col.name);
    }
  }
  if (originColumn && !seen.has(originColumn)) columnNames.push(originColumn);

  const rows: Record<string, string>[] = [];
  const parts: SourcePart[] = [];
  for (const ds of datasets) {
    const label = partLabel(ds);
    for (const row of ds.rows) {
      const merged: Record<string, string> = {};
      for (const name of columnNames) merged[name] = row[name] ?? '';
      if (originColumn) merged[originColumn] = label;
      rows.push(merged);
    }
    parts.push(...(ds.parts ?? [datasetToPart(ds)]));
  }

  const columns: SourceColumn[] = columnNames.map((name) =>
    describeColumn(name, rows),
  );

  return {
    fileName: summarizeNames(datasets),
    columns,
    rows,
    parts,
    // 結合後は「どの1シートを見ているか」が定まらないため、単体用の情報は持たない
    sheetNames: undefined,
    activeSheet: undefined,
    previewRows: undefined,
  };
}

/** 取込元を表す表示名(`売上.xlsx / 1月` のような形) */
export function partLabel(ds: SourceDataset): string {
  return ds.activeSheet ? `${ds.fileName} / ${ds.activeSheet}` : ds.fileName;
}

function datasetToPart(ds: SourceDataset): SourcePart {
  return {
    fileName: ds.fileName,
    sheet: ds.activeSheet,
    rowCount: ds.rows.length,
    headerRow: ds.headerRow ?? 1,
  };
}

/** 結合後の表示名。件数が多いときは省略する。 */
function summarizeNames(datasets: SourceDataset[]): string {
  const names = [...new Set(datasets.map((d) => d.fileName))];
  if (names.length === 1) return names[0];
  return `${names[0]} ほか${names.length - 1}件`;
}
