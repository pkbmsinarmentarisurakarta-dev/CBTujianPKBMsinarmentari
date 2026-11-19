import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { getSupabaseAdmin, isSupabaseConfigured } from '../config/env.ts';
import { db } from '../db/sqlite.ts';
import { requireAuth, signAuthToken } from '../middleware/auth.ts';
import { writeAuditLog } from '../utils/audit.ts';

const router = Router();

const loginSchema = z.object({
  identifier: z.string().min(1, 'Username/NIS/Email wajib diisi').max(160),
  password: z.string().min(1, 'Kata sandi wajib diisi').max(128),
  portal: z.enum(['ADMIN', 'SISWA']),
});

const forgotTokens = new Map<string, { profileId: string; expiresAt: number }>();

router.post('/login', async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Input tidak valid' });
  }

  const { identifier, password, portal } = parsed.data;
  const trimmed = identifier.trim();

  // Cari berdasarkan username, email (admin), atau NIS (siswa)
  let user = db.prepare(`
    SELECT p.*, s.id AS student_id, s.nis, s.status AS student_status, s.class_id, c.name AS class_name,
           sc.name AS school_name, sc.logo_url AS school_logo, sc.active_academic_year, sc.active_semester
    FROM profiles p
    JOIN schools sc ON sc.id = p.school_id
    LEFT JOIN students s ON s.profile_id = p.id
    LEFT JOIN classes c ON c.id = s.class_id
    WHERE p.role = ? AND (LOWER(p.username) = LOWER(?) OR LOWER(COALESCE(p.email, '')) = LOWER(?) OR LOWER(COALESCE(s.nis, '')) = LOWER(?))
    LIMIT 1
  `).get(portal, trimmed, trimmed, trimmed) as any;

  // Fallback ke Supabase bila user belum ada di SQLite lokal (mis. instance serverless baru)
  if (!user && isSupabaseConfigured()) {
    try {
      const sb = getSupabaseAdmin();
      if (sb) {
        const lower = trimmed.toLowerCase();
        const { data: sbProfs } = await sb
          .from('profiles')
          .select('*')
          .eq('role', portal)
          .or(`username.ilike.${lower},email.ilike.${lower}`)
          .limit(1);

        let sbProf = sbProfs?.[0];
        let sbStudent: any = null;

        if (!sbProf && portal === 'SISWA') {
          const { data: stuMatch } = await sb
            .from('students')
            .select('*')
            .ilike('nis', lower)
            .limit(1);
          if (stuMatch?.[0]) {
            sbStudent = stuMatch[0];
            const { data: pByStu } = await sb
              .from('profiles')
              .select('*')
              .eq('id', sbStudent.profile_id)
              .eq('role', 'SISWA')
              .limit(1);
            sbProf = pByStu?.[0];
          }
        }

        if (sbProf) {
          if (!sbStudent && portal === 'SISWA') {
            const { data: stuData } = await sb.from('students').select('*').eq('profile_id', sbProf.id).limit(1);
            sbStudent = stuData?.[0] || null;
          }
          const { data: sbSchool } = await sb.from('schools').select('*').eq('id', sbProf.school_id).limit(1);
          const schoolRow = sbSchool?.[0];
          let className: string | null = null;
          if (sbStudent?.class_id) {
            const { data: clsRow } = await sb.from('classes').select('name').eq('id', sbStudent.class_id).limit(1);
            className = clsRow?.[0]?.name || null;
          }

          user = {
            ...sbProf,
            is_active: sbProf.is_active ? 1 : 0,
            student_id: sbStudent?.id || null,
            nis: sbStudent?.nis || null,
            student_status: sbStudent?.status || null,
            class_id: sbStudent?.class_id || null,
            class_name: className,
            school_name: schoolRow?.name || 'Sekolah / Madrasah',
            school_logo: schoolRow?.logo_url || '/images/school-logo.jpg',
            active_academic_year: schoolRow?.active_academic_year || '2026/2027',
            active_semester: schoolRow?.active_semester || 'Ganjil',
            _fromSupabase: true,
          };
        }
      }
    } catch (e) {
      console.warn('[Auth Supabase Fallback]', e);
    }
  }

  if (!user) {
    return res.status(401).json({ error: 'Kredensial tidak ditemukan atau tidak sesuai dengan peran login.' });
  }

  // Cek pembatasan percobaan login (lockout 5 menit setelah 5 gagal)
  if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
    const waitSec = Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 1000);
    return res.status(429).json({
      error: `Akun dikunci sementara karena terlalu banyak percobaan login gagal. Coba lagi dalam ${waitSec} detik.`,
    });
  }

  if (user.is_active !== 1 || (portal === 'SISWA' && user.student_status === 'nonaktif')) {
    return res.status(403).json({ error: 'Akun Anda sedang dinonaktifkan. Hubungi administrator sekolah.' });
  }

  const validPassword = bcrypt.compareSync(password, user.password_hash);
  if (!validPassword) {
    const nextAttempts = (user.failed_login_attempts || 0) + 1;
    const lockedUntil = nextAttempts >= 5 ? new Date(Date.now() + 5 * 60_000).toISOString() : null;
    if (!user._fromSupabase) {
      db.prepare(`
        UPDATE profiles SET failed_login_attempts = ?, locked_until = ? WHERE id = ?
      `).run(nextAttempts >= 5 ? 0 : nextAttempts, lockedUntil, user.id);
    }

    writeAuditLog({
      schoolId: user.school_id,
      actorProfileId: user.id,
      actorRole: user.role,
      action: 'LOGIN_FAILED',
      entityType: 'profile',
      entityId: user.id,
      metadata: { identifier: trimmed, attempts: nextAttempts, locked: Boolean(lockedUntil) },
      ipAddress: req.ip,
    });

    if (lockedUntil) {
      return res.status(429).json({ error: 'Percobaan gagal melebihi batas (5x). Akun dikunci selama 5 menit.' });
    }
    return res.status(401).json({ error: `Kata sandi salah. Sisa percobaan sebelum kunci sementara: ${5 - nextAttempts}x.` });
  }

  // Reset counter percobaan & catat login terakhir
  if (!user._fromSupabase) {
    db.prepare(`
      UPDATE profiles SET failed_login_attempts = 0, locked_until = NULL, last_login_at = datetime('now') WHERE id = ?
    `).run(user.id);
  }

  const token = signAuthToken({
    profileId: user.id,
    schoolId: user.school_id,
    role: user.role,
  });

  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.cookie('cbt_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isHttps,
    maxAge: 12 * 60 * 60 * 1000,
  });

  writeAuditLog({
    schoolId: user.school_id,
    actorProfileId: user.id,
    actorRole: user.role,
    action: 'LOGIN_SUCCESS',
    entityType: 'profile',
    entityId: user.id,
    ipAddress: req.ip,
  });

  return res.json({
    token,
    user: {
      profileId: user.id,
      schoolId: user.school_id,
      role: user.role,
      username: user.username,
      email: user.email,
      fullName: user.full_name,
      studentId: user.student_id || null,
      nis: user.nis || null,
      classId: user.class_id || null,
      className: user.class_name || null,
      schoolName: user.school_name,
      schoolLogo: user.school_logo,
      activeAcademicYear: user.active_academic_year,
      activeSemester: user.active_semester,
    },
  });
});

router.post('/logout', requireAuth, (req: Request, res: Response) => {
  writeAuditLog({
    schoolId: req.authUser!.schoolId,
    actorProfileId: req.authUser!.profileId,
    actorRole: req.authUser!.role,
    action: 'LOGOUT',
    entityType: 'profile',
    entityId: req.authUser!.profileId,
    ipAddress: req.ip,
  });
  res.clearCookie('cbt_token');
  return res.json({ ok: true, message: 'Berhasil keluar dari sistem.' });
});

router.get('/me', requireAuth, async (req: Request, res: Response) => {
  let u = db.prepare(`
    SELECT p.id AS profileId, p.school_id AS schoolId, p.role, p.username, p.email, p.full_name AS fullName,
           s.id AS studentId, s.nis, s.nisn, s.class_id AS classId, c.name AS className,
           sc.name AS schoolName, sc.logo_url AS schoolLogo, sc.active_academic_year AS activeAcademicYear,
           sc.active_semester AS activeSemester, sc.app_title AS appTitle
    FROM profiles p
    JOIN schools sc ON sc.id = p.school_id
    LEFT JOIN students s ON s.profile_id = p.id
    LEFT JOIN classes c ON c.id = s.class_id
    WHERE p.id = ?
  `).get(req.authUser!.profileId) as any;

  if (!u && isSupabaseConfigured()) {
    const sb = getSupabaseAdmin();
    if (sb) {
      const { data: p } = await sb.from('profiles').select('*').eq('id', req.authUser!.profileId).maybeSingle();
      if (p) {
        const { data: sc } = await sb.from('schools').select('*').eq('id', p.school_id).maybeSingle();
        const { data: s } = await sb.from('students').select('*').eq('profile_id', p.id).maybeSingle();
        let className: string | null = null;
        if (s?.class_id) {
          const { data: c } = await sb.from('classes').select('name').eq('id', s.class_id).maybeSingle();
          className = c?.name || null;
        }
        u = {
          profileId: p.id,
          schoolId: p.school_id,
          role: p.role,
          username: p.username,
          email: p.email,
          fullName: p.full_name,
          studentId: s?.id || null,
          nis: s?.nis || null,
          nisn: s?.nisn || null,
          classId: s?.class_id || null,
          className,
          schoolName: sc?.name || 'Sekolah / Madrasah',
          schoolLogo: sc?.logo_url || '/images/school-logo.jpg',
          activeAcademicYear: sc?.active_academic_year || '2026/2027',
          activeSemester: sc?.active_semester || 'Ganjil',
          appTitle: sc?.app_title || 'CBT Online Sekolah/Madrasah',
        };
      }
    }
  }

  return res.json({ user: u });
});

const forgotSchema = z.object({
  identifier: z.string().min(1),
});

router.post('/forgot-password', (req: Request, res: Response) => {
  const parsed = forgotSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Username atau email admin wajib diisi.' });

  const admin = db.prepare(`
    SELECT id, school_id, email, username FROM profiles
    WHERE role = 'ADMIN' AND (LOWER(username) = LOWER(?) OR LOWER(COALESCE(email, '')) = LOWER(?))
    LIMIT 1
  `).get(parsed.data.identifier.trim(), parsed.data.identifier.trim()) as any;

  if (!admin) {
    return res.status(404).json({ error: 'Akun admin dengan username/email tersebut tidak ditemukan.' });
  }

  const resetCode = crypto.randomBytes(3).toString('hex').toUpperCase();
  forgotTokens.set(resetCode, { profileId: admin.id, expiresAt: Date.now() + 15 * 60_000 });

  writeAuditLog({
    schoolId: admin.school_id,
    actorProfileId: admin.id,
    actorRole: 'ADMIN',
    action: 'REQUEST_PASSWORD_RESET',
    entityType: 'profile',
    entityId: admin.id,
    ipAddress: req.ip,
  });

  // Dalam lingkungan produksi email SMTP/Supabase Auth akan mengirimkan tautan; di sini kode verifikasi dikembalikan terstruktur untuk konfirmasi admin lokal
  return res.json({
    ok: true,
    message: 'Kode verifikasi pemulihan sandi telah dibuat (berlaku 15 menit).',
    verificationHint: resetCode,
  });
});

const resetSchema = z.object({
  code: z.string().min(4),
  newPassword: z.string().min(6, 'Kata sandi baru minimal 6 karakter'),
});

router.post('/reset-password', (req: Request, res: Response) => {
  const parsed = resetSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Input tidak valid' });

  const entry = forgotTokens.get(parsed.data.code.trim().toUpperCase());
  if (!entry || Date.now() > entry.expiresAt) {
    return res.status(400).json({ error: 'Kode verifikasi tidak valid atau sudah kedaluwarsa.' });
  }

  const hash = bcrypt.hashSync(parsed.data.newPassword, 10);
  db.prepare(`UPDATE profiles SET password_hash = ?, failed_login_attempts = 0, locked_until = NULL WHERE id = ?`).run(
    hash,
    entry.profileId
  );
  forgotTokens.delete(parsed.data.code.trim().toUpperCase());

  return res.json({ ok: true, message: 'Kata sandi admin berhasil diperbarui. Silakan masuk kembali.' });
});

export default router;
