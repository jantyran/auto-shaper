/**
 * 配色テーマ。
 *
 * 実体は `src/styles.css` の `[data-theme='...']` に定義したトークン一式で、
 * ここは「どのテーマがあるか」と「`<html>` にどう適用するか」だけを持つ。
 * 選択値は設定(`core/settings.ts`)の一部として localStorage に保存される。
 */

export type ThemeId =
  'ledger-light' | 'paper' | 'orchid-light' | 'slate' | 'orchid' | 'ledger';

export interface ThemeMeta {
  id: ThemeId;
  name: string;
  /** 設定画面での並び分け(明るい地 / 暗い地) */
  mode: 'light' | 'dark';
  desc: string;
  /** 設定画面のプレビュー用。左から 地・パネル・アクセント */
  preview: [string, string, string];
}

export const THEMES: ThemeMeta[] = [
  {
    id: 'ledger-light',
    name: 'Ledger Light',
    mode: 'light',
    desc: '白地に深緑。表計算ソフトに最も近い既定の配色。',
    preview: ['#f5f8f6', '#ffffff', '#10794a'],
  },
  {
    id: 'paper',
    name: 'Paper',
    mode: 'light',
    desc: '白地に濃い青。色味を抑えた中性的な配色。',
    preview: ['#f6f7f9', '#ffffff', '#3b62d9'],
  },
  {
    id: 'orchid-light',
    name: 'Orchid Light',
    mode: 'light',
    desc: '白地に紫。緑の補色で、意味を持つ色と混ざりにくい。',
    preview: ['#f8f6fa', '#ffffff', '#8b3fd4'],
  },
  {
    id: 'slate',
    name: 'Slate & Signal',
    mode: 'dark',
    desc: '暗い地に青。以前の既定配色。',
    preview: ['#0f1420', '#171d2b', '#4f7cff'],
  },
  {
    id: 'orchid',
    name: 'Orchid',
    mode: 'dark',
    desc: '暗い地に紫。Orchid Light と同じ色相の暗い版。',
    preview: ['#131019', '#1c1826', '#b45ce8'],
  },
  {
    id: 'ledger',
    name: 'Ledger',
    mode: 'dark',
    desc: '暗い地に緑。Ledger Light と同じ色相の暗い版。',
    preview: ['#0d1512', '#141f1b', '#21a366'],
  },
];

export const DEFAULT_THEME: ThemeId = 'ledger-light';

const VALID = new Set<string>(THEMES.map((t) => t.id));

/** 保存値が未知のテーマ名でも既定へ落として画面が壊れないようにする */
export function normalizeTheme(value: unknown): ThemeId {
  return typeof value === 'string' && VALID.has(value)
    ? (value as ThemeId)
    : DEFAULT_THEME;
}

/** `<html data-theme="...">` を差し替えて配色を切り替える */
export function applyTheme(theme: ThemeId): void {
  document.documentElement.dataset.theme = theme;
}
