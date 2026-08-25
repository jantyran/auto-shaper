import type { Step, View } from '../state/store';

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
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'source-upload',
    view: 'app',
    step: 'source',
    selector: 'tour-source-upload',
    title: 'ようこそ',
    body: '雑多なExcel/CSVをここにドラッグ&ドロップすると読み込みが始まります。列名や形式がバラバラでも大丈夫です。',
  },
  {
    id: 'source-security',
    view: 'app',
    step: 'source',
    selector: 'tour-source-security',
    title: 'データの扱いについて',
    body: 'アップロードした実データはこのブラウザ内だけで処理されます。AIに渡すのは後の画面で列名と匿名化したサンプルだけです。',
  },
  {
    id: 'target-panel',
    view: 'app',
    step: 'target',
    selector: 'tour-target-panel',
    title: '2. インポート先を選ぶ',
    body: '取り込みたいフォーマット(プリセット・独自アップロード・保存済みテンプレート)を選ぶと、列名からマッピング候補を自動で作ります。',
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
    id: 'mapping-rows',
    view: 'app',
    step: 'mapping',
    selector: 'tour-mapping-rows',
    title: '3. 項目ごとに変換方法を確認',
    body: '各項目の下に、実際のデータでどう変換されるかのミニプレビューが出ます。確信度が低い項目や結果がおかしい項目だけ直せばOKです。',
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
    id: 'result-stats',
    view: 'app',
    step: 'result',
    selector: 'tour-result-stats',
    title: '4. 変換して出力',
    body: 'ここで全件を変換します。必須項目の欠落やメール/電話の形式エラーがあれば件数と内容が表示されます。',
  },
  {
    id: 'result-export',
    view: 'app',
    step: 'result',
    selector: 'tour-result-export',
    title: 'ダウンロード',
    body: '内容を確認できたらCSVまたはExcelでダウンロードしてください。変換はすべてブラウザ内で完結しており、外部には送信されません。',
  },
];

export function tourStepsFor(view: View, step: Step | undefined): TourStep[] {
  return TOUR_STEPS.filter(
    (s) => s.view === view && (s.view !== 'app' || s.step === step),
  );
}
