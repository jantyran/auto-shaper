import type { Locale } from './settings';

export const messages = {
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
    'document.title': 'Auto Shaper — Data shaping',
    'status.rows': '{count} rows processed',
    'demo.banner': 'You are exploring with demo data (not your real data).',
    'demo.startOwn': 'Start with my data',
    'view.app.description':
      'Shape differently formatted Excel and CSV files for their destination. Standardize inconsistent labels, split names, and check duplicates.',
    'view.text.description':
      'Paste text such as inquiry emails to sort it into template fields and organize it in a table.',
    'view.admin.description': 'Add and edit destination formats freely.',
    'view.formula.description':
      'Review formulas, branches, and field references available for auto-fill rules.',
    'view.settings.description':
      'Manage feature toggles, AI (LLM) connections, and masking here.',
    'source.heading': '1. Upload source data',
    'source.description':
      'Upload files with varying formats, such as agency lists and survey results, as they are. Files split by month or sheets for each branch are combined into one table.',
    'source.dropTitle': 'Drop files here, or click to choose files',
    'source.dropHint':
      'CSV / Excel (.xlsx, .xls) / TSV — add multiple files with the same shape at once. Header rows are detected automatically, even when a title row appears above them.',
    'source.security':
      'Uploaded files are processed only in your browser. No real data is sent to a server or AI.',
    'mapping.recipe.defaultName': 'Recipe',
    'mapping.recipe.prompt': 'Enter a recipe name',
    'mapping.backToTarget': '← Choose destination again',
    'mapping.saveRecipe': '🔁 Save as recipe',
    'mapping.requiredHint': 'Assign all required fields',
    'mapping.convert': 'Convert with these settings →',
    'result.backToMapping': '← Edit mapping',
    'result.reset': 'Start over',
    'footer.by': 'Shaped by Shotaroh Horiguchi',
    'footer.license': 'MIT License',
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
    'document.title': 'Auto Shaper — データ整形',
    'status.rows': '{count}行を処理しました',
    'demo.banner': '🧪 デモデータで操作を体験中です（実データではありません）',
    'demo.startOwn': '自分のデータで始める',
    'view.app.description':
      '毎回フォーマットが違うExcel/CSVを、取り込み先の形式に合わせて整形します。表記ゆれの統一・姓名の分割・重複チェックまで。',
    'view.text.description':
      '問合せメールなどの文章を貼り付けると、テンプレートの項目へ振り分けて表形式に整理します。',
    'view.admin.description':
      'インポート先（整形後）のフォーマットを自由に追加・編集できます。',
    'view.formula.description':
      '自動記入ルールで使える式、分岐、フィールド参照の書き方を確認できます。',
    'view.settings.description':
      '機能のON/OFF、AI(LLM)接続、マスキングをここで管理します。',
    'source.heading': '1. 整形前のデータをアップロード',
    'source.description':
      '代理店リスト、アンケート結果など、フォーマットがバラバラなファイルをそのまま投入してください。月次で分かれたファイルや、支店ごとのシートは、まとめて投入すると1つの表として整形します。',
    'source.dropTitle': 'ここにファイルをドロップ、またはクリックして選択',
    'source.dropHint':
      'CSV / Excel (.xlsx, .xls) / TSV — 同じ形のファイルは複数まとめて投入できます。見出し行は自動で判定します（上にタイトル行があってもOK）',
    'source.security':
      'アップロードしたファイルはブラウザ内でのみ処理されます。サーバーやAIへ実データを送信しません。',
    'mapping.recipe.defaultName': 'レシピ',
    'mapping.recipe.prompt': 'レシピ名を入力してください',
    'mapping.backToTarget': '← インポート先を選び直す',
    'mapping.saveRecipe': '🔁 レシピとして保存',
    'mapping.requiredHint': '必須項目を割り当ててください',
    'mapping.convert': 'この内容で変換する →',
    'result.backToMapping': '← マッピングを修正',
    'result.reset': '最初からやり直す',
    'footer.by': 'Shaped by Shotaroh Horiguchi',
    'footer.license': 'MIT License',
  },
} as const;

export type TranslationKey = keyof (typeof messages)['en'];

export type TranslationValues = Record<string, string | number>;

export function createTranslator(locale: Locale) {
  return (key: TranslationKey, values?: TranslationValues): string => {
    const message = messages[locale][key];
    if (!values) return message;
    return message.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
      name in values ? String(values[name]) : placeholder,
    );
  };
}
