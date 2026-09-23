/**
 * ヘッダーのログイン状態バッジ。
 * 未ログイン: 「ログイン」ボタン(設定ページのアカウント欄へ誘導)。
 * ログイン済み: メールアドレスと保存先(DB同期)の表示。クリックで設定へ。
 */
import { Lock } from 'lucide-react';
import { useStore } from '../state/store';
import { createTranslator } from '../core/i18n';

export function AuthBadge() {
  const user = useStore((s) => s.user);
  const authReady = useStore((s) => s.authReady);
  const storageMode = useStore((s) => s.storageMode);
  const setView = useStore((s) => s.setView);
  const locale = useStore((s) => s.settings.locale);
  const t = createTranslator(locale);

  if (!authReady) return null;

  if (!user) {
    return (
      <button
        className="navbtn auth-badge-btn"
        onClick={() => setView('settings')}
        title={t('authBadge.signedOutTitle')}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
      >
        <Lock size={14} aria-hidden="true" />
        {t('account.signIn')}
      </button>
    );
  }

  return (
    <button
      className="auth-badge"
      onClick={() => setView('settings')}
      title={t('authBadge.signedInTitle')}
    >
      <span className="dot" />
      <span className="mail">{user.email}</span>
      <span className="sync">
        {storageMode === 'api' ? t('authBadge.sync') : t('authBadge.local')}
      </span>
    </button>
  );
}
