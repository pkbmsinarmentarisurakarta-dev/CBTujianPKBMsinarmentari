import cookieParser from 'cookie-parser';
import express, { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import helmet from 'helmet';
import http from 'http';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { ENV } from './server/config/env.ts';
import { db, initDatabase } from './server/db/sqlite.ts';
import { apiRateLimiter } from './server/middleware/auth.ts';
import adminRoutes from './server/routes/admin.routes.ts';
import authRoutes from './server/routes/auth.routes.ts';
import studentRoutes from './server/routes/student.routes.ts';
import { initWebSocketServer } from './server/services/ws.service.ts';

async function bootstrap() {
  initDatabase();

  const app = express();
  const server = http.createServer(app);

  // Security headers (diizinkan iframe AI Studio preview)
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      frameguard: false,
    })
  );
  app.use(cookieParser());
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  // Layani berkas gambar yang diunggah secara lokal
  const uploadsPath = path.resolve(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsPath)) fs.mkdirSync(uploadsPath, { recursive: true });
  app.use('/uploads', express.static(uploadsPath));

  // Public school info untuk halaman login (tanpa data sensitif)
  app.get('/api/public/school-info', (_req: Request, res: Response) => {
    const school = db.prepare(`
      SELECT name, level, logo_url, app_title, active_academic_year, active_semester
      FROM schools LIMIT 1
    `).get();
    return res.json({ school });
  });

  app.get('/api/health', (_req: Request, res: Response) => {
    return res.json({ ok: true, serverTime: new Date().toISOString() });
  });

  // API routes dengan rate limiting
  app.use('/api/auth', apiRateLimiter(60, 60_000), authRoutes);
  app.use('/api/admin', apiRateLimiter(400, 60_000), adminRoutes);
  app.use('/api/student', apiRateLimiter(600, 60_000), studentRoutes);

  // Centralized API error handler
  app.use('/api', (err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[API Error]', err);
    const status = err.status || 500;
    return res.status(status).json({
      error: err.message || 'Terjadi kesalahan internal pada server.',
    });
  });

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
