/**
 * アカウント欄(設定ページの先頭)。
 *
 * 未ログイン: メール+パスワードでログイン/新規登録。ログインしなくても
 *   アプリは使え、テンプレート/レシピは localStorage に保存される。
 * ログイン済み: アカウント情報の表示とログアウト。ログイン中はテンプレート/
 *   レシピがサーバー(DB)に保存され、複数端末で共有できる。
 */
import { useEffect, useState } from 'react';
import { useStore } from '../state/store';
import { isValidEmail } from '../core/auth';
import { getApiBase, setApiBase } from '../core/apiBase';
import { detectBackend, resetStorageModeCache } from '../core/schemaRepository';
import { createTranslator } from '../core/i18n';

type Mode = 'login' | 'signup';

export function AccountPanel() {
  const user = useStore((s) => s.user);
  const storageMode = useStore((s) => s.storageMode);
  const signIn = useStore((s) => s.signIn);
  const signUp = useStore((s) => s.signUp);
  const signOut = useStore((s) => s.signOut);
  const locale = useStore((s) => s.settings.locale);
  const t = createTranslator(locale);

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  if (user) {
    return (
      <div className="panel">
        <h2>{t('account.heading')}</h2>
        <p className="subtitle">
          {t('account.signedInIntro.before')}
          <b>{t('account.signedInIntro.emphasis')}</b>
          {t('account.signedInIntro.after')}
        </p>
        <div className="account-row">
          <div>
            <div className="toggle-title">{user.email}</div>
            <div className="toggle-desc">
              {t('account.storageLocation')}{' '}
              {storageMode === 'api'
                ? t('account.storage.server')
                : t('account.storage.local')}
            </div>
          </div>
          <button className="ghost" onClick={() => void signOut()}>
            {t('account.signOut')}
          </button>
        </div>
        <ConnectionField />
      </div>
    );
  }

  const submit = async () => {
    setError(undefined);
    if (!isValidEmail(email)) {
      setError(t('account.emailInvalid'));
      return;
    }
    if (password.length < 8) {
      setError(t('account.passwordInvalid'));
      return;
    }
    setBusy(true);
    try {
      if (mode === 'signup') await signUp(email, password);
      else await signIn(email, password);
      setPassword('');
    } catch (e) {
      setError(e instanceof Error ? e.message : t('account.signInFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <h2>{t('account.heading')}</h2>
      <p className="subtitle">
        {t('account.signedOutIntro.before')}
        <b>{t('account.signedOutIntro.emphasis')}</b>
        {t('account.signedOutIntro.middle')}
        <b>{t('account.signedOutIntro.storage')}</b>
        {t('account.signedOutIntro.after')}
      </p>

      <div className="auth-tabs">
        <button
          className={`navbtn${mode === 'login' ? ' active' : ''}`}
          onClick={() => {
            setMode('login');
            setError(undefined);
          }}
        >
          {t('account.signIn')}
        </button>
        <button
          className={`navbtn${mode === 'signup' ? ' active' : ''}`}
          onClick={() => {
            setMode('signup');
            setError(undefined);
          }}
        >
          {t('account.signUp')}
        </button>
      </div>

      <div className="settings-grid" style={{ marginTop: 12 }}>
        <label className="field-label" style={{ gridColumn: '1 / -1' }}>
          {t('account.email')}
          <input
            type="email"
            value={email}
            autoComplete="username"
            placeholder="you@example.com"
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="field-label" style={{ gridColumn: '1 / -1' }}>
          {t('account.password')}
          <input
            type="password"
            value={password}
            autoComplete={
              mode === 'signup' ? 'new-password' : 'current-password'
            }
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
        <button
          className="primary"
          onClick={() => void submit()}
          disabled={busy}
        >
          {busy
            ? t('account.working')
            : mode === 'signup'
              ? t('account.signUpAndSignIn')
              : t('account.signIn')}
        </button>
      </div>

      <div className="security-note" style={{ marginTop: 8 }}>
        {t('account.securityNote.before')}
        <code>npm run server</code>
        {t('account.securityNote.after')}
      </div>
      <ConnectionField />
    </div>
  );
}

/**
 * APIサーバーの接続先URL設定。通常は空欄で、Vite proxy または同一オリジンの
 * 相対パス `/api` を使う。Viteを使わない静的配信などで `/api` が中継されない
 * 場合だけ、APIサーバーの絶対URLを指定する。
 */
function ConnectionField() {
  const locale = useStore((s) => s.settings.locale);
  const t = createTranslator(locale);
  const [base, setBase] = useState(getApiBase());
  const [saved, setSaved] = useState(false);
  // 相対パス /api が既に届いているか(同一オリジン配信/Firebase Hosting等)。
  // 届いているなら「別オリジンのAPIサーバーを指定する」提案は不要かつ有害。
  const [relativeApiOk, setRelativeApiOk] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void detectBackend().then((ok) => {
      if (!cancelled) setRelativeApiOk(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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

  // この提案は http 配信(ローカル開発 / LAN内の自前ホスト)でのみ意味がある。
  // 公開HTTPSサイトでは `npm run server` は http でしか待ち受けないため
  // https://<host>:8787 は必ず失敗し、押した人のアプリを壊すだけになる。
  const canGuessHost = window.location.protocol === 'http:';

  // https ページから http の API を叩くとブラウザに混在コンテンツとして
  // 遮断されるため、保存しても全リクエストが失敗する。
  const mixedContent =
    window.location.protocol === 'https:' && base.trim().startsWith('http://');

  return (
    <details className="conn-field">
      <summary>{t('account.connectionDetails')}</summary>
      <label className="field-label" style={{ maxWidth: 560 }}>
        {t('account.apiServerUrl')}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="text"
            style={{ flex: 1 }}
            value={base}
            placeholder={t('account.apiServerPlaceholder')}
            onChange={(e) => setBase(e.target.value)}
            onBlur={(e) => commit(e.target.value)}
          />
          <button type="button" onClick={() => commit(base)}>
            {saved ? t('account.saved') : t('account.save')}
          </button>
        </div>
      </label>
      {mixedContent && (
        <div className="alert error" style={{ margin: '6px 0 8px' }}>
          {t('account.mixedContent')}
        </div>
      )}
      {canGuessHost && relativeApiOk === false && !base && (
        <div style={{ margin: '6px 0 8px' }}>
          <button type="button" className="ghost" onClick={useThisHost}>
            {t('account.useHost', { host: guessFromHost })}
          </button>
        </div>
      )}
      <p className="subtitle" style={{ margin: '0 0 12px' }}>
        {t('account.connectionHint')}
      </p>
    </details>
  );
}
