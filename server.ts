import express, { Request, Response } from 'express';
import http from 'http';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { createApp } from './server/app.ts';
import { ENV } from './server/config/env.ts';
import { initWebSocketServer } from './server/services/ws.service.ts';

async function bootstrap() {
  const app = createApp();
  const server = http.createServer(app);

  // Inisialisasi WebSocket pada HTTP server yang sama (port 3000)
  initWebSocketServer(server);

  // Vite middleware untuk dev atau static files untuk production
  if (ENV.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  server.listen(ENV.PORT, '0.0.0.0', () => {
    console.log(`Server CBT Online Sekolah/Madrasah berjalan di http://0.0.0.0:${ENV.PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('Gagal memulai server CBT:', err);
  process.exit(1);
});
