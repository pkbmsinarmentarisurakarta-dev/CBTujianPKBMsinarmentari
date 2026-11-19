let cachedApp = null;

async function getApp() {
  if (!cachedApp) {
    const mod = await import('../server/_vercel-bundle.mjs');
    cachedApp = mod.default;
  }
  return cachedApp;
}

export default async function handler(req, res) {
  try {
    // Pulihkan path API asli saat diteruskan lewat ?__vercel_path=... (dari rewrite vercel.json atau fallback klien)
    if (req.url) {
      const parsedUrl = new URL(req.url, 'http://localhost');
      const vercelPath = parsedUrl.searchParams.get('__vercel_path');
      if (vercelPath !== null) {
        parsedUrl.searchParams.delete('__vercel_path');
        const remainingQuery = parsedUrl.searchParams.toString();
        const cleanSubpath = vercelPath.replace(/^\/+/, '');
        const restoredUrl = `/api/${cleanSubpath}${remainingQuery ? `?${remainingQuery}` : ''}`;
        req.url = restoredUrl;
        if ('originalUrl' in req) {
          req.originalUrl = restoredUrl;
        }
      }
    }

    const app = await getApp();
    return app(req, res);
  } catch (err) {
    console.error('[Vercel Serverless Error]', err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        error: `Kesalahan server Vercel: ${err?.message || 'Gagal memuat modul aplikasi server.'}`,
      })
    );
  }
}
