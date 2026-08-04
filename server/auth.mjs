/**
 * 認証(自前バックエンド)。
 *
 * メール + パスワードのシンプルな認証。パスワードは scrypt でハッシュ化して
 * 保存し(平文は保持しない)、ログイン成功時にランダムなセッショントークンを
 * 発行して DB(ストア)に保存する。以降のリクエストは
 * `Authorization: Bearer <token>` でユーザーを特定する。
 *
 * 外部サービスや追加依存は使わず、Node 標準の crypto のみで完結する。
 */
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/** セッションの有効期間(30日) */
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const SCRYPT_KEYLEN = 64;

export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const hash = scryptSync(String(password), salt, SCRYPT_KEYLEN).toString('hex');
  return { hash, salt };
}

export function verifyPassword(password, salt, expectedHash) {
  const actual = scryptSync(String(password), salt, SCRYPT_KEYLEN);
  const expected = Buffer.from(String(expectedHash), 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function newSessionToken() {
  return randomBytes(32).toString('hex');
}

export function sessionExpiry() {
  return Date.now() + SESSION_TTL_MS;
}

export function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function newUserId() {
  return `u_${Date.now().toString(36)}_${randomBytes(6).toString('hex')}`;
}

/** Bearer トークンからユーザーを解決する Express ミドルウェアを作る */
export function makeRequireAuth(store) {
  return function requireAuth(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) {
      return res.status(401).json({ error: '認証が必要です' });
    }
    const session = store.getSession(token);
    if (!session) {
      return res.status(401).json({ error: 'セッションが無効か期限切れです' });
    }
    req.userId = session.userId;
    req.sessionToken = token;
    next();
  };
}
