/**
 * テキストマスキング（フリーテキスト整形モード用）。
 *
 * 問合せメールなどの雑多なテキストを AI に渡す前に、機微情報を
 * 可逆なトークン（例: [EMAIL_1]）へ置換する。AI にはトークン化済みの
 * テキストだけを送り、AI の応答に含まれるトークンはローカルで元の値へ復元する。
 * これにより「AI に直接見られると危うい情報」を伏せたまま整形できる。
 *
 * ロジックは Maskify（jantyran/Maskify-ai の services/maskingService.ts）を
 * このリポジトリの方針（外部依存なし・localStorage 完結）に合わせて移植・簡素化したもの。
 *
 * 提供する操作:
 *  - autoMaskText:       メール/電話/カード番号/長い数字列をパターン検出して一括マスク
 *  - manualMaskSelection: ユーザーが選択した範囲を指定カテゴリでマスク（同一文字列は全置換）
 *  - unmaskText:         トークンを元の値へ復元
 */

/** マスクのカテゴリ。自動検出は EMAIL/PHONE/CARD/NUMBER、手動はすべて指定可能。 */
export type MaskCategory =
  | 'NAME'
  | 'COMPANY'
  | 'EMAIL'
  | 'PHONE'
  | 'ADDRESS'
  | 'NUMBER'
  | 'CARD'
  | 'CUSTOM';

/** 1つの伏字トークンの情報 */
export interface MaskToken {
  /** 内部ID */
  id: string;
  /** 元の値（このブラウザ内にのみ保持し、AI へは送らない） */
  original: string;
  /** 分類 */
  category: MaskCategory;
  /** 表示トークン（例: "[EMAIL_1]"）。AI へはこの文字列だけが渡る */
  display: string;
  /** ハイライト色（16進） */
  color: string;
}

/** display（トークン文字列）をキーにしたトークン辞書 */
export type MaskDictionary = Map<string, MaskToken>;

/** カテゴリごとのトークン接頭辞（トークンは常に大文字 + "_数字" 形式にする） */
const CATEGORY_PREFIX: Record<MaskCategory, string> = {
  NAME: 'NAME',
  COMPANY: 'COMPANY',
  EMAIL: 'EMAIL',
  PHONE: 'PHONE',
  ADDRESS: 'ADDRESS',
  NUMBER: 'NUM',
  CARD: 'CARD',
  CUSTOM: 'MASK',
};

/** カテゴリごとのハイライト色 */
export const CATEGORY_COLOR: Record<MaskCategory, string> = {
  NAME: '#4f7cff',
  COMPANY: '#3ecf8e',
  EMAIL: '#f0b429',
  PHONE: '#a06bff',
  ADDRESS: '#33b5c9',
  NUMBER: '#8b96ad',
  CARD: '#f26d6d',
  CUSTOM: '#ec6ea8',
};

/** カテゴリの日本語表示ラベル（UI 用） */
export const CATEGORY_LABEL: Record<MaskCategory, string> = {
  NAME: '氏名',
  COMPANY: '会社名',
  EMAIL: 'メール',
  PHONE: '電話',
  ADDRESS: '住所',
  NUMBER: '番号',
  CARD: 'カード',
  CUSTOM: 'その他',
};

/** パターン検出用の正規表現（自動スキャン） */
export const REGEX_PATTERNS = {
  EMAIL: /[^\s@<>()[\]{}",;]+@[^\s@<>()[\]{}",;]+\.[^\s@<>()[\]{}",;.]+/g,
  /** クレジットカード（4桁×4、区切りは空白/ハイフン許容） */
  CARD: /\b(?:\d{4}[ -]?){3}\d{4}\b/g,
  /** 電話番号候補（実際の採否は桁数で検証する） */
  PHONE: /\+?\d[\d\s()-]{7,}\d/g,
  /** 5桁以上の連続数字（ID・口座番号など） */
  NUMBER: /\d{5,}/g,
} as const;

/** 全トークンの display 集合を作る */
function collectNames(dict: MaskDictionary): Set<string> {
  const set = new Set<string>();
  for (const t of dict.values()) set.add(t.display);
  return set;
}

/** 指定カテゴリの次のインデックスを、既存辞書から衝突しないように決める */
function nextIndex(category: MaskCategory, dict: MaskDictionary): number {
  let max = 0;
  for (const t of dict.values()) {
    if (t.category !== category) continue;
    const m = t.display.match(/_(\d+)\]$/);
    if (m) max = Math.max(max, parseInt(m[1], 10) || 0);
  }
  return max + 1;
}

/** 未使用のトークン名を作る（衝突時はインデックスを進める） */
function buildDisplay(
  category: MaskCategory,
  dict: MaskDictionary,
  used: Set<string>,
): string {
  const prefix = CATEGORY_PREFIX[category];
  let idx = nextIndex(category, dict);
  let display = `[${prefix}_${idx}]`;
  while (used.has(display)) {
    idx += 1;
    display = `[${prefix}_${idx}]`;
  }
  return display;
}

/** 既存トークンから同じ original を探す（同一値は同じトークンに寄せる） */
function findByOriginal(dict: MaskDictionary, original: string): MaskToken | undefined {
  for (const t of dict.values()) if (t.original === original) return t;
  return undefined;
}

/** 電話番号候補の桁数が妥当か（9〜14桁）。誤検出（年号・金額）を避ける */
function isPhoneLike(match: string): boolean {
  const digits = match.replace(/\D/g, '').length;
  return digits >= 9 && digits <= 14;
}

/**
 * パターン検出による一括マスク。
 * 順序は EMAIL → CARD → PHONE → NUMBER（先に消した桁を後段で二重検出しないため）。
 * 既存の辞書は保持し、新しく見つかった値を追記する。
 */
export function autoMaskText(
  text: string,
  dict: MaskDictionary,
): { maskedText: string; dictionary: MaskDictionary } {
  const next = new Map(dict);
  const used = collectNames(next);
  let out = text;

  const apply = (
    re: RegExp,
    category: MaskCategory,
    accept: (m: string) => boolean = () => true,
  ) => {
    out = out.replace(re, (match) => {
      if (!accept(match)) return match;
      const existing = findByOriginal(next, match);
      if (existing) return existing.display;
      const display = buildDisplay(category, next, used);
      used.add(display);
      next.set(display, {
        id: `${category}_${Date.now()}_${used.size}`,
        original: match,
        category,
        display,
        color: CATEGORY_COLOR[category],
      });
      return display;
    });
  };

  apply(REGEX_PATTERNS.EMAIL, 'EMAIL');
  apply(REGEX_PATTERNS.CARD, 'CARD');
  apply(REGEX_PATTERNS.PHONE, 'PHONE', isPhoneLike);
  apply(REGEX_PATTERNS.NUMBER, 'NUMBER');

  return { maskedText: out, dictionary: next };
}

/**
 * ユーザーが選択した範囲を、指定カテゴリでマスクする。
 * 選択文字列と同一のものはテキスト内すべてを置換する（例: 会社名が複数箇所に出る）。
 * @returns 変更が無い場合は null
 */
export function manualMaskSelection(
  text: string,
  start: number,
  end: number,
  category: MaskCategory,
  dict: MaskDictionary,
): { maskedText: string; dictionary: MaskDictionary } | null {
  if (start === end) return null;
  const original = text.slice(start, end).trim();
  if (!original) return null;

  const next = new Map(dict);
  const used = collectNames(next);

  const existing = findByOriginal(next, original);
  const display = existing ? existing.display : buildDisplay(category, next, used);
  if (!existing) {
    next.set(display, {
      id: `${category}_${Date.now()}_${used.size + 1}`,
      original,
      category,
      display,
      color: CATEGORY_COLOR[category],
    });
  }

  const maskedText = text.split(original).join(display);
  return { maskedText, dictionary: next };
}

/**
 * トークンを元の値へ復元する。
 * 長い display から順に置換して、部分一致による取りこぼしを防ぐ。
 */
export function unmaskText(text: string, dict: MaskDictionary): string {
  let out = text;
  const tokens = [...dict.values()].sort((a, b) => b.display.length - a.display.length);
  for (const t of tokens) out = out.split(t.display).join(t.original);
  return out;
}

/** レコード（key→値）の各値を復元する。整形結果の表示・出力に使う */
export function unmaskRecord(
  record: Record<string, string>,
  dict: MaskDictionary,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(record)) out[k] = unmaskText(v, dict);
  return out;
}

/** ハイライト表示のためにテキストをトークン境界で分割する */
export function splitByTokens(text: string): string[] {
  return text.split(/(\[[A-Z]+_\d+\])/g);
}
