import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Upload,
  Target,
  ArrowLeftRight,
  Download,
  Table2,
  FileText,
  Folders,
  Calculator,
  Sparkles,
  MousePointerClick,
} from 'lucide-react';
import { useStore, type Step, type View } from '../state/store';
import { tourStepsFor, type TourStep } from '../core/tour';
import { createTranslator, type TranslationKey } from '../core/i18n';

const PAD = 6;
const CARD_WIDTH = 330;
/**
 * 吹き出しカードの初回配置に使うおおよその高さ。
 * 実際の高さは描画後に測り直して補正する(`waitHint` の有無などで
 * 実高さが変わり、これより低く見積もると対象ボタンに被ってしまうため)。
 */
const CARD_EST_HEIGHT = 210;

const FLOW_STEPS: {
  icon: LucideIcon;
  label: TranslationKey;
  note: TranslationKey;
}[] = [
  {
    icon: Upload,
    label: 'tour.intro.flow.upload.label',
    note: 'tour.intro.flow.upload.note',
  },
  {
    icon: Target,
    label: 'tour.intro.flow.destination.label',
    note: 'tour.intro.flow.destination.note',
  },
  {
    icon: ArrowLeftRight,
    label: 'tour.intro.flow.mapping.label',
    note: 'tour.intro.flow.mapping.note',
  },
  {
    icon: Download,
    label: 'tour.intro.flow.export.label',
    note: 'tour.intro.flow.export.note',
  },
];

const SERVICE_INTRO_ITEMS: {
  icon: LucideIcon;
  title: TranslationKey;
  body: TranslationKey;
}[] = [
  {
    icon: Table2,
    title: 'tour.intro.service.table.title',
    body: 'tour.intro.service.table.body',
  },
  {
    icon: FileText,
    title: 'tour.intro.service.text.title',
    body: 'tour.intro.service.text.body',
  },
  {
    icon: Folders,
    title: 'tour.intro.service.templates.title',
    body: 'tour.intro.service.templates.body',
  },
  {
    icon: Calculator,
    title: 'tour.intro.service.formulas.title',
    body: 'tour.intro.service.formulas.body',
  },
];

function screenKeyOf(view: View, step: Step | undefined): string {
  return `${view}:${step ?? ''}`;
}

/** OS/ブラウザで「視差効果を減らす」設定なら瞬間移動にする */
function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * ガイドが次のコマへ進んだとき、対象要素まで画面をスクロールして視線を誘導する。
 * 一気に飛ばすと今どこを見ているのか分からなくなるため、滑らかに動かして
 * 「上に動いている」「下に動いている」が目で追えるようにする。
 * すでに十分見えている位置なら動かさない(不要な揺れを防ぐ)。
 */
function scrollStepIntoView(el: Element): void {
  const rect = el.getBoundingClientRect();
  // 吹き出しカードの高さぶんの余白を確保して「見えている」を判定する
  const margin = Math.min(200, window.innerHeight * 0.28);
  const comfortablyVisible =
    rect.top >= margin && rect.bottom <= window.innerHeight - margin;
  if (comfortablyVisible) return;

  el.scrollIntoView({
    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    block: 'center',
    inline: 'nearest',
  });
}

/**
 * 操作画面に重ねるガイドツアー。
 *
 * 設計方針:
 *  - まず全体紹介のポップアップを見せ、「操作方法を学ぶ」で手順ガイドへ進む。
 *  - ガイドがユーザーを追い越さないようにする。インポート先の選択・変換の実行・
 *    ダウンロード・タブ移動といった「ユーザー自身がやるべき操作」のコマでは
 *    進むボタンを出さず、実際に操作されるまで待つ(TourStep.waitFor)。
 *  - タブ移動も自動では行わない。該当タブをハイライトして、ユーザーに押させる。
 *  - ハイライトは装飾のみ(pointer-events: none)なので実画面をそのまま触れる。
 *  - 一度案内した画面は、このツアー中は再表示しない(戻っても繰り返さない)。
 */
export function GuidedTour() {
  const tourActive = useStore((s) => s.tourActive);
  const tourNonce = useStore((s) => s.tourNonce);
  const view = useStore((s) => s.view);
  const locale = useStore((s) => s.settings.locale);
  const step = useStore((s) => s.step);
  const closeTour = useStore((s) => s.closeTour);
  const loadDemoSource = useStore((s) => s.loadDemoSource);

  const screenKey = screenKeyOf(view, step);

  // ツアーの1回分のセッション。startTour のたびに nonce が変わるので、
  // 「一度終えた後に使い方ボタンで開き直す」ケースも確実に初期化される。
  const [session, setSession] = useState(() => ({
    nonce: -1,
    phase: 'idle' as 'idle' | 'intro' | 'steps',
    seen: new Set<string>(),
    lastScreen: screenKey,
  }));

  if (tourActive && session.nonce !== tourNonce) {
    setSession({
      nonce: tourNonce,
      phase: 'intro',
      seen: new Set(),
      lastScreen: screenKey,
    });
  } else if (tourActive && session.lastScreen !== screenKey) {
    // 操作待ちのまま画面が変わった = その画面の案内は役目を終えた
    const seen = new Set(session.seen);
    seen.add(session.lastScreen);
    setSession({ ...session, seen, lastScreen: screenKey });
  }

  const finishScreen = (key: string, skipped: boolean, isFinal: boolean) => {
    // ソース案内を「進む」で終えた時だけ、体験用のサンプルデータを読み込む。
    // スキップした人にデータを押し付けない。実データがある場合も上書きしない。
    if (
      !skipped &&
      key === screenKeyOf('app', 'source') &&
      !useStore.getState().source
    ) {
      void loadDemoSource();
    }

    const seen = new Set(session.seen);
    seen.add(key);
    setSession({ ...session, seen });

    if (isFinal && !skipped) closeTour();
  };

  if (!tourActive || session.phase === 'idle') return null;
  if (session.phase === 'intro') {
    return (
      <IntroModal
        locale={locale}
        onStart={() => setSession({ ...session, phase: 'steps' })}
        onSkip={closeTour}
      />
    );
  }

  return (
    <TourSteps
      locale={locale}
      view={view}
      step={step}
      screenKey={screenKey}
      seen={session.seen}
      onFinishScreen={finishScreen}
      onHardClose={closeTour}
    />
  );
}

function IntroModal({
  locale,
  onStart,
  onSkip,
}: {
  locale: 'en' | 'ja';
  onStart: () => void;
  onSkip: () => void;
}) {
  const t = createTranslator(locale);
  return (
    <div className="intro-overlay">
      <div className="intro-card">
        <header className="intro-head">
          <span
            className="intro-badge"
            aria-hidden="true"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Sparkles size={20} />
          </span>
          <div>
            <h3>{t('tour.intro.title')}</h3>
            <p>{t('tour.intro.description')}</p>
          </div>
        </header>

        <section className="intro-section">
          <h4>{t('tour.intro.flowHeading')}</h4>
          <div className="intro-flow">
            {FLOW_STEPS.map((s, i) => {
              const FlowIcon = s.icon;
              return (
                <div className="intro-flow-cell" key={t(s.label)}>
                  <div className="intro-flow-step">
                    <span
                      className="intro-flow-icon"
                      aria-hidden="true"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <FlowIcon size={20} />
                    </span>
                    <span className="intro-flow-num">{i + 1}</span>
                    <span className="intro-flow-label">{t(s.label)}</span>
                    <span className="intro-flow-note">{t(s.note)}</span>
                  </div>
                  {i < FLOW_STEPS.length - 1 && (
                    <span className="intro-flow-arrow" aria-hidden="true">
                      →
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section className="intro-section">
          <h4>{t('tour.intro.servicesHeading')}</h4>
          <div className="intro-item-list">
            {SERVICE_INTRO_ITEMS.map((item) => {
              const ItemIcon = item.icon;
              return (
                <div className="intro-item" key={t(item.title)}>
                  <span
                    className="intro-item-icon"
                    aria-hidden="true"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <ItemIcon size={20} />
                  </span>
                  <div className="intro-item-text">
                    <span className="intro-item-title">{t(item.title)}</span>
                    <span className="intro-item-body">{t(item.body)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <p className="intro-foot-note">{t('tour.intro.note')}</p>

        <footer className="intro-actions">
          <button type="button" className="ghost" onClick={onSkip}>
            {t('tour.intro.skip')}
          </button>
          <button type="button" className="primary" onClick={onStart}>
            {t('tour.intro.start')}
          </button>
        </footer>
      </div>
    </div>
  );
}

function TourSteps({
  locale,
  view,
  step,
  screenKey,
  seen,
  onFinishScreen,
  onHardClose,
}: {
  locale: 'en' | 'ja';
  view: View;
  step: Step;
  screenKey: string;
  seen: Set<string>;
  onFinishScreen: (key: string, skipped: boolean, isFinal: boolean) => void;
  onHardClose: () => void;
}) {
  const exportedOnce = useStore((s) => s.exportedOnce);
  const steps = useMemo(
    () => tourStepsFor(locale, view, step),
    [locale, view, step],
  );

  const [local, setLocal] = useState({ key: screenKey, index: 0 });
  // 画面が変わったら、レンダー中にこの画面用のインデックスへリセットする
  if (local.key !== screenKey) {
    setLocal({ key: screenKey, index: 0 });
  }

  const current = seen.has(screenKey) ? undefined : steps[local.index];
  const [rect, setRect] = useState<DOMRect | null>(null);

  useLayoutEffect(() => {
    if (!current) return;
    const update = () => {
      const el = document.querySelector(`[data-tour="${current.selector}"]`);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    // レイアウトの変化(データ読み込み等)を安価に追従する
    const id = window.setInterval(update, 300);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      window.clearInterval(id);
      // ここで rect を消すとコマの切り替わりで一瞬中央に飛んで見えるため、
      // 次のコマの update() が測り直すまで前の位置を保つ。
    };
  }, [current]);

  // コマが変わるたびに、対象要素が見える位置まで滑らかにスクロールする。
  // データ読み込み直後などで要素がまだ無いことがあるので、少しの間だけ待つ。
  useEffect(() => {
    if (!current) return;
    let cancelled = false;
    let timer = 0;
    const attempt = (tries: number) => {
      if (cancelled) return;
      const el = document.querySelector(`[data-tour="${current.selector}"]`);
      if (el) {
        scrollStepIntoView(el);
        return;
      }
      if (tries < 12) timer = window.setTimeout(() => attempt(tries + 1), 100);
    };
    attempt(0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [current]);

  if (!current) return null;

  const isLast = local.index === steps.length - 1;
  // 操作待ちのコマでは進むボタンを出さない。
  // 'export' はダウンロードが済んだ時点で進めるようにする。
  const waiting =
    current.waitFor === 'screen' ||
    (current.waitFor === 'export' && !exportedOnce);

  const handleNext = () => {
    if (isLast) onFinishScreen(screenKey, false, !!current.final);
    else setLocal((s) => ({ ...s, index: s.index + 1 }));
  };
  const handlePrev = () =>
    setLocal((s) => ({ ...s, index: Math.max(0, s.index - 1) }));

  return (
    <div className="tour-root">
      {rect && <TourSpotlight rect={rect} />}
      <TourCard
        rect={rect}
        step={current}
        index={local.index}
        total={steps.length}
        isLast={isLast}
        waiting={waiting}
        onPrev={local.index > 0 ? handlePrev : undefined}
        onNext={handleNext}
        onSkipScreen={() => onFinishScreen(screenKey, true, !!current.final)}
        locale={locale}
        onHardClose={onHardClose}
      />
    </div>
  );
}

function TourSpotlight({ rect }: { rect: DOMRect }) {
  const top = rect.top - PAD;
  const bottom = rect.bottom + PAD;
  const left = rect.left - PAD;
  const right = rect.right + PAD;
  return (
    <>
      <div
        className="tour-mask"
        style={{ top: 0, left: 0, right: 0, height: Math.max(0, top) }}
      />
      <div
        className="tour-mask"
        style={{ top: bottom, left: 0, right: 0, bottom: 0 }}
      />
      <div
        className="tour-mask"
        style={{
          top,
          left: 0,
          width: Math.max(0, left),
          height: rect.height + PAD * 2,
        }}
      />
      <div
        className="tour-mask"
        style={{ top, left: right, right: 0, height: rect.height + PAD * 2 }}
      />
      <div
        className="tour-spot"
        style={{
          top,
          left,
          width: rect.width + PAD * 2,
          height: rect.height + PAD * 2,
        }}
      />
    </>
  );
}

function TourCard({
  rect,
  step,
  index,
  total,
  isLast,
  waiting,
  onPrev,
  onNext,
  onSkipScreen,
  onHardClose,
  locale,
}: {
  rect: DOMRect | null;
  step: TourStep;
  index: number;
  total: number;
  isLast: boolean;
  waiting: boolean;
  onPrev?: () => void;
  onNext: () => void;
  onSkipScreen: () => void;
  onHardClose: () => void;
  locale: 'en' | 'ja';
}) {
  const t = createTranslator(locale);
  const cardRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState(() => cardStyle(rect, CARD_EST_HEIGHT));

  // 見積もり高さで一旦配置した後、実際の高さで測り直して補正する。
  // useLayoutEffect 内なので、ペイント前に反映されチラつきは出ない。
  useLayoutEffect(() => {
    const height = cardRef.current?.offsetHeight ?? CARD_EST_HEIGHT;
    setStyle(cardStyle(rect, height));
  }, [rect, step, waiting]);

  return (
    <div className="tour-card" ref={cardRef} style={style}>
      <div className="tour-card-head">
        <span className="tour-step-count">
          {index + 1} / {total}
        </span>
        <button
          type="button"
          className="icon"
          title={t('tour.close')}
          onClick={onHardClose}
        >
          ×
        </button>
      </div>
      <h4>{step.title}</h4>
      <p>{step.body}</p>

      {waiting && step.waitHint && (
        <p className="tour-wait-hint">
          <span
            aria-hidden="true"
            style={{
              display: 'inline-flex',
              verticalAlign: 'middle',
              marginRight: 4,
            }}
          >
            <MousePointerClick size={16} />
          </span>
          {step.waitHint}
        </p>
      )}

      <div className="tour-card-actions">
        {onPrev ? (
          <button type="button" className="ghost" onClick={onPrev}>
            {t('tour.previous')}
          </button>
        ) : (
          <button type="button" className="ghost" onClick={onSkipScreen}>
            {t('tour.intro.skip')}
          </button>
        )}
        {waiting ? (
          <span className="tour-waiting-label">{t('tour.waiting')}</span>
        ) : (
          <button type="button" className="primary" onClick={onNext}>
            {step.primaryLabel ?? (isLast ? t('tour.done') : t('tour.next'))}
          </button>
        )}
      </div>
    </div>
  );
}

function cardStyle(
  rect: DOMRect | null,
  cardHeight: number,
): {
  top: number;
  left: number;
  width: number;
} {
  const margin = 14;
  if (!rect) {
    const left = Math.max(margin, (window.innerWidth - CARD_WIDTH) / 2);
    return {
      top: window.innerHeight / 2 - cardHeight / 2,
      left,
      width: CARD_WIDTH,
    };
  }
  // 対象の下に入りきるなら下、無理なら上に置く(実測した cardHeight で判定)
  const spaceBelow = window.innerHeight - rect.bottom;
  const rawTop =
    spaceBelow > cardHeight + margin
      ? rect.bottom + margin
      : rect.top - margin - cardHeight;
  // スクロール中も含め、カードが画面外へ出て見失われないよう常に収める
  const maxTop = Math.max(margin, window.innerHeight - cardHeight - margin);
  const top = Math.min(Math.max(margin, rawTop), maxTop);
  const maxLeft = Math.max(margin, window.innerWidth - CARD_WIDTH - margin);
  const left = Math.min(Math.max(margin, rect.left), maxLeft);
  return { top, left, width: CARD_WIDTH };
}
