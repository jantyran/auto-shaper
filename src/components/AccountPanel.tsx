/**
 * アカウント欄(設定ページの先頭)。
 *
 * 未ログイン: メール+パスワードでログイン/新規登録。ログインしなくても
 *   アプリは使え、テンプレート/レシピは localStorage に保存される。
 * ログイン済み: アカウント情報の表示とログアウト。ログイン中はテンプレート/
 *   レシピがサーバー(DB)に保存され、複数端末で共有できる。
 */
import { useState } from 'react';
import { useStore } from '../state/store';
import { isValidEmail } from '../core/auth';
import { getApiBase, setApiBase } from '../core/apiBase';
import { resetStorageModeCache } from '../core/schemaRepository';

type Mode = 'login' | 'signup';

export function AccountPanel() {
  const user = useStore((s) => s.user);
  const storageMode = useStore((s) => s.storageMode);
  const signIn = useStore((s) => s.signIn);
  const signUp = useStore((s) => s.signUp);
  const signOut = useStore((s) => s.signOut);

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  if (user) {
    return (
      <div className="panel">
        <h2>アカウント</h2>
        <ConnectionField />
        <p className="subtitle">
          ログイン中はテンプレートとレシピが<b>サーバー(DB)に保存</b>され、複数端末で共有できます。
        </p>
        <div className="account-row">
          <div>
            <div className="toggle-title">{user.email}</div>
            <div className="toggle-desc">
              保存先: {storageMode === 'api' ? 'サーバー(DB)' : 'localStorage(サーバー未接続)'}
            </div>
          </div>
          <button className="ghost" onClick={() => void signOut()}>
            ログアウト
          </button>
        </div>
      </div>
    );
  }

  const submit = async () => {
    setError(undefined);
    if (!isValidEmail(email)) {
      setError('メールアドレスの形式が正しくありません。');
      return;
    }
    if (password.length < 8) {
      setError('パスワードは8文字以上にしてください。');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'signup') await signUp(email, password);
      else await signIn(email, password);
      setPassword('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ログインに失敗しました。');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <h2>アカウント</h2>
      <ConnectionField />
      <p className="subtitle">
        ログインは任意です。<b>ログインしなくても利用でき</b>、テンプレート/レシピはこのブラウザ
        (localStorage)に保存されます。ログインすると<b>サーバー(DB)に保存</b>され、複数端末で
        共有できます（保存されるのはテンプレート定義とマッピングのみで、実データは送信しません）。
      </p>

      <div className="auth-tabs">
        <button
          className={`navbtn${mode === 'login' ? ' active' : ''}`}
          onClick={() => {
            setMode('login');
            setError(undefined);
          }}
        >
          ログイン
        </button>
        <button
          className={`navbtn${mode === 'signup' ? ' active' : ''}`}
          onClick={() => {
            setMode('signup');
            setError(undefined);
          }}
        >
          新規登録
        </button>
      </div>

      <div className="settings-grid" style={{ marginTop: 12 }}>
        <label className="field-label" style={{ gridColumn: '1 / -1' }}>
          メールアドレス
          <input
            type="email"
            value={email}
            autoComplete="username"
            placeholder="you@example.com"
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="field-label" style={{ gridColumn: '1 / -1' }}>
          パスワード（8文字以上）
          <input
            type="password"
            value={password}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            placeholder="••••••••"
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit();
            }}
          />
        </label>
      </div>

      {error && (
        <div className="alert error" style={{ marginTop: 12 }}>
          {error}
        </div>
      )}

      <div className="btn-row">
        <button className="primary" onClick={() => void submit()} disabled={busy}>
          {busy ? '処理中…' : mode === 'signup' ? '登録してログイン' : 'ログイン'}
        </button>
      </div>

      <div className="security-note" style={{ marginTop: 8 }}>
        パスワードはサーバーで scrypt によりハッシュ化して保存され、平文は保持されません。
        バックエンド(<code>npm run server</code>)が起動していない場合、ログインは利用できません
        （その場合も localStorage 保存でそのまま使えます）。
      </div>
    </div>
  );
}

/**
 * APIサーバーの接続先URL設定。
 * Vite開発サーバー(5173)や同一オリジン配信なら空欄でOK(相対パスで届く)。
 * Live Server(例: 5502)など別オリジンで開く場合は、APIサーバーのURL
 * (例: http://localhost:8787)を入れると、そこへ直接アクセスする。
 */
function ConnectionField() {
  const [base, setBase] = useState(getApiBase());
  const [saved, setSaved] = useState(false);

  const commit = (value: string) => {
    setApiBase(value);
    resetStorageModeCache(); // 疎通判定キャッシュを作り直す
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  // いま開いているホストの :8787 を自動入力(リモートIPやLive Server対策)
  const guessFromHost = `${window.location.protocol}//${window.location.hostname}:8787`;
  const useThisHost = () => {
    setBase(guessFromHost);
    commit(guessFromHost);
  };

  return (
    <div className="conn-field">
      <label className="field-label" style={{ maxWidth: 560 }}>
        APIサーバーURL（別オリジン/別ホストで開いている場合に設定）
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="text"
            style={{ flex: 1 }}
            value={base}
            placeholder="空欄=同一オリジン/開発サーバー（例: http://localhost:8787）"
            onChange={(e) => setBase(e.target.value)}
            onBlur={(e) => commit(e.target.value)}
          />
          <button type="button" onClick={() => commit(base)}>
            {saved ? '✓ 保存' : '保存'}
          </button>
        </div>
      </label>
      <div style={{ margin: '6px 0 8px' }}>
        <button type="button" className="ghost" onClick={useThisHost}>
          このホストの :8787 を使う（{guessFromHost}）
        </button>
      </div>
      <p className="subtitle" style={{ margin: '0 0 12px' }}>
        <b>APIサーバー</b>は <code>npm run server</code> で動く Node サーバー(既定ポート8787)で、SQLite を読み書きします。
        ブラウザは SQLite に直接ではなく、この API サーバー経由で保存します。<br />
        Vite開発サーバー(<code>localhost:5173</code>)や同一オリジン配信なら<b>空欄でOK</b>です。
        Live Server(<code>:5502</code>)や<b>リモートIP</b>(例 <code>http://133.18.123.87:5502</code>)で開く場合は、
        同じホストの <code>:8787</code>(<code>http://&lt;このホスト&gt;:8787</code>) を指定してください
        （上のボタンで自動入力できます）。そのホストで <code>npm run server</code> を起動し、
        ポート8787が到達可能である必要があります。設定後にログインし直すと反映されます。
      </p>
    </div>
  );
}
