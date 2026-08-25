import type { Step, View } from '../state/store';

/**
 * ユーザーの操作を待つ種類。
 *  - 'screen': ユーザーが画面を進める操作(カード選択・変換実行・タブ移動)をするまで待つ。
 *              進むボタンは出さず、画面が変わったら次のコマへ自然に切り替わる。
 *  - 'export': ダウンロードが実行されるまで進むボタンを出さない。
 */
export type TourWaitFor = 'screen' | 'export';

/** 操作画面に重ねるガイドツアーの1コマ */
export interface TourStep {
  id: string;
  view: View;
  /** view === 'app' のときのみ判定対象 */
  step?: Step;
  /** ハイライト対象要素の data-tour 属性値 */
  selector: string;
  title: string;
  body: string;
  /** 進むボタンの文言。未指定なら「次へ」/「わかった」を自動で出し分ける */
  primaryLabel?: string;
  /** ユーザーの操作を待つコマ。ガイドが先行しないよう進むボタンを抑制する */
  waitFor?: TourWaitFor;
  /** 待っている間に出す操作の指示 */
  waitHint?: string;
  /** ツアー全体の最後のコマ(進むと終了する) */
  final?: boolean;
}

export const TOUR_STEPS: TourStep[] = [
  // ── 1. ソース投入 ──────────────────────────────────────────
  {
    id: 'source-upload',
    view: 'app',
    step: 'source',
    selector: 'tour-source-upload',
    title: 'ようこそ',
    body: '雑多なExcel/CSVをここにドラッグ&ドロップすると読み込みが始まります。実データはこのブラウザ内だけで処理され、外部には送信されません。まずは「サンプルで試す」で、表記ゆれのある名刺リスト5件を使って一連の流れを体験してみましょう。',
    primaryLabel: 'サンプルで試す →',
  },

  // ── 2. インポート先選択(ユーザーがカードを選ぶまで待つ) ──
  {
    id: 'target-panel',
    view: 'app',
    step: 'target',
    selector: 'tour-target-panel',
    title: '2. インポート先を選ぶ',
    body: '整形後のデータをどのフォーマットに合わせるかを指定します。選ぶと、列名からマッピング候補が自動で作られます。',
    waitFor: 'screen',
    waitHint:
      'この中からインポート先を1つクリックしてください（例: Salesforce — リード）',
  },

  // ── 3. マッピング確認 ──────────────────────────────────────
  {
    id: 'mapping-rows',
    view: 'app',
    step: 'mapping',
    selector: 'tour-mapping-rows',
    title: '3. 項目ごとに変換方法を確認',
    body: '各項目の下に、実際のデータでどう変換されるかのミニプレビューが出ます。確信度が低い項目や結果がおかしい項目だけ直せばOKです。',
  },
  {
    id: 'mapping-context',
    view: 'app',
    step: 'mapping',
    selector: 'tour-mapping-context',
    title: '今回だけの追加情報',
    body: '元ファイルに無い情報(展示会名など)をこの回だけ式に渡せます。ただし効くのは、管理画面でその項目に自動記入ルールを設定し、式に{Import.キー}を書いた場合だけです。',
  },
  {
    id: 'mapping-preview',
    view: 'app',
    step: 'mapping',
    selector: 'tour-mapping-preview',
    title: '全体プレビュー',
    body: '先頭数行が実際にどう変換されるかまとめて確認できます。「空欄の項目を表示」を外すと、未割当の列を消した見え方も確認できます(出力にも反映されます)。',
  },
  {
    id: 'mapping-convert',
    view: 'app',
    step: 'mapping',
    selector: 'tour-mapping-convert',
    title: '全件を変換する',
    body: '内容を確認できたら、この操作で全行をまとめて変換します。変換はブラウザ内で実行されます。',
    waitFor: 'screen',
    waitHint: '「この内容で変換する →」をクリックしてください',
  },

  // ── 4. 変換・出力(ダウンロードするまで待つ) ────────────────
  {
    id: 'result-stats',
    view: 'app',
    step: 'result',
    selector: 'tour-result-stats',
    title: '4. 変換の結果を確認',
    body: '全件を変換しました。必須項目の欠落、メール/電話の形式エラー、選択肢に無い値があれば件数と内容が下に表示されます。重複の可能性がある行もここで気づけます。',
  },
  {
    id: 'result-export',
    view: 'app',
    step: 'result',
    selector: 'tour-result-export',
    title: 'ダウンロードして完了',
    body: '整形済みデータをCSVまたはExcelで書き出せます。ここまでの処理はすべてこのブラウザ内で完結しており、外部には送信されていません。',
    waitFor: 'export',
    waitHint: 'どちらかのダウンロードボタンを実際に押してみてください',
  },
  {
    id: 'nav-text',
    view: 'app',
    step: 'result',
    selector: 'tour-nav-text',
    title: '次はテキスト整形',
    body: '表だけでなく、問合せメールのような文章もテンプレートへ整理できます。',
    waitFor: 'screen',
    waitHint: '「テキスト整形」タブをクリックして移動してください',
  },

  // ── テキスト整形 ───────────────────────────────────────────
  {
    id: 'text-input',
    view: 'text',
    selector: 'tour-text-input',
    title: 'テキスト整形',
    body: '問合せメールなどの雑多な文章をそのまま貼り付け、必要ならマスクしてから「AIで整形する」を押すと、選んだテンプレートの項目へ自動で振り分けます。',
  },
  {
    id: 'text-results',
    view: 'text',
    selector: 'tour-text-results',
    title: '結果をためて出力',
    body: '整形結果は複数件ためられます。各項目はその場で編集でき、最後にまとめてCSV/Excel/テキストとしてコピー・出力できます。',
  },
  {
    id: 'nav-admin',
    view: 'text',
    selector: 'tour-nav-admin',
    title: '次はテンプレート管理',
    body: '整形先のフォーマット(テンプレート)は自由に作れます。',
    waitFor: 'screen',
    waitHint: '「テンプレート管理」タブをクリックして移動してください',
  },

  // ── テンプレート管理 ───────────────────────────────────────
  {
    id: 'admin-toolbar',
    view: 'admin',
    selector: 'tour-admin-toolbar',
    title: 'テンプレート管理',
    body: '取り込み先フォーマット(テンプレート)を自由に追加・編集できます。JSON/CSV/Excelのヘッダー行からも作成でき、エクスポートで他の環境に共有できます。',
  },
  {
    id: 'admin-list',
    view: 'admin',
    selector: 'tour-admin-list',
    title: '項目の自動記入ルール',
    body: '各テンプレートを「編集」して項目を開くと「自動記入ルール」を設定できます。式に{Import.キー}と書くと、表の整形画面の「今回の追加情報」で入力した値を差し込めます。',
  },
  {
    id: 'nav-formula',
    view: 'admin',
    selector: 'tour-nav-formula',
    title: '最後に式リファレンス',
    body: '自動記入ルールで使える式の書き方をまとめてあります。',
    waitFor: 'screen',
    waitHint: '「式リファレンス」タブをクリックして移動してください',
  },

  // ── 式リファレンス(最後) ───────────────────────────────────
  {
    id: 'formula-panel',
    view: 'formula',
    selector: 'tour-formula-panel',
    title: '式リファレンス',
    body: 'テンプレート管理の自動記入ルールで使える式(if/case/文字列連結など)の一覧です。書き方に迷ったらここを確認してください。以上でひと通りの流れは完了です。',
    primaryLabel: 'ツアーを終える',
    final: true,
  },
];

export function tourStepsFor(view: View, step: Step | undefined): TourStep[] {
  return TOUR_STEPS.filter(
    (s) => s.view === view && (s.view !== 'app' || s.step === step),
  );
}
