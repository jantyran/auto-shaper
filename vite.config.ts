import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import type { Connect, ViteDevServer, PreviewServer } from 'vite';

/**
 * API を dev/preview サーバーに in-process でマウントするプラグイン。
 * これにより `npm run dev` / `npm run preview` 単体で、同一オリジンの `/api/*` が
 * そのまま動く(別プロセスの `npm run server` も proxy も不要)。
 *
 * サーバー実体(better-sqlite3 等)を読み込むのは dev/preview のときだけにしたいので、
 * `configureServer` / `configurePreviewServer` 内で動的 import する
 * (`vite build` 時には読み込まれない)。
 */
function inProcessApi() {
  const mount = async (middlewares: Connect.Server) => {
    const { createApp } = await import('./server/app.mjs');
    const app = createApp();
    // /api/* は Express に完結させる(next を渡さないので未知の /api は Express が404を返す)。
    // それ以外は Vite に通す。
    const handle = app as unknown as (req: unknown, res: unknown) => void;
    middlewares.use((req, res, next) => {
      if (req.url && req.url.startsWith('/api')) {
        handle(req, res);
      } else {
        next();
      }
    });
  };
  return {
    name: 'auto-shaper-inprocess-api',
    // 直接 use することで Vite の内部ミドルウェア(静的配信/SPAフォールバック)より
    // 前に /api を処理させる(/api が index.html にフォールバックされるのを防ぐ)
    async configureServer(server: ViteDevServer) {
      await mount(server.middlewares);
    },
    async configurePreviewServer(server: PreviewServer) {
      await mount(server.middlewares);
    },
  };
}

export default defineConfig({
  plugins: [react(), inProcessApi()],
  worker: {
    format: 'es',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
} as any);
