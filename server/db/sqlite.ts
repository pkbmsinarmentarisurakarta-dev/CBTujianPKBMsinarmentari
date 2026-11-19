import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { WRITABLE_DATA_DIR } from '../config/env.ts';

const dataDir = WRITABLE_DATA_DIR;
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'cbt.db');
export const db = new Database(dbPath);

// Optimasi konkurensi untuk >= 100-200 peserta bersamaan
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 8000');
db.pragma('cache_size = -16000');

export function uid(): string {
  return crypto.randomUUID();
}

let dbInitialized = false;

export function initDatabase() {
  if (dbInitialized) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS schools (
      id TEXT PRIMARY KEY,
      npsn TEXT UNIQUE,
      name TEXT NOT NULL,
      level TEXT NOT NULL DEFAULT 'SMA/MA',
      address TEXT NOT NULL DEFAULT '',
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      principal_name TEXT DEFAULT '',
      logo_url TEXT DEFAULT '',
      app_title TEXT NOT NULL DEFAULT 'CBT Online Sekolah/Madrasah',
      active_academic_year TEXT NOT NULL DEFAULT '2026/2027',
      active_semester TEXT NOT NULL DEFAULT 'Ganjil',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      username TEXT NOT NULL,
      email TEXT,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('ADMIN', 'SISWA')),
      is_active INTEGER NOT NULL DEFAULT 1,
      failed_login_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT,
      last_login_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(school_id, username)
    );
    CREATE INDEX IF NOT EXISTS idx_profiles_school_role ON profiles(school_id, role);
    CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);

    CREATE TABLE IF NOT EXISTS academic_years (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      year_label TEXT NOT NULL,
      semester TEXT NOT NULL CHECK (semester IN ('Ganjil', 'Genap')),
      is_active INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(school_id, year_label, semester)
    );

    CREATE TABLE IF NOT EXISTS classes (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      academic_year_id TEXT REFERENCES academic_years(id) ON DELETE SET NULL,
      academic_year_label TEXT NOT NULL DEFAULT '2026/2027',
      name TEXT NOT NULL,
      grade_level TEXT NOT NULL DEFAULT 'XII',
      major TEXT DEFAULT '',
      homeroom_teacher TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(school_id, academic_year_label, name)
    );
    CREATE INDEX IF NOT EXISTS idx_classes_school_year ON classes(school_id, academic_year_label);

    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      profile_id TEXT NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
      class_id TEXT REFERENCES classes(id) ON DELETE SET NULL,
      nis TEXT NOT NULL,
      nisn TEXT DEFAULT '',
      full_name TEXT NOT NULL,
      gender TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif', 'nonaktif')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(school_id, nis)
    );
    CREATE INDEX IF NOT EXISTS idx_students_school_class ON students(school_id, class_id);

    CREATE TABLE IF NOT EXISTS subjects (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Wajib',
      description TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(school_id, code)
    );

    CREATE TABLE IF NOT EXISTS question_banks (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      created_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      grade_level TEXT NOT NULL DEFAULT 'Semua',
      description TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      bank_id TEXT REFERENCES question_banks(id) ON DELETE CASCADE,
      subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      grade_level TEXT NOT NULL DEFAULT 'XII',
      question_type TEXT NOT NULL CHECK (question_type IN ('single_choice', 'multiple_choice', 'true_false', 'short_answer', 'essay')),
      difficulty TEXT NOT NULL DEFAULT 'sedang' CHECK (difficulty IN ('mudah', 'sedang', 'sulit')),
      content_html TEXT NOT NULL,
      latex_formula TEXT DEFAULT '',
      image_url TEXT DEFAULT '',
      image_width TEXT DEFAULT '100%',
      table_json TEXT DEFAULT '',
      correct_answer_text TEXT DEFAULT '',
      answer_rules_json TEXT DEFAULT '{}',
      weight REAL NOT NULL DEFAULT 1.0,
      explanation TEXT DEFAULT '',
      created_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_questions_school_subj_diff ON questions(school_id, subject_id, difficulty);

    CREATE TABLE IF NOT EXISTS question_options (
      id TEXT PRIMARY KEY,
      question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      option_label TEXT NOT NULL,
      content_html TEXT NOT NULL,
      image_url TEXT DEFAULT '',
      is_correct INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_qoptions_question ON question_options(question_id);

    CREATE TABLE IF NOT EXISTS exams (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
      class_id TEXT REFERENCES classes(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      exam_type TEXT NOT NULL DEFAULT 'Penilaian Tengah Semester',
      academic_year TEXT NOT NULL DEFAULT '2026/2027',
      semester TEXT NOT NULL DEFAULT 'Ganjil' CHECK (semester IN ('Ganjil', 'Genap')),
      description TEXT DEFAULT '',
      exam_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL,
      question_count INTEGER NOT NULL DEFAULT 0,
      passing_score REAL NOT NULL DEFAULT 75.0,
      rounding_mode TEXT NOT NULL DEFAULT 'two_decimals',
      exam_token TEXT NOT NULL,
      max_attempts INTEGER NOT NULL DEFAULT 1,
      shuffle_questions INTEGER NOT NULL DEFAULT 1,
      shuffle_options INTEGER NOT NULL DEFAULT 1,
      questions_per_page INTEGER NOT NULL DEFAULT 1,
      results_published INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'terjadwal', 'aktif', 'selesai', 'diarsipkan')),
      created_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_exams_school_status_date ON exams(school_id, status, exam_date);

    CREATE TABLE IF NOT EXISTS exam_participants (
      id TEXT PRIMARY KEY,
      exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      extra_minutes INTEGER NOT NULL DEFAULT 0,
      allowed_attempts INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'terdaftar' CHECK (status IN ('terdaftar', 'sedang_ujian', 'selesai')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(exam_id, student_id)
    );
    CREATE INDEX IF NOT EXISTS idx_eparticipants_exam_student ON exam_participants(exam_id, student_id);

    CREATE TABLE IF NOT EXISTS exam_questions (
      id TEXT PRIMARY KEY,
      exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
      question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      question_order INTEGER NOT NULL DEFAULT 1,
      custom_weight REAL,
      UNIQUE(exam_id, question_id)
    );

    CREATE TABLE IF NOT EXISTS exam_sessions (
      id TEXT PRIMARY KEY,
      exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      attempt_number INTEGER NOT NULL DEFAULT 1,
      session_token TEXT NOT NULL UNIQUE,
      question_order_json TEXT NOT NULL DEFAULT '[]',
      option_order_json TEXT NOT NULL DEFAULT '{}',
      started_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      submitted_at TEXT,
      last_heartbeat_at TEXT NOT NULL,
      connection_status TEXT NOT NULL DEFAULT 'terhubung',
      status TEXT NOT NULL DEFAULT 'berlangsung' CHECK (status IN ('berlangsung', 'selesai', 'waktu_habis', 'direset')),
      suspicious_count INTEGER NOT NULL DEFAULT 0,
      ip_address TEXT DEFAULT '',
      user_agent TEXT DEFAULT '',
      UNIQUE(exam_id, student_id, attempt_number)
    );
    CREATE INDEX IF NOT EXISTS idx_esessions_exam_status ON exam_sessions(exam_id, status);

    CREATE TABLE IF NOT EXISTS student_answers (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
      question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      selected_option_ids_json TEXT NOT NULL DEFAULT '[]',
      answer_text TEXT DEFAULT '',
      is_flagged INTEGER NOT NULL DEFAULT 0,
      is_correct INTEGER,
      auto_score REAL DEFAULT 0,
      manual_score REAL,
      grader_note TEXT DEFAULT '',
      idempotency_key TEXT,
      client_seq INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(session_id, question_id)
    );
    CREATE INDEX IF NOT EXISTS idx_sanswers_session ON student_answers(session_id);

    CREATE TABLE IF NOT EXISTS exam_activity_logs (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES exam_sessions(id) ON DELETE CASCADE,
      exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      details TEXT DEFAULT '',
      occurred_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_eactivity_exam_student ON exam_activity_logs(exam_id, student_id, occurred_at);

    CREATE TABLE IF NOT EXISTS exam_results (
      id TEXT PRIMARY KEY,
      exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
      session_id TEXT NOT NULL UNIQUE REFERENCES exam_sessions(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      raw_score REAL NOT NULL DEFAULT 0,
      max_score REAL NOT NULL DEFAULT 100,
      final_score REAL NOT NULL DEFAULT 0,
      correct_count INTEGER NOT NULL DEFAULT 0,
      wrong_count INTEGER NOT NULL DEFAULT 0,
      unanswered_count INTEGER NOT NULL DEFAULT 0,
      needs_manual_grading INTEGER NOT NULL DEFAULT 0,
      graded_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
      graded_at TEXT,
      published_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      actor_profile_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
      actor_role TEXT NOT NULL DEFAULT 'SYSTEM',
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT DEFAULT '',
      metadata_json TEXT DEFAULT '{}',
      ip_address TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_audit_school_created ON audit_logs(school_id, created_at);
  `);

  const schoolCount = db.prepare('SELECT COUNT(*) as c FROM schools').get() as { c: number };
  if (schoolCount.c === 0) {
    seedInitialData();
  }
  dbInitialized = true;
}

function seedInitialData() {
  const schoolId = '11111111-1111-4111-8111-111111111111';
  const adminProfileId = '10000000-0000-4000-8000-000000000001';
  const yearId = '22222222-2222-4222-8222-222222222221';

  const adminPassHash = bcrypt.hashSync('AdminCBT2026!', 10);
  const studentPassHash = bcrypt.hashSync('Siswa2026!', 10);

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO schools (id, npsn, name, level, address, phone, email, principal_name, logo_url, app_title, active_academic_year, active_semester)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      schoolId,
      '20327981',
      'MA/SMA Nusantara Cendekia',
      'SMA/MA',
      'Jl. Pendidikan No. 45, Kota Surakarta, Jawa Tengah 57139',
      '(0271) 654321',
      'kurikulum@nusantaracendekia.sch.id',
      'Drs. H. Ahmad Fauzan, M.Pd.',
      '/images/school-logo.jpg',
      'CBT Online Sekolah/Madrasah',
      '2026/2027',
      'Ganjil'
    );

    db.prepare(`
      INSERT INTO academic_years (id, school_id, year_label, semester, is_active)
      VALUES (?, ?, ?, ?, 1)
    `).run(yearId, schoolId, '2026/2027', 'Ganjil');

    db.prepare(`
      INSERT INTO profiles (id, school_id, username, email, password_hash, full_name, role, is_active)
      VALUES (?, ?, ?, ?, ?, ?, 'ADMIN', 1)
    `).run(adminProfileId, schoolId, 'admin', 'admin@nusantaracendekia.sch.id', adminPassHash, 'Operator Kurikulum Utama');

    const classesData = [
      { id: '30000000-0000-4000-8000-000000000001', name: 'XII IPA 1', grade: 'XII', major: 'Matematika & Ilmu Alam', teacher: 'Dra. Siti Aminah, M.Pd.' },
      { id: '30000000-0000-4000-8000-000000000002', name: 'XII IPA 2', grade: 'XII', major: 'Matematika & Ilmu Alam', teacher: 'Budi Santoso, S.Si., M.Pd.' },
      { id: '30000000-0000-4000-8000-000000000003', name: 'XII IPS 1', grade: 'XII', major: 'Ilmu Sosial', teacher: 'Rina Kusuma, S.Pd.' },
    ];
    for (const c of classesData) {
      db.prepare(`
        INSERT INTO classes (id, school_id, academic_year_id, academic_year_label, name, grade_level, major, homeroom_teacher)
        VALUES (?, ?, ?, '2026/2027', ?, ?, ?, ?)
      `).run(c.id, schoolId, yearId, c.name, c.grade, c.major, c.teacher);
    }

    const studentsData = [
      { nis: '20261001', nisn: '0084512001', name: 'Aisyah Putri Maharani', gender: 'P', classId: classesData[0].id, username: '20261001' },
      { nis: '20261002', nisn: '0084512002', name: 'Muhammad Rizky Pratama', gender: 'L', classId: classesData[0].id, username: '20261002' },
      { nis: '20261003', nisn: '0084512003', name: 'Nadia Zahra Ramadhani', gender: 'P', classId: classesData[0].id, username: '20261003' },
      { nis: '20261004', nisn: '0084512004', name: 'Dimas Aditya Saputra', gender: 'L', classId: classesData[0].id, username: '20261004' },
      { nis: '20261005', nisn: '0084512005', name: 'Fajar Nugroho Wibowo', gender: 'L', classId: classesData[1].id, username: '20261005' },
      { nis: '20261006', nisn: '0084512006', name: 'Salsabila Khairunnisa', gender: 'P', classId: classesData[1].id, username: '20261006' },
      { nis: '20261007', nisn: '0084512007', name: 'Bagas Prakoso Putra', gender: 'L', classId: classesData[1].id, username: '20261007' },
      { nis: '20261008', nisn: '0084512008', name: 'Lutfia Nur Hidayah', gender: 'P', classId: classesData[2].id, username: '20261008' },
    ];

    const studentIds: string[] = [];
    for (let i = 0; i < studentsData.length; i++) {
      const s = studentsData[i];
      const pId = `10000000-0000-4000-8000-00000000010${i + 1}`;
      const sId = `40000000-0000-4000-8000-00000000010${i + 1}`;
      studentIds.push(sId);
      db.prepare(`
        INSERT INTO profiles (id, school_id, username, email, password_hash, full_name, role, is_active)
        VALUES (?, ?, ?, ?, ?, ?, 'SISWA', 1)
      `).run(pId, schoolId, s.username, `${s.username}@siswa.nusantaracendekia.sch.id`, studentPassHash, s.name);

      db.prepare(`
        INSERT INTO students (id, school_id, profile_id, class_id, nis, nisn, full_name, gender, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'aktif')
      `).run(sId, schoolId, pId, s.classId, s.nis, s.nisn, s.name, s.gender);
    }

    const subjectsData = [
      { id: '50000000-0000-4000-8000-000000000001', code: 'MAT-12', name: 'Matematika Peminatan', category: 'Peminatan MIPA', desc: 'Kalkulus diferensial, integral, dan matriks transformasi.' },
      { id: '50000000-0000-4000-8000-000000000002', code: 'FIS-12', name: 'Fisika', category: 'Peminatan MIPA', desc: 'Mekanika Newton, usaha energi, dan listrik dinamis.' },
      { id: '50000000-0000-4000-8000-000000000003', code: 'KIM-12', name: 'Kimia', category: 'Peminatan MIPA', desc: 'Stoikiometri reaksi, kesetimbangan kimia, dan larutan.' },
      { id: '50000000-0000-4000-8000-000000000004', code: 'BIO-12', name: 'Biologi', category: 'Peminatan MIPA', desc: 'Struktur sel, metabolisme, dan genetika molekuler.' },
    ];
    for (const sub of subjectsData) {
      db.prepare(`
        INSERT INTO subjects (id, school_id, code, name, category, description)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(sub.id, schoolId, sub.code, sub.name, sub.category, sub.desc);
    }

    const bankMipaId = '60000000-0000-4000-8000-000000000001';
    const bankSainsId = '60000000-0000-4000-8000-000000000002';
    db.prepare(`
      INSERT INTO question_banks (id, school_id, subject_id, created_by, title, grade_level, description)
      VALUES (?, ?, ?, ?, ?, 'XII', ?)
    `).run(bankMipaId, schoolId, subjectsData[0].id, adminProfileId, 'Bank Soal PAS Matematika & Kalkulus XII', 'Kumpulan soal evaluasi kalkulus, matriks, dan aljabar tingkat lanjut.');
    db.prepare(`
      INSERT INTO question_banks (id, school_id, subject_id, created_by, title, grade_level, description)
      VALUES (?, ?, ?, ?, ?, 'XII', ?)
    `).run(bankSainsId, schoolId, subjectsData[1].id, adminProfileId, 'Bank Soal Terpadu Sains (Fisika, Kimia, Biologi)', 'Soal bergambar, tabel pengamatan, dan reaksi kimia.');

    const insertQ = db.prepare(`
      INSERT INTO questions (id, school_id, bank_id, subject_id, grade_level, question_type, difficulty, content_html, latex_formula, image_url, image_width, table_json, correct_answer_text, answer_rules_json, weight, explanation, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertOpt = db.prepare(`
      INSERT INTO question_options (id, question_id, option_label, content_html, image_url, is_correct, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    // Soal 1: Pilihan Ganda Tunggal - Integral Matematika
    const q1 = '70000000-0000-4000-8000-000000000001';
    insertQ.run(
      q1, schoolId, bankMipaId, subjectsData[0].id, 'XII', 'single_choice', 'sedang',
      '<p>Hitunglah nilai dari integral tentu berikut:</p>',
      '\\int_{0}^{2} (3x^2 + 2x - 1)\\,dx',
      '', '100%', '', '', '{}', 15,
      'Antiturunan dari 3x² + 2x - 1 adalah x³ + x² - x. Substitusi batas 0 hingga 2 menghasilkan 8 + 4 - 2 = 10.', adminProfileId
    );
    insertOpt.run(uid(), q1, 'A', '$$8$$', '', 0, 1);
    insertOpt.run(uid(), q1, 'B', '$$10$$', '', 1, 2);
    insertOpt.run(uid(), q1, 'C', '$$12$$', '', 0, 3);
    insertOpt.run(uid(), q1, 'D', '$$14$$', '', 0, 4);

    // Soal 2: Pilihan Ganda Kompleks - Matriks & Turunan
    const q2 = '70000000-0000-4000-8000-000000000002';
    insertQ.run(
      q2, schoolId, bankMipaId, subjectsData[0].id, 'XII', 'multiple_choice', 'sulit',
      '<p>Diketahui fungsi $f(x) = x^3 - 6x^2 + 9x + 2$ dan matriks $A = \\begin{pmatrix} 2 & 1 \\\\ 1 & 3 \\end{pmatrix}$. Pilih <strong>dua</strong> pernyataan yang bernilai benar:</p>',
      '', '', '100%', '', '', '{}', 20,
      'Turunan pertama f\'(x) = 3x² - 12x + 9 = 3(x-1)(x-3), sehingga stasioner di x=1 dan x=3. Determinan A = 2(3) - 1(1) = 5.', adminProfileId
    );
    insertOpt.run(uid(), q2, 'A', 'Turunan pertama adalah $f\'(x) = 3x^2 - 12x + 9$', '', 1, 1);
    insertOpt.run(uid(), q2, 'B', 'Determinan matriks $A$ bernilai $7$', '', 0, 2);
    insertOpt.run(uid(), q2, 'C', 'Determinan matriks $A$ bernilai $5$', '', 1, 3);
    insertOpt.run(uid(), q2, 'D', 'Titik stasioner terjadi pada $x = 2$ dan $x = 4$', '', 0, 4);

    // Soal 3: Soal Bergambar Fisika - Bidang Miring
    const q3 = '70000000-0000-4000-8000-000000000003';
    insertQ.run(
      q3, schoolId, bankSainsId, subjectsData[1].id, 'XII', 'single_choice', 'sedang',
      '<p>Perhatikan diagram gaya pada balok bermassa $m = 4\\text{ kg}$ di atas bidang miring licin ($f_k = 0$) dengan sudut kemiringan $\\theta = 30^\\circ$ dan percepatan gravitasi $g = 10\\text{ m/s}^2$. Besar gaya normal $N$ yang bekerja pada balok adalah...</p>',
      'N = m \\cdot g \\cdot \\cos(30^\\circ)',
      '/images/soal-fisika.jpg', '65%', '', '', '{}', 15,
      'N = 4 × 10 × cos(30°) = 40 × (1/2)√3 = 20√3 N.', adminProfileId
    );
    insertOpt.run(uid(), q3, 'A', '$20\\text{ N}$', '', 0, 1);
    insertOpt.run(uid(), q3, 'B', '$20\\sqrt{2}\\text{ N}$', '', 0, 2);
    insertOpt.run(uid(), q3, 'C', '$20\\sqrt{3}\\text{ N}$', '', 1, 3);
    insertOpt.run(uid(), q3, 'D', '$40\\text{ N}$', '', 0, 4);

    // Soal 4: Soal Bergambar Biologi - Struktur Sel Tumbuhan
    const q4 = '70000000-0000-4000-8000-000000000004';
    insertQ.run(
      q4, schoolId, bankSainsId, subjectsData[3].id, 'XII', 'single_choice', 'mudah',
      '<p>Berdasarkan diagram penampang sel tumbuhan di bawah ini, organel yang berperan sebagai tempat berlangsungnya reaksi fotosintesis adalah...</p>',
      '',
      '/images/soal-biologi.jpg', '65%', '', '', '{}', 10,
      'Kloroplas mengandung klorofil untuk menangkap energi cahaya pada fotosintesis.', adminProfileId
    );
    insertOpt.run(uid(), q4, 'A', 'Central Vacuole (Vakuola Sentral)', '', 0, 1);
    insertOpt.run(uid(), q4, 'B', 'Chloroplast (Kloroplas)', '', 1, 2);
    insertOpt.run(uid(), q4, 'C', 'Golgi Apparatus (Badan Golgi)', '', 0, 3);
    insertOpt.run(uid(), q4, 'D', 'Ribosomes (Ribosom)', '', 0, 4);

    // Soal 5: Benar / Salah - Reaksi Kimia & Kesetimbangan
    const q5 = '70000000-0000-4000-8000-000000000005';
    insertQ.run(
      q5, schoolId, bankSainsId, subjectsData[2].id, 'XII', 'true_false', 'mudah',
      '<p>Perhatikan reaksi kesetimbangan proses Haber-Bosch berikut:</p><p>Jika tekanan sistem diperbesar pada suhu tetap, kesetimbangan akan bergeser ke arah kanan membentuk lebih banyak gas amonia ($NH_3$).</p>',
      'N_2(g) + 3H_2(g) \\rightleftharpoons 2NH_3(g) \\quad \\Delta H = -92\\text{ kJ}',
      '', '100%', '', '', '{}', 10,
      'Benar. Pembesaran tekanan menggeser kesetimbangan ke jumlah koefisien gas yang lebih kecil (4 mol -> 2 mol, arah kanan).', adminProfileId
    );
    insertOpt.run(uid(), q5, 'B', 'Benar', '', 1, 1);
    insertOpt.run(uid(), q5, 'S', 'Salah', '', 0, 2);

    // Soal 6: Soal Berbasis Tabel + Isian Singkat
    const q6 = '70000000-0000-4000-8000-000000000006';
    const tableJson = JSON.stringify({
      headers: ['Percobaan', '[A] (M)', '[B] (M)', 'Laju Awal (M/s)'],
      rows: [
        ['1', '0.1', '0.1', '0.02'],
        ['2', '0.2', '0.1', '0.08'],
        ['3', '0.1', '0.2', '0.04'],
      ],
    });
    insertQ.run(
      q6, schoolId, bankSainsId, subjectsData[2].id, 'XII', 'short_answer', 'sedang',
      '<p>Perhatikan tabel data laju reaksi $A + B \\rightarrow C$ berikut. Tentukan <strong>orde reaksi total</strong> dari reaksi tersebut (tulis angka saja)!</p>',
      '', '', '100%', tableJson, '3',
      JSON.stringify({ aliases: ['3', 'tiga', '3.0'], caseSensitive: false }), 15,
      'Orde terhadap A = 2 (konsentrasi 2x, laju 4x), orde terhadap B = 1 (konsentrasi 2x, laju 2x). Orde total = 2 + 1 = 3.', adminProfileId
    );

    // Soal 7: Uraian - Persamaan Aljabar & Akar Kuadrat
    const q7 = '70000000-0000-4000-8000-000000000007';
    insertQ.run(
      q7, schoolId, bankMipaId, subjectsData[0].id, 'XII', 'essay', 'sulit',
      '<p>Sebuah benda bergerak dengan persamaan kecepatan $v(t) = 3t^2 - 4t + 2\\text{ m/s}$. Jika posisi awal benda pada $t = 0$ adalah $s(0) = 5\\text{ m}$, tentukan persamaan posisi $s(t)$ dan posisi benda saat $t = 3\\text{ detik}$ beserta langkah penyelesaiannya!</p>',
      's(t) = s(0) + \\int_{0}^{t} v(u)\\,du',
      '', '100%', '', '', '{}', 15,
      's(t) = t³ - 2t² + 2t + 5. Untuk t=3, s(3) = 27 - 18 + 6 + 5 = 20 meter.', adminProfileId
    );

    // Ujian 1: UJIAN AKTIF (Bisa langsung dikerjakan siswa dengan token CBT2026)
    const activeExamId = '80000000-0000-4000-8000-000000000001';
    const today = new Date().toISOString().slice(0, 10);
    db.prepare(`
      INSERT INTO exams (id, school_id, subject_id, class_id, title, exam_type, academic_year, semester, description, exam_date, start_time, end_time, duration_minutes, question_count, passing_score, rounding_mode, exam_token, max_attempts, shuffle_questions, shuffle_options, questions_per_page, results_published, status, created_by)
      VALUES (?, ?, ?, ?, ?, ?, '2026/2027', 'Ganjil', ?, ?, '07:00', '23:59', 60, 7, 75, 'two_decimals', 'CBT2026', 2, 1, 1, 1, 0, 'aktif', ?)
    `).run(
      activeExamId,
      schoolId,
      subjectsData[0].id,
      classesData[0].id,
      'Asesmen Sumatif Tengah Semester — MIPA Terpadu',
      'Penilaian Tengah Semester',
      'Ujian berbasis komputer mencakup soal kalkulus LaTeX, bidang miring fisika, struktur sel biologi, kesetimbangan kimia, tabel laju reaksi, dan uraian.',
      today,
      adminProfileId
    );

    const examQs = [q1, q2, q3, q4, q5, q6, q7];
    examQs.forEach((qid, idx) => {
      db.prepare(`
        INSERT INTO exam_questions (id, exam_id, question_id, question_order)
        VALUES (?, ?, ?, ?)
      `).run(uid(), activeExamId, qid, idx + 1);
    });

    for (const sId of studentIds) {
      db.prepare(`
        INSERT INTO exam_participants (id, exam_id, student_id, extra_minutes, allowed_attempts, status)
        VALUES (?, ?, ?, 0, 2, 'terdaftar')
      `).run(uid(), activeExamId, sId);
    }

    // Ujian 2: UJIAN SELESAI & DIPUBLIKASIKAN (Untuk grafik laporan & riwayat nilai)
    const pastExamId = '80000000-0000-4000-8000-000000000002';
    db.prepare(`
      INSERT INTO exams (id, school_id, subject_id, class_id, title, exam_type, academic_year, semester, description, exam_date, start_time, end_time, duration_minutes, question_count, passing_score, rounding_mode, exam_token, max_attempts, shuffle_questions, shuffle_options, questions_per_page, results_published, status, created_by)
      VALUES (?, ?, ?, ?, ?, ?, '2026/2027', 'Ganjil', ?, '2026-10-20', '08:00', '10:00', 90, 4, 75, 'two_decimals', 'TRYOUT1', 1, 1, 1, 1, 1, 'selesai', ?)
    `).run(
      pastExamId,
      schoolId,
      subjectsData[1].id,
      classesData[0].id,
      'Try Out Asesmen Nasional — Fisika & Sains',
      'Try Out',
      'Evaluasi kesiapan ujian akhir semester mata pelajaran Fisika & Sains.',
      adminProfileId
    );

    [q3, q4, q5, q6].forEach((qid, idx) => {
      db.prepare(`INSERT INTO exam_questions (id, exam_id, question_id, question_order) VALUES (?, ?, ?, ?)`).run(uid(), pastExamId, qid, idx + 1);
    });

    const sampleScores = [92, 85, 78, 88, 72, 95, 81, 84];
    for (let i = 0; i < studentIds.length; i++) {
      const sId = studentIds[i];
      const sessId = `90000000-0000-4000-8000-00000000020${i + 1}`;
      db.prepare(`
        INSERT INTO exam_participants (id, exam_id, student_id, extra_minutes, allowed_attempts, status)
        VALUES (?, ?, ?, 0, 1, 'selesai')
      `).run(uid(), pastExamId, sId);
      db.prepare(`
        INSERT INTO exam_sessions (id, exam_id, student_id, attempt_number, session_token, started_at, expires_at, submitted_at, last_heartbeat_at, connection_status, status, suspicious_count)
        VALUES (?, ?, ?, 1, ?, '2026-10-20T08:02:00.000Z', '2026-10-20T09:32:00.000Z', '2026-10-20T09:14:00.000Z', '2026-10-20T09:14:00.000Z', 'selesai', 'selesai', ?)
      `).run(sessId, pastExamId, sId, `past-sess-${i + 1}`, i === 3 ? 1 : 0);

      const finalScore = sampleScores[i];
      const correct = finalScore >= 85 ? 4 : 3;
      db.prepare(`
        INSERT INTO exam_results (id, exam_id, session_id, student_id, raw_score, max_score, final_score, correct_count, wrong_count, unanswered_count, needs_manual_grading, graded_by, graded_at, published_at)
        VALUES (?, ?, ?, ?, ?, 100, ?, ?, ?, 0, 0, ?, '2026-10-20T10:00:00.000Z', '2026-10-20T12:00:00.000Z')
      `).run(uid(), pastExamId, sessId, sId, finalScore, finalScore, correct, 4 - correct, adminProfileId);
    }

    db.prepare(`
      INSERT INTO audit_logs (id, school_id, actor_profile_id, actor_role, action, entity_type, entity_id, metadata_json)
      VALUES (?, ?, ?, 'ADMIN', 'INIT_SYSTEM', 'school', ?, ?)
    `).run(uid(), schoolId, adminProfileId, schoolId, JSON.stringify({ note: 'Inisialisasi basis data awal CBT Sekolah/Madrasah' }));
  });

  tx();
}
