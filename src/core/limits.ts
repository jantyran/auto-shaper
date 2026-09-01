/**
 * 取り込みサイズの上限。
 *
 * ブラウザ内で完結させる方針上、行データはすべてメモリに載る。1行は
 * `Record<string, string>` なので、列数×文字数のぶんだけオブジェクトの
 * オーバーヘッドも乗る。さらに、読み取り時の二次元配列・変換後の行と、
 * 同じデータの写しが同時に複数存在する瞬間がある。
 *
 * 落ちてから気づくのが最悪なので、余裕を持って警告し、明らかに危険な
 * サイズは受け付けずに理由を伝える。
 */

/** これを超えたら「重くなるかも」と知らせる(処理は続ける) */
export const ROW_WARN_THRESHOLD = 50_000;

/** これを超えたら受け付けない(1ファイル/シート、および結合後の合計) */
export const ROW_HARD_LIMIT = 200_000;

/** 列数の上限。壊れたシートは使われていない範囲まで列として拾ってしまう。 */
export const COLUMN_HARD_LIMIT = 512;

export type SizeLevel = 'ok' | 'warn' | 'over';

export interface SizeCheck {
  level: SizeLevel;
  /** ユーザーに見せる文言(level が 'ok' なら undefined) */
  message?: string;
}

function jp(n: number): string {
  return n.toLocaleString('ja-JP');
}

/** 行数が上限に収まっているかを判定する */
export function checkRowCount(rowCount: number, label: string): SizeCheck {
  if (rowCount > ROW_HARD_LIMIT) {
    return {
      level: 'over',
      message:
        `${label}は ${jp(rowCount)} 行あり、このアプリで扱える上限（${jp(ROW_HARD_LIMIT)} 行）を超えています。` +
        'ファイルを分けて取り込むか、不要な行を減らしてから読み込んでください。',
    };
  }
  if (rowCount > ROW_WARN_THRESHOLD) {
    return {
      level: 'warn',
      message:
        `${label}は ${jp(rowCount)} 行あります。変換やプレビューの動作が重くなることがあります` +
        `（目安は ${jp(ROW_WARN_THRESHOLD)} 行まで）。`,
    };
  }
  return { level: 'ok' };
}

/** 列数が上限に収まっているかを判定する */
export function checkColumnCount(
  columnCount: number,
  label: string,
): SizeCheck {
  if (columnCount > COLUMN_HARD_LIMIT) {
    return {
      level: 'over',
      message:
        `${label}は ${jp(columnCount)} 列あり、上限（${jp(COLUMN_HARD_LIMIT)} 列）を超えています。` +
        '見出し行の指定が正しいか、余分な列が入っていないか確認してください。',
    };
  }
  return { level: 'ok' };
}

/** 行数・列数をまとめて判定し、最も重い結果を返す */
export function checkDatasetSize(
  rowCount: number,
  columnCount: number,
  label: string,
): SizeCheck {
  const cols = checkColumnCount(columnCount, label);
  if (cols.level === 'over') return cols;
  return checkRowCount(rowCount, label);
}
