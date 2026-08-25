import { useLayoutEffect, useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { tourStepsFor } from '../core/tour';

const PAD = 6;
const CARD_WIDTH = 320;

/**
 * 操作画面に重ねるガイドツアー。
 * ハイライトは装飾のみ(pointer-events: none)で、ユーザーは実際の画面を
 * 触りながら進められる。表示中の画面(view/step)が変わると自動で次のコマへ進む。
 */
export function GuidedTour() {
  const tourActive = useStore((s) => s.tourActive);
  const view = useStore((s) => s.view);
  const step = useStore((s) => s.step);
  const closeTour = useStore((s) => s.closeTour);

  const steps = useMemo(() => tourStepsFor(view, step), [view, step]);
  const screenKey = `${view}:${step ?? ''}`;

  const [local, setLocal] = useState({
    key: screenKey,
    index: 0,
    dismissed: false,
  });
  // 画面(view/step)が変わったら、レンダー中にツアーの進行状態をリセットする
  if (local.key !== screenKey) {
    setLocal({ key: screenKey, index: 0, dismissed: false });
  }

  const current = steps[local.index];
  const [rect, setRect] = useState<DOMRect | null>(null);

  useLayoutEffect(() => {
    if (!tourActive || local.dismissed || !current) return;
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
      setRect(null);
    };
  }, [tourActive, local.dismissed, current]);

  if (!tourActive || !current || local.dismissed) return null;

  const isLast = local.index === steps.length - 1;
  const handleNext = () => {
    if (isLast) setLocal((s) => ({ ...s, dismissed: true }));
    else setLocal((s) => ({ ...s, index: s.index + 1 }));
  };
  const handlePrev = () =>
    setLocal((s) => ({ ...s, index: Math.max(0, s.index - 1) }));

  return (
    <div className="tour-root">
      {rect && <TourSpotlight rect={rect} />}
      <TourCard
        rect={rect}
        title={current.title}
        body={current.body}
        index={local.index}
        total={steps.length}
        isLast={isLast}
        onPrev={local.index > 0 ? handlePrev : undefined}
        onNext={handleNext}
        onSkip={closeTour}
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
      <div className="tour-mask" style={{ top: 0, left: 0, right: 0, height: Math.max(0, top) }} />
      <div className="tour-mask" style={{ top: bottom, left: 0, right: 0, bottom: 0 }} />
      <div className="tour-mask" style={{ top, left: 0, width: Math.max(0, left), height: rect.height + PAD * 2 }} />
      <div className="tour-mask" style={{ top, left: right, right: 0, height: rect.height + PAD * 2 }} />
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
  title,
  body,
  index,
  total,
  isLast,
  onPrev,
  onNext,
  onSkip,
}: {
  rect: DOMRect | null;
  title: string;
  body: string;
  index: number;
  total: number;
  isLast: boolean;
  onPrev?: () => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  const style = cardStyle(rect);
  return (
    <div className="tour-card" style={style}>
      <div className="tour-card-head">
        <span className="tour-step-count">
          {index + 1} / {total}
        </span>
        <button type="button" className="icon" title="ツアーを閉じる" onClick={onSkip}>
          ×
        </button>
      </div>
      <h4>{title}</h4>
      <p>{body}</p>
      <div className="tour-card-actions">
        {onPrev ? (
          <button type="button" className="ghost" onClick={onPrev}>
            ← 前へ
          </button>
        ) : (
          <button type="button" className="ghost" onClick={onSkip}>
            スキップ
          </button>
        )}
        <button type="button" className="primary" onClick={onNext}>
          {isLast ? 'わかった' : '次へ →'}
        </button>
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
    const left = Math.max(
      margin,
      (window.innerWidth - CARD_WIDTH) / 2,
    );
    return { top: window.innerHeight / 2 - 90, left, width: CARD_WIDTH };
  }
  const spaceBelow = window.innerHeight - rect.bottom;
  const top =
    spaceBelow > 200
      ? rect.bottom + margin
      : Math.max(margin, rect.top - margin - 190);
  const maxLeft = Math.max(margin, window.innerWidth - CARD_WIDTH - margin);
  const left = Math.min(Math.max(margin, rect.left), maxLeft);
  return { top, left, width: CARD_WIDTH };
}
