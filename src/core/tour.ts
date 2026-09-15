import type { Step, View } from '../state/store';
import { createTranslator, type TourTranslationKey } from './i18n';
import type { Locale } from './settings';

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

type TourStepDefinition = Omit<
  TourStep,
  'title' | 'body' | 'primaryLabel' | 'waitHint'
>;

const TOUR_STEP_DEFINITIONS: TourStepDefinition[] = [
  // ── 1. ソース投入 ──────────────────────────────────────────
  {
    id: 'source-upload',
    view: 'app',
    step: 'source',
    selector: 'tour-source-upload',
  },

  // ── 2. インポート先選択(ユーザーがカードを選ぶまで待つ) ──
  {
    id: 'target-panel',
    view: 'app',
    step: 'target',
    selector: 'tour-target-panel',
    waitFor: 'screen',
  },

  // ── 3. マッピング確認 ──────────────────────────────────────
  {
    id: 'mapping-rows',
    view: 'app',
    step: 'mapping',
    selector: 'tour-mapping-rows',
  },
  {
    id: 'mapping-context',
    view: 'app',
    step: 'mapping',
    selector: 'tour-mapping-context',
  },
  {
    id: 'mapping-preview',
    view: 'app',
    step: 'mapping',
    selector: 'tour-mapping-preview',
  },
  {
    id: 'mapping-convert',
    view: 'app',
    step: 'mapping',
    selector: 'tour-mapping-convert',
    waitFor: 'screen',
  },

  // ── 4. 変換・出力(ダウンロードするまで待つ) ────────────────
  {
    id: 'result-stats',
    view: 'app',
    step: 'result',
    selector: 'tour-result-stats',
  },
  {
    id: 'result-export',
    view: 'app',
    step: 'result',
    selector: 'tour-result-export',
    waitFor: 'export',
  },
  {
    id: 'nav-text',
    view: 'app',
    step: 'result',
    selector: 'tour-nav-text',
    waitFor: 'screen',
  },

  // ── テキスト整形 ───────────────────────────────────────────
  {
    id: 'text-input',
    view: 'text',
    selector: 'tour-text-input',
  },
  {
    id: 'text-results',
    view: 'text',
    selector: 'tour-text-results',
  },
  {
    id: 'nav-admin',
    view: 'text',
    selector: 'tour-nav-admin',
    waitFor: 'screen',
  },

  // ── テンプレート管理 ───────────────────────────────────────
  {
    id: 'admin-toolbar',
    view: 'admin',
    selector: 'tour-admin-toolbar',
  },
  {
    id: 'admin-list',
    view: 'admin',
    selector: 'tour-admin-list',
  },
  {
    id: 'nav-formula',
    view: 'admin',
    selector: 'tour-nav-formula',
    waitFor: 'screen',
  },

  // ── 式リファレンス(最後) ───────────────────────────────────
  {
    id: 'formula-panel',
    view: 'formula',
    selector: 'tour-formula-panel',
    final: true,
  },
];

const TOUR_COPY_KEYS: Record<
  string,
  {
    title: TourTranslationKey;
    body: TourTranslationKey;
    primaryLabel?: TourTranslationKey;
    waitHint?: TourTranslationKey;
  }
> = {
  'source-upload': {
    title: 'tour.source.title',
    body: 'tour.source.body',
    primaryLabel: 'tour.source.primary',
  },
  'target-panel': {
    title: 'tour.target.title',
    body: 'tour.target.body',
    waitHint: 'tour.target.waitHint',
  },
  'mapping-rows': {
    title: 'tour.mappingRows.title',
    body: 'tour.mappingRows.body',
  },
  'mapping-context': {
    title: 'tour.mappingContext.title',
    body: 'tour.mappingContext.body',
  },
  'mapping-preview': {
    title: 'tour.mappingPreview.title',
    body: 'tour.mappingPreview.body',
  },
  'mapping-convert': {
    title: 'tour.mappingConvert.title',
    body: 'tour.mappingConvert.body',
    waitHint: 'tour.mappingConvert.waitHint',
  },
  'result-stats': {
    title: 'tour.resultStats.title',
    body: 'tour.resultStats.body',
  },
  'result-export': {
    title: 'tour.resultExport.title',
    body: 'tour.resultExport.body',
    waitHint: 'tour.resultExport.waitHint',
  },
  'nav-text': {
    title: 'tour.navText.title',
    body: 'tour.navText.body',
    waitHint: 'tour.navText.waitHint',
  },
  'text-input': { title: 'tour.textInput.title', body: 'tour.textInput.body' },
  'text-results': {
    title: 'tour.textResults.title',
    body: 'tour.textResults.body',
  },
  'nav-admin': {
    title: 'tour.navAdmin.title',
    body: 'tour.navAdmin.body',
    waitHint: 'tour.navAdmin.waitHint',
  },
  'admin-toolbar': {
    title: 'tour.adminToolbar.title',
    body: 'tour.adminToolbar.body',
  },
  'admin-list': { title: 'tour.adminList.title', body: 'tour.adminList.body' },
  'nav-formula': {
    title: 'tour.navFormula.title',
    body: 'tour.navFormula.body',
    waitHint: 'tour.navFormula.waitHint',
  },
  'formula-panel': {
    title: 'tour.formula.title',
    body: 'tour.formula.body',
    primaryLabel: 'tour.formula.primary',
  },
};

export function tourStepsFor(
  locale: Locale,
  view: View,
  step: Step | undefined,
): TourStep[] {
  const t = createTranslator(locale);
  return TOUR_STEP_DEFINITIONS.filter(
    (item) => item.view === view && (item.view !== 'app' || item.step === step),
  ).map((item) => {
    const copy = TOUR_COPY_KEYS[item.id];
    return {
      ...item,
      title: t(copy.title),
      body: t(copy.body),
      primaryLabel: copy.primaryLabel ? t(copy.primaryLabel) : undefined,
      waitHint: copy.waitHint ? t(copy.waitHint) : undefined,
    };
  });
}
