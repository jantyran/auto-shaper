import type { Locale } from './settings';

const messages = {
  en: {
    'language.choose': 'Choose your language',
    'language.description': 'You can change this anytime in Settings.',
    'language.english': 'English',
    'language.japanese': '日本語',
    'language.label': 'Language',
    'nav.table': 'Data shaping',
    'nav.text': 'Text shaping',
    'nav.templates': 'Templates',
    'nav.formulas': 'Formula reference',
    'nav.settings': 'Settings',
    'nav.tour': 'How it works',
    'app.tag': 'Browser-only — your data never leaves your device',
    'step.source': 'Upload data',
    'step.target': 'Select destination',
    'step.mapping': 'Review mapping',
    'step.result': 'Export results',
    'entrance.tagline': 'Shape messy data, entirely in your browser.',
    'entrance.start': 'Click to start',
    'settings.language.title': 'Language',
    'settings.language.description':
      'Choose the language used throughout the app.',
  },
  ja: {
    'language.choose': '言語を選択',
    'language.description': '設定画面からいつでも変更できます。',
    'language.english': 'English',
    'language.japanese': '日本語',
    'language.label': '表示言語',
    'nav.table': '表の整形',
    'nav.text': 'テキスト整形',
    'nav.templates': 'テンプレート管理',
    'nav.formulas': '式リファレンス',
    'nav.settings': '設定',
    'nav.tour': '使い方',
    'app.tag': 'ブラウザ完結・実データは外部に出ません',
    'step.source': 'ソース投入',
    'step.target': 'インポート先選択',
    'step.mapping': 'マッピング確認',
    'step.result': '変換・出力',
    'entrance.tagline': '雑多なデータを、ブラウザの中だけで整える。',
    'entrance.start': 'クリックしてはじめる',
    'settings.language.title': '表示言語',
    'settings.language.description': 'アプリ全体で使用する言語を選択します。',
  },
} as const;

export type TranslationKey = keyof (typeof messages)['en'];

export function createTranslator(locale: Locale) {
  return (key: TranslationKey): string => messages[locale][key];
}
