/**
 * 値の置換表。
 *
 * 取り込み先の選択肢(picklist)は値が1文字でも違うと行ごと弾かれるため、
 * 「東京都 → 13」「済/未 → TRUE/FALSE」のような対応を表で持てるようにする。
 * 条件分岐(conditional)を積み上げなくても書けることが狙い。
 *
 * 照合は「前後の空白を無視」「全角英数は半角に寄せる」「英字の大小を無視」で行う。
 * 元データ側の表記ゆれをユーザーが全部書き出さなくて済むようにするため。
 */
import type { ValueMapEntry } from '../types';
import { toHalfWidth } from './normalize';

/** 照合用のキーに揃える(表示や出力には使わない) */
function matchKey(value: string): string {
  return toHalfWidth(value).trim().toLowerCase();
}

/**
 * 置換表を1つの値に適用する。
 *
 * @param entries 上から順に見て、最初に一致したものを使う
 * @param fallback どれにも一致しなかった空でない値をこの値にする。
 *   `undefined` なら元の値をそのまま通す。
 */
export function applyValueMap(
  value: string,
  entries: ValueMapEntry[] | undefined,
  fallback?: string,
): string {
  if (!entries || entries.length === 0) return value;
  const key = matchKey(value);
  for (const entry of entries) {
    if (matchKey(entry.from) === key) return entry.to;
  }
  // 空欄は「未一致」ではなく「値が無い」として扱う。
  // ここで fallback を当てると、空欄が一律に埋まってしまい事故になる。
  if (key === '') return value;
  return fallback ?? value;
}

/** 置換表のうち、実際に効く行(from が空でないもの)だけを残す */
export function compactValueMap(entries: ValueMapEntry[]): ValueMapEntry[] {
  return entries.filter((e) => e.from.trim() !== '');
}

/**
 * 列の値から、置換表の下書きを作る。出現した値を重複を除いて並べる。
 *
 * 変換先には同じ値を入れておく。空にすると、下書きを入れた瞬間に
 * すべての値が空欄に置き換わってしまい、ユーザーがデータを消したように
 * 見えるため。こうしておけば下書きは何も変えず、直したい行だけ書き換えればよい。
 */
export function draftValueMap(values: string[], limit = 30): ValueMapEntry[] {
  const seen = new Set<string>();
  const out: ValueMapEntry[] = [];
  for (const v of values) {
    const t = v.trim();
    if (t === '') continue;
    const key = matchKey(t);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ from: t, to: t });
    if (out.length >= limit) break;
  }
  return out;
}
