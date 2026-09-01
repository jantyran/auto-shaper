/**
 * 参照テーブル(横引き)。
 *
 * 別ファイルの表をキーで突き合わせ、必要な列だけを元データに足す。
 * Excel の XLOOKUP と同じ意味論で、1行につき必ず1件を返すため行数は
 * 変わらない。SQL の JOIN のように1対多で行が増えると、ユーザーが気づかない
 * まま件数が膨らんだデータを取り込むことになるので、そこは仕様で塞いでいる。
 *
 * 「一致したか」を残せるので、同じ仕組みで差分抽出(既に登録済みの行を除く /
 * 既存の行だけ残す)も行える。機能を2つ作らずに済み、覚える概念も1つで済む。
 */
import type { LookupTable } from '../types';
import { toHalfWidth } from './normalize';

type Row = Record<string, string>;

/** 一致状況の列に入る値 */
export const MATCH_LABEL = '一致';
export const UNMATCH_LABEL = '未一致';

/** 複数一致を「すべて連結」で扱うときの区切り */
const JOIN_SEPARATOR = ' / ';

export interface LookupStats {
  /** 一致した行数 */
  matched: number;
  /** 一致しなかった行数 */
  unmatched: number;
  /** 参照表に複数の候補があった行数 */
  multiple: number;
}

export interface LookupOutcome {
  rows: Row[];
  stats: LookupStats;
}

/**
 * 照合用のキーに揃える。
 * 値の対応表(`valueMap.ts`)と同じ規則にしてあるので、アプリ内で「一致」の
 * 意味が2通りにならない。
 */
function matchKey(value: string, loose: boolean): string {
  return loose ? toHalfWidth(value).trim().toLowerCase() : value.trim();
}

/** キーの組から、突き合わせ用の1本の文字列を作る */
function composeKey(
  row: Row,
  columns: string[],
  loose: boolean,
): string | null {
  const parts = columns.map((c) => matchKey(row[c] ?? '', loose));
  // キーが全部空の行は突き合わせ対象外(空欄同士を同一視しない)
  if (parts.every((p) => p === '')) return null;
  return parts.join(' ');
}

/**
 * 参照表を、キー→行 のインデックスにする。
 * 参照表が大きいと線形探索では現実的な速度にならないため、必ず一度だけ
 * Map を作ってから引く。
 */
export function buildLookupIndex(
  lookupRows: Row[],
  lookupColumns: string[],
  loose: boolean,
): Map<string, Row[]> {
  const index = new Map<string, Row[]>();
  for (const row of lookupRows) {
    const key = composeKey(row, lookupColumns, loose);
    if (key == null) continue;
    const bucket = index.get(key);
    if (bucket) bucket.push(row);
    else index.set(key, [row]);
  }
  return index;
}

/** 複数候補から採用する1件(または連結した値)を決める */
function pickValue(
  candidates: Row[],
  from: string,
  multiple: LookupTable['multiple'],
): string {
  if (multiple === 'joinAll') {
    const seen = new Set<string>();
    const values: string[] = [];
    for (const row of candidates) {
      const v = (row[from] ?? '').trim();
      if (v === '' || seen.has(v)) continue;
      seen.add(v);
      values.push(v);
    }
    return values.join(JOIN_SEPARATOR);
  }
  const row =
    multiple === 'last' ? candidates[candidates.length - 1] : candidates[0];
  return row?.[from] ?? '';
}

/** 設定のうち、実際に効くキーの組(両側とも列が選ばれているもの) */
export function activeKeys(config: LookupTable): LookupTable['keys'] {
  return config.keys.filter(
    (k) => k.sourceColumn.trim() !== '' && k.lookupColumn.trim() !== '',
  );
}

/** 設定のうち、実際に足される列(参照側の列名と、足す列名の両方があるもの) */
export function activeColumns(config: LookupTable): LookupTable['columns'] {
  return config.columns.filter(
    (c) => c.from.trim() !== '' && c.as.trim() !== '',
  );
}

/**
 * 元データに参照表の列を足す(必要なら一致状況で行も絞る)。
 * キーが揃っていない設定は何もせずに素通しする。設定の途中で
 * データが空になったり全行落ちたりしないようにするため。
 */
export function applyLookup(
  rows: Row[],
  lookupRows: Row[],
  config: LookupTable,
): LookupOutcome {
  const keys = activeKeys(config);
  if (keys.length === 0) {
    return {
      rows,
      stats: { matched: 0, unmatched: rows.length, multiple: 0 },
    };
  }

  const index = buildLookupIndex(
    lookupRows,
    keys.map((k) => k.lookupColumn),
    config.loose,
  );
  const columns = activeColumns(config);
  const statusColumn = config.statusColumn?.trim();

  const stats: LookupStats = { matched: 0, unmatched: 0, multiple: 0 };
  const out: Row[] = [];

  for (const row of rows) {
    const key = composeKey(
      row,
      keys.map((k) => k.sourceColumn),
      config.loose,
    );
    const hits = key == null ? undefined : index.get(key);
    const found = !!hits && hits.length > 0;
    if (found) {
      stats.matched++;
      if (hits.length > 1) stats.multiple++;
    } else {
      stats.unmatched++;
    }

    if (config.matchAction === 'excludeMatched' && found) continue;
    if (config.matchAction === 'keepMatched' && !found) continue;

    const next: Row = { ...row };
    for (const col of columns) {
      next[col.as] =
        found && hits
          ? pickValue(hits, col.from, config.multiple)
          : config.notFound;
    }
    if (statusColumn) {
      next[statusColumn] = found ? MATCH_LABEL : UNMATCH_LABEL;
    }
    out.push(next);
  }

  return { rows: out, stats };
}

/** 新しい参照設定の初期値 */
export function createLookupTable(
  id: string,
  fileIndex: number,
  sheet: string,
): LookupTable {
  return {
    id,
    fileIndex,
    sheet,
    keys: [{ sourceColumn: '', lookupColumn: '' }],
    columns: [],
    multiple: 'first',
    notFound: '',
    loose: true,
    matchAction: 'none',
  };
}
