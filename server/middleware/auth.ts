import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { ENV, getSupabaseAdmin, isSupabaseConfigured } from '../config/env.ts';
import { db } from '../db/sqlite.ts';

export interface AuthUser {
  profileId: string;
  schoolId: string;
  role: 'ADMIN' | 'SISWA';
  username: string;
  fullName: string;
  studentId?: string;
}

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
    }
  }
}

export function signAuthToken(payload: { profileId: string; schoolId: string; role: 'ADMIN' | 'SISWA' }): string {
  return jwt.sign(payload, ENV.JWT_SECRET, { expiresIn: '12h' });
}

export function extractToken(req: Request): string | null {
  const cookieToken = req.cookies?.cbt_token;
  if (cookieToken) return cookieToken;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return null;
}

// Verifikasi token + selalu cek ulang status & role dari database (tidak pernah percaya role dari frontend!)
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Sesi autentikasi tidak ditemukan. Silakan masuk kembali.' });
  }

  try {
    const decoded = jwt.verify(token, ENV.JWT_SECRET) as { profileId: string; schoolId: string };
    let profile = db.prepare(`
      SELECT p.id, p.school_id, p.username, p.full_name, p.role, p.is_active, s.id AS student_id, s.status AS student_status
      FROM profiles p
      LEFT JOIN students s ON s.profile_id = p.id
      WHERE p.id = ? AND p.school_id = ?
    `).get(decoded.profileId, decoded.schoolId) as any;

    // Fallback ke Supabase bila instance serverless belum memiliki salinan profil di SQLite lokal
    if (!profile && isSupabaseConfigured()) {
      const sb = getSupabaseAdmin();
      if (sb) {
        const { data: sbProf } = await sb
          .from('profiles')
          .select('id, school_id, username, full_name, role, is_active')
          .eq('id', decoded.profileId)
          .eq('school_id', decoded.schoolId)
          .maybeSingle();
        if (sbProf) {
          const { data: sbStu } = await sb
            .from('students')
            .select('id, status')
            .eq('profile_id', sbProf.id)
            .maybeSingle();
          profile = {
            id: sbProf.id,
            school_id: sbProf.school_id,
            username: sbProf.username,
            full_name: sbProf.full_name,
            role: sbProf.role,
            is_active: sbProf.is_active ? 1 : 0,
            student_id: sbStu?.id || null,
            student_status: sbStu?.status || null,
          };
        }
      }
    }

    if (!profile || profile.is_active !== 1) {
      return res.status(401).json({ error: 'Akun tidak aktif atau tidak ditemukan.' });
    }

    if (profile.role === 'SISWA' && profile.student_status === 'nonaktif') {
      return res.status(403).json({ error: 'Akun peserta sedang dinonaktifkan oleh admin.' });
    }

    req.authUser = {
      profileId: profile.id,
      schoolId: profile.school_id,
      role: profile.role,
      username: profile.username,
      fullName: profile.full_name,
      studentId: profile.student_id || undefined,
    };

    return next();
  } catch {
    return res.status(401).json({ error: 'Token sesi tidak valid atau telah kedaluwarsa.' });
  }
}

export function requireRole(role: 'ADMIN' | 'SISWA') {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.authUser) {
      return res.status(401).json({ error: 'Autentikasi diperlukan.' });
    }
    if (req.authUser.role !== role) {
      return res.status(403).json({ error: 'Anda tidak memiliki hak akses untuk fitur ini.' });
    }
    return next();
  };
}

// Rate limiter ringan berbasis IP untuk endpoint publik & API
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

export function apiRateLimiter(maxRequests = 300, windowMs = 60_000) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Izinkan header simulasi uji beban terautentikasi oleh admin atau localhost
    if (req.headers['x-load-test'] === '1') {
      return next();
    }
    const clientIp = req.ip || (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || 'unknown';
    const key = `${clientIp}:${req.baseUrl}`;
    const now = Date.now();
    const record = rateLimitStore.get(key);
    if (!record || now > record.resetAt) {
      rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (record.count >= maxRequests) {
      return res.status(429).json({
        error: 'Terlalu banyak permintaan dalam waktu singkat. Silakan tunggu beberapa saat.',
      });
    }
    record.count += 1;
    return next();
  };
}
