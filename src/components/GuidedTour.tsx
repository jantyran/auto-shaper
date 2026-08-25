import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useStore, type Step, type View } from '../state/store';
import { tourStepsFor, type TourStep } from '../core/tour';

const PAD = 6;
const CARD_WIDTH = 330;
/** 吹き出しカードのおおよその高さ(配置計算用) */
const CARD_EST_HEIGHT = 210;

const FLOW_STEPS = [
  { icon: '📥', label: 'アップロード', note: '雑多なCSV/Excel' },
  { icon: '🎯', label: 'インポート先', note: '出力先を選ぶ' },
  { icon: '🔀', label: 'マッピング', note: 'AIの提案を確認' },
  { icon: '📤', label: '出力', note: 'CSV / Excel' },
];

const SERVICE_INTRO_ITEMS: { icon: string; title: string; body: string }[] = [
  {
    icon: '📊',
    title: '表の整形',
    body: 'バラバラなExcel/CSVのカラムを読み取り、インポート用フォーマットへ自動整形します。',
  },
  {
    icon: '📝',
    title: 'テキスト整形',
    body: '問合せメールなどの文章を、テンプレートの項目へ振り分けて整理します。',
  },
  {
    icon: '🗂️',
    title: 'テンプレート管理',
    body: '取り込み先フォーマットを追加・編集し、自動記入ルールも設定できます。',
  },
  {
    icon: '📐',
    title: '式リファレンス',
    body: '自動記入ルールで使える式(if/caseなど)の書き方を確認できます。',
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
        onStart={() => setSession({ ...session, phase: 'steps' })}
        onSkip={closeTour}
      />
    );
  }

  return (
    <TourSteps
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
  onStart,
  onSkip,
}: {
  onStart: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="intro-overlay">
      <div className="intro-card">
        <header className="intro-head">
          <span className="intro-badge" aria-hidden="true">
            ✨
          </span>
          <div>
            <h3>Auto Shaper へようこそ</h3>
            <p>
              雑多なデータを、<b>ブラウザ内だけ</b>
              で整形して書き出すツールです。実データが外部に送信されることはありません。
            </p>
          </div>
        </header>

        <section className="intro-section">
          <h4>表の整形は、この4ステップ</h4>
          <div className="intro-flow">
            {FLOW_STEPS.map((s, i) => (
              <div className="intro-flow-cell" key={s.label}>
                <div className="intro-flow-step">
                  <span className="intro-flow-icon" aria-hidden="true">
                    {s.icon}
                  </span>
                  <span className="intro-flow-num">{i + 1}</span>
                  <span className="intro-flow-label">{s.label}</span>
                  <span className="intro-flow-note">{s.note}</span>
                </div>
                {i < FLOW_STEPS.length - 1 && (
                  <span className="intro-flow-arrow" aria-hidden="true">
                    →
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="intro-section">
          <h4>4つのタブでできること</h4>
          <div className="intro-item-list">
            {SERVICE_INTRO_ITEMS.map((item) => (
              <div className="intro-item" key={item.title}>
                <span className="intro-item-icon" aria-hidden="true">
                  {item.icon}
                </span>
                <div className="intro-item-text">
                  <span className="intro-item-title">{item.title}</span>
                  <span className="intro-item-body">{item.body}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <p className="intro-foot-note">
          これから、サンプルデータを使って実際の画面を操作しながら案内します。
          操作はあなた自身が進めるので、途中でやめても大丈夫です。
        </p>

        <footer className="intro-actions">
          <button type="button" className="ghost" onClick={onSkip}>
            スキップ
          </button>
          <button type="button" className="primary" onClick={onStart}>
            操作方法を学ぶ →
          </button>
        </footer>
      </div>
    </div>
  );
}

function TourSteps({
  view,
  step,
  screenKey,
  seen,
  onFinishScreen,
  onHardClose,
}: {
  view: View;
  step: Step;
  screenKey: string;
  seen: Set<string>;
  onFinishScreen: (key: string, skipped: boolean, isFinal: boolean) => void;
  onHardClose: () => void;
}) {
  const exportedOnce = useStore((s) => s.exportedOnce);
  const steps = useMemo(() => tourStepsFor(view, step), [view, step]);

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
}) {
  const style = cardStyle(rect);
  return (
    <div className="tour-card" style={style}>
      <div className="tour-card-head">
        <span className="tour-step-count">
          {index + 1} / {total}
        </span>
        <button
          type="button"
          className="icon"
          title="ツアーを閉じる"
          onClick={onHardClose}
        >
          ×
        </button>
      </div>
      <h4>{step.title}</h4>
      <p>{step.body}</p>

      {waiting && step.waitHint && (
        <p className="tour-wait-hint">
          <span aria-hidden="true">👉</span> {step.waitHint}
        </p>
      )}

      <div className="tour-card-actions">
        {onPrev ? (
          <button type="button" className="ghost" onClick={onPrev}>
            ← 前へ
          </button>
        ) : (
          <button type="button" className="ghost" onClick={onSkipScreen}>
            スキップ
          </button>
        )}
        {waiting ? (
          <span className="tour-waiting-label">操作をお待ちしています…</span>
        ) : (
          <button type="button" className="primary" onClick={onNext}>
            {step.primaryLabel ?? (isLast ? 'わかった' : '次へ →')}
          </button>
        )}
      </div>
    </div>
  );
}

function cardStyle(rect: DOMRect | null): {
  top: number;
  left: number;
  width: number;
} {
  const margin = 14;
  if (!rect) {
    const left = Math.max(margin, (window.innerWidth - CARD_WIDTH) / 2);
    return { top: window.innerHeight / 2 - 90, left, width: CARD_WIDTH };
  }
  // 対象の下に入りきるなら下、無理なら上に置く
  const spaceBelow = window.innerHeight - rect.bottom;
  const rawTop =
    spaceBelow > CARD_EST_HEIGHT + margin
      ? rect.bottom + margin
      : rect.top - margin - CARD_EST_HEIGHT;
  // スクロール中も含め、カードが画面外へ出て見失われないよう常に収める
  const maxTop = Math.max(
    margin,
    window.innerHeight - CARD_EST_HEIGHT - margin,
  );
  const top = Math.min(Math.max(margin, rawTop), maxTop);
  const maxLeft = Math.max(margin, window.innerWidth - CARD_WIDTH - margin);
  const left = Math.min(Math.max(margin, rect.left), maxLeft);
  return { top, left, width: CARD_WIDTH };
}
