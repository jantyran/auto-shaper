/**
 * サジェスト用の辞書・文字列ユーティリティ。
 * 日本語/英語の表記ゆれを吸収し、カラム名の意味的な近さを測るための土台。
 */

/** ヘッダー文字列を比較用に正規化(小文字化・全角半角・記号除去) */
export function normalizeHeader(input: string): string {
  return input
    .normalize('NFKC') // 全角英数→半角、互換文字の正規化
    .toLowerCase()
    .replace(/[\s_\-.・（）()【】\[\]「」『』:：/、,，。]/g, '')
    .trim();
}

/** レーベンシュタイン距離 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const prev = new Array(b.length + 1);
  const curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

/** 0-1の類似度(1が完全一致) */
export function similarity(a: string, b: string): number {
  const na = normalizeHeader(a);
  const nb = normalizeHeader(b);
  if (na === '' || nb === '') return 0;
  if (na === nb) return 1;
  // 包含関係は強いシグナル
  if (na.includes(nb) || nb.includes(na)) {
    const ratio = Math.min(na.length, nb.length) / Math.max(na.length, nb.length);
    return 0.7 + 0.25 * ratio;
  }
  const dist = levenshtein(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  return Math.max(0, 1 - dist / maxLen);
}

/**
 * 「氏名」など結合された1カラムを表すキーワード。
 * これらに一致するソース列があれば、姓/名への分割候補になる。
 */
export const FULL_NAME_KEYWORDS = [
  '氏名',
  '名前',
  'お名前',
  'fullname',
  'full name',
  'name',
  '担当者名',
  '担当者',
];

/** 姓を表す概念キーワード */
export const LAST_NAME_KEYWORDS = ['姓', '苗字', '名字', 'lastname', 'last name', 'family name'];
/** 名を表す概念キーワード */
export const FIRST_NAME_KEYWORDS = ['名', 'firstname', 'first name', 'given name'];

/** ターゲットのキー/ラベルが指す概念を判定するヘルパー群 */
export function isLastNameField(keyOrLabel: string): boolean {
  const n = normalizeHeader(keyOrLabel);
  return LAST_NAME_KEYWORDS.some((k) => normalizeHeader(k) === n);
}
export function isFirstNameField(keyOrLabel: string): boolean {
  const n = normalizeHeader(keyOrLabel);
  return FIRST_NAME_KEYWORDS.some((k) => normalizeHeader(k) === n);
}
export function matchesAnyKeyword(header: string, keywords: string[]): boolean {
  const n = normalizeHeader(header);
  return keywords.some((k) => {
    const nk = normalizeHeader(k);
    return n === nk || n.includes(nk);
  });
}
