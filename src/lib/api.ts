const TOKEN_KEY = 'cbt_auth_token';

export function getStoredToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null) {
  if (!token) {
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
  } else {
    sessionStorage.setItem(TOKEN_KEY, token);
  }
}

function buildVercelFallbackPath(path: string): string | null {
  if (!path.startsWith('/api/') || path.startsWith('/api/cbt')) return null;
  const qIdx = path.indexOf('?');
  const pathname = qIdx >= 0 ? path.slice(0, qIdx) : path;
  const search = qIdx >= 0 ? path.slice(qIdx + 1) : '';
  const subpath = pathname.replace(/^\/api\/?/, '');
  return `/api/cbt?__vercel_path=${encodeURIComponent(subpath)}${search ? `&${search}` : ''}`;
}

export async function apiFetch<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const isFormData = options.body instanceof FormData;
  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const execRequest = (targetPath: string) =>
    fetch(targetPath, {
      ...options,
      headers,
      credentials: 'include',
    });

  let res = await execRequest(path);
  let rawText = await res.text().catch(() => '');
  let data: any = {};
  if (rawText) {
    try {
      data = JSON.parse(rawText);
    } catch {
      data = {};
    }
  }

  // Fallback otomatis bila Vercel CDN mengembalikan 404 non-JSON sebelum rewrite API berjalan
  if (res.status === 404 && !data.error) {
    const fallbackPath = buildVercelFallbackPath(path);
    if (fallbackPath) {
      res = await execRequest(fallbackPath);
      rawText = await res.text().catch(() => '');
      data = {};
      if (rawText) {
        try {
          data = JSON.parse(rawText);
        } catch {
          data = {};
        }
      }
    }
  }

  if (!res.ok) {
    const fallbackMsg =
      res.status === 404
        ? `Endpoint server tidak ditemukan (404). Pastikan fungsi API backend (/api/cbt) ikut ter-deploy.`
        : `Permintaan gagal (${res.status})`;
    const err = new Error(data.error || fallbackMsg) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return data as T;
}
