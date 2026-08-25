/**
 * 超軽量なレート制限(インメモリ・固定ウィンドウ)。
 *
 * 追加の依存(Redis等)は使わず、プロセス内の Map だけで数える。
 * Cloud Functions のようにインスタンスが複数に増える環境では
 * インスタンスごとにしか効かない(共有ストアではない)ため完全な防御にはならないが、
 * 単純な連打・ブルートフォース・スクリプトによる乱打には一定の歯止めになる。
 */

/**
 * @param {object} opts
 * @param {number} opts.windowMs 集計ウィンドウ(ミリ秒)
 * @param {number} opts.max ウィンドウ内に許可する最大リクエスト数
 * @param {(req: import('express').Request) => string} opts.keyFn 制限の単位(IP・ユーザーIDなど)
 * @param {string} [opts.message] 制限時に返すエラーメッセージ
 */
export function rateLimit({ windowMs, max, keyFn, message }) {
  /** @type {Map<string, number[]>} キーごとの直近リクエスト時刻(ウィンドウ内のみ保持) */
  const hits = new Map();

  // 長時間稼働するプロセス(npm run server)でキーが溜まり続けないよう、
  // 定期的に空になったエントリを掃除する。Cloud Functions のような
  // 短命プロセスでは実行前に終わるだけで実害はない。
  const sweepTimer = setInterval(
    () => {
      const now = Date.now();
      for (const [key, arr] of hits) {
        const fresh = arr.filter((t) => now - t < windowMs);
        if (fresh.length === 0) hits.delete(key);
        else hits.set(key, fresh);
      }
    },
    Math.max(windowMs, 60_000),
  );
  sweepTimer.unref?.();

  return (req, res, next) => {
    const key = keyFn(req);
    const now = Date.now();
    const arr = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (arr.length >= max) {
      const retryAfterSec = Math.max(
        1,
        Math.ceil((arr[0] + windowMs - now) / 1000),
      );
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        error:
          message ??
          'リクエストが多すぎます。しばらく待ってから再試行してください。',
      });
    }
    arr.push(now);
    hits.set(key, arr);
    next();
  };
}
