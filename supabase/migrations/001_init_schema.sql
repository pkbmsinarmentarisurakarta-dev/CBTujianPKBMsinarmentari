-- ============================================================================
-- 001_init_schema.sql
-- Skema Database PostgreSQL / Supabase untuk CBT Online Sekolah/Madrasah
-- Mencakup 17 tabel inti, relasi, constraint, check, dan indeks performa.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. schools
CREATE TABLE IF NOT EXISTS public.schools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  npsn VARCHAR(32) UNIQUE,
  name VARCHAR(200) NOT NULL,
  level VARCHAR(50) NOT NULL DEFAULT 'SMA/MA' CHECK (level IN ('SD/MI', 'SMP/MTs', 'SMA/MA', 'SMK', 'PKBM', 'Lembaga')),
  address TEXT NOT NULL DEFAULT '',
  phone VARCHAR(40) DEFAULT '',
  email VARCHAR(160) DEFAULT '',
  principal_name VARCHAR(160) DEFAULT '',
  logo_url TEXT DEFAULT '',
  app_title VARCHAR(160) NOT NULL DEFAULT 'CBT Online Sekolah/Madrasah',
  active_academic_year VARCHAR(20) NOT NULL DEFAULT '2026/2027',
  active_semester VARCHAR(16) NOT NULL DEFAULT 'Ganjil' CHECK (active_semester IN ('Ganjil', 'Genap')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. profiles (terhubung ke auth.users pada Supabase Auth)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID UNIQUE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  username VARCHAR(80) NOT NULL,
  email VARCHAR(160),
  password_hash TEXT NOT NULL,
  full_name VARCHAR(160) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('ADMIN', 'SISWA')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_login_attempts >= 0),
  locked_until TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, username)
);

CREATE INDEX IF NOT EXISTS idx_profiles_school_role ON public.profiles(school_id, role);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- 3. academic_years
CREATE TABLE IF NOT EXISTS public.academic_years (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  year_label VARCHAR(20) NOT NULL,
  semester VARCHAR(16) NOT NULL CHECK (semester IN ('Ganjil', 'Genap')),
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, year_label, semester)
);

-- 4. classes
CREATE TABLE IF NOT EXISTS public.classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id UUID REFERENCES public.academic_years(id) ON DELETE SET NULL,
  academic_year_label VARCHAR(20) NOT NULL DEFAULT '2026/2027',
  name VARCHAR(80) NOT NULL,
  grade_level VARCHAR(20) NOT NULL DEFAULT 'XII',
  major VARCHAR(80) DEFAULT '',
  homeroom_teacher VARCHAR(160) DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, academic_year_label, name)
);

CREATE INDEX IF NOT EXISTS idx_classes_school_year ON public.classes(school_id, academic_year_label);

-- 5. students
CREATE TABLE IF NOT EXISTS public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  nis VARCHAR(40) NOT NULL,
  nisn VARCHAR(40) DEFAULT '',
  full_name VARCHAR(160) NOT NULL,
  gender VARCHAR(16) CHECK (gender IN ('L', 'P', '')),
  status VARCHAR(20) NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif', 'nonaktif')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, nis)
);

CREATE INDEX IF NOT EXISTS idx_students_school_class ON public.students(school_id, class_id);
CREATE INDEX IF NOT EXISTS idx_students_nis ON public.students(school_id, nis);

-- 6. subjects
CREATE TABLE IF NOT EXISTS public.subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  code VARCHAR(32) NOT NULL,
  name VARCHAR(160) NOT NULL,
  category VARCHAR(80) NOT NULL DEFAULT 'Wajib',
  description TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, code)
);

CREATE INDEX IF NOT EXISTS idx_subjects_school ON public.subjects(school_id);

-- 7. question_banks
CREATE TABLE IF NOT EXISTS public.question_banks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  title VARCHAR(200) NOT NULL,
  grade_level VARCHAR(20) NOT NULL DEFAULT 'Semua',
  description TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qbanks_school_subject ON public.question_banks(school_id, subject_id);

-- 8. questions
CREATE TABLE IF NOT EXISTS public.questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  bank_id UUID REFERENCES public.question_banks(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  grade_level VARCHAR(20) NOT NULL DEFAULT 'XII',
  question_type VARCHAR(32) NOT NULL CHECK (
    question_type IN ('single_choice', 'multiple_choice', 'true_false', 'short_answer', 'essay')
  ),
  difficulty VARCHAR(16) NOT NULL DEFAULT 'sedang' CHECK (difficulty IN ('mudah', 'sedang', 'sulit')),
  content_html TEXT NOT NULL,
  latex_formula TEXT DEFAULT '',
  image_url TEXT DEFAULT '',
  image_width VARCHAR(20) DEFAULT '100%',
  table_json TEXT DEFAULT '',
  correct_answer_text TEXT DEFAULT '',
  answer_rules_json TEXT DEFAULT '{}',
  weight NUMERIC(6,2) NOT NULL DEFAULT 1.0 CHECK (weight > 0),
  explanation TEXT DEFAULT '',
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_questions_school_subj_diff ON public.questions(school_id, subject_id, difficulty);
CREATE INDEX IF NOT EXISTS idx_questions_bank ON public.questions(bank_id);

-- 9. question_options
CREATE TABLE IF NOT EXISTS public.question_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  option_label VARCHAR(8) NOT NULL,
  content_html TEXT NOT NULL,
  image_url TEXT DEFAULT '',
  is_correct BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_qoptions_question ON public.question_options(question_id);

-- 10. exams
CREATE TABLE IF NOT EXISTS public.exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE RESTRICT,
  class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  title VARCHAR(200) NOT NULL,
  exam_type VARCHAR(64) NOT NULL DEFAULT 'Penilaian Tengah Semester',
  academic_year VARCHAR(20) NOT NULL DEFAULT '2026/2027',
  semester VARCHAR(16) NOT NULL DEFAULT 'Ganjil' CHECK (semester IN ('Ganjil', 'Genap')),
  description TEXT DEFAULT '',
  exam_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0 AND duration_minutes <= 600),
  question_count INTEGER NOT NULL DEFAULT 0 CHECK (question_count >= 0),
  passing_score NUMERIC(5,2) NOT NULL DEFAULT 75.00,
  rounding_mode VARCHAR(20) NOT NULL DEFAULT 'two_decimals' CHECK (rounding_mode IN ('none', 'nearest_int', 'one_decimal', 'two_decimals')),
  exam_token VARCHAR(16) NOT NULL,
  max_attempts INTEGER NOT NULL DEFAULT 1 CHECK (max_attempts >= 1),
  shuffle_questions BOOLEAN NOT NULL DEFAULT TRUE,
  shuffle_options BOOLEAN NOT NULL DEFAULT TRUE,
  questions_per_page INTEGER NOT NULL DEFAULT 1 CHECK (questions_per_page >= 1),
  results_published BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'terjadwal', 'aktif', 'selesai', 'diarsipkan')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exams_school_status_date ON public.exams(school_id, status, exam_date);

-- 11. exam_participants
CREATE TABLE IF NOT EXISTS public.exam_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  extra_minutes INTEGER NOT NULL DEFAULT 0 CHECK (extra_minutes >= 0),
  allowed_attempts INTEGER NOT NULL DEFAULT 1 CHECK (allowed_attempts >= 1),
  status VARCHAR(24) NOT NULL DEFAULT 'terdaftar' CHECK (status IN ('terdaftar', 'sedang_ujian', 'selesai')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (exam_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_eparticipants_exam_student ON public.exam_participants(exam_id, student_id);

-- 12. exam_questions
CREATE TABLE IF NOT EXISTS public.exam_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  question_order INTEGER NOT NULL DEFAULT 1,
  custom_weight NUMERIC(6,2),
  UNIQUE (exam_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_equestions_exam ON public.exam_questions(exam_id, question_order);

-- 13. exam_sessions
CREATE TABLE IF NOT EXISTS public.exam_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  session_token VARCHAR(128) NOT NULL UNIQUE,
  question_order_json TEXT NOT NULL DEFAULT '[]',
  option_order_json TEXT NOT NULL DEFAULT '{}',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  submitted_at TIMESTAMPTZ,
  last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  connection_status VARCHAR(20) NOT NULL DEFAULT 'terhubung' CHECK (connection_status IN ('terhubung', 'terputus', 'selesai')),
  status VARCHAR(20) NOT NULL DEFAULT 'berlangsung' CHECK (status IN ('berlangsung', 'selesai', 'waktu_habis', 'direset')),
  suspicious_count INTEGER NOT NULL DEFAULT 0 CHECK (suspicious_count >= 0),
  ip_address VARCHAR(64) DEFAULT '',
  user_agent TEXT DEFAULT '',
  UNIQUE (exam_id, student_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS idx_esessions_exam_status ON public.exam_sessions(exam_id, status);
CREATE INDEX IF NOT EXISTS idx_esessions_student ON public.exam_sessions(student_id);

-- 14. student_answers
CREATE TABLE IF NOT EXISTS public.student_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.exam_sessions(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  selected_option_ids_json TEXT NOT NULL DEFAULT '[]',
  answer_text TEXT DEFAULT '',
  is_flagged BOOLEAN NOT NULL DEFAULT FALSE,
  is_correct BOOLEAN,
  auto_score NUMERIC(6,2) DEFAULT 0,
  manual_score NUMERIC(6,2),
  grader_note TEXT DEFAULT '',
  idempotency_key VARCHAR(128),
  client_seq BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_sanswers_session ON public.student_answers(session_id);

-- 15. exam_activity_logs
CREATE TABLE IF NOT EXISTS public.exam_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.exam_sessions(id) ON DELETE CASCADE,
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  event_type VARCHAR(48) NOT NULL CHECK (
    event_type IN ('fullscreen_exit', 'tab_switch', 'window_blur', 'connection_lost', 'connection_restored', 'session_started', 'session_submitted')
  ),
  details TEXT DEFAULT '',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eactivity_exam_student ON public.exam_activity_logs(exam_id, student_id, occurred_at DESC);

-- 16. exam_results
CREATE TABLE IF NOT EXISTS public.exam_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_id UUID NOT NULL REFERENCES public.exams(id) ON DELETE CASCADE,
  session_id UUID NOT NULL UNIQUE REFERENCES public.exam_sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  raw_score NUMERIC(8,2) NOT NULL DEFAULT 0,
  max_score NUMERIC(8,2) NOT NULL DEFAULT 100,
  final_score NUMERIC(6,2) NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,
  wrong_count INTEGER NOT NULL DEFAULT 0,
  unanswered_count INTEGER NOT NULL DEFAULT 0,
  needs_manual_grading BOOLEAN NOT NULL DEFAULT FALSE,
  graded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  graded_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eresults_exam_student ON public.exam_results(exam_id, student_id);

-- 17. audit_logs
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  actor_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_role VARCHAR(20) NOT NULL DEFAULT 'SYSTEM',
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(64) NOT NULL,
  entity_id VARCHAR(64) DEFAULT '',
  metadata_json TEXT DEFAULT '{}',
  ip_address VARCHAR(64) DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_school_created ON public.audit_logs(school_id, created_at DESC);
