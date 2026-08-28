/**
 * 日付と数値の正規化。
 *
 * 表記ゆれの発生源として最も大きいのがこの2つ。日付は
 * `2024/1/5` `2024年1月5日` `令和6年1月5日` `45296`(Excelのシリアル値)が
 * ひとつの列に混在することがあり、数値は `1,000円` `¥1000` `(1,000)` のように
 * 単位や記号が付いたまま届く。どちらも取り込み先が受け付ける形に揃える。
 *
 * 解釈できなかった値は握りつぶさず、前後の空白だけ落として返す。
 * 勝手に空にするとユーザーがデータを失ったことに気づけないため。
 */
import { toHalfWidth } from './normalize';

/** Excelのシリアル値の起点。1900年の閏年バグを織り込んで 1899-12-30 とする。 */
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);

/**
 * シリアル値として解釈する範囲(1970-01-01 〜 2099-12-31 相当)。
 *
 * 下限をここまで上げているのは、`1` `2` のような小さい整数を日付に変えて
 * しまわないため。業務データでその値が1900年代初頭の日付である可能性より、
 * ただの個数やIDである可能性の方がはるかに高い。
 * この範囲なら 1900年の閏年バグ(シリアル60)より後なので、起点は一定でよい。
 */
const EXCEL_SERIAL_MIN = 25569;
const EXCEL_SERIAL_MAX = 73050;

/** 和暦の元号と、その元年に対応する西暦 */
const JP_ERAS: Array<{ pattern: RegExp; startYear: number }> = [
  { pattern: /^(令和|令|R|Ｒ)/i, startYear: 2018 },
  { pattern: /^(平成|平|H|Ｈ)/i, startYear: 1988 },
  { pattern: /^(昭和|昭|S|Ｓ)/i, startYear: 1925 },
  { pattern: /^(大正|大|T|Ｔ)/i, startYear: 1911 },
  { pattern: /^(明治|明|M|Ｍ)/i, startYear: 1867 },
];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** 年月日が実在するか(2月31日のような値を弾く) */
function isRealDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

function iso(y: number, m: number, d: number): string | null {
  return isRealDate(y, m, d) ? `${y}-${pad2(m)}-${pad2(d)}` : null;
}

/** 和暦表記を西暦の年月日に変換する(元年 = 1年) */
function parseJapaneseEra(input: string): string | null {
  for (const era of JP_ERAS) {
    const head = era.pattern.exec(input);
    if (!head) continue;
    const rest = input.slice(head[0].length);
    // 「6年1月5日」「6.1.5」「6/1/5」いずれの区切りも受ける。元年は1年。
    const m =
      /^\s*(元|\d{1,2})\s*[年./-]\s*(\d{1,2})\s*[月./-]?\s*(\d{1,2})\s*日?\s*$/.exec(
        rest,
      );
    if (!m) continue;
    const eraYear = m[1] === '元' ? 1 : Number(m[1]);
    return iso(era.startYear + eraYear, Number(m[2]), Number(m[3]));
  }
  return null;
}

/**
 * 日付を `YYYY-MM-DD` に揃える。
 *
 * 受け付ける形: `2024-01-05` `2024/1/5` `2024.1.5` `2024年1月5日`
 * `令和6年1月5日` `R6.1.5` `20240105` `45296`(Excelのシリアル値)。
 * 時刻が付いていれば落とす。
 *
 * `1/5/2024` のような月日が先に来る表記は、日本の業務データでは
 * 月と日のどちらが先か判定できないため、あえて変換しない。
 */
export function normalizeDate(input: string): string {
  const raw = input.trim();
  if (raw === '') return '';
  // 全角の数字と記号を半角に寄せてから判定する
  const v = toHalfWidth(raw).trim();

  // 時刻部分は落とす(`2024/1/5 13:00` → `2024/1/5`)
  const dateOnly = v.replace(/[ T]\d{1,2}:\d{2}(:\d{2})?.*$/, '').trim();

  const ymd =
    /^(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?$/.exec(
      dateOnly,
    );
  if (ymd) {
    return iso(Number(ymd[1]), Number(ymd[2]), Number(ymd[3])) ?? raw;
  }

  // 区切りなしの8桁(20240105)
  const packed = /^(\d{4})(\d{2})(\d{2})$/.exec(dateOnly);
  if (packed) {
    return iso(Number(packed[1]), Number(packed[2]), Number(packed[3])) ?? raw;
  }

  const era = parseJapaneseEra(dateOnly);
  if (era) return era;

  // Excelのシリアル値(日付書式が外れた数値セル)
  if (/^\d{1,5}$/.test(dateOnly)) {
    const serial = Number(dateOnly);
    if (serial >= EXCEL_SERIAL_MIN && serial <= EXCEL_SERIAL_MAX) {
      const dt = new Date(EXCEL_EPOCH_UTC + serial * 86400000);
      return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(
        dt.getUTCDate(),
      )}`;
    }
  }

  return raw;
}

/**
 * 数値を、単位や桁区切りを外した素の数値文字列にする。
 *
 * 受け付ける形: `1,000` `¥1,000` `1000円` `１２３` `(1,000)`(会計表記の負数)
 * `12.5%`。小数点と符号は残す。数値として読めなければ元の値を返す。
 */
export function normalizeNumber(input: string): string {
  const raw = input.trim();
  if (raw === '') return '';
  let v = toHalfWidth(raw).trim();

  // 会計表記の丸括弧は負数を表す
  let negative = false;
  const paren = /^\((.*)\)$/.exec(v);
  if (paren) {
    negative = true;
    v = paren[1];
  }
  if (v.startsWith('-') || v.startsWith('−') || v.startsWith('▲')) {
    negative = !negative;
    v = v.slice(1);
  }

  // 通貨記号・単位・桁区切りを落とす
  const stripped = v.replace(/[,\s¥$€£円個件人台本枚%％]/g, '');
  if (!/^\d*\.?\d+$/.test(stripped)) return raw;

  // 先頭の余分なゼロを落としつつ、小数はそのまま保つ
  const n = Number(stripped);
  if (!Number.isFinite(n)) return raw;
  return negative && n !== 0 ? `-${stripped}` : stripped;
}
