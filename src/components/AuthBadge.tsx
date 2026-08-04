/**
 * ヘッダーのログイン状態バッジ。
 * 未ログイン: 「ログイン」ボタン(設定ページのアカウント欄へ誘導)。
 * ログイン済み: メールアドレスと保存先(DB同期)の表示。クリックで設定へ。
 */
import { useStore } from '../state/store';

export function AuthBadge() {
  const user = useStore((s) => s.user);
  const authReady = useStore((s) => s.authReady);
  const storageMode = useStore((s) => s.storageMode);
  const setView = useStore((s) => s.setView);

  if (!authReady) return null;

  if (!user) {
    return (
      <button
        className="navbtn auth-badge-btn"
        onClick={() => setView('settings')}
        title="ログインするとテンプレート/レシピをDBに保存できます"
      >
        🔒 ログイン
      </button>
    );
  }

  return (
    <button
      className="auth-badge"
      onClick={() => setView('settings')}
      title="アカウント設定へ"
    >
      <span className="dot" />
      <span className="mail">{user.email}</span>
      <span className="sync">{storageMode === 'api' ? 'DB同期' : 'ローカル'}</span>
    </button>
  );
}
