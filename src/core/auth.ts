/**
 * 認証(フロント側)。
 *
 * 自前バックエンドの `/api/auth/*` を呼び、発行されたセッショントークンを
 * このブラウザ(localStorage)に保存する。以降の保存系 API 呼び出しは
 * `Authorization: Bearer <token>` を付けてユーザーを特定させる。
 *
 * ログインしていない場合、テンプレート/レシピは localStorage に保存される
 * (リポジトリ層が自動的に切り替える)。ログインすると DB(サーバー)に保存される。
 */
import { apiUrl, getApiBase } from './apiBase';

export interface AuthUser {
  id: string;
  email: string;
}

const TOKEN_KEY = 'auto-shaper.auth.token.v1';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* 保存失敗は握りつぶす */
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

/** ログイン済みか(トークンの有無で判定) */
export function isAuthenticated(): boolean {
  return !!getToken();
}

/** 認証ヘッダ(未ログインなら空) */
export function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** メール形式の簡易チェック(UI 側の即時バリデーション用) */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function postAuth(
  path: string,
  body: Record<string, unknown>,
): Promise<{ token: string; user: AuthUser }> {
  const url = apiUrl(path);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    // ネットワーク到達不可(サーバー未起動 / 別オリジンで中継されていない 等)
    throw new Error(
      `APIサーバーに接続できませんでした（${url}）。` +
        '`npm run server` の起動、または「APIサーバーURL」の設定を確認してください。',
    );
  }
  const data = (await res.json().catch(() => ({}))) as {
    token?: string;
    user?: AuthUser;
    error?: string;
  };
  if (!res.ok || !data.token || !data.user) {
    // サーバーがJSONで理由を返していれば、それをそのまま見せる(原因が分かる)
    if (data.error) throw new Error(data.error);
    // JSONエラーが無い = APIサーバーに届いていない(未起動 / 静的配信の404 / プロキシがECONNREFUSEDで500 など)
    const hint = getApiBase()
      ? `送信先: ${url}。APIサーバーが起動しているか確認してください（npm run server）。`
      : `送信先: ${url}（相対パス）。開発サーバー(5173)経由の場合は別ターミナルで npm run server を起動してください。` +
        `別オリジン(例 5502)で開いている場合は「設定 → アカウント → APIサーバーURL」に http://localhost:8787 を設定してください。`;
    throw new Error(`認証に失敗しました (${res.status})。${hint}`);
  }
  setToken(data.token);
  return { token: data.token, user: data.user };
}

/** 新規登録 */
export async function signUp(email: string, password: string): Promise<AuthUser> {
  const { user } = await postAuth('/api/auth/signup', { email, password });
  return user;
}

/** ログイン */
export async function signIn(email: string, password: string): Promise<AuthUser> {
  const { user } = await postAuth('/api/auth/login', { email, password });
  return user;
}

/** ログアウト(サーバーのセッションも破棄) */
export async function signOut(): Promise<void> {
  try {
    await fetch(apiUrl('/api/auth/logout'), {
      method: 'POST',
      headers: authHeaders(),
    });
  } catch {
    /* サーバー不通でもローカルのトークンは消す */
  }
  clearToken();
}

/** 保存済みトークンから現在のユーザーを取得(無効なら null にしてトークン破棄) */
export async function fetchMe(): Promise<AuthUser | null> {
  if (!getToken()) return null;
  try {
    const res = await fetch(apiUrl('/api/auth/me'), { headers: authHeaders() });
    if (res.ok) {
      const data = (await res.json()) as { user: AuthUser };
      return data.user;
    }
    if (res.status === 401) clearToken();
    return null;
  } catch {
    // サーバー不通。トークンは残し、次回オンライン時に再検証する
    return null;
  }
}
