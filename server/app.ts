import cookieParser from 'cookie-parser';
import express, { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import helmet from 'helmet';
import path from 'path';
import { IS_VERCEL, WRITABLE_UPLOADS_DIR } from './config/env.ts';
import { db, initDatabase } from './db/sqlite.ts';
import { apiRateLimiter } from './middleware/auth.ts';
import adminRoutes from './routes/admin.routes.ts';
import authRoutes from './routes/auth.routes.ts';
import studentRoutes from './routes/student.routes.ts';

export function createApp() {
  initDatabase();

  const app = express();
  app.set('trust proxy', 1);

  // Security headers (diizinkan iframe AI Studio preview)
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      frameguard: false,
    })
  );
  app.use(cookieParser());
  // Guard bila runtime serverless (mis. Vercel) sudah mem-parsing req.body sebelum Express
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (req.body !== undefined && typeof req.body === 'object' && !(req as any)._body) {
      (req as any)._body = true;
    }
    next();
  });
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  // Layani berkas gambar yang diunggah secara lokal (/tmp/cbt-uploads pada Vercel)
  const uploadsPath = WRITABLE_UPLOADS_DIR;
  if (!fs.existsSync(uploadsPath)) fs.mkdirSync(uploadsPath, { recursive: true });
  app.use('/uploads', express.static(uploadsPath));
  app.use('/api/uploads', express.static(uploadsPath));

  // Public school info untuk halaman login (tanpa data sensitif)
  app.get('/api/public/school-info', (_req: Request, res: Response) => {
    const school = db
      .prepare(
        `
      SELECT name, level, logo_url, app_title, active_academic_year, active_semester
      FROM schools LIMIT 1
    `
      )
      .get();
    return res.json({ school });
  });

  app.get('/api/health', (_req: Request, res: Response) => {
    return res.json({
      ok: true,
      runtime: IS_VERCEL ? 'vercel-serverless' : 'node-server',
      serverTime: new Date().toISOString(),
    });
  });

  // API routes dengan rate limiting
  app.use('/api/auth', apiRateLimiter(60, 60_000), authRoutes);
  app.use('/api/admin', apiRateLimiter(400, 60_000), adminRoutes);
  app.use('/api/student', apiRateLimiter(600, 60_000), studentRoutes);

  // JSON 404 untuk rute /api yang tidak cocok
  app.use('/api', (req: Request, res: Response) => {
    return res.status(404).json({
      error: `Endpoint API tidak ditemukan (${req.method} ${req.originalUrl || req.url}).`,
    });
  });

  // Centralized API error handler
  app.use('/api', (err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[API Error]', err);
    const status = err.status || 500;
    return res.status(status).json({
      error: err.message || 'Terjadi kesalahan internal pada server.',
    });
  });

  return app;
}
