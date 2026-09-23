import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useStore } from '../state/store';
import { createTranslator } from '../core/i18n';

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
  const locale = useStore((s) => s.settings.locale);
  const [leaving, setLeaving] = useState(false);
  const t = createTranslator(locale);

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
      aria-label={t('entrance.start')}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') skip();
      }}
    >
      <div className="entrance-content">
        <span className="entrance-mark" aria-hidden="true">
          <Sparkles size={32} />
        </span>
        <h1 className="entrance-title">Auto Shaper</h1>
        <p className="entrance-tagline">{t('entrance.tagline')}</p>
        <span className="entrance-hint">{t('entrance.start')}</span>
      </div>
    </div>
  );
}
