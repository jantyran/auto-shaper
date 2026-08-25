import { useEffect, useState } from 'react';
import { useStore } from '../state/store';

/** この時間が経つと自動でフェードアウトする(クリックで即スキップも可) */
const AUTO_DISMISS_MS = 1800;
/** フェードアウトの演出時間(この間だけ leaving 状態を見せてから実際に閉じる) */
const FADE_OUT_MS = 320;

/**
 * 初回・未ログイン訪問者にだけ最初に見せる、ブランディング用の全画面エントランス。
 * 「いきなり機能説明が始まる」印象を避けるための一呼吸(演出のみで、操作の説明はしない)。
 */
export function EntranceScreen() {
  const dismissEntrance = useStore((s) => s.dismissEntrance);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setLeaving(true), AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => dismissEntrance(), FADE_OUT_MS);
    return () => window.clearTimeout(timer);
  }, [leaving, dismissEntrance]);

  const skip = () => setLeaving(true);

  return (
    <div
      className={`entrance-overlay${leaving ? ' leaving' : ''}`}
      onClick={skip}
      role="button"
      tabIndex={0}
      aria-label="はじめる"
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') skip();
      }}
    >
      <div className="entrance-content">
        <span className="entrance-mark" aria-hidden="true">
          ✨
        </span>
        <h1 className="entrance-title">Auto Shaper</h1>
        <p className="entrance-tagline">
          雑多なデータを、ブラウザの中だけで整える。
        </p>
        <span className="entrance-hint">クリックしてはじめる</span>
      </div>
    </div>
  );
}
