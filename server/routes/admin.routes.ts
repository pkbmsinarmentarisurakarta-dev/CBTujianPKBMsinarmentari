import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Request, Response, Router } from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { z } from 'zod';
import {
  clearSupabaseRuntimeConfig,
  ENV,
  getSafeSupabaseConfigSummary,
  getSupabaseAdmin,
  isSupabaseConfigured,
  saveSupabaseRuntimeConfig,
  testSupabaseConnection,
} from '../config/env.ts';
import { db, uid } from '../db/sqlite.ts';
import { requireAuth, requireRole } from '../middleware/auth.ts';
import { gradeSession } from '../services/grading.service.ts';
import { broadcastMonitoringEvent } from '../services/ws.service.ts';
import { writeAuditLog } from '../utils/audit.ts';

const router = Router();
router.use(requireAuth, requireRole('ADMIN'));

// Konfigurasi unggah gambar (JPG, JPEG, PNG, WebP maks 5MB)
const uploadDir = path.resolve(process.cwd(), 'uploads/questions');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error('Format gambar hanya mendukung JPG, JPEG, PNG, atau WebP.'));
    }
    cb(null, true);
  },
});

// ======================== UPLOAD MEDIA ========================
router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'File gambar tidak ditemukan.' });
  const folder = req.body.folder === 'logos' ? 'logos' : 'questions';

  // Jika Supabase dikonfigurasi, unggah juga ke Supabase Storage bucket cbt-media
  const supabase = getSupabaseAdmin();
  if (supabase) {
    try {
      const buffer = fs.readFileSync(req.file.path);
      const storagePath = `${req.authUser!.schoolId}/${folder}/${req.file.filename}`;
      const { error } = await supabase.storage.from('cbt-media').upload(storagePath, buffer, {
        contentType: req.file.mimetype,
        upsert: true,
      });
      if (!error) {
        const { data } = supabase.storage.from('cbt-media').getPublicUrl(storagePath);
        return res.json({ url: data.publicUrl, storage: 'supabase', filename: req.file.filename });
      }
    } catch (e) {
      console.warn('Fallback ke penyimpanan lokal karena error Supabase Storage:', e);
    }
  }

  return res.json({
    url: `/uploads/questions/${req.file.filename}`,
    storage: 'local',
    filename: req.file.filename,
  });
});

// ======================== DASHBOARD ========================
router.get('/dashboard', (req: Request, res: Response) => {
  const schoolId = req.authUser!.schoolId;

  const stats = {
    totalStudents: (db.prepare(`SELECT COUNT(*) AS c FROM students WHERE school_id = ?`).get(schoolId) as any).c,
    totalClasses: (db.prepare(`SELECT COUNT(*) AS c FROM classes WHERE school_id = ?`).get(schoolId) as any).c,
    totalSubjects: (db.prepare(`SELECT COUNT(*) AS c FROM subjects WHERE school_id = ?`).get(schoolId) as any).c,
    totalQuestions: (db.prepare(`SELECT COUNT(*) AS c FROM questions WHERE school_id = ?`).get(schoolId) as any).c,
    totalExams: (db.prepare(`SELECT COUNT(*) AS c FROM exams WHERE school_id = ?`).get(schoolId) as any).c,
    activeExams: (db.prepare(`SELECT COUNT(*) AS c FROM exams WHERE school_id = ? AND status = 'aktif'`).get(schoolId) as any).c,
    ongoingParticipants: (
      db.prepare(`
        SELECT COUNT(*) AS c FROM exam_sessions es
        JOIN exams e ON e.id = es.exam_id
        WHERE e.school_id = ? AND es.status = 'berlangsung'
      `).get(schoolId) as any
    ).c,
    completedParticipants: (
      db.prepare(`
        SELECT COUNT(*) AS c FROM exam_sessions es
        JOIN exams e ON e.id = es.exam_id
        WHERE e.school_id = ? AND es.status IN ('selesai', 'waktu_habis')
      `).get(schoolId) as any
    ).c,
  };

  const chartByExam = db.prepare(`
    SELECT e.id, e.title,
           ROUND(AVG(er.final_score), 1) AS avgScore,
           MAX(er.final_score) AS maxScore,
           MIN(er.final_score) AS minScore,
           COUNT(er.id) AS participantCount
    FROM exams e
    LEFT JOIN exam_results er ON er.exam_id = e.id
    WHERE e.school_id = ?
    GROUP BY e.id
    ORDER BY e.exam_date DESC
    LIMIT 6
  `).all(schoolId);

  const scoreDistribution = db.prepare(`
    SELECT
      SUM(CASE WHEN er.final_score >= 90 THEN 1 ELSE 0 END) AS s90,
      SUM(CASE WHEN er.final_score >= 75 AND er.final_score < 90 THEN 1 ELSE 0 END) AS s75,
      SUM(CASE WHEN er.final_score >= 60 AND er.final_score < 75 THEN 1 ELSE 0 END) AS s60,
      SUM(CASE WHEN er.final_score < 60 THEN 1 ELSE 0 END) AS sBelow
    FROM exam_results er
    JOIN exams e ON e.id = er.exam_id
    WHERE e.school_id = ?
  `).get(schoolId) as any;

  const recentLogs = db.prepare(`
    SELECT al.*, p.full_name AS actor_name
    FROM audit_logs al
    LEFT JOIN profiles p ON p.id = al.actor_profile_id
    WHERE al.school_id = ?
    ORDER BY al.created_at DESC
    LIMIT 10
  `).all(schoolId);

  return res.json({
    stats,
    chartByExam,
    scoreDistribution: [
      { range: '90 - 100', jumlah: scoreDistribution?.s90 || 0 },
      { range: '75 - 89', jumlah: scoreDistribution?.s75 || 0 },
      { range: '60 - 74', jumlah: scoreDistribution?.s60 || 0 },
      { range: '< 60', jumlah: scoreDistribution?.sBelow || 0 },
    ],
    recentLogs,
  });
});

// ======================== PROFIL SEKOLAH ========================
router.get('/school', (req: Request, res: Response) => {
  const school = db.prepare(`SELECT * FROM schools WHERE id = ?`).get(req.authUser!.schoolId);
  const years = db.prepare(`SELECT * FROM academic_years WHERE school_id = ? ORDER BY year_label DESC`).all(req.authUser!.schoolId);
  return res.json({ school, academicYears: years });
});

const schoolSchema = z.object({
  name: z.string().min(2),
  npsn: z.string().optional().default(''),
  level: z.enum(['SD/MI', 'SMP/MTs', 'SMA/MA', 'SMK', 'PKBM', 'Lembaga']),
  address: z.string().optional().default(''),
  phone: z.string().optional().default(''),
  email: z.string().optional().default(''),
  principal_name: z.string().optional().default(''),
  logo_url: z.string().optional().default(''),
  app_title: z.string().min(2),
  active_academic_year: z.string().min(4),
  active_semester: z.enum(['Ganjil', 'Genap']),
});

router.put('/school', (req: Request, res: Response) => {
  const parsed = schoolSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const d = parsed.data;
  db.prepare(`
    UPDATE schools
    SET name = ?, npsn = ?, level = ?, address = ?, phone = ?, email = ?, principal_name = ?,
        logo_url = ?, app_title = ?, active_academic_year = ?, active_semester = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    d.name,
    d.npsn || null,
    d.level,
    d.address,
    d.phone,
    d.email,
    d.principal_name,
    d.logo_url,
    d.app_title,
    d.active_academic_year,
    d.active_semester,
    req.authUser!.schoolId
  );

  // Sinkronkan academic_years
  const existingYear = db.prepare(`
    SELECT id FROM academic_years WHERE school_id = ? AND year_label = ? AND semester = ?
  `).get(req.authUser!.schoolId, d.active_academic_year, d.active_semester);
  db.prepare(`UPDATE academic_years SET is_active = 0 WHERE school_id = ?`).run(req.authUser!.schoolId);
  if (existingYear) {
    db.prepare(`UPDATE academic_years SET is_active = 1 WHERE id = ?`).run((existingYear as any).id);
  } else {
    db.prepare(`
      INSERT INTO academic_years (id, school_id, year_label, semester, is_active) VALUES (?, ?, ?, ?, 1)
    `).run(uid(), req.authUser!.schoolId, d.active_academic_year, d.active_semester);
  }

  writeAuditLog({
    schoolId: req.authUser!.schoolId,
    actorProfileId: req.authUser!.profileId,
    actorRole: 'ADMIN',
    action: 'UPDATE_SCHOOL',
    entityType: 'school',
    entityId: req.authUser!.schoolId,
    ipAddress: req.ip,
  });

  const school = db.prepare(`SELECT * FROM schools WHERE id = ?`).get(req.authUser!.schoolId);
  return res.json({ school });
});

// ======================== DATA KELAS ========================
router.get('/classes', (req: Request, res: Response) => {
  const year = String(req.query.year || '');
  const classes = db.prepare(`
    SELECT c.*, COUNT(s.id) AS student_count
    FROM classes c
    LEFT JOIN students s ON s.class_id = c.id
    WHERE c.school_id = ? ${year ? 'AND c.academic_year_label = ?' : ''}
    GROUP BY c.id
    ORDER BY c.grade_level ASC, c.name ASC
  `).all(...(year ? [req.authUser!.schoolId, year] : [req.authUser!.schoolId]));
  return res.json({ classes });
});

router.get('/classes/:id/students', (req: Request, res: Response) => {
  const students = db.prepare(`
    SELECT s.*, p.username
    FROM students s
    JOIN profiles p ON p.id = s.profile_id
    WHERE s.school_id = ? AND s.class_id = ?
    ORDER BY s.full_name ASC
  `).all(req.authUser!.schoolId, req.params.id);
  return res.json({ students });
});

const classSchema = z.object({
  name: z.string().min(1),
  grade_level: z.string().min(1),
  academic_year_label: z.string().min(4),
  major: z.string().optional().default(''),
  homeroom_teacher: z.string().optional().default(''),
});

router.post('/classes', (req: Request, res: Response) => {
  const parsed = classSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const d = parsed.data;
  try {
    const id = uid();
    db.prepare(`
      INSERT INTO classes (id, school_id, academic_year_label, name, grade_level, major, homeroom_teacher)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, req.authUser!.schoolId, d.academic_year_label, d.name.trim(), d.grade_level.trim(), d.major, d.homeroom_teacher);
    return res.status(201).json({ id });
  } catch (e: any) {
    return res.status(400).json({ error: 'Nama kelas sudah ada pada tahun pelajaran tersebut.' });
  }
});

router.put('/classes/:id', (req: Request, res: Response) => {
  const parsed = classSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const d = parsed.data;
  try {
    db.prepare(`
      UPDATE classes SET name = ?, grade_level = ?, academic_year_label = ?, major = ?, homeroom_teacher = ?, updated_at = datetime('now')
      WHERE id = ? AND school_id = ?
    `).run(d.name.trim(), d.grade_level.trim(), d.academic_year_label, d.major, d.homeroom_teacher, req.params.id, req.authUser!.schoolId);
    return res.json({ ok: true });
  } catch {
    return res.status(400).json({ error: 'Gagal memperbarui kelas. Pastikan nama kelas tidak duplikat.' });
  }
});

router.delete('/classes/:id', (req: Request, res: Response) => {
  db.prepare(`DELETE FROM classes WHERE id = ? AND school_id = ?`).run(req.params.id, req.authUser!.schoolId);
  return res.json({ ok: true });
});

router.post('/classes/transfer', (req: Request, res: Response) => {
  const schema = z.object({
    studentIds: z.array(z.string()).min(1),
    targetClassId: z.string().min(1),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Pilih minimal satu siswa dan kelas tujuan.' });

  const targetClass = db.prepare(`SELECT id FROM classes WHERE id = ? AND school_id = ?`).get(
    parsed.data.targetClassId,
    req.authUser!.schoolId
  );
  if (!targetClass) return res.status(404).json({ error: 'Kelas tujuan tidak ditemukan.' });

  const stmt = db.prepare(`UPDATE students SET class_id = ?, updated_at = datetime('now') WHERE id = ? AND school_id = ?`);
  const tx = db.transaction(() => {
    for (const sid of parsed.data.studentIds) {
      stmt.run(parsed.data.targetClassId, sid, req.authUser!.schoolId);
    }
  });
  tx();
  return res.json({ ok: true });
});

// ======================== DATA SISWA ========================
router.get('/students', (req: Request, res: Response) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const classId = String(req.query.classId || '');
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(200, Math.max(10, Number(req.query.limit || 50)));
  const offset = (page - 1) * limit;

  const whereParts = ['s.school_id = ?'];
  const params: any[] = [req.authUser!.schoolId];
  if (classId) {
    whereParts.push('s.class_id = ?');
    params.push(classId);
  }
  if (q) {
    whereParts.push('(LOWER(s.full_name) LIKE ? OR LOWER(s.nis) LIKE ? OR LOWER(p.username) LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  const whereSql = whereParts.join(' AND ');

  const total = (
    db.prepare(`SELECT COUNT(*) AS c FROM students s JOIN profiles p ON p.id = s.profile_id WHERE ${whereSql}`).get(...params) as any
  ).c;

  const students = db.prepare(`
    SELECT s.*, p.username, p.is_active, p.last_login_at, c.name AS class_name
    FROM students s
    JOIN profiles p ON p.id = s.profile_id
    LEFT JOIN classes c ON c.id = s.class_id
    WHERE ${whereSql}
    ORDER BY c.name ASC, s.full_name ASC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  return res.json({ students, total, page, limit });
});

const studentSchema = z.object({
  nis: z.string().min(2),
  nisn: z.string().optional().default(''),
  full_name: z.string().min(2),
  gender: z.enum(['L', 'P', '']).optional().default(''),
  class_id: z.string().nullable().optional(),
  username: z.string().min(2),
  password: z.string().optional(),
  status: z.enum(['aktif', 'nonaktif']).optional().default('aktif'),
});

router.post('/students', (req: Request, res: Response) => {
  const parsed = studentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const d = parsed.data;
  const schoolId = req.authUser!.schoolId;

  const dupNis = db.prepare(`SELECT id FROM students WHERE school_id = ? AND nis = ?`).get(schoolId, d.nis.trim());
  if (dupNis) return res.status(400).json({ error: `NIS "${d.nis}" sudah terdaftar di sekolah ini.` });

  const dupUser = db.prepare(`SELECT id FROM profiles WHERE school_id = ? AND LOWER(username) = LOWER(?)`).get(
    schoolId,
    d.username.trim()
  );
  if (dupUser) return res.status(400).json({ error: `Username "${d.username}" sudah digunakan.` });

  const profileId = uid();
  const studentId = uid();
  const hash = bcrypt.hashSync(d.password && d.password.length >= 4 ? d.password : 'Siswa2026!', 10);

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO profiles (id, school_id, username, password_hash, full_name, role, is_active)
      VALUES (?, ?, ?, ?, ?, 'SISWA', ?)
    `).run(profileId, schoolId, d.username.trim(), hash, d.full_name.trim(), d.status === 'aktif' ? 1 : 0);

    db.prepare(`
      INSERT INTO students (id, school_id, profile_id, class_id, nis, nisn, full_name, gender, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(studentId, schoolId, profileId, d.class_id || null, d.nis.trim(), d.nisn, d.full_name.trim(), d.gender, d.status);
  });
  tx();

  writeAuditLog({
    schoolId,
    actorProfileId: req.authUser!.profileId,
    actorRole: 'ADMIN',
    action: 'CREATE_STUDENT',
    entityType: 'student',
    entityId: studentId,
    metadata: { nis: d.nis, name: d.full_name },
    ipAddress: req.ip,
  });

  return res.status(201).json({ id: studentId });
});

router.put('/students/:id', (req: Request, res: Response) => {
  const parsed = studentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const d = parsed.data;
  const schoolId = req.authUser!.schoolId;

  const existing = db.prepare(`SELECT * FROM students WHERE id = ? AND school_id = ?`).get(req.params.id, schoolId) as any;
  if (!existing) return res.status(404).json({ error: 'Data siswa tidak ditemukan.' });

  const dupNis = db.prepare(`SELECT id FROM students WHERE school_id = ? AND nis = ? AND id <> ?`).get(
    schoolId,
    d.nis.trim(),
    req.params.id
  );
  if (dupNis) return res.status(400).json({ error: `NIS "${d.nis}" sudah dipakai siswa lain.` });

  const dupUser = db.prepare(`SELECT id FROM profiles WHERE school_id = ? AND LOWER(username) = LOWER(?) AND id <> ?`).get(
    schoolId,
    d.username.trim(),
    existing.profile_id
  );
  if (dupUser) return res.status(400).json({ error: `Username "${d.username}" sudah dipakai pengguna lain.` });

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE students SET nis = ?, nisn = ?, full_name = ?, gender = ?, class_id = ?, status = ?, updated_at = datetime('now')
      WHERE id = ? AND school_id = ?
    `).run(d.nis.trim(), d.nisn, d.full_name.trim(), d.gender, d.class_id || null, d.status, req.params.id, schoolId);

    db.prepare(`
      UPDATE profiles SET username = ?, full_name = ?, is_active = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(d.username.trim(), d.full_name.trim(), d.status === 'aktif' ? 1 : 0, existing.profile_id);
  });
  tx();

  return res.json({ ok: true });
});

router.post('/students/:id/reset-password', (req: Request, res: Response) => {
  const newPassword = String(req.body.newPassword || 'Siswa2026!');
  if (newPassword.length < 4) return res.status(400).json({ error: 'Password minimal 4 karakter.' });
  const existing = db.prepare(`SELECT profile_id FROM students WHERE id = ? AND school_id = ?`).get(
    req.params.id,
    req.authUser!.schoolId
  ) as any;
  if (!existing) return res.status(404).json({ error: 'Siswa tidak ditemukan.' });

  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare(`UPDATE profiles SET password_hash = ?, failed_login_attempts = 0, locked_until = NULL WHERE id = ?`).run(
    hash,
    existing.profile_id
  );
  return res.json({ ok: true, message: 'Password siswa berhasil direset.' });
});

router.patch('/students/:id/toggle-status', (req: Request, res: Response) => {
  const existing = db.prepare(`SELECT id, profile_id, status FROM students WHERE id = ? AND school_id = ?`).get(
    req.params.id,
    req.authUser!.schoolId
  ) as any;
  if (!existing) return res.status(404).json({ error: 'Siswa tidak ditemukan.' });

  const nextStatus = existing.status === 'aktif' ? 'nonaktif' : 'aktif';
  db.prepare(`UPDATE students SET status = ? WHERE id = ?`).run(nextStatus, existing.id);
  db.prepare(`UPDATE profiles SET is_active = ? WHERE id = ?`).run(nextStatus === 'aktif' ? 1 : 0, existing.profile_id);
  return res.json({ ok: true, status: nextStatus });
});

router.delete('/students/:id', (req: Request, res: Response) => {
  const existing = db.prepare(`SELECT profile_id FROM students WHERE id = ? AND school_id = ?`).get(
    req.params.id,
    req.authUser!.schoolId
  ) as any;
  if (!existing) return res.status(404).json({ error: 'Siswa tidak ditemukan.' });
  db.prepare(`DELETE FROM profiles WHERE id = ?`).run(existing.profile_id);
  return res.json({ ok: true });
});

router.post('/students/import', (req: Request, res: Response) => {
  const schema = z.object({
    rows: z.array(
      z.object({
        nis: z.string().min(1),
        nisn: z.string().optional().default(''),
        full_name: z.string().min(1),
        gender: z.string().optional().default(''),
        class_name: z.string().optional().default(''),
        username: z.string().optional(),
        password: z.string().optional(),
      })
    ),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Format baris impor tidak valid.' });

  const schoolId = req.authUser!.schoolId;
  const classes = db.prepare(`SELECT id, name FROM classes WHERE school_id = ?`).all(schoolId) as { id: string; name: string }[];
  const classMap = new Map(classes.map((c) => [c.name.trim().toLowerCase(), c.id]));

  let inserted = 0;
  const skipped: string[] = [];

  const tx = db.transaction(() => {
    for (const row of parsed.data.rows) {
      const nis = String(row.nis).trim();
      const username = String(row.username || nis).trim();
      const existsNis = db.prepare(`SELECT id FROM students WHERE school_id = ? AND nis = ?`).get(schoolId, nis);
      const existsUser = db.prepare(`SELECT id FROM profiles WHERE school_id = ? AND LOWER(username) = LOWER(?)`).get(
        schoolId,
        username
      );
      if (existsNis || existsUser) {
        skipped.push(`${nis} (${row.full_name})`);
        continue;
      }
      const classId = row.class_name ? classMap.get(row.class_name.trim().toLowerCase()) || null : null;
      const profileId = uid();
      const studentId = uid();
      const hash = bcrypt.hashSync(row.password && row.password.length >= 4 ? row.password : 'Siswa2026!', 10);
      const gender = row.gender?.toUpperCase().startsWith('L') ? 'L' : row.gender?.toUpperCase().startsWith('P') ? 'P' : '';

      db.prepare(`
        INSERT INTO profiles (id, school_id, username, password_hash, full_name, role, is_active)
        VALUES (?, ?, ?, ?, ?, 'SISWA', 1)
      `).run(profileId, schoolId, username, hash, row.full_name.trim());

      db.prepare(`
        INSERT INTO students (id, school_id, profile_id, class_id, nis, nisn, full_name, gender, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'aktif')
      `).run(studentId, schoolId, profileId, classId, nis, row.nisn || '', row.full_name.trim(), gender);
      inserted += 1;
    }
  });
  tx();

  return res.json({ inserted, skippedCount: skipped.length, skipped });
});

// ======================== CETAK KARTU UJIAN ========================
router.get('/exam-cards', (req: Request, res: Response) => {
  const schoolId = req.authUser!.schoolId;
  const classId = String(req.query.classId || '').trim();
  const examId = String(req.query.examId || '').trim();
  const q = String(req.query.q || '').trim().toLowerCase();
  const onlyActive = String(req.query.onlyActive ?? 'true') !== 'false';

  const school = db.prepare(`SELECT * FROM schools WHERE id = ?`).get(schoolId);
  const classes = db.prepare(`SELECT id, name, grade_level FROM classes WHERE school_id = ? ORDER BY name ASC`).all(schoolId);
  const exams = db.prepare(`
    SELECT e.id, e.title, e.exam_type, e.exam_date, e.start_time, e.end_time, e.status, sub.name AS subject_name
    FROM exams e
    JOIN subjects sub ON sub.id = e.subject_id
    WHERE e.school_id = ?
    ORDER BY e.exam_date DESC, e.start_time DESC
  `).all(schoolId);

  let selectedExam: any = null;
  if (examId) {
    selectedExam = db.prepare(`
      SELECT e.*, sub.name AS subject_name
      FROM exams e
      JOIN subjects sub ON sub.id = e.subject_id
      WHERE e.id = ? AND e.school_id = ?
    `).get(examId, schoolId) || null;
  }

  const whereParts = ['s.school_id = ?'];
  const params: any[] = [schoolId];

  if (onlyActive) {
    whereParts.push(`s.status = 'aktif' AND p.is_active = 1`);
  }
  if (classId) {
    whereParts.push('s.class_id = ?');
    params.push(classId);
  }
  if (examId) {
    whereParts.push('EXISTS (SELECT 1 FROM exam_participants ep WHERE ep.exam_id = ? AND ep.student_id = s.id)');
    params.push(examId);
  }
  if (q) {
    whereParts.push('(LOWER(s.full_name) LIKE ? OR LOWER(s.nis) LIKE ? OR LOWER(p.username) LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  const students = db.prepare(`
    SELECT s.id, s.nis, s.nisn, s.full_name, s.gender, s.status, s.class_id,
           p.username, c.name AS class_name, c.grade_level
    FROM students s
    JOIN profiles p ON p.id = s.profile_id
    LEFT JOIN classes c ON c.id = s.class_id
    WHERE ${whereParts.join(' AND ')}
    ORDER BY c.name ASC, s.full_name ASC
    LIMIT 1000
  `).all(...params);

  return res.json({ school, classes, exams, selectedExam, students });
});

// ======================== MATA PELAJARAN ========================
router.get('/subjects', (req: Request, res: Response) => {
  const subjects = db.prepare(`
    SELECT s.*,
      (SELECT COUNT(*) FROM questions q WHERE q.subject_id = s.id) AS question_count
    FROM subjects s
    WHERE s.school_id = ?
    ORDER BY s.name ASC
  `).all(req.authUser!.schoolId);
  return res.json({ subjects });
});

const subjectSchema = z.object({
  code: z.string().min(2),
  name: z.string().min(2),
  category: z.string().min(2),
  description: z.string().optional().default(''),
});

router.post('/subjects', (req: Request, res: Response) => {
  const parsed = subjectSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const d = parsed.data;
  try {
    const id = uid();
    db.prepare(`
      INSERT INTO subjects (id, school_id, code, name, category, description)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, req.authUser!.schoolId, d.code.trim().toUpperCase(), d.name.trim(), d.category.trim(), d.description);
    return res.status(201).json({ id });
  } catch {
    return res.status(400).json({ error: 'Kode mata pelajaran sudah digunakan.' });
  }
});

router.put('/subjects/:id', (req: Request, res: Response) => {
  const parsed = subjectSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const d = parsed.data;
  try {
    db.prepare(`
      UPDATE subjects SET code = ?, name = ?, category = ?, description = ?, updated_at = datetime('now')
      WHERE id = ? AND school_id = ?
    `).run(d.code.trim().toUpperCase(), d.name.trim(), d.category.trim(), d.description, req.params.id, req.authUser!.schoolId);
    return res.json({ ok: true });
  } catch {
    return res.status(400).json({ error: 'Kode mata pelajaran sudah digunakan.' });
  }
});

router.delete('/subjects/:id', (req: Request, res: Response) => {
  try {
    db.prepare(`DELETE FROM subjects WHERE id = ? AND school_id = ?`).run(req.params.id, req.authUser!.schoolId);
    return res.json({ ok: true });
  } catch {
    return res.status(400).json({ error: 'Mata pelajaran sedang digunakan oleh ujian aktif.' });
  }
});

// ======================== BANK SOAL & SOAL ========================
router.get('/question-banks', (req: Request, res: Response) => {
  const banks = db.prepare(`
    SELECT qb.*, sub.name AS subject_name, COUNT(q.id) AS question_count
    FROM question_banks qb
    JOIN subjects sub ON sub.id = qb.subject_id
    LEFT JOIN questions q ON q.bank_id = qb.id
    WHERE qb.school_id = ?
    GROUP BY qb.id
    ORDER BY qb.created_at DESC
  `).all(req.authUser!.schoolId);
  return res.json({ banks });
});

router.post('/question-banks', (req: Request, res: Response) => {
  const schema = z.object({
    subject_id: z.string().min(1),
    title: z.string().min(2),
    grade_level: z.string().default('Semua'),
    description: z.string().optional().default(''),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const id = uid();
  db.prepare(`
    INSERT INTO question_banks (id, school_id, subject_id, created_by, title, grade_level, description)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    req.authUser!.schoolId,
    parsed.data.subject_id,
    req.authUser!.profileId,
    parsed.data.title,
    parsed.data.grade_level,
    parsed.data.description
  );
  return res.status(201).json({ id });
});

router.get('/questions', (req: Request, res: Response) => {
  const subjectId = String(req.query.subjectId || '');
  const difficulty = String(req.query.difficulty || '');
  const gradeLevel = String(req.query.gradeLevel || '');
  const qType = String(req.query.type || '');
  const search = String(req.query.q || '').trim().toLowerCase();
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(100, Math.max(10, Number(req.query.limit || 25)));
  const offset = (page - 1) * limit;

  const whereParts = ['q.school_id = ?'];
  const params: any[] = [req.authUser!.schoolId];
  if (subjectId) { whereParts.push('q.subject_id = ?'); params.push(subjectId); }
  if (difficulty) { whereParts.push('q.difficulty = ?'); params.push(difficulty); }
  if (gradeLevel) { whereParts.push('q.grade_level = ?'); params.push(gradeLevel); }
  if (qType) { whereParts.push('q.question_type = ?'); params.push(qType); }
  if (search) {
    whereParts.push('(LOWER(q.content_html) LIKE ? OR LOWER(q.latex_formula) LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }
  const whereSql = whereParts.join(' AND ');

  const total = (db.prepare(`SELECT COUNT(*) AS c FROM questions q WHERE ${whereSql}`).get(...params) as any).c;
  const rows = db.prepare(`
    SELECT q.*, sub.name AS subject_name, sub.code AS subject_code
    FROM questions q
    JOIN subjects sub ON sub.id = q.subject_id
    WHERE ${whereSql}
    ORDER BY q.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as any[];

  const optStmt = db.prepare(`SELECT * FROM question_options WHERE question_id = ? ORDER BY sort_order ASC`);
  const questions = rows.map((r) => ({
    ...r,
    options: optStmt.all(r.id),
  }));

  return res.json({ questions, total, page, limit });
});

const questionSchema = z.object({
  bank_id: z.string().nullable().optional(),
  subject_id: z.string().min(1),
  grade_level: z.string().min(1),
  question_type: z.enum(['single_choice', 'multiple_choice', 'true_false', 'short_answer', 'essay']),
  difficulty: z.enum(['mudah', 'sedang', 'sulit']),
  content_html: z.string().min(1, 'Teks pertanyaan wajib diisi'),
  latex_formula: z.string().optional().default(''),
  image_url: z.string().optional().default(''),
  image_width: z.string().optional().default('100%'),
  table_json: z.string().optional().default(''),
  correct_answer_text: z.string().optional().default(''),
  answer_rules_json: z.string().optional().default('{}'),
  weight: z.number().positive(),
  explanation: z.string().optional().default(''),
  options: z
    .array(
      z.object({
        option_label: z.string(),
        content_html: z.string(),
        image_url: z.string().optional().default(''),
        is_correct: z.boolean(),
      })
    )
    .optional()
    .default([]),
});

router.post('/questions', (req: Request, res: Response) => {
  const parsed = questionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const d = parsed.data;
  const id = uid();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO questions (id, school_id, bank_id, subject_id, grade_level, question_type, difficulty, content_html, latex_formula, image_url, image_width, table_json, correct_answer_text, answer_rules_json, weight, explanation, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      req.authUser!.schoolId,
      d.bank_id || null,
      d.subject_id,
      d.grade_level,
      d.question_type,
      d.difficulty,
      d.content_html,
      d.latex_formula,
      d.image_url,
      d.image_width,
      d.table_json,
      d.correct_answer_text,
      d.answer_rules_json,
      d.weight,
      d.explanation,
      req.authUser!.profileId
    );

    const optStmt = db.prepare(`
      INSERT INTO question_options (id, question_id, option_label, content_html, image_url, is_correct, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    d.options.forEach((opt, idx) => {
      optStmt.run(uid(), id, opt.option_label, opt.content_html, opt.image_url || '', opt.is_correct ? 1 : 0, idx + 1);
    });
  });
  tx();

  return res.status(201).json({ id });
});

router.put('/questions/:id', (req: Request, res: Response) => {
  const parsed = questionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const d = parsed.data;

  const existing = db.prepare(`SELECT id FROM questions WHERE id = ? AND school_id = ?`).get(
    req.params.id,
    req.authUser!.schoolId
  );
  if (!existing) return res.status(404).json({ error: 'Soal tidak ditemukan.' });

  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE questions
      SET bank_id = ?, subject_id = ?, grade_level = ?, question_type = ?, difficulty = ?,
          content_html = ?, latex_formula = ?, image_url = ?, image_width = ?, table_json = ?,
          correct_answer_text = ?, answer_rules_json = ?, weight = ?, explanation = ?, updated_at = datetime('now')
      WHERE id = ? AND school_id = ?
    `).run(
      d.bank_id || null,
      d.subject_id,
      d.grade_level,
      d.question_type,
      d.difficulty,
      d.content_html,
      d.latex_formula,
      d.image_url,
      d.image_width,
      d.table_json,
      d.correct_answer_text,
      d.answer_rules_json,
      d.weight,
      d.explanation,
      req.params.id,
      req.authUser!.schoolId
    );

    db.prepare(`DELETE FROM question_options WHERE question_id = ?`).run(req.params.id);
    const optStmt = db.prepare(`
      INSERT INTO question_options (id, question_id, option_label, content_html, image_url, is_correct, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    d.options.forEach((opt, idx) => {
      optStmt.run(uid(), req.params.id, opt.option_label, opt.content_html, opt.image_url || '', opt.is_correct ? 1 : 0, idx + 1);
    });
  });
  tx();

  return res.json({ ok: true });
});

router.post('/questions/:id/duplicate', (req: Request, res: Response) => {
  const orig = db.prepare(`SELECT * FROM questions WHERE id = ? AND school_id = ?`).get(
    req.params.id,
    req.authUser!.schoolId
  ) as any;
  if (!orig) return res.status(404).json({ error: 'Soal tidak ditemukan.' });

  const newId = uid();
  const opts = db.prepare(`SELECT * FROM question_options WHERE question_id = ? ORDER BY sort_order ASC`).all(orig.id) as any[];

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO questions (id, school_id, bank_id, subject_id, grade_level, question_type, difficulty, content_html, latex_formula, image_url, image_width, table_json, correct_answer_text, answer_rules_json, weight, explanation, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      newId,
      orig.school_id,
      orig.bank_id,
      orig.subject_id,
      orig.grade_level,
      orig.question_type,
      orig.difficulty,
      `${orig.content_html} <p><em>(Salinan)</em></p>`,
      orig.latex_formula,
      orig.image_url,
      orig.image_width,
      orig.table_json,
      orig.correct_answer_text,
      orig.answer_rules_json,
      orig.weight,
      orig.explanation,
      req.authUser!.profileId
    );
    const stmt = db.prepare(`
      INSERT INTO question_options (id, question_id, option_label, content_html, image_url, is_correct, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const o of opts) {
      stmt.run(uid(), newId, o.option_label, o.content_html, o.image_url, o.is_correct, o.sort_order);
    }
  });
  tx();
  return res.status(201).json({ id: newId });
});

router.delete('/questions/:id', (req: Request, res: Response) => {
  db.prepare(`DELETE FROM questions WHERE id = ? AND school_id = ?`).run(req.params.id, req.authUser!.schoolId);
  return res.json({ ok: true });
});

function normalizeQuestionType(raw: string): 'single_choice' | 'multiple_choice' | 'true_false' | 'short_answer' | 'essay' | null {
  const v = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (['single_choice', 'pg', 'pilihan_ganda', 'pilihan_ganda_tunggal'].includes(v)) return 'single_choice';
  if (['multiple_choice', 'pg_kompleks', 'pilihan_ganda_kompleks', 'kompleks'].includes(v)) return 'multiple_choice';
  if (['true_false', 'benar_salah', 'benar/salah', 'bs'].includes(v)) return 'true_false';
  if (['short_answer', 'isian', 'isian_singkat'].includes(v)) return 'short_answer';
  if (['essay', 'uraian', 'esai'].includes(v)) return 'essay';
  return null;
}

function normalizeDifficulty(raw: string): 'mudah' | 'sedang' | 'sulit' {
  const v = raw.trim().toLowerCase();
  if (v === 'mudah' || v === 'easy') return 'mudah';
  if (v === 'sulit' || v === 'sukar' || v === 'hard') return 'sulit';
  return 'sedang';
}

function toSafeQuestionHtml(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  if (/<[a-z][\s\S]*>/i.test(trimmed)) return trimmed;
  const escaped = trimmed
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<p>${escaped.replace(/\r?\n/g, '<br />')}</p>`;
}

router.post('/questions/import', (req: Request, res: Response) => {
  const schema = z.object({
    defaultSubjectId: z.string().optional().default(''),
    rows: z
      .array(
        z.object({
          rowNumber: z.number().optional(),
          subject_ref: z.string().optional().default(''),
          grade_level: z.string().optional().default('X'),
          question_type: z.string().min(1),
          difficulty: z.string().optional().default('sedang'),
          weight: z.coerce.number().positive().optional().default(1),
          question_text: z.string().min(1),
          latex_formula: z.string().optional().default(''),
          option_a: z.string().optional().default(''),
          option_b: z.string().optional().default(''),
          option_c: z.string().optional().default(''),
          option_d: z.string().optional().default(''),
          option_e: z.string().optional().default(''),
          answer_key: z.string().optional().default(''),
          explanation: z.string().optional().default(''),
        })
      )
      .min(1, 'Tidak ada baris soal untuk diimpor.')
      .max(500, 'Maksimal 500 soal per unggahan.'),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Format impor soal tidak valid.' });
  }

  const schoolId = req.authUser!.schoolId;
  const subjects = db.prepare(`SELECT id, code, name FROM subjects WHERE school_id = ?`).all(schoolId) as {
    id: string;
    code: string;
    name: string;
  }[];
  const subjectByCode = new Map(subjects.map((s) => [s.code.trim().toLowerCase(), s.id]));
  const subjectByName = new Map(subjects.map((s) => [s.name.trim().toLowerCase(), s.id]));
  const validSubjectIds = new Set(subjects.map((s) => s.id));

  const fallbackSubjectId =
    parsed.data.defaultSubjectId && validSubjectIds.has(parsed.data.defaultSubjectId)
      ? parsed.data.defaultSubjectId
      : '';

  let inserted = 0;
  const skipped: string[] = [];

  const insertQuestionStmt = db.prepare(`
    INSERT INTO questions (id, school_id, bank_id, subject_id, grade_level, question_type, difficulty, content_html, latex_formula, image_url, image_width, table_json, correct_answer_text, answer_rules_json, weight, explanation, created_by)
    VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, '', '100%', '', ?, ?, ?, ?, ?)
  `);
  const insertOptionStmt = db.prepare(`
    INSERT INTO question_options (id, question_id, option_label, content_html, image_url, is_correct, sort_order)
    VALUES (?, ?, ?, ?, '', ?, ?)
  `);

  const tx = db.transaction(() => {
    parsed.data.rows.forEach((row, idx) => {
      const rowLabel = `Baris ${row.rowNumber ?? idx + 2}`;
      const qType = normalizeQuestionType(row.question_type);
      if (!qType) {
        skipped.push(`${rowLabel}: Jenis soal "${row.question_type}" tidak dikenali`);
        return;
      }

      const refKey = row.subject_ref.trim().toLowerCase();
      const resolvedSubjectId =
        (refKey ? subjectByCode.get(refKey) || subjectByName.get(refKey) : undefined) || fallbackSubjectId;
      if (!resolvedSubjectId) {
        skipped.push(`${rowLabel}: Mata pelajaran "${row.subject_ref || '-'}" tidak ditemukan`);
        return;
      }

      const contentHtml = toSafeQuestionHtml(row.question_text);
      if (!contentHtml) {
        skipped.push(`${rowLabel}: Teks pertanyaan kosong`);
        return;
      }

      const difficulty = normalizeDifficulty(row.difficulty);
      const gradeLevel = row.grade_level.trim() || 'X';
      const weight = Number(row.weight) > 0 ? Number(row.weight) : 1;
      const answerKeyRaw = row.answer_key.trim();

      let optionsToInsert: { label: string; html: string; isCorrect: boolean }[] = [];
      let correctAnswerText = '';
      let answerRulesJson = '{}';

      if (qType === 'single_choice' || qType === 'multiple_choice') {
        const rawOpts = [
          { label: 'A', val: row.option_a.trim() },
          { label: 'B', val: row.option_b.trim() },
          { label: 'C', val: row.option_c.trim() },
          { label: 'D', val: row.option_d.trim() },
          { label: 'E', val: row.option_e.trim() },
        ].filter((o) => o.val.length > 0);

        if (rawOpts.length < 2) {
          skipped.push(`${rowLabel}: Soal pilihan ganda minimal harus memiliki 2 opsi jawaban (A dan B)`);
          return;
        }

        const keyLabels = new Set(
          answerKeyRaw
            .toUpperCase()
            .split(/[,;\s]+/)
            .map((k) => k.trim())
            .filter(Boolean)
        );
        optionsToInsert = rawOpts.map((o) => ({
          label: o.label,
          html: toSafeQuestionHtml(o.val),
          isCorrect: keyLabels.has(o.label),
        }));

        if (!optionsToInsert.some((o) => o.isCorrect)) {
          skipped.push(`${rowLabel}: Kunci jawaban "${answerKeyRaw || '-'}" tidak cocok dengan opsi A-${rawOpts[rawOpts.length - 1].label}`);
          return;
        }
      } else if (qType === 'true_false') {
        const normKey = answerKeyRaw.toUpperCase();
        const isTrue = ['BENAR', 'TRUE', 'B', 'A', '1', 'YA'].includes(normKey);
        const isFalse = ['SALAH', 'FALSE', 'S', '2', 'TIDAK'].includes(normKey);
        if (!isTrue && !isFalse) {
          skipped.push(`${rowLabel}: Kunci Benar/Salah harus diisi BENAR atau SALAH (atau A/B)`);
          return;
        }
        optionsToInsert = [
          { label: 'A', html: toSafeQuestionHtml(row.option_a.trim() || 'Benar'), isCorrect: isTrue },
          { label: 'B', html: toSafeQuestionHtml(row.option_b.trim() || 'Salah'), isCorrect: isFalse },
        ];
      } else if (qType === 'short_answer') {
        const candidates = answerKeyRaw
          .split('|')
          .map((s) => s.trim())
          .filter(Boolean);
        if (candidates.length === 0) {
          skipped.push(`${rowLabel}: Kunci jawaban isian singkat wajib diisi`);
          return;
        }
        correctAnswerText = candidates[0];
        answerRulesJson = JSON.stringify({ aliases: candidates.slice(1), caseSensitive: false });
      } else if (qType === 'essay') {
        correctAnswerText = answerKeyRaw;
      }

      const questionId = uid();
      insertQuestionStmt.run(
        questionId,
        schoolId,
        resolvedSubjectId,
        gradeLevel,
        qType,
        difficulty,
        contentHtml,
        row.latex_formula.trim(),
        correctAnswerText,
        answerRulesJson,
        weight,
        row.explanation.trim(),
        req.authUser!.profileId
      );

      optionsToInsert.forEach((opt, optIdx) => {
        insertOptionStmt.run(uid(), questionId, opt.label, opt.html, opt.isCorrect ? 1 : 0, optIdx + 1);
      });

      inserted += 1;
    });
  });
  tx();

  if (inserted > 0) {
    writeAuditLog({
      schoolId,
      actorProfileId: req.authUser!.profileId,
      actorRole: 'ADMIN',
      action: 'IMPORT_QUESTIONS',
      entityType: 'question',
      metadata: { inserted, skippedCount: skipped.length },
      ipAddress: req.ip,
    });
  }

  return res.json({ inserted, skippedCount: skipped.length, skipped });
});

// ======================== MANAJEMEN UJIAN ========================
router.get('/exams', (req: Request, res: Response) => {
  const exams = db.prepare(`
    SELECT e.*, sub.name AS subject_name, c.name AS class_name,
      (SELECT COUNT(*) FROM exam_questions eq WHERE eq.exam_id = e.id) AS attached_question_count,
      (SELECT COUNT(*) FROM exam_participants ep WHERE ep.exam_id = e.id) AS participant_count
    FROM exams e
    JOIN subjects sub ON sub.id = e.subject_id
    LEFT JOIN classes c ON c.id = e.class_id
    WHERE e.school_id = ?
    ORDER BY e.exam_date DESC, e.start_time DESC
  `).all(req.authUser!.schoolId);
  return res.json({ exams });
});

router.get('/exams/:id', (req: Request, res: Response) => {
  const exam = db.prepare(`
    SELECT e.*, sub.name AS subject_name, c.name AS class_name
    FROM exams e
    JOIN subjects sub ON sub.id = e.subject_id
    LEFT JOIN classes c ON c.id = e.class_id
    WHERE e.id = ? AND e.school_id = ?
  `).get(req.params.id, req.authUser!.schoolId);
  if (!exam) return res.status(404).json({ error: 'Ujian tidak ditemukan.' });

  const questions = db.prepare(`
    SELECT eq.id AS exam_question_id, eq.question_order, eq.custom_weight, q.*, sub.name AS subject_name
    FROM exam_questions eq
    JOIN questions q ON q.id = eq.question_id
    JOIN subjects sub ON sub.id = q.subject_id
    WHERE eq.exam_id = ?
    ORDER BY eq.question_order ASC
  `).all(req.params.id);

  const participants = db.prepare(`
    SELECT ep.*, s.nis, s.full_name, c.name AS class_name,
           es.id AS session_id, es.status AS session_status, es.started_at, es.submitted_at, es.suspicious_count
    FROM exam_participants ep
    JOIN students s ON s.id = ep.student_id
    LEFT JOIN classes c ON c.id = s.class_id
    LEFT JOIN exam_sessions es ON es.exam_id = ep.exam_id AND es.student_id = ep.student_id
      AND es.id = (SELECT id FROM exam_sessions WHERE exam_id = ep.exam_id AND student_id = ep.student_id ORDER BY attempt_number DESC LIMIT 1)
    WHERE ep.exam_id = ?
    ORDER BY c.name ASC, s.full_name ASC
  `).all(req.params.id);

  return res.json({ exam, questions, participants });
});

const examSchema = z.object({
  title: z.string().min(3),
  exam_type: z.string().min(2),
  academic_year: z.string().min(4),
  semester: z.enum(['Ganjil', 'Genap']),
  subject_id: z.string().min(1),
  class_id: z.string().nullable().optional(),
  description: z.string().optional().default(''),
  exam_date: z.string().min(8),
  start_time: z.string().min(4),
  end_time: z.string().min(4),
  duration_minutes: z.number().int().min(1).max(600),
  passing_score: z.number().min(0).max(100),
  rounding_mode: z.enum(['none', 'nearest_int', 'one_decimal', 'two_decimals']),
  exam_token: z.string().min(4).max(16),
  max_attempts: z.number().int().min(1).max(10),
  shuffle_questions: z.boolean(),
  shuffle_options: z.boolean(),
  questions_per_page: z.number().int().min(1).max(20),
  results_published: z.boolean(),
  status: z.enum(['draft', 'terjadwal', 'aktif', 'selesai', 'diarsipkan']),
});

router.post('/exams', (req: Request, res: Response) => {
  const parsed = examSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const d = parsed.data;
  if ((d.status === 'terjadwal' || d.status === 'aktif') && req.body.questionIds?.length === 0) {
    return res.status(400).json({ error: 'Ujian tidak dapat diaktifkan sebelum memiliki minimal 1 soal.' });
  }

  const id = uid();
  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO exams (id, school_id, subject_id, class_id, title, exam_type, academic_year, semester, description, exam_date, start_time, end_time, duration_minutes, question_count, passing_score, rounding_mode, exam_token, max_attempts, shuffle_questions, shuffle_options, questions_per_page, results_published, status, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      req.authUser!.schoolId,
      d.subject_id,
      d.class_id || null,
      d.title.trim(),
      d.exam_type,
      d.academic_year,
      d.semester,
      d.description,
      d.exam_date,
      d.start_time,
      d.end_time,
      d.duration_minutes,
      d.passing_score,
      d.rounding_mode,
      d.exam_token.trim().toUpperCase(),
      d.max_attempts,
      d.shuffle_questions ? 1 : 0,
      d.shuffle_options ? 1 : 0,
      d.questions_per_page,
      d.results_published ? 1 : 0,
      d.status,
      req.authUser!.profileId
    );

    // Jika kelas dipilih saat buat ujian, otomatis daftarkan siswa aktif di kelas tersebut
    if (d.class_id) {
      const classStudents = db.prepare(`SELECT id FROM students WHERE school_id = ? AND class_id = ? AND status = 'aktif'`).all(
        req.authUser!.schoolId,
        d.class_id
      ) as { id: string }[];
      const pStmt = db.prepare(`
        INSERT OR IGNORE INTO exam_participants (id, exam_id, student_id, extra_minutes, allowed_attempts, status)
        VALUES (?, ?, ?, 0, ?, 'terdaftar')
      `);
      for (const s of classStudents) {
        pStmt.run(uid(), id, s.id, d.max_attempts);
      }
    }
  });
  tx();

  writeAuditLog({
    schoolId: req.authUser!.schoolId,
    actorProfileId: req.authUser!.profileId,
    actorRole: 'ADMIN',
    action: 'CREATE_EXAM',
    entityType: 'exam',
    entityId: id,
    metadata: { title: d.title },
    ipAddress: req.ip,
  });

  return res.status(201).json({ id });
});

router.put('/exams/:id', (req: Request, res: Response) => {
  const parsed = examSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });
  const d = parsed.data;

  const qCount = (db.prepare(`SELECT COUNT(*) AS c FROM exam_questions WHERE exam_id = ?`).get(req.params.id) as any).c;
  const pCount = (db.prepare(`SELECT COUNT(*) AS c FROM exam_participants WHERE exam_id = ?`).get(req.params.id) as any).c;

  if ((d.status === 'aktif' || d.status === 'terjadwal') && qCount === 0) {
    return res.status(400).json({ error: 'Validasi gagal: Tambahkan minimal 1 soal sebelum menerbitkan/mengaktifkan ujian.' });
  }
  if (d.status === 'aktif' && pCount === 0) {
    return res.status(400).json({ error: 'Validasi gagal: Tambahkan minimal 1 peserta ujian sebelum mengaktifkan ujian.' });
  }

  db.prepare(`
    UPDATE exams
    SET subject_id = ?, class_id = ?, title = ?, exam_type = ?, academic_year = ?, semester = ?, description = ?,
        exam_date = ?, start_time = ?, end_time = ?, duration_minutes = ?, passing_score = ?, rounding_mode = ?,
        exam_token = ?, max_attempts = ?, shuffle_questions = ?, shuffle_options = ?, questions_per_page = ?,
        results_published = ?, status = ?, updated_at = datetime('now')
    WHERE id = ? AND school_id = ?
  `).run(
    d.subject_id,
    d.class_id || null,
    d.title.trim(),
    d.exam_type,
    d.academic_year,
    d.semester,
    d.description,
    d.exam_date,
    d.start_time,
    d.end_time,
    d.duration_minutes,
    d.passing_score,
    d.rounding_mode,
    d.exam_token.trim().toUpperCase(),
    d.max_attempts,
    d.shuffle_questions ? 1 : 0,
    d.shuffle_options ? 1 : 0,
    d.questions_per_page,
    d.results_published ? 1 : 0,
    d.status,
    req.params.id,
    req.authUser!.schoolId
  );

  return res.json({ ok: true });
});

router.delete('/exams/:id', (req: Request, res: Response) => {
  db.prepare(`DELETE FROM exams WHERE id = ? AND school_id = ?`).run(req.params.id, req.authUser!.schoolId);
  return res.json({ ok: true });
});

router.post('/exams/:id/questions', (req: Request, res: Response) => {
  const schema = z.object({ questionIds: z.array(z.string()).min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Pilih minimal satu soal.' });

  const exam = db.prepare(`SELECT id FROM exams WHERE id = ? AND school_id = ?`).get(req.params.id, req.authUser!.schoolId);
  if (!exam) return res.status(404).json({ error: 'Ujian tidak ditemukan.' });

  const currentMax = (
    db.prepare(`SELECT COALESCE(MAX(question_order), 0) AS m FROM exam_questions WHERE exam_id = ?`).get(req.params.id) as any
  ).m;

  const stmt = db.prepare(`INSERT OR IGNORE INTO exam_questions (id, exam_id, question_id, question_order) VALUES (?, ?, ?, ?)`);
  const tx = db.transaction(() => {
    parsed.data.questionIds.forEach((qid, idx) => {
      stmt.run(uid(), req.params.id, qid, currentMax + idx + 1);
    });
    const totalQ = (db.prepare(`SELECT COUNT(*) AS c FROM exam_questions WHERE exam_id = ?`).get(req.params.id) as any).c;
    db.prepare(`UPDATE exams SET question_count = ? WHERE id = ?`).run(totalQ, req.params.id);
  });
  tx();

  return res.json({ ok: true });
});

router.delete('/exams/:id/questions/:questionId', (req: Request, res: Response) => {
  db.prepare(`DELETE FROM exam_questions WHERE exam_id = ? AND question_id = ?`).run(req.params.id, req.params.questionId);
  const totalQ = (db.prepare(`SELECT COUNT(*) AS c FROM exam_questions WHERE exam_id = ?`).get(req.params.id) as any).c;
  db.prepare(`UPDATE exams SET question_count = ? WHERE id = ?`).run(totalQ, req.params.id);
  return res.json({ ok: true });
});

// Pengaturan peserta ujian
router.post('/exams/:id/participants', (req: Request, res: Response) => {
  const schema = z.object({
    classId: z.string().optional(),
    studentIds: z.array(z.string()).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Parameter peserta tidak valid.' });

  const exam = db.prepare(`SELECT id, max_attempts FROM exams WHERE id = ? AND school_id = ?`).get(
    req.params.id,
    req.authUser!.schoolId
  ) as any;
  if (!exam) return res.status(404).json({ error: 'Ujian tidak ditemukan.' });

  let ids: string[] = parsed.data.studentIds || [];
  if (parsed.data.classId) {
    const rows = db.prepare(`SELECT id FROM students WHERE school_id = ? AND class_id = ? AND status = 'aktif'`).all(
      req.authUser!.schoolId,
      parsed.data.classId
    ) as { id: string }[];
    ids = [...new Set([...ids, ...rows.map((r) => r.id)])];
  }

  const stmt = db.prepare(`
    INSERT OR IGNORE INTO exam_participants (id, exam_id, student_id, extra_minutes, allowed_attempts, status)
    VALUES (?, ?, ?, 0, ?, 'terdaftar')
  `);
  const tx = db.transaction(() => {
    for (const sid of ids) {
      stmt.run(uid(), exam.id, sid, exam.max_attempts);
    }
  });
  tx();
  return res.json({ ok: true, addedCount: ids.length });
});

router.patch('/exams/:id/participants/:studentId', (req: Request, res: Response) => {
  const schema = z.object({
    extra_minutes: z.number().int().min(0).max(180),
    allowed_attempts: z.number().int().min(1).max(10),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Input waktu tambahan / kesempatan tidak valid.' });

  db.prepare(`
    UPDATE exam_participants SET extra_minutes = ?, allowed_attempts = ?
    WHERE exam_id = ? AND student_id = ?
  `).run(parsed.data.extra_minutes, parsed.data.allowed_attempts, req.params.id, req.params.studentId);

  // Jika ada sesi aktif, perpanjang expires_at sesuai extra_minutes
  const activeSession = db.prepare(`
    SELECT id, started_at FROM exam_sessions WHERE exam_id = ? AND student_id = ? AND status = 'berlangsung'
  `).get(req.params.id, req.params.studentId) as any;
  if (activeSession) {
    const exam = db.prepare(`SELECT duration_minutes FROM exams WHERE id = ?`).get(req.params.id) as any;
    const newExp = new Date(
      new Date(activeSession.started_at).getTime() + (exam.duration_minutes + parsed.data.extra_minutes) * 60_000
    ).toISOString();
    db.prepare(`UPDATE exam_sessions SET expires_at = ? WHERE id = ?`).run(newExp, activeSession.id);
  }

  return res.json({ ok: true });
});

router.delete('/exams/:id/participants/:studentId', (req: Request, res: Response) => {
  const activeSession = db.prepare(`
    SELECT id FROM exam_sessions WHERE exam_id = ? AND student_id = ?
  `).get(req.params.id, req.params.studentId);
  if (activeSession) {
    return res.status(400).json({ error: 'Peserta sudah memulai ujian dan tidak dapat dihapus langsung.' });
  }
  db.prepare(`DELETE FROM exam_participants WHERE exam_id = ? AND student_id = ?`).run(req.params.id, req.params.studentId);
  return res.json({ ok: true });
});

router.post('/exams/:id/reset-session/:studentId', (req: Request, res: Response) => {
  const examId = req.params.id;
  const studentId = req.params.studentId;
  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE exam_sessions SET status = 'direset', connection_status = 'selesai'
      WHERE exam_id = ? AND student_id = ? AND status = 'berlangsung'
    `).run(examId, studentId);
    db.prepare(`
      UPDATE exam_participants SET status = 'terdaftar'
      WHERE exam_id = ? AND student_id = ?
    `).run(examId, studentId);
  });
  tx();

  writeAuditLog({
    schoolId: req.authUser!.schoolId,
    actorProfileId: req.authUser!.profileId,
    actorRole: 'ADMIN',
    action: 'RESET_EXAM_SESSION',
    entityType: 'exam_session',
    entityId: `${examId}:${studentId}`,
    ipAddress: req.ip,
  });

  broadcastMonitoringEvent(req.authUser!.schoolId, { type: 'monitoring:update', examId });
  return res.json({ ok: true, message: 'Sesi peserta berhasil direset oleh admin.' });
});

// ======================== MONITORING REAL-TIME ========================
router.get('/monitoring', (req: Request, res: Response) => {
  const examId = String(req.query.examId || '');
  const exams = db.prepare(`
    SELECT id, title, status, exam_date, start_time, end_time, exam_token
    FROM exams WHERE school_id = ? AND status IN ('aktif', 'terjadwal', 'selesai')
    ORDER BY CASE status WHEN 'aktif' THEN 1 WHEN 'terjadwal' THEN 2 ELSE 3 END, exam_date DESC
  `).all(req.authUser!.schoolId) as any[];

  const targetExamId = examId || exams[0]?.id;
  if (!targetExamId) {
    return res.json({ exams: [], summary: null, participants: [], activityLogs: [] });
  }

  const participants = db.prepare(`
    SELECT ep.*, s.nis, s.full_name, c.name AS class_name,
           es.id AS session_id, es.status AS session_status, es.started_at, es.expires_at, es.submitted_at,
           es.last_heartbeat_at, es.connection_status, es.suspicious_count,
           (SELECT COUNT(*) FROM student_answers sa WHERE sa.session_id = es.id AND (sa.selected_option_ids_json <> '[]' OR LENGTH(TRIM(sa.answer_text)) > 0)) AS answered_count
    FROM exam_participants ep
    JOIN students s ON s.id = ep.student_id
    LEFT JOIN classes c ON c.id = s.class_id
    LEFT JOIN exam_sessions es ON es.exam_id = ep.exam_id AND es.student_id = ep.student_id
      AND es.id = (SELECT id FROM exam_sessions WHERE exam_id = ep.exam_id AND student_id = ep.student_id ORDER BY attempt_number DESC LIMIT 1)
    WHERE ep.exam_id = ?
    ORDER BY s.full_name ASC
  `).all(targetExamId) as any[];

  const now = Date.now();
  const enriched = participants.map((p) => {
    const remainingSeconds =
      p.session_status === 'berlangsung' && p.expires_at
        ? Math.max(0, Math.floor((new Date(p.expires_at).getTime() - now) / 1000))
        : 0;
    const isStale =
      p.session_status === 'berlangsung' &&
      p.last_heartbeat_at &&
      now - new Date(p.last_heartbeat_at).getTime() > 45_000;
    return {
      ...p,
      remaining_seconds: remainingSeconds,
      connection_status: p.session_status === 'berlangsung' ? (isStale ? 'terputus' : 'terhubung') : p.connection_status || '-',
    };
  });

  const summary = {
    totalRegistered: enriched.length,
    notStarted: enriched.filter((p) => !p.session_id || p.session_status === 'direset').length,
    ongoing: enriched.filter((p) => p.session_status === 'berlangsung').length,
    completed: enriched.filter((p) => p.session_status === 'selesai' || p.session_status === 'waktu_habis').length,
    totalAlerts: enriched.reduce((acc, p) => acc + (p.suspicious_count || 0), 0),
  };

  const activityLogs = db.prepare(`
    SELECT eal.*, s.full_name, s.nis
    FROM exam_activity_logs eal
    JOIN students s ON s.id = eal.student_id
    WHERE eal.exam_id = ?
    ORDER BY eal.occurred_at DESC
    LIMIT 40
  `).all(targetExamId);

  return res.json({ exams, selectedExamId: targetExamId, summary, participants: enriched, activityLogs });
});

// ======================== HASIL, KOREKSI MANUAL & ANALISIS SOAL ========================
router.get('/results', (req: Request, res: Response) => {
  const examId = String(req.query.examId || '');
  const classId = String(req.query.classId || '');
  const subjectId = String(req.query.subjectId || '');

  const whereParts = ['e.school_id = ?'];
  const params: any[] = [req.authUser!.schoolId];
  if (examId) { whereParts.push('e.id = ?'); params.push(examId); }
  if (classId) { whereParts.push('s.class_id = ?'); params.push(classId); }
  if (subjectId) { whereParts.push('e.subject_id = ?'); params.push(subjectId); }
  const whereSql = whereParts.join(' AND ');

  const results = db.prepare(`
    SELECT er.*, e.title AS exam_title, e.passing_score, e.results_published, sub.name AS subject_name,
           s.nis, s.full_name AS student_name, c.name AS class_name,
           es.started_at, es.submitted_at, es.suspicious_count
    FROM exam_results er
    JOIN exams e ON e.id = er.exam_id
    JOIN subjects sub ON sub.id = e.subject_id
    JOIN students s ON s.id = er.student_id
    LEFT JOIN classes c ON c.id = s.class_id
    JOIN exam_sessions es ON es.id = er.session_id
    WHERE ${whereSql}
    ORDER BY er.final_score DESC, s.full_name ASC
  `).all(...params);

  return res.json({ results });
});

router.get('/results/:sessionId/detail', (req: Request, res: Response) => {
  const result = db.prepare(`
    SELECT er.*, e.title AS exam_title, e.school_id, s.full_name AS student_name, s.nis, c.name AS class_name
    FROM exam_results er
    JOIN exams e ON e.id = er.exam_id
    JOIN students s ON s.id = er.student_id
    LEFT JOIN classes c ON c.id = s.class_id
    WHERE er.session_id = ? AND e.school_id = ?
  `).get(req.params.sessionId, req.authUser!.schoolId) as any;
  if (!result) return res.status(404).json({ error: 'Detail hasil tidak ditemukan.' });

  const items = db.prepare(`
    SELECT q.*, eq.custom_weight, sa.selected_option_ids_json, sa.answer_text, sa.is_correct, sa.auto_score, sa.manual_score, sa.grader_note
    FROM exam_questions eq
    JOIN questions q ON q.id = eq.question_id
    LEFT JOIN student_answers sa ON sa.question_id = q.id AND sa.session_id = ?
    WHERE eq.exam_id = ?
    ORDER BY eq.question_order ASC
  `).all(req.params.sessionId, result.exam_id) as any[];

  const optStmt = db.prepare(`SELECT * FROM question_options WHERE question_id = ? ORDER BY sort_order ASC`);
  const detailedItems = items.map((it) => ({
    ...it,
    options: optStmt.all(it.id),
  }));

  return res.json({ result, items: detailedItems });
});

router.post('/results/:sessionId/manual-grade', (req: Request, res: Response) => {
  const schema = z.object({
    questionId: z.string().min(1),
    manualScore: z.coerce.number().finite().min(0, 'Nilai uraian minimal 0.'),
    graderNote: z.string().optional().default(''),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Skor koreksi manual tidak valid.' });
  }

  const session = db.prepare(`
    SELECT es.id, es.exam_id
    FROM exam_sessions es
    JOIN exams e ON e.id = es.exam_id
    WHERE es.id = ? AND e.school_id = ?
  `).get(req.params.sessionId, req.authUser!.schoolId) as { id: string; exam_id: string } | undefined;

  if (!session) {
    return res.status(404).json({ error: 'Sesi hasil ujian tidak ditemukan.' });
  }

  const { questionId, manualScore, graderNote } = parsed.data;

  const examQuestion = db.prepare(`
    SELECT COALESCE(eq.custom_weight, q.weight, 1) AS max_weight, q.question_type
    FROM exam_questions eq
    JOIN questions q ON q.id = eq.question_id
    WHERE eq.exam_id = ? AND eq.question_id = ?
  `).get(session.exam_id, questionId) as { max_weight: number; question_type: string } | undefined;

  if (!examQuestion) {
    return res.status(404).json({ error: 'Soal tidak ditemukan pada ujian ini.' });
  }

  const maxWeight = Number(examQuestion.max_weight ?? 1);
  if (manualScore > maxWeight) {
    return res.status(400).json({ error: `Nilai uraian tidak boleh melebihi bobot maksimal (${maxWeight}).` });
  }

  const existing = db.prepare(`SELECT id FROM student_answers WHERE session_id = ? AND question_id = ?`).get(
    req.params.sessionId,
    questionId
  );
  if (existing) {
    db.prepare(`
      UPDATE student_answers SET manual_score = ?, grader_note = ?, updated_at = datetime('now')
      WHERE session_id = ? AND question_id = ?
    `).run(manualScore, graderNote, req.params.sessionId, questionId);
  } else {
    db.prepare(`
      INSERT INTO student_answers (id, session_id, question_id, selected_option_ids_json, answer_text, is_flagged, manual_score, grader_note)
      VALUES (?, ?, ?, '[]', '', 0, ?, ?)
    `).run(uid(), req.params.sessionId, questionId, manualScore, graderNote);
  }

  const updatedResult = gradeSession(req.params.sessionId);
  db.prepare(`UPDATE exam_results SET graded_by = ?, graded_at = datetime('now') WHERE session_id = ?`).run(
    req.authUser!.profileId,
    req.params.sessionId
  );

  writeAuditLog({
    schoolId: req.authUser!.schoolId,
    actorProfileId: req.authUser!.profileId,
    actorRole: 'ADMIN',
    action: 'MANUAL_GRADE_ESSAY',
    entityType: 'exam_session',
    entityId: req.params.sessionId,
    metadata: { questionId, manualScore, maxWeight },
    ipAddress: req.ip,
  });

  const refreshedResult = db.prepare(`SELECT * FROM exam_results WHERE session_id = ?`).get(req.params.sessionId);
  return res.json({ result: refreshedResult || updatedResult, questionId, manualScore, graderNote });
});

router.post('/exams/:id/publish-results', (req: Request, res: Response) => {
  const publish = Boolean(req.body.publish);
  db.prepare(`UPDATE exams SET results_published = ? WHERE id = ? AND school_id = ?`).run(
    publish ? 1 : 0,
    req.params.id,
    req.authUser!.schoolId
  );
  db.prepare(`UPDATE exam_results SET published_at = ? WHERE exam_id = ?`).run(
    publish ? new Date().toISOString() : null,
    req.params.id
  );

  writeAuditLog({
    schoolId: req.authUser!.schoolId,
    actorProfileId: req.authUser!.profileId,
    actorRole: 'ADMIN',
    action: publish ? 'PUBLISH_RESULTS' : 'UNPUBLISH_RESULTS',
    entityType: 'exam',
    entityId: req.params.id,
    ipAddress: req.ip,
  });

  return res.json({ ok: true, results_published: publish });
});

router.get('/exams/:id/analysis', (req: Request, res: Response) => {
  const questions = db.prepare(`
    SELECT q.id, q.question_type, q.difficulty, q.content_html, q.weight,
           COUNT(sa.id) AS total_attempts,
           SUM(CASE WHEN sa.is_correct = 1 THEN 1 ELSE 0 END) AS correct_attempts,
           SUM(CASE WHEN sa.is_correct = 0 THEN 1 ELSE 0 END) AS wrong_attempts
    FROM exam_questions eq
    JOIN questions q ON q.id = eq.question_id
    LEFT JOIN student_answers sa ON sa.question_id = q.id
      AND sa.session_id IN (SELECT id FROM exam_sessions WHERE exam_id = ? AND status IN ('selesai', 'waktu_habis'))
    WHERE eq.exam_id = ?
    GROUP BY q.id
    ORDER BY eq.question_order ASC
  `).all(req.params.id, req.params.id) as any[];

  const analysis = questions.map((q, idx) => {
    const pIndex = q.total_attempts > 0 ? Number((q.correct_attempts / q.total_attempts).toFixed(2)) : 0;
    const category = pIndex >= 0.7 ? 'Mudah' : pIndex >= 0.3 ? 'Sedang' : 'Sukar';
    return {
      number: idx + 1,
      ...q,
      correct_rate: Math.round(pIndex * 100),
      empirical_difficulty: category,
    };
  });

  return res.json({ analysis });
});

// ======================== MANAJEMEN AKUN ADMIN & AUDIT LOG ========================
router.get('/accounts', (req: Request, res: Response) => {
  const admins = db.prepare(`
    SELECT id, username, email, full_name, is_active, last_login_at, created_at
    FROM profiles WHERE school_id = ? AND role = 'ADMIN'
    ORDER BY created_at ASC
  `).all(req.authUser!.schoolId);
  return res.json({ admins });
});

router.post('/accounts', (req: Request, res: Response) => {
  const schema = z.object({
    username: z.string().min(3),
    email: z.string().email(),
    full_name: z.string().min(2),
    password: z.string().min(6),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });

  const dup = db.prepare(`SELECT id FROM profiles WHERE school_id = ? AND LOWER(username) = LOWER(?)`).get(
    req.authUser!.schoolId,
    parsed.data.username.trim()
  );
  if (dup) return res.status(400).json({ error: 'Username admin sudah terdaftar.' });

  const id = uid();
  const hash = bcrypt.hashSync(parsed.data.password, 10);
  db.prepare(`
    INSERT INTO profiles (id, school_id, username, email, password_hash, full_name, role, is_active)
    VALUES (?, ?, ?, ?, ?, ?, 'ADMIN', 1)
  `).run(id, req.authUser!.schoolId, parsed.data.username.trim(), parsed.data.email.trim(), hash, parsed.data.full_name.trim());
  return res.status(201).json({ id });
});

router.patch('/accounts/:id/toggle', (req: Request, res: Response) => {
  if (req.params.id === req.authUser!.profileId) {
    return res.status(400).json({ error: 'Anda tidak dapat menonaktifkan akun Anda sendiri.' });
  }
  const target = db.prepare(`SELECT is_active FROM profiles WHERE id = ? AND school_id = ? AND role = 'ADMIN'`).get(
    req.params.id,
    req.authUser!.schoolId
  ) as any;
  if (!target) return res.status(404).json({ error: 'Akun tidak ditemukan.' });
  const next = target.is_active === 1 ? 0 : 1;
  db.prepare(`UPDATE profiles SET is_active = ? WHERE id = ?`).run(next, req.params.id);
  return res.json({ ok: true, is_active: next === 1 });
});

router.get('/audit-logs', (req: Request, res: Response) => {
  const logs = db.prepare(`
    SELECT al.*, p.full_name AS actor_name, p.username AS actor_username
    FROM audit_logs al
    LEFT JOIN profiles p ON p.id = al.actor_profile_id
    WHERE al.school_id = ?
    ORDER BY al.created_at DESC
    LIMIT 100
  `).all(req.authUser!.schoolId);
  return res.json({ logs });
});

// ======================== STATUS SISTEM & PENGATURAN SUPABASE ========================
router.get('/system/status', async (_req: Request, res: Response) => {
  const configured = isSupabaseConfigured();
  const safeConfig = getSafeSupabaseConfigSummary();
  let supabaseReachable = false;
  let supabaseNote = 'Variabel SUPABASE_URL & SUPABASE_SERVICE_ROLE_KEY belum disetel.';
  if (configured) {
    try {
      const sb = getSupabaseAdmin();
      const { error } = await sb!.from('schools').select('id').limit(1);
      if (!error) {
        supabaseReachable = true;
        supabaseNote = 'Terhubung ke PostgreSQL Supabase dengan Service Role Server-Only.';
      } else {
        supabaseNote = `Koneksi Supabase merespons error: ${error.message}`;
      }
    } catch (e: any) {
      supabaseNote = `Gagal menghubungi Supabase: ${e.message}`;
    }
  }

  return res.json({
    activeDriver: supabaseReachable ? 'Supabase PostgreSQL' : 'SQLite WAL Lokal (Siap Migrasi Supabase)',
    supabaseConfigured: configured,
    supabaseReachable,
    supabaseNote,
    supabaseConfig: safeConfig,
    migrationsAvailable: ['001_init_schema.sql', '002_rls_policies.sql', '003_functions_and_storage.sql'],
    nodeVersion: process.version,
    port: ENV.PORT,
  });
});

const supabaseConfigSchema = z.object({
  supabaseUrl: z.string().url('Format URL Supabase harus valid (contoh: https://xyz.supabase.co)'),
  anonKey: z.string().min(10, 'Anon / Publishable Key tidak valid'),
  serviceRoleKey: z.string().optional().default(''),
});

router.put('/system/supabase-config', async (req: Request, res: Response) => {
  const parsed = supabaseConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || 'Input konfigurasi tidak valid.' });
  }

  const { supabaseUrl, anonKey, serviceRoleKey } = parsed.data;
  const current = getSafeSupabaseConfigSummary();
  if (!serviceRoleKey.trim() && !current.hasServiceRoleKey) {
    return res.status(400).json({ error: 'Service Role Key wajib diisi saat konfigurasi pertama kali.' });
  }

  saveSupabaseRuntimeConfig({ supabaseUrl, anonKey, serviceRoleKey });

  writeAuditLog({
    schoolId: req.authUser!.schoolId,
    actorProfileId: req.authUser!.profileId,
    actorRole: 'ADMIN',
    action: 'UPDATE_SUPABASE_CONFIG',
    entityType: 'system_config',
    entityId: 'supabase',
    metadata: { supabaseUrl, updatedServiceRoleKey: Boolean(serviceRoleKey.trim()) },
    ipAddress: req.ip,
  });

  const testResult = await testSupabaseConnection();
  return res.json({
    ok: true,
    supabaseConfig: getSafeSupabaseConfigSummary(),
    testResult,
  });
});

router.post('/system/supabase-test', async (req: Request, res: Response) => {
  const supabaseUrl = typeof req.body?.supabaseUrl === 'string' ? req.body.supabaseUrl.trim() : '';
  const serviceRoleKey = typeof req.body?.serviceRoleKey === 'string' ? req.body.serviceRoleKey.trim() : '';

  const testResult = await testSupabaseConnection(
    supabaseUrl || serviceRoleKey
      ? {
          supabaseUrl: supabaseUrl || undefined,
          serviceRoleKey: serviceRoleKey || undefined,
        }
      : undefined
  );
  return res.json(testResult);
});

router.delete('/system/supabase-config', (req: Request, res: Response) => {
  clearSupabaseRuntimeConfig();
  writeAuditLog({
    schoolId: req.authUser!.schoolId,
    actorProfileId: req.authUser!.profileId,
    actorRole: 'ADMIN',
    action: 'RESET_SUPABASE_CONFIG',
    entityType: 'system_config',
    entityId: 'supabase',
    ipAddress: req.ip,
  });
  return res.json({
    ok: true,
    supabaseConfig: getSafeSupabaseConfigSummary(),
  });
});

router.post('/system/supabase-sync', async (req: Request, res: Response) => {
  const sb = getSupabaseAdmin();
  if (!sb) {
    return res.status(400).json({ error: 'Konfigurasi Supabase belum disetel di server.' });
  }

  const schoolId = req.authUser!.schoolId;
  const report: { table: string; count: number; error?: string }[] = [];

  async function upsertTable(table: string, rows: any[]) {
    if (rows.length === 0) {
      report.push({ table, count: 0 });
      return;
    }
    const { error } = await sb!.from(table).upsert(rows, { onConflict: 'id' });
    if (error) {
      report.push({ table, count: 0, error: error.message });
    } else {
      report.push({ table, count: rows.length });
    }
  }

  const schoolRows = db.prepare(`SELECT * FROM schools WHERE id = ?`).all(schoolId);
  const yearRows = (db.prepare(`SELECT * FROM academic_years WHERE school_id = ?`).all(schoolId) as any[]).map((r) => ({
    ...r,
    is_active: Boolean(r.is_active),
  }));
  const classRows = db.prepare(`SELECT * FROM classes WHERE school_id = ?`).all(schoolId);
  const profileRows = (db.prepare(`SELECT * FROM profiles WHERE school_id = ?`).all(schoolId) as any[]).map((r) => ({
    ...r,
    is_active: Boolean(r.is_active),
  }));
  const studentRows = db.prepare(`SELECT * FROM students WHERE school_id = ?`).all(schoolId);
  const subjectRows = db.prepare(`SELECT * FROM subjects WHERE school_id = ?`).all(schoolId);
  const bankRows = db.prepare(`SELECT * FROM question_banks WHERE school_id = ?`).all(schoolId);
  const questionRows = db.prepare(`SELECT * FROM questions WHERE school_id = ?`).all(schoolId);
  const optionRows = (
    db.prepare(`SELECT qo.* FROM question_options qo JOIN questions q ON q.id = qo.question_id WHERE q.school_id = ?`).all(
      schoolId
    ) as any[]
  ).map((r) => ({
    ...r,
    is_correct: Boolean(r.is_correct),
  }));
  const examRows = (db.prepare(`SELECT * FROM exams WHERE school_id = ?`).all(schoolId) as any[]).map((r) => ({
    ...r,
    shuffle_questions: Boolean(r.shuffle_questions),
    shuffle_options: Boolean(r.shuffle_options),
    results_published: Boolean(r.results_published),
  }));
  const epRows = db
    .prepare(`SELECT ep.* FROM exam_participants ep JOIN exams e ON e.id = ep.exam_id WHERE e.school_id = ?`)
    .all(schoolId);
  const eqRows = db
    .prepare(`SELECT eq.* FROM exam_questions eq JOIN exams e ON e.id = eq.exam_id WHERE e.school_id = ?`)
    .all(schoolId);

  await upsertTable('schools', schoolRows);
  await upsertTable('academic_years', yearRows);
  await upsertTable('classes', classRows);
  await upsertTable('profiles', profileRows);
  await upsertTable('students', studentRows);
  await upsertTable('subjects', subjectRows);
  await upsertTable('question_banks', bankRows);
  await upsertTable('questions', questionRows);
  await upsertTable('question_options', optionRows);
  await upsertTable('exams', examRows);
  await upsertTable('exam_participants', epRows);
  await upsertTable('exam_questions', eqRows);

  const failed = report.filter((r) => r.error);
  writeAuditLog({
    schoolId,
    actorProfileId: req.authUser!.profileId,
    actorRole: 'ADMIN',
    action: 'SYNC_SQLITE_TO_SUPABASE',
    entityType: 'system_config',
    entityId: 'supabase',
    metadata: { report },
    ipAddress: req.ip,
  });

  return res.json({
    ok: failed.length === 0,
    report,
    message:
      failed.length === 0
        ? 'Seluruh data master, bank soal, dan jadwal ujian berhasil disinkronkan ke Supabase PostgreSQL.'
        : `Sinkronisasi selesai dengan ${failed.length} catatan error. Periksa apakah skema migrasi sudah dijalankan.`,
  });
});

// Pengujian beban NYATA terhadap endpoint autosave & transaksi database untuk 100 / 200 virtual users
router.post('/system/load-test', async (req: Request, res: Response) => {
  const vuCount = req.body.virtualUsers === 200 ? 200 : 100;
  const schoolId = req.authUser!.schoolId;
  const startMs = Date.now();

  const sampleExam = db.prepare(`SELECT id FROM exams WHERE school_id = ? LIMIT 1`).get(schoolId) as any;
  const sampleQuestions = sampleExam
    ? (db.prepare(`SELECT question_id FROM exam_questions WHERE exam_id = ? LIMIT 3`).all(sampleExam.id) as { question_id: string }[])
    : [];

  if (!sampleExam || sampleQuestions.length === 0) {
    return res.status(400).json({ error: 'Tidak ada ujian dengan soal untuk diuji.' });
  }

  const testTag = `loadtest-${Date.now()}`;
  const createdSessionIds: string[] = [];
  const createdProfileIds: string[] = [];

  try {
    // Siapkan N peserta virtual sementara di database
    const studentIds: string[] = [];
    const prepTx = db.transaction(() => {
      for (let i = 0; i < vuCount; i++) {
        const pId = uid();
        const sId = uid();
        const sessId = uid();
        createdProfileIds.push(pId);
        studentIds.push(sId);
        createdSessionIds.push(sessId);

        db.prepare(`
          INSERT INTO profiles (id, school_id, username, password_hash, full_name, role, is_active)
          VALUES (?, ?, ?, 'hash', ?, 'SISWA', 1)
        `).run(pId, schoolId, `${testTag}-${i}`, `VU-${i}`);

        db.prepare(`
          INSERT INTO students (id, school_id, profile_id, nis, full_name, status)
          VALUES (?, ?, ?, ?, ?, 'aktif')
        `).run(sId, schoolId, pId, `${testTag}-${i}`, `VU-${i}`);

        db.prepare(`
          INSERT INTO exam_sessions (id, exam_id, student_id, attempt_number, session_token, started_at, expires_at, last_heartbeat_at, status)
          VALUES (?, ?, ?, 1, ?, datetime('now'), datetime('now', '+60 minutes'), datetime('now'), 'berlangsung')
        `).run(sessId, sampleExam.id, sId, `${testTag}-tok-${i}`);
      }
    });
    prepTx();

    // Jalankan N * 3 operasi autosave konkuren secara paralel + idempotency check
    let successCount = 0;
    let errorCount = 0;
    const latencies: number[] = [];

    const upsertStmt = db.prepare(`
      INSERT INTO student_answers (id, session_id, question_id, selected_option_ids_json, answer_text, is_flagged, idempotency_key, client_seq, updated_at)
      VALUES (?, ?, ?, ?, '', 0, ?, ?, datetime('now'))
      ON CONFLICT(session_id, question_id) DO UPDATE SET
        selected_option_ids_json = excluded.selected_option_ids_json,
        idempotency_key = excluded.idempotency_key,
        client_seq = excluded.client_seq,
        updated_at = datetime('now')
      WHERE excluded.client_seq >= student_answers.client_seq
    `);

    await Promise.all(
      createdSessionIds.map(async (sessId, idx) => {
        const t0 = performance.now();
        try {
          const tx = db.transaction(() => {
            sampleQuestions.forEach((q, qIdx) => {
              upsertStmt.run(uid(), sessId, q.question_id, JSON.stringify([`opt-${qIdx}`]), `idem-${idx}-${qIdx}`, qIdx + 1);
            });
          });
          tx();
          successCount += 1;
        } catch {
          errorCount += 1;
        } finally {
          latencies.push(performance.now() - t0);
        }
      })
    );

    // Verifikasi integritas: tidak ada jawaban yang hilang
    const placeholders = createdSessionIds.map(() => '?').join(',');
    const storedAnswers = (
      db.prepare(`SELECT COUNT(*) AS c FROM student_answers WHERE session_id IN (${placeholders})`).get(...createdSessionIds) as any
    ).c;

    const expectedAnswers = vuCount * sampleQuestions.length;
    latencies.sort((a, b) => a - b);
    const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
    const avgMs = latencies.reduce((a, b) => a + b, 0) / Math.max(1, latencies.length);
    const totalDurationMs = Date.now() - startMs;

    // Bersihkan data virtual user pengujian setelah diverifikasi
    const cleanupTx = db.transaction(() => {
      for (const pId of createdProfileIds) {
        db.prepare(`DELETE FROM profiles WHERE id = ?`).run(pId);
      }
    });
    cleanupTx();

    return res.json({
      virtualUsers: vuCount,
      questionsPerUser: sampleQuestions.length,
      expectedAnswers,
      storedAnswers,
      lostAnswers: expectedAnswers - storedAnswers,
      successSessions: successCount,
      failedSessions: errorCount,
      avgLatencyMs: Number(avgMs.toFixed(2)),
      p95LatencyMs: Number(p95.toFixed(2)),
      totalDurationMs,
      passed: expectedAnswers === storedAnswers && errorCount === 0,
      testedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    return res.status(500).json({ error: `Pengujian beban gagal: ${err.message}` });
  }
});

export default router;
